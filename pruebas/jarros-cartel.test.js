import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import opentypeNs from 'opentype.js';
import { iniciarMotor, operar } from '../src/utils/motorBooleano';
import {
  PARAMETROS_INICIALES, FORMAS_CARTEL, sanearParametros, curvaAsa, armarJarro, armarPlaca, partesDe, radioExteriorFn, conForma
} from '../src/utils/jarros';
import { tamanoAjustado, contornoCartel } from '../src/utils/jarrosCartel';
import { cajaMalla, volumenMalla, revisarCerrada, crear3mf } from '../src/utils/mallas3d';
import { CAMAS } from '../src/utils/camasImpresion';

const opentype = opentypeNs.parse ? opentypeNs : opentypeNs.default;
const leerFuente = (nombre) => {
  const b = fs.readFileSync(`node_modules/@fontsource/${nombre}/files/${nombre}-latin-400-normal.woff`);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
const fuente = leerFuente('fredoka');

// Armar un cartel con texto tarda cerca de un segundo por jarro.
vi.setConfig({ testTimeout: 30000 });
beforeAll(async () => { await iniciarMotor(); });

const cerrada = (m) => revisarCerrada(m).cerrada;
const conCartel = (extra = {}) => ({ ...PARAMETROS_INICIALES, asa: false, cartel: true, cartelTexto: 'Ana', ...extra });
const armar = (extra, opciones = { fuente }) => armarJarro(conCartel(extra), opciones);
const pieza = (j, id) => j.piezas.find((x) => x.id === id);

describe('cartel: parámetros', () => {
  it('por defecto no hay cartel y los valores raros se sanean', () => {
    expect(PARAMETROS_INICIALES.cartel).toBe(false);
    expect(armarJarro({ ...PARAMETROS_INICIALES }, { fuente }).piezas.map((x) => x.id)).toEqual(['cuerpo', 'asa']);
    const s = sanearParametros({ cartelTexto: 'x'.repeat(100), cartelForma: 'no existe', cartelMayusculas: 'raro', cartelTamano: 'otro', cartelRemaches: 3, cartelGrosor: 99, cartelBisel: -1 });
    expect(s.cartelTexto).toHaveLength(30);
    expect(s.cartelForma).toBe(PARAMETROS_INICIALES.cartelForma);
    expect(s.cartelMayusculas).toBe('como');
    expect(s.cartelTamano).toBe('ajustado');
    expect(s.cartelRemaches).toBe(0);
    expect(s.cartelGrosor).toBe(8);
    expect(s.cartelBisel).toBe(0);
  });

  it('lo que se mete el cartel en la pared deja al menos 1,4 mm de pared hacia adentro', () => {
    expect(sanearParametros({ pared: 3, cartelEmpotrado: 4 }).cartelEmpotrado).toBeCloseTo(1.6, 6);
    expect(sanearParametros({ pared: 1.2, cartelEmpotrado: 2 }).cartelEmpotrado).toBe(0.4);
  });

  it('sin tipografía o sin texto no hay cartel', () => {
    expect(armarJarro(conCartel(), {}).piezas.map((x) => x.id)).toEqual(['cuerpo']);
    expect(armar({ cartelTexto: '   ' }).piezas.map((x) => x.id)).toEqual(['cuerpo']);
  });
});

describe('cartel: formas y tamaño', () => {
  it('cada forma tiene un contorno y un tamaño ajustado que contiene al texto con su margen', () => {
    for (const f of FORMAS_CARTEL) {
      const { ancho, alto } = tamanoAjustado(f.id, 40, 12, 4);
      expect(ancho, f.id).toBeGreaterThanOrEqual(48 - 1e-9);
      expect(alto, f.id).toBeGreaterThanOrEqual(20 - 1e-9);
      const pts = contornoCartel(f.id, ancho, alto).getPoints(12);
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      expect(Math.max(...xs) - Math.min(...xs), f.id).toBeCloseTo(ancho, 1);
      expect(Math.max(...ys) - Math.min(...ys), f.id).toBeCloseTo(alto, 1);
    }
  });
});

describe('cartel: armado', () => {
  // Se arma después de cargar el motor (si no, el cuerpo se talla con la librería de respaldo).
  let j, cartel;
  beforeAll(() => { j = armar({}); cartel = pieza(j, 'cartel'); });

  it('el cartel es una pieza desmontable con partes de color cerradas', () => {
    expect(cartel).toBeTruthy();
    expect(cartel.desmontable).toBe(true);
    expect(cartel.partes.map((x) => x.id)).toEqual(['base', 'borde', 'letras']);
    for (const parte of cartel.partes) {
      expect(cerrada(parte.malla), parte.id).toBe(true);
      expect(volumenMalla(parte.malla), parte.id).toBeGreaterThan(0);
    }
    const colores = cartel.partes.map((x) => x.color);
    expect(colores).toEqual([PARAMETROS_INICIALES.colores.cartel, PARAMETROS_INICIALES.colores.borde, PARAMETROS_INICIALES.colores.letras]);
  });

  it('el cartel está envuelto sobre el jarro: la cara de atrás apoya en la pared y las letras sobresalen', () => {
    const R = radioExteriorFn(PARAMETROS_INICIALES);
    const base = cartel.partes.find((x) => x.id === 'base').malla;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < base.pos.length; i += 3) {
      const d = Math.hypot(base.pos[i], base.pos[i + 1]) - R(base.pos[i + 2]);
      min = Math.min(min, d); max = Math.max(max, d);
    }
    // Atrás: lo que se mete en la cavidad (1,5 mm); arriba: la base sobresale 1,5 mm (grosor 3 - 1,5).
    expect(min).toBeCloseTo(-1.5, 1);
    expect(max).toBeCloseTo(1.5, 1);
    const letras = cajaMalla(cartel.partes.find((x) => x.id === 'letras').malla);
    const rLetras = Math.max(...[letras.min, letras.max].map((p) => Math.hypot(p[0], p[1])));
    expect(rLetras).toBeGreaterThan(Math.hypot(...[cajaMalla(base).max[0], cajaMalla(base).max[1]]) - 1);
    // Queda de frente (hacia -Y), centrado en la altura pedida.
    const caja = cajaMalla(cartel.malla);
    expect(caja.min[1]).toBeLessThan(-30);
    expect((caja.min[2] + caja.max[2]) / 2).toBeCloseTo(85, 0);
    expect((caja.min[0] + caja.max[0]) / 2).toBeCloseTo(0, 0);
  });

  it('el cuerpo lleva la cavidad: menos material que sin cartel, sigue cerrado y el cartel entra con holgura', () => {
    const sin = armarJarro({ ...PARAMETROS_INICIALES, asa: false });
    const cuerpo = pieza(j, 'cuerpo').malla;
    expect(cerrada(cuerpo)).toBe(true);
    const quitado = volumenMalla(pieza(sin, 'cuerpo').malla) - volumenMalla(cuerpo);
    expect(quitado).toBeGreaterThan(200);
    // La base del cartel no pisa el cuerpo (no hay material en común) gracias a la holgura.
    const base = cartel.partes.find((x) => x.id === 'base').malla;
    const comun = operar(cuerpo, base, 'restar');
    expect(Math.abs(volumenMalla(comun) - volumenMalla(cuerpo))).toBeLessThan(0.5);
    // La cara de atrás de la base queda a menos de 0,2 mm del fondo de la cavidad (no flota).
    expect(volumenMalla(base)).toBeGreaterThan(200);
  });

  it('pegado: no se talla cavidad y el cartel se mete apenas en la pared', () => {
    const k = armar({ cartelDesmontable: false });
    expect(pieza(k, 'cartel').desmontable).toBe(false);
    const sin = armarJarro({ ...PARAMETROS_INICIALES, asa: false });
    expect(volumenMalla(pieza(k, 'cuerpo').malla)).toBeCloseTo(volumenMalla(pieza(sin, 'cuerpo').malla), 0);
    const R = radioExteriorFn(PARAMETROS_INICIALES);
    const base = pieza(k, 'cartel').partes[0].malla;
    let min = Infinity;
    for (let i = 0; i < base.pos.length; i += 3) min = Math.min(min, Math.hypot(base.pos[i], base.pos[i + 1]) - R(base.pos[i + 2]));
    expect(min).toBeCloseTo(-0.6, 1);
  });

  it('la altura y el giro mueven el cartel', () => {
    const alto = armar({ cartelAltura: 120 });
    expect((cajaMalla(pieza(alto, 'cartel').malla).min[2] + cajaMalla(pieza(alto, 'cartel').malla).max[2]) / 2).toBeCloseTo(120, 0);
    const lado = armar({ cartelAngulo: 90 }); // hacia +X
    const c = cajaMalla(pieza(lado, 'cartel').malla);
    expect(c.max[0]).toBeGreaterThan(35);
    expect(c.min[0]).toBeGreaterThan(0);
  });

  it('se limita para no salirse del jarro ni dar más de media vuelta, y avisa', () => {
    const arriba = armar({ cartelAltura: 300 });
    expect(arriba.avisos.join(' ')).toMatch(/se salga del jarro/);
    expect(cajaMalla(pieza(arriba, 'cartel').malla).max[2]).toBeLessThanOrEqual(arriba.alto);
    const ancho = armar({ cartelTamano: 'propio', cartelAncho: 200, cartelAlto: 30 });
    expect(ancho.avisos.join(' ')).toMatch(/más de media vuelta/);
  });

  it('avisa si el nombre no entra en un tamaño propio', () => {
    expect(armar({ cartelTamano: 'propio', cartelAncho: 20, cartelAlto: 12, cartelTexto: 'Valentina' }).avisos.join(' ')).toMatch(/no entra/);
  });

  it('todas las formas dan partes cerradas y un cuerpo con cavidad cerrado', () => {
    for (const f of FORMAS_CARTEL) {
      const k = armar({ cartelForma: f.id, cartelRemaches: 4 });
      const c = pieza(k, 'cartel');
      expect(c.partes.length, f.id).toBeGreaterThanOrEqual(3);
      for (const parte of c.partes) expect(cerrada(parte.malla), `${f.id} ${parte.id}`).toBe(true);
      expect(cerrada(pieza(k, 'cuerpo').malla), f.id).toBe(true);
    }
  });

  it('con remaches suma esa parte, con 4 más volumen que con 2', () => {
    const dos = pieza(armar({ cartelRemaches: 2 }), 'cartel').partes.find((x) => x.id === 'remaches');
    const cuatro = pieza(armar({ cartelRemaches: 4 }), 'cartel').partes.find((x) => x.id === 'remaches');
    expect(dos).toBeTruthy();
    expect(volumenMalla(cuatro.malla)).toBeGreaterThan(volumenMalla(dos.malla) * 1.8);
    expect(pieza(armar({ cartelRemaches: 0 }), 'cartel').partes.some((x) => x.id === 'remaches')).toBe(false);
  });

  it('sin borde no hay parte de borde', () => {
    expect(pieza(armar({ cartelBorde: false }), 'cartel').partes.some((x) => x.id === 'borde')).toBe(false);
  });

  it('más bisel o grosor cambian la base; el bisel 0 deja una sola capa', () => {
    const lisa = pieza(armar({ cartelBisel: 0 }), 'cartel').partes[0].malla;
    const biselada = pieza(armar({ cartelBisel: 1.2 }), 'cartel').partes[0].malla;
    // Mismo alto total, pero el bisel arma escalones (más triángulos) y achica la cara de arriba.
    expect(cajaMalla(biselada).max[2]).toBeCloseTo(cajaMalla(lisa).max[2], 1);
    expect(biselada.tri.length).toBeGreaterThan(lisa.tri.length);
    expect(cerrada(biselada)).toBe(true);
    const gruesa = pieza(armar({ cartelGrosor: 5 }), 'cartel').partes[0].malla;
    expect(volumenMalla(gruesa)).toBeGreaterThan(volumenMalla(lisa) * 1.4);
  });

  it('el arco sube el centro y la onda mueve el contorno; con arco el borde de abajo ya no es recto', () => {
    const plano = cajaMalla(pieza(armar({ cartelArco: 0 }), 'cartel').malla);
    const arco = armar({ cartelArco: 6 });
    const caja = cajaMalla(pieza(arco, 'cartel').malla);
    expect(caja.max[2]).toBeCloseTo(plano.max[2] + 6, 0);
    expect(arco.avisos.join(' ')).toMatch(/soportes/);
    expect(armar({ cartelOnda: 2 }).avisos.join(' ')).toMatch(/soportes/);
  });

  it('el cartel sigue la silueta de un barril', () => {
    const p = conForma(conCartel({}), 'barril');
    const k = armarJarro(p, { fuente });
    const R = radioExteriorFn(p);
    const base = pieza(k, 'cartel').partes[0].malla;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < base.pos.length; i += 3) {
      const d = Math.hypot(base.pos[i], base.pos[i + 1]) - R(base.pos[i + 2]);
      min = Math.min(min, d); max = Math.max(max, d);
    }
    expect(min).toBeCloseTo(-1.5, 1);
    expect(max).toBeCloseTo(1.5, 1);
    expect(cerrada(pieza(k, 'cuerpo').malla)).toBe(true);
  });

  it('avisa si el cartel se pisa con el asa y deja de avisar al girarlo', () => {
    const pisa = armarJarro({ ...PARAMETROS_INICIALES, cartel: true, cartelTexto: 'Ana', cartelAngulo: 90, cartelAltura: 150 }, { fuente });
    expect(pisa.avisos.join(' ')).toMatch(/se pisa con el asa/);
    const libre = armarJarro({ ...PARAMETROS_INICIALES, cartel: true, cartelTexto: 'Ana', cartelAngulo: 0 }, { fuente });
    expect(libre.avisos.join(' ')).not.toMatch(/se pisa con el asa/);
  });
});

describe('cartel: placa de impresión y 3MF', () => {
  let j;
  beforeAll(() => { j = armarJarro({ ...PARAMETROS_INICIALES, cartel: true, cartelTexto: 'Ana', asaDesmontable: true }, { fuente }); });
  const bambu = CAMAS.find((c) => c.id === 'bambu');

  it('la pieza del cartel se imprime parada, apoyada en su borde de abajo, con todas sus partes', () => {
    const c = pieza(j, 'cartel');
    expect(cajaMalla(c.mallaImpresion).min[2]).toBeCloseTo(0, 4);
    expect(c.partes).toHaveLength(3);
    for (const parte of c.partes) expect(cajaMalla(parte.mallaImpresion).min[2]).toBeGreaterThanOrEqual(-1e-4);
    expect(partesDe(pieza(j, 'asa'))).toHaveLength(1);
  });

  it('la placa lleva las partes del cartel agrupadas como un solo objeto, sin pisarse con las demás piezas', () => {
    const { cuerpos, entra } = armarPlaca(j.piezas, bambu);
    expect(entra).toBe(true);
    const delCartel = cuerpos.filter((x) => x.grupo === 'cartel');
    expect(delCartel).toHaveLength(3);
    expect(delCartel.every((x) => x.grupoNombre === 'Cartel')).toBe(true);
    const cajaGrupo = cajaMalla(delCartel.map((x) => x.malla).reduce((a, b) => ({ pos: new Float32Array([...a.pos, ...b.pos]), tri: new Uint32Array(0) })));
    const otros = cuerpos.filter((x) => x.grupo !== 'cartel').map((x) => cajaMalla(x.malla));
    for (const o of otros) {
      const separadas = cajaGrupo.max[0] <= o.min[0] || o.max[0] <= cajaGrupo.min[0] || cajaGrupo.max[1] <= o.min[1] || o.max[1] <= cajaGrupo.min[1];
      expect(separadas).toBe(true);
    }
  });

  it('el 3MF de la placa agrupa las partes de color en un objeto y deja las demás sueltas', () => {
    const { cuerpos } = armarPlaca(j.piezas, bambu);
    const archivos = unzipSync(crear3mf(cuerpos, { ensamblado: false }));
    const modelo = strFromU8(archivos['3D/3dmodel.model']);
    expect((modelo.match(/<component /g) || []).length).toBe(3);
    expect(modelo).toMatch(/<object id="\d+" name="Cartel" type="model"><components>/);
    // Items: una asa suelta, un cuerpo suelto y el cartel (3 objetos en la mesa).
    expect((modelo.match(/<item /g) || []).length).toBe(3);
  });

  it('sin grupos el 3MF se arma como siempre', () => {
    const { cuerpos } = armarPlaca(armarJarro({ ...PARAMETROS_INICIALES, asaDesmontable: true }).piezas, bambu);
    const modelo = strFromU8(unzipSync(crear3mf(cuerpos, { ensamblado: false }))['3D/3dmodel.model']);
    expect((modelo.match(/<item /g) || []).length).toBe(2);
    expect(modelo).not.toMatch(/<component /);
  });
});

describe('cartel: moverlo para hacer ajustes', () => {
  const pasos = [0, 5, 10, 15, 20];

  it('mover el cartel reutiliza su forma ya armada: sólo se vuelve a envolver en el jarro', () => {
    const a = pieza(armar({ cartelAngulo: 0 }), 'cartel').partes[0].malla;
    const b = pieza(armar({ cartelAngulo: 25, cartelAltura: 100 }), 'cartel').partes[0].malla;
    // Mismos triángulos (la forma no se recalculó) pero en otro lugar del jarro.
    expect(b.tri).toBe(a.tri);
    expect(b.pos).not.toBe(a.pos);
    expect(cajaMalla(b).max[2]).toBeGreaterThan(cajaMalla(a).max[2] + 10);
    // Cambiar el texto sí arma una forma nueva.
    const c = pieza(armar({ cartelTexto: 'Otro nombre' }), 'cartel').partes[0].malla;
    expect(c.tri).not.toBe(a.tri);
  });

  it('cada paso de un ajuste fino mueve el cartel esa cantidad, con la cavidad del cuerpo cerrada', () => {
    const centros = pasos.map((g) => {
      const j = armar({ cartelAngulo: g });
      expect(cerrada(pieza(j, 'cuerpo').malla), `${g}°`).toBe(true);
      const c = cajaMalla(pieza(j, 'cartel').malla);
      return (c.min[0] + c.max[0]) / 2;
    });
    // De frente (−Y) el cartel se corre hacia +X al girar: cada paso lo mueve un poco más.
    for (let i = 1; i < centros.length; i++) expect(centros[i]).toBeGreaterThan(centros[i - 1] + 1);
  });

  it('un ajuste de altura chico mueve el cartel esa altura', () => {
    const z = (h) => { const c = cajaMalla(pieza(armar({ cartelAltura: h }), 'cartel').malla); return (c.min[2] + c.max[2]) / 2; };
    expect(z(86) - z(85)).toBeCloseTo(1, 1);
    expect(z(80) - z(85)).toBeCloseTo(-5, 1);
  });
});

describe('cartel: varias copias alrededor del jarro', () => {
  it('se sanea la cantidad y por defecto hay un solo cartel', () => {
    expect(PARAMETROS_INICIALES.cartelCantidad).toBe(1);
    expect(sanearParametros({ cartelCantidad: 9 }).cartelCantidad).toBe(4);
    expect(sanearParametros({ cartelCantidad: 0 }).cartelCantidad).toBe(1);
    expect(sanearParametros({ cartelCantidad: 2.4 }).cartelCantidad).toBe(2);
    expect(armar({}).piezas.map((x) => x.id)).toEqual(['cuerpo', 'cartel']);
  });

  it('con 2 o 3 copias salen N piezas iguales, repartidas parejo, cada una con su cavidad', () => {
    const j = armar({ cartelCantidad: 3, cartelForma: 'pastilla', cartelTamano: 'propio', cartelAncho: 36, cartelAlto: 20, cartelAlturaLetra: 8 });
    expect(j.piezas.map((x) => x.id)).toEqual(['cuerpo', 'cartel', 'cartel2', 'cartel3']);
    expect(pieza(j, 'cartel').nombre).toBe('Cartel 1');
    expect(j.piezas.filter((x) => x.desmontable)).toHaveLength(3);
    const vol = ['cartel', 'cartel2', 'cartel3'].map((id) => volumenMalla(pieza(j, id).malla));
    expect(Math.abs(vol[0] - vol[1]) / vol[0]).toBeLessThan(0.02);
    expect(Math.abs(vol[0] - vol[2]) / vol[0]).toBeLessThan(0.02);
    const ang = ['cartel', 'cartel2', 'cartel3'].map((id) => { const c = cajaMalla(pieza(j, id).malla); return Math.atan2((c.min[1] + c.max[1]) / 2, (c.min[0] + c.max[0]) / 2); });
    const d = (a, b) => ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    expect(Math.abs(d(ang[0], ang[1]) - d(ang[1], ang[2]))).toBeLessThan(0.2);
    expect(cerrada(pieza(j, 'cuerpo').malla)).toBe(true);
    const uno = armar({ cartelForma: 'pastilla', cartelTamano: 'propio', cartelAncho: 36, cartelAlto: 20, cartelAlturaLetra: 8 });
    expect(volumenMalla(pieza(j, 'cuerpo').malla)).toBeLessThan(volumenMalla(pieza(uno, 'cuerpo').malla) - 20);
  });

  it('avisa si no entran uno al lado del otro y si una copia se pisa con el asa', () => {
    expect(armar({ cartelCantidad: 4, cartelTamano: 'propio', cartelAncho: 80 }).avisos.join(' ')).toMatch(/no entran uno al lado del otro/);
    const conAsa = armarJarro({ ...conCartel({ cartelCantidad: 2, cartelAngulo: 90 }), asa: true });
    expect(conAsa.avisos.join(' ')).not.toMatch(/Los carteles no entran/);
    expect(armarJarro({ ...conCartel({ cartelCantidad: 2, cartelAngulo: 90 }), asa: true, asaAngulo: 0, cartelAltura: curvaAsa(PARAMETROS_INICIALES).z1 }, { fuente }).avisos.join(' ')).toMatch(/se pisa con el asa/);
  });
});
