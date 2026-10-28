import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { crearBambu3mf, configProyecto, filamentosDe } from '../src/utils/bambu3mf';
import plantilla from '../src/utils/plantillaBambuA1.json';
import { prepararMascara, cuantizar, armarLlaveroImagen, PARAMETROS_IMAGEN } from '../src/utils/imagenLlavero';
import { volumenMalla } from '../src/utils/mallas3d';

// Caja de lx × ly × lz mm con su esquina en (x, y, 0).
function caja(x, y, lx, ly, lz) {
  const p = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const pos = new Float32Array(p.flatMap(([a, b, c]) => [x + a * lx, y + b * ly, c * lz]));
  const tri = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { pos, tri };
}
const cuerpos3 = [
  { nombre: 'Borde', color: '#222222', malla: caja(0, 0, 40, 30, 2) },
  { nombre: 'Color 1', color: '#ff0000', malla: caja(5, 5, 14, 20, 2) },
  { nombre: 'Color 2', color: '#00FF00', malla: caja(20, 5, 14, 20, 2) }
];

const abrir = (bytes) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([n, b]) => [n, strFromU8(b)]));

// Revisa que las etiquetas XML estén bien cerradas y anidadas.
function xmlBalanceado(xml) {
  const pila = [];
  for (const m of xml.replace(/<\?.*?\?>/g, '').matchAll(/<(\/?)([A-Za-z0-9_:.-]+)([^>]*?)(\/?)>/g)) {
    const [, cierra, nombre, , autoCierra] = m;
    if (autoCierra) continue;
    if (cierra) { if (pila.pop() !== nombre) return false; } else pila.push(nombre);
  }
  return pila.length === 0;
}

describe('3MF para Bambu Studio', () => {
  const archivos = abrir(crearBambu3mf(cuerpos3, { nombre: 'Mi llavero' }));

  it('trae los archivos de un proyecto de Bambu Studio', () => {
    for (const n of ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', '3D/_rels/3dmodel.model.rels', '3D/Objects/object_1.model',
      'Metadata/model_settings.config', 'Metadata/project_settings.config', 'Metadata/slice_info.config', 'Metadata/filament_sequence.json', 'Metadata/cut_information.xml']) {
      expect(archivos[n], n).toBeTruthy();
    }
  });

  it('todos los XML están bien formados', () => {
    for (const [n, c] of Object.entries(archivos)) if (/\.(xml|rels|model|config)$/.test(n) && !n.includes('project_settings')) expect(xmlBalanceado(c), n).toBe(true);
  });

  it('se declara como de Bambu Studio, que es lo que evita el aviso de 3mf ajeno', () => {
    const m = archivos['3D/3dmodel.model'];
    expect(m).toMatch(/<metadata name="Application">BambuStudio-\d+\.\d+\.\d+\.\d+<\/metadata>/);
    expect(m).toContain('<metadata name="BambuStudio:3mfVersion">1</metadata>');
    expect(m).toContain('requiredextensions="p"');
  });

  it('cada pieza es una parte del objeto, enlazada entre los tres archivos', () => {
    const modelo = archivos['3D/3dmodel.model'];
    const objeto = archivos['3D/Objects/object_1.model'];
    const config = archivos['Metadata/model_settings.config'];
    const idsMalla = [...objeto.matchAll(/<object id="(\d+)"/g)].map((m) => Number(m[1]));
    const idsComponente = [...modelo.matchAll(/<component [^>]*objectid="(\d+)"/g)].map((m) => Number(m[1]));
    const idsParte = [...config.matchAll(/<part id="(\d+)"/g)].map((m) => Number(m[1]));
    expect(idsMalla).toEqual([1, 2, 3]);
    expect(idsComponente).toEqual(idsMalla);
    expect(idsParte).toEqual(idsMalla);
    // El objeto de la configuración es el mismo que el del modelo y de la cama.
    const idObjeto = Number(modelo.match(/<object id="(\d+)" p:UUID="[^"]+" type="model">\s*<components>/)[1]);
    expect(config).toContain(`<object id="${idObjeto}">`);
    expect(config).toContain(`<metadata key="object_id" value="${idObjeto}"/>`);
    expect(modelo).toContain(`<item objectid="${idObjeto}"`);
    expect(idObjeto).not.toBe(1); // no puede repetir el id de una parte
  });

  it('a cada color le toca su filamento y los iguales comparten', () => {
    const config = archivos['Metadata/model_settings.config'];
    const extruders = [...config.matchAll(/<part id="\d+"[\s\S]*?<metadata key="extruder" value="(\d+)"/g)].map((m) => Number(m[1]));
    expect(extruders).toEqual([1, 2, 3]);
    const iguales = abrir(crearBambu3mf([...cuerpos3, { nombre: 'Color 3', color: '#FF0000', malla: caja(0, 0, 1, 1, 1) }]));
    const e2 = [...iguales['Metadata/model_settings.config'].matchAll(/<part id="\d+"[\s\S]*?<metadata key="extruder" value="(\d+)"/g)].map((m) => Number(m[1]));
    expect(e2).toEqual([1, 2, 3, 2]); // el rojo repetido (distinta mayúscula) usa el filamento 2
  });

  it('las mallas salen completas', () => {
    const objeto = archivos['3D/Objects/object_1.model'];
    expect((objeto.match(/<vertex /g) || []).length).toBe(24);
    expect((objeto.match(/<triangle /g) || []).length).toBe(36);
    expect(archivos['Metadata/model_settings.config']).toContain('<metadata face_count="36"/>');
  });

  it('el objeto queda centrado en la cama de 256 × 256', () => {
    const t = archivos['3D/3dmodel.model'].match(/<item [^>]*transform="1 0 0 0 1 0 0 0 1 ([\d.-]+) ([\d.-]+) 0"/);
    expect(Number(t[1])).toBeCloseTo(128 - 20, 3); // caja de 40 mm de ancho
    expect(Number(t[2])).toBeCloseTo(128 - 15, 3); // y de 30 mm de alto
  });

  it('los nombres con caracteres especiales no rompen el XML', () => {
    const raro = abrir(crearBambu3mf([{ nombre: 'Ala <1> & "rojo"', color: '#fff', malla: caja(0, 0, 1, 1, 1) }], { nombre: 'Avión & "yo"' }));
    expect(xmlBalanceado(raro['Metadata/model_settings.config'])).toBe(true);
    expect(raro['Metadata/model_settings.config']).toContain('Ala &lt;1&gt; &amp; &quot;rojo&quot;');
  });

  it('sin piezas avisa', () => {
    expect(() => crearBambu3mf([])).toThrow();
  });

  it('más de 16 colores no entra en Bambu Studio y avisa', () => {
    const muchos = Array.from({ length: 17 }, (_, i) => ({ nombre: `c${i}`, color: `#${(i * 15 + 10).toString(16).padStart(2, '0')}0000`, malla: caja(i, 0, 1, 1, 1) }));
    expect(() => crearBambu3mf(muchos)).toThrow(/16/);
  });
});

describe('configuración del proyecto', () => {
  const colores = ['#222222', '#FF0000', '#00FF00'];
  const cfg = JSON.parse(abrir(crearBambu3mf(cuerpos3))['Metadata/project_settings.config']);

  it('es JSON válido con las mismas opciones que la plantilla', () => {
    expect(Object.keys(cfg).sort()).toEqual(Object.keys(plantilla).sort());
  });

  it('los filamentos son los colores, en orden', () => {
    expect(cfg.filament_colour).toEqual(colores);
    expect(cfg.filament_multi_colour).toEqual(colores);
    expect(cfg.filament_self_index).toEqual(['1', '2', '3']);
    expect(cfg.filament_map).toEqual(['1', '1', '1']);
  });

  it('todas las opciones por filamento tienen un valor por filamento', () => {
    const n = colores.length;
    const malas = Object.entries(cfg).filter(([k, v]) => Array.isArray(v) && plantilla[k].length === 4 && !['different_settings_to_system', 'inherits_group'].includes(k) && v.length !== n);
    expect(malas.map(([k]) => k)).toEqual([]);
    expect(cfg.filament_settings_id).toEqual(Array(n).fill('Bambu PLA Basic @BBL A1'));
    expect(cfg.nozzle_temperature).toEqual(Array(n).fill(plantilla.nozzle_temperature[1]));
  });

  it('las matrices de limpieza (flush) tienen el tamaño que corresponde', () => {
    const n = colores.length;
    expect(cfg.flush_volumes_matrix.length).toBe(n * n);
    for (let i = 0; i < n; i++) expect(cfg.flush_volumes_matrix[i * n + i]).toBe('0');
    expect(cfg.flush_volumes_vector.length).toBe(2 * n);
    expect(cfg.filament_dev_ams_drying_temperature.length).toBe(4 * n);
    expect(cfg.filament_dev_ams_drying_ams_limitations.length).toBe(2 * n);
  });

  it('las listas por perfil tienen proceso + filamentos + impresora', () => {
    expect(cfg.different_settings_to_system.length).toBe(colores.length + 2);
    expect(cfg.inherits_group.length).toBe(colores.length + 2);
    expect(cfg.different_settings_to_system[0]).toBe(plantilla.different_settings_to_system[0]);
    expect(cfg.different_settings_to_system.at(-1)).toBe(plantilla.different_settings_to_system.at(-1));
  });

  it('lo que no es por filamento queda igual que en la plantilla (impresora, proceso)', () => {
    expect(cfg.printer_settings_id).toBe('Bambu Lab A1 0.4');
    expect(cfg.nozzle_diameter).toEqual(['0.4']);
    expect(cfg.layer_height).toBe(plantilla.layer_height);
    expect(cfg.version).toBe(plantilla.version);
  });

  it('funciona con un solo filamento y con 13 (un llavero de imagen con 12 colores y borde)', () => {
    for (const n of [1, 2, 13]) {
      const c = configProyecto(Array.from({ length: n }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`));
      expect(c.filament_colour.length).toBe(n);
      expect(c.flush_volumes_matrix.length).toBe(n * n);
      expect(c.filament_type.length).toBe(n);
      expect(c.different_settings_to_system.length).toBe(n + 2);
    }
  });

  it('con la plantilla original (4 filamentos) las listas coinciden en tamaño', () => {
    const c = configProyecto(['#1', '#2', '#3', '#4']);
    for (const [k, v] of Object.entries(plantilla)) if (Array.isArray(v)) expect(c[k].length, k).toBe(v.length);
  });

  it('filamentosDe junta los colores iguales sin mirar mayúsculas', () => {
    expect(filamentosDe([{ color: '#ff0000' }, { color: '#FF0000' }, { color: '#00ff00' }])).toEqual(['#FF0000', '#00FF00']);
  });
});

describe('con una imagen de verdad', () => {
  it('un llavero de imagen sale como proyecto de Bambu, con las piezas y sus filamentos', () => {
    const w = 40, h = 30;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(x < 20 ? [220, 30, 30, 255] : [30, 60, 220, 255], (y * w + x) * 4);
    const q = cuantizar(rgba, prepararMascara(rgba, w, h), w, h, 4);
    const r = armarLlaveroImagen({ indices: q.indices, w, h, paleta: q.paleta }, { ...PARAMETROS_IMAGEN, anchoMm: 50 });
    const a = abrir(crearBambu3mf(r.cuerpos, { nombre: 'prueba' }));
    const cfg = JSON.parse(a['Metadata/project_settings.config']);
    expect(cfg.filament_colour.length).toBe(new Set(r.cuerpos.map((c) => c.color.toUpperCase())).size);
    expect((a['3D/Objects/object_1.model'].match(/<object /g) || []).length).toBe(r.cuerpos.length);
    const caras = r.cuerpos.reduce((s, c) => s + c.malla.tri.length / 3, 0);
    expect(a['Metadata/model_settings.config']).toContain(`<metadata face_count="${caras}"/>`);
    expect(r.cuerpos.every((c) => volumenMalla(c.malla) > 0)).toBe(true);
  });
});

// Si está el proyecto de referencia guardado por Bambu Studio, se compara contra él.
const REFERENCIA = 'C:/Users/u194700/Documents/Impresiones 3D/1-Todo3d_cba/referencias-bambu/llavero.3mf';
describe.skipIf(!fs.existsSync(REFERENCIA))('contra el proyecto real de Bambu Studio', () => {
  const ref = abrir(new Uint8Array(fs.readFileSync(REFERENCIA)));
  const nuestro = abrir(crearBambu3mf(cuerpos3));

  it('tiene los mismos archivos de estructura (sin las miniaturas)', () => {
    const sinImagenes = (o) => Object.keys(o).filter((n) => !n.endsWith('.png')).sort();
    expect(sinImagenes(nuestro)).toEqual(sinImagenes(ref));
  });

  it('el modelo usa las mismas etiquetas y espacios de nombres', () => {
    const etiquetas = (x) => [...new Set([...x.matchAll(/<([A-Za-z:]+)[ >/]/g)].map((m) => m[1]))].sort();
    expect(etiquetas(nuestro['3D/3dmodel.model'])).toEqual(etiquetas(ref['3D/3dmodel.model']));
    expect(etiquetas(nuestro['3D/Objects/object_1.model'])).toEqual(etiquetas(ref['3D/Objects/object_1.model']));
    expect(nuestro['3D/3dmodel.model'].match(/<model [^>]*>/)[0]).toBe(ref['3D/3dmodel.model'].match(/<model [^>]*>/)[0]);
  });

  it('la configuración del proyecto con los mismos 4 filamentos de la referencia es la misma que la suya', () => {
    const cfgRef = JSON.parse(ref['Metadata/project_settings.config']);
    const cfg = configProyecto(cfgRef.filament_colour);
    for (const k of ['printer_settings_id', 'printer_model', 'layer_height', 'wall_loops', 'curr_bed_type', 'version', 'from', 'name', 'flush_volumes_vector']) expect(cfg[k], k).toEqual(cfgRef[k]);
    expect(cfg.filament_colour).toEqual(cfgRef.filament_colour);
    expect(cfg.filament_self_index).toEqual(cfgRef.filament_self_index);
    expect(cfg.filament_map).toEqual(cfgRef.filament_map);
    expect(cfg.flush_volumes_matrix.length).toBe(cfgRef.flush_volumes_matrix.length);
    expect(Object.keys(cfg).sort()).toEqual(Object.keys(cfgRef).sort());
  });

  it('las partes de la configuración del modelo tienen las mismas etiquetas y claves que las de Bambu', () => {
    const claves = (x) => [...new Set([...x.matchAll(/<metadata key="([a-z_]+)"/g)].map((m) => m[1]))];
    const propias = claves(nuestro['Metadata/model_settings.config']);
    const deRef = claves(ref['Metadata/model_settings.config']);
    // Todo lo que escribimos lo conoce Bambu (no inventamos claves); sólo faltan datos de origen y miniaturas.
    expect(propias.filter((k) => !deRef.includes(k)).concat(['extruder'].filter((k) => !propias.includes(k)))).toEqual([]);
  });
});
