import { describe, it, expect, vi } from 'vitest';
import { soldar, leerStl, stlBinario, revisarCerrada, cajaMalla, volumenMalla } from '../src/utils/mallas3d';
import { TEXTURAS, CATEGORIAS_TEXTURA, resolucionSugerida, generarTextura, muestrear, suavizarTextura, invertirTextura, texturaDeImagen } from '../src/utils/texturasSuperficie';
import { crearUniformes, llenarUniformes, escribirMapas, remuestrear, LADO_MAPA } from '../src/utils/shaderSuperficie';
import { prepararVista, texturizar, texturizarCapas, estimarTriangulosCapas, estimarTriangulos, leerObj, normalEnPunto, PROYECCIONES, PARAMETROS_SUPERFICIE } from '../src/utils/superficie';

// Generar todas las texturas del catálogo tarda varios segundos si la compu está ocupada.
vi.setConfig({ testTimeout: 30000 });

// Cubo de l mm con el vértice mínimo en el origen: sólo 12 triángulos.
function cubo(l = 20) {
  const p = [[0, 0, 0], [l, 0, 0], [l, l, 0], [0, l, 0], [0, 0, l], [l, 0, l], [l, l, l], [0, l, l]];
  const caras = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  const sopa = [];
  for (const [a, b, c, d] of caras) sopa.push(...p[a], ...p[b], ...p[c], ...p[a], ...p[c], ...p[d]);
  return soldar(Float32Array.from(sopa));
}

// Cilindro de r × h mm: sus triángulos son largos y finos.
function cilindro(r = 15, h = 40, n = 72) {
  const s = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
    const p0 = [r * Math.cos(a0), r * Math.sin(a0)], p1 = [r * Math.cos(a1), r * Math.sin(a1)];
    s.push(p0[0], p0[1], 0, p1[0], p1[1], 0, p1[0], p1[1], h, p0[0], p0[1], 0, p1[0], p1[1], h, p0[0], p0[1], h);
    s.push(0, 0, h, p0[0], p0[1], h, p1[0], p1[1], h);
    s.push(0, 0, 0, p1[0], p1[1], 0, p0[0], p0[1], 0);
  }
  return soldar(Float32Array.from(s));
}

const lineas = generarTextura('geo-lineas');
const cuadros = generarTextura('geo-cuadros');

describe('catálogo de texturas', () => {
  it('tiene entre 20 y 30 texturas de madera, fibra de carbono y geométricas', () => {
    expect(TEXTURAS.length).toBeGreaterThanOrEqual(20);
    expect(TEXTURAS.length).toBeLessThanOrEqual(30);
    expect(new Set(TEXTURAS.map((t) => t.id)).size).toBe(TEXTURAS.length);
    for (const c of CATEGORIAS_TEXTURA) expect(TEXTURAS.filter((t) => t.categoria === c.id).length).toBeGreaterThanOrEqual(6);
    expect(CATEGORIAS_TEXTURA.map((c) => c.id)).toEqual(['madera', 'carbono', 'geometricas']);
  });

  it('cada textura tiene alturas entre 0 y 1, con relieve de verdad, y siempre da lo mismo', () => {
    for (const t of TEXTURAS) {
      const a = generarTextura(t.id, 64);
      let min = 1, max = 0, suma = 0;
      for (const x of a.datos) { expect(Number.isFinite(x)).toBe(true); min = Math.min(min, x); max = Math.max(max, x); suma += x; }
      expect(min, t.id).toBeGreaterThanOrEqual(0);
      expect(max, t.id).toBeLessThanOrEqual(1);
      expect(max - min, `${t.id} es casi plana`).toBeGreaterThan(0.3);
      const media = suma / a.datos.length;
      let varianza = 0;
      for (const x of a.datos) varianza += (x - media) ** 2;
      expect(Math.sqrt(varianza / a.datos.length), `${t.id} casi no varía`).toBeGreaterThan(0.05);
      // Se generan de nuevo (otra resolución, sin la caché) y coinciden en forma.
      expect(Array.from(generarTextura(t.id, 64).datos.slice(0, 50))).toEqual(Array.from(a.datos.slice(0, 50)));
    }
  });

  it('se repiten sin costuras: la función da lo mismo una vuelta más allá', () => {
    for (const t of TEXTURAS) {
      for (const [u, v] of [[0.13, 0.41], [0.77, 0.05], [0.5, 0.93]]) {
        expect(t.f(u + 1, v), t.id).toBeCloseTo(t.f(u, v), 6);
        expect(t.f(u, v + 1), t.id).toBeCloseTo(t.f(u, v), 6);
      }
    }
  });

  it('en el borde de la textura no hay saltos grandes (empalma con la repetición)', () => {
    for (const t of TEXTURAS) {
      const a = generarTextura(t.id);
      const n = a.n;
      let saltoBorde = 0, saltoMedio = 0;
      for (let y = 0; y < n; y++) {
        saltoBorde += Math.abs(a.datos[y * n] - a.datos[y * n + n - 1]);
        saltoMedio += Math.abs(a.datos[y * n + n / 2] - a.datos[y * n + n / 2 - 1]);
      }
      // Un salto en el empalme se notaría como una raya: no puede ser mucho
      // mayor que el cambio normal entre dos píxeles vecinos.
      expect(saltoBorde, t.id).toBeLessThanOrEqual(saltoMedio * 6 + n * 0.12);
    }
  });
});

describe('uso de texturas', () => {
  it('muestrear repite la textura y devuelve el valor exacto en el centro de un píxel', () => {
    const t = { n: 4, datos: Float32Array.from({ length: 16 }, (_, i) => i / 15) };
    expect(muestrear(t, 0.125, 0.125)).toBeCloseTo(0, 6);
    expect(muestrear(t, 0.125 + 3, 0.125 - 2)).toBeCloseTo(0, 6);
    expect(muestrear(t, 0.375, 0.125)).toBeCloseTo(1 / 15, 6);
    expect(muestrear(t, 0.1, 0.9)).toBeCloseTo(muestrear(t, 1.1, -0.1), 6);
  });

  it('suavizar baja el contraste y conserva el promedio; invertir da el opuesto', () => {
    const s = suavizarTextura(cuadros, 3);
    const rango = (d) => Math.max(...d) - Math.min(...d);
    expect(rango(s.datos)).toBeLessThan(rango(cuadros.datos));
    const media = (d) => d.reduce((a, b) => a + b, 0) / d.length;
    expect(media(s.datos)).toBeCloseTo(media(cuadros.datos), 3);
    const i = invertirTextura(cuadros);
    expect(i.datos[100]).toBeCloseTo(1 - cuadros.datos[100], 6);
  });

  it('una imagen se vuelve mapa de alturas por su luminosidad', () => {
    const rgba = Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255]);
    const t = texturaDeImagen(rgba, 2, 2);
    expect(t.datos[0]).toBe(0);
    expect(t.datos[1]).toBeCloseTo(1, 5);
    expect(t.datos[3]).toBeGreaterThan(t.datos[2]); // el verde pesa más que el rojo
  });
});

describe('OBJ', () => {
  it('lee un cubo con caras de cuatro lados', () => {
    const txt = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'v 0 0 1', 'v 1 0 1', 'v 1 1 1', 'v 0 1 1',
      'f 1 4 3 2', 'f 5 6 7 8', 'f 1 2 6 5', 'f 3 4 8 7', 'f 2 3 7 6', 'f 4 1 5 8'].join('\n');
    const m = leerObj(txt);
    expect(m.tri.length / 3).toBe(12);
    expect(revisarCerrada(m).cerrada).toBe(true);
    expect(volumenMalla(m)).toBeCloseTo(1, 6);
  });

  it('acepta índices negativos y con barras, y avisa si no hay caras', () => {
    const m = leerObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3/1/1 -2/2/2 -1/3/3');
    expect(m.tri.length).toBe(3);
    expect(() => leerObj('v 0 0 0')).toThrow(/no tiene caras/);
  });
});

describe('texturizar', () => {
  // 7 mm por repetición con aristas de ~0,6 mm: los vértices no caen justo sobre los bordes de la textura.
  const base = { ...PARAMETROS_SUPERFICIE, resolucion: 1, tamanoU: 7, tamanoV: 7 };

  it('mantiene el sólido cerrado y mueve la superficie hasta la profundidad pedida', () => {
    const { malla } = texturizar(cubo(), cuadros, { ...base, profundidad: 1 });
    expect(malla.tri.length / 3).toBeGreaterThan(1000);
    expect(revisarCerrada(malla).cerrada).toBe(true);
    for (const x of malla.pos) expect(Number.isFinite(x)).toBe(true);
    const c = cajaMalla(malla);
    // Simétrico: sale y entra la mitad de la profundidad.
    expect(c.max[0]).toBeGreaterThan(20.2);
    expect(c.max[0]).toBeLessThanOrEqual(20.5 + 1e-3);
    expect(c.min[0]).toBeGreaterThanOrEqual(-0.5 - 1e-3);
  });

  it('empujando hacia adentro el modelo no crece', () => {
    const { malla } = texturizar(cubo(), cuadros, { ...base, simetrico: false, empujarAdentro: true, profundidad: 1 });
    const c = cajaMalla(malla);
    for (let k = 0; k < 3; k++) { expect(c.max[k]).toBeLessThanOrEqual(20 + 1e-3); expect(c.min[k]).toBeGreaterThanOrEqual(-1e-3); }
    expect(volumenMalla(malla)).toBeLessThan(8000);
  });

  it('funciona con todas las proyecciones y deja la malla cerrada y sin valores raros', () => {
    for (const p of PROYECCIONES) {
      const { malla } = texturizar(cubo(), lineas, { ...base, proyeccion: p.id, resolucion: 2 });
      expect(revisarCerrada(malla).cerrada, p.id).toBe(true);
      expect(malla.pos.every(Number.isFinite), p.id).toBe(true);
    }
  });

  it('con la cilíndrica, el eje elegido cambia el resultado', () => {
    const z = texturizar(cubo(), lineas, { ...base, proyeccion: 'cilindrica', ejeCilindro: 'z', resolucion: 2 }).malla;
    const x = texturizar(cubo(), lineas, { ...base, proyeccion: 'cilindrica', ejeCilindro: 'x', resolucion: 2 }).malla;
    expect(z.tri.length).toBe(x.tri.length);
    let distintos = 0;
    for (let i = 0; i < z.pos.length; i++) if (Math.abs(z.pos[i] - x.pos[i]) > 1e-4) distintos++;
    expect(distintos).toBeGreaterThan(100);
  });

  it('el ángulo inferior deja lisa la cara de abajo', () => {
    const { malla } = texturizar(cubo(), cuadros, { ...base, profundidad: 1, anguloInferior: 45 });
    let tocados = 0;
    for (let v = 0; v < malla.pos.length / 3; v++) {
      const [x, y, z] = [malla.pos[v * 3], malla.pos[v * 3 + 1], malla.pos[v * 3 + 2]];
      if (z < 1e-6 && x > 2 && x < 18 && y > 2 && y < 18) expect(Math.abs(z)).toBeLessThan(1e-6);
      if (z > 19.9 || z < -0.01) tocados++;
    }
    expect(tocados).toBeGreaterThan(0); // arriba sí hay textura
  });

  it('con "base lisa" lo que está pegado a la cama queda en el plano', () => {
    const { malla } = texturizar(cubo(), cuadros, { ...base, profundidad: 1, baseLisa: true });
    expect(cajaMalla(malla).min[2]).toBeCloseTo(0, 6);
  });

  it('"proteger voladizos" evita que algún vértice baje en Z', () => {
    const sin = texturizar(cubo(), cuadros, { ...base, profundidad: 1 }).malla;
    const con = texturizar(cubo(), cuadros, { ...base, profundidad: 1, protegerVoladizos: true }).malla;
    expect(cajaMalla(sin).min[2]).toBeLessThan(-0.1);
    expect(cajaMalla(con).min[2]).toBeGreaterThanOrEqual(-1e-6 - 0);
  });

  it('la máscara de "solo incluir" deja sin tocar lo que no se pintó', () => {
    const m = cubo();
    const mascara = new Uint8Array(m.tri.length / 3);
    for (let t = 0; t < mascara.length; t++) {
      const z = [0, 1, 2].map((k) => m.pos[m.tri[t * 3 + k] * 3 + 2]);
      if (z.every((x) => x > 19.99)) mascara[t] = 1; // la tapa de arriba
    }
    const { malla } = texturizar(m, cuadros, { ...base, profundidad: 1, modoMascara: 'incluir' }, { mascara });
    let abajoIntacto = true, arribaMovida = false;
    for (let v = 0; v < malla.pos.length / 3; v++) {
      const z = malla.pos[v * 3 + 2];
      if (z < 0.001 && Math.abs(z) > 1e-6) abajoIntacto = false;
      if (z > 20.01 || (z > 19 && z < 19.99)) arribaMovida = true;
    }
    expect(abajoIntacto).toBe(true);
    expect(arribaMovida).toBe(true);
    // Lo mismo en "excluir": lo pintado no se toca.
    const e = texturizar(m, cuadros, { ...base, profundidad: 1, modoMascara: 'excluir' }, { mascara }).malla;
    let topeLiso = true;
    for (let v = 0; v < e.pos.length / 3; v++) {
      const [x, y, z] = [e.pos[v * 3], e.pos[v * 3 + 1], e.pos[v * 3 + 2]];
      if (x > 3 && x < 17 && y > 3 && y < 17 && z > 19 && Math.abs(z - 20) > 1e-6) topeLiso = false;
    }
    expect(topeLiso).toBe(true);
  });

  it('el sello sólo toca la zona de su tamaño', () => {
    const { malla } = texturizar(cubo(), cuadros, { ...base, profundidad: 1, tamanoU: 8, tamanoV: 8, sello: { centro: [10, 10, 20], normal: [0, 0, 1] } });
    let dentro = 0;
    for (let v = 0; v < malla.pos.length / 3; v++) {
      const [x, y, z] = [malla.pos[v * 3], malla.pos[v * 3 + 1], malla.pos[v * 3 + 2]];
      if (Math.abs(x - 10) > 4.01 || Math.abs(y - 10) > 4.01) { if (z > 19 && Math.abs(z - 20) > 1e-6 && z < 20.2 && x > 0.1 && x < 19.9 && y > 0.1 && y < 19.9) throw new Error(`se movió fuera del sello: ${x},${y},${z}`); }
      else if (Math.abs(z - 20) > 1e-3) dentro++;
    }
    expect(dentro).toBeGreaterThan(20);
    expect(revisarCerrada(malla).cerrada).toBe(true);
    // Subdivide sólo cerca del sello: muchos menos triángulos que en todo el modelo.
    const todo = texturizar(cubo(), cuadros, { ...base, profundidad: 1 }).malla;
    expect(malla.tri.length).toBeLessThan(todo.tri.length / 3);
  });

  it('la estimación de triángulos se acerca a lo que sale de verdad', () => {
    for (const resolucion of [1, 0.5]) {
      const op = { ...base, resolucion };
      const real = texturizar(cubo(), cuadros, op).malla.tri.length / 3;
      const est = estimarTriangulos(cubo(), op, null);
      expect(est / real).toBeGreaterThan(0.6);
      expect(est / real).toBeLessThan(1.6);
    }
  });

  it('si no entra en el límite de triángulos, sube la resolución y avisa', () => {
    const r = texturizar(cubo(), cuadros, { ...base, resolucion: 0.2 }, { maxTriangulos: 20000 });
    expect(r.malla.tri.length / 3).toBeLessThan(40000);
    expect(r.avisos.join(' ')).toMatch(/resolución de/);
  });

  it('la resolución sugerida va con el tamaño y el detalle de la textura', () => {
    const hex = TEXTURAS.find((t) => t.id === 'geo-hexagonos');
    expect(resolucionSugerida(hex, 10)).toBeCloseTo(10 / 21, 1);
    expect(resolucionSugerida(hex, 1000)).toBe(2);
    expect(resolucionSugerida(hex, 0.1)).toBe(0.15);
  });

  it('la estimación también sirve con triángulos largos y finos (un cilindro)', () => {
    const op = { ...base, proyeccion: 'cilindrica', resolucion: 0.8 };
    const real = texturizar(cilindro(), cuadros, op).malla.tri.length / 3;
    const est = estimarTriangulos(cilindro(), op, null);
    expect(est / real).toBeGreaterThan(0.85);
    expect(est / real).toBeLessThan(3);
  });

  it('un cilindro texturado con la cilíndrica queda cerrado', () => {
    const { malla } = texturizar(cilindro(), lineas, { ...base, proyeccion: 'cilindrica', resolucion: 1, profundidad: 0.6 });
    expect(revisarCerrada(malla).cerrada).toBe(true);
    expect(malla.pos.every(Number.isFinite)).toBe(true);
  });

  it('avisa si la profundidad es grande para el tamaño del modelo', () => {
    expect(texturizar(cubo(), cuadros, { ...base, resolucion: 2, profundidad: 3 }).avisos.join(' ')).toMatch(/10%/);
    expect(texturizar(cubo(), cuadros, { ...base, resolucion: 2, profundidad: 0.5 }).avisos).toEqual([]);
  });

  it('el resultado se exporta a STL y se vuelve a leer igual', () => {
    const { malla } = texturizar(cubo(), cuadros, { ...base, resolucion: 2 });
    const otra = leerStl(stlBinario(malla, 'prueba').buffer);
    expect(otra.tri.length).toBe(malla.tri.length);
    expect(revisarCerrada(otra).cerrada).toBe(true);
  });

  it('normalEnPunto da la normal de la cara que está debajo del punto', () => {
    const n = normalEnPunto(cubo(), [10, 10, 20]);
    expect(n[2]).toBeCloseTo(1, 6);
  });
});

describe('capas', () => {
  const base = { ...PARAMETROS_SUPERFICIE, resolucion: 1, tamanoU: 7, tamanoV: 7, profundidad: 1 };
  const op = (extra = {}) => ({ ...base, ...extra });
  const mismos = (a, b) => a.pos.length === b.pos.length && a.pos.every((x, i) => Math.abs(x - b.pos[i]) < 1e-5);

  it('una sola capa da lo mismo que texturizar', () => {
    const a = texturizar(cubo(), cuadros, op()).malla;
    const b = texturizarCapas(cubo(), [{ textura: cuadros, op: op() }], op()).malla;
    expect(mismos(a, b)).toBe(true);
  });

  it('una capa que cubre todo reemplaza a la de abajo', () => {
    const sola = texturizar(cubo(), lineas, op()).malla;
    const dos = texturizarCapas(cubo(), [{ textura: cuadros, op: op() }, { textura: lineas, op: op() }], op()).malla;
    expect(mismos(sola, dos)).toBe(true);
  });

  it('una capa que suma agrega su relieve: con dos iguales se mueve el doble', () => {
    const una = texturizar(cubo(), cuadros, op({ simetrico: false })).malla;
    const dos = texturizarCapas(cubo(), [{ textura: cuadros, op: op({ simetrico: false }) }, { textura: cuadros, op: op({ simetrico: false, combinar: 'sumar' }) }], op()).malla;
    const c1 = cajaMalla(una), c2 = cajaMalla(dos);
    expect(c2.max[0] - 20).toBeGreaterThan((c1.max[0] - 20) * 1.8);
    expect(c2.max[0] - 20).toBeLessThanOrEqual(2 + 1e-3);
    expect(revisarCerrada(dos).cerrada).toBe(true);
  });

  it('una capa pintada sólo toca su zona y deja el resto como la de abajo', () => {
    const m = cubo();
    const mascara = new Uint8Array(m.tri.length / 3);
    for (let t = 0; t < mascara.length; t++) {
      if ([0, 1, 2].every((k) => m.pos[m.tri[t * 3 + k] * 3 + 2] > 19.99)) mascara[t] = 1; // la tapa de arriba
    }
    const abajo = { textura: lineas, op: op() };
    const arriba = { textura: cuadros, op: op({ modoMascara: 'incluir' }), mascara };
    const dos = texturizarCapas(m, [abajo, arriba], op()).malla;
    const solaAbajo = texturizar(m, lineas, op()).malla;
    // La unión de zonas es todo el modelo, así que se parte igual y los vértices son los mismos:
    // lejos de la tapa (z < 10) manda la capa de abajo y dan lo mismo.
    expect(dos.pos.length).toBe(solaAbajo.pos.length);
    let comparados = 0;
    for (let v = 0; v < dos.pos.length / 3; v++) {
      if (solaAbajo.pos[v * 3 + 2] < 10) {
        comparados++;
        for (let k = 0; k < 3; k++) expect(dos.pos[v * 3 + k]).toBeCloseTo(solaAbajo.pos[v * 3 + k], 5);
      }
    }
    expect(comparados).toBeGreaterThan(100);
    // La tapa en cambio no es igual a la de una sola capa.
    const alturas = (malla) => [...malla.pos].filter((_, i) => i % 3 === 2).filter((z) => z > 19).sort();
    expect(alturas(dos).join()).not.toBe(alturas(solaAbajo).join());
    expect(revisarCerrada(dos).cerrada).toBe(true);
  });

  it('sin capas no cambia nada y la estimación de varias capas usa la unión de sus zonas', () => {
    const m = cubo();
    const r = texturizarCapas(m, [], op());
    expect(r.malla.pos.length).toBe(m.pos.length);
    const soloSello = { textura: cuadros, op: op({ tamanoU: 6, tamanoV: 6, sello: { centro: [10, 10, 20], normal: [0, 0, 1] } }) };
    const todo = { textura: cuadros, op: op() };
    const a = estimarTriangulosCapas(m, [soloSello], 0.5);
    const b = estimarTriangulosCapas(m, [todo], 0.5);
    const c = estimarTriangulosCapas(m, [soloSello, todo], 0.5);
    expect(a).toBeLessThan(b / 3);
    expect(c).toBe(b);
  });
});

describe('vista previa en la GPU', () => {
  const base = { ...PARAMETROS_SUPERFICIE, resolucion: 1, tamanoU: 7, tamanoV: 7, profundidad: 1 };

  it('prepararVista devuelve la malla partida con normales y cuánto recibe cada vértice de cada capa', () => {
    const m = cubo();
    const mascara = new Uint8Array(m.tri.length / 3);
    for (let t = 0; t < mascara.length; t++) {
      if ([0, 1, 2].every((k) => m.pos[m.tri[t * 3 + k] * 3 + 2] > 19.99)) mascara[t] = 1; // la tapa de arriba
    }
    const r = prepararVista(m, [{ op: base }, { op: { ...base, modoMascara: 'incluir' }, mascara }], { resolucion: 1 });
    const nv = r.pos.length / 3;
    expect(r.tri.length / 3).toBeGreaterThan(1000);
    expect(r.normal.length).toBe(nv * 3);
    expect(r.recibe.length).toBe(nv * 4);
    for (let v = 0; v < nv; v++) {
      expect(r.recibe[v * 4]).toBe(1); // la capa 1 recibe en todo
      expect(r.recibe[v * 4 + 2]).toBe(0); // las casillas sin capa quedan en 0
      expect(r.recibe[v * 4 + 3]).toBe(0);
      const z = r.pos[v * 3 + 2];
      if (z < 10) expect(r.recibe[v * 4 + 1]).toBe(0); // lejos de la tapa, la capa 2 no recibe
      if (z > 19.99 && Math.abs(r.pos[v * 3] - 10) < 5 && Math.abs(r.pos[v * 3 + 1] - 10) < 5) expect(r.recibe[v * 4 + 1]).toBe(1);
    }
    expect(r.avisos).toEqual([]);
  });

  it('llenarUniformes carga la proyección, el relieve y el sello de cada capa', () => {
    const u = crearUniformes();
    const m = cilindro();
    const sello = { centro: [1, 2, 3], normal: [0, 0, 1] };
    llenarUniformes(u, m, [
      { op: { ...base, proyeccion: 'cilindrica', ejeCilindro: 'x', empujarAdentro: true, simetrico: false, profundidad: 0.7 } },
      null,
      { op: { ...base, sello, combinar: 'sumar', rotacion: 90 } }
    ], { protegerVoladizos: true, baseLisa: false }, 0);
    expect(Array.from(u.uActiva.value)).toEqual([1, 0, 1, 0]);
    expect(Array.from(u.uTipo.value)).toEqual([1, 0, 6, 0]);
    expect(Array.from(u.uCombinar.value)).toEqual([0, 0, 1, 0]);
    expect(u.uProf.value[0]).toBeCloseTo(-0.7, 6);
    expect(Array.from(u.uEjes.value.slice(0, 3))).toEqual([1, 2, 0]); // eje X: [y, z, x]
    expect(u.uCentro.value[3]).toBeGreaterThan(10); // radio del cilindro
    expect(Array.from(u.uSelloC.value.slice(6, 9))).toEqual([1, 2, 3]);
    expect(u.uDes.value[8 + 2]).toBeCloseTo(0, 6); // cos 90°
    expect(u.uDes.value[8 + 3]).toBeCloseTo(1, 6); // sen 90°
    expect(u.uProteger.value).toBe(1);
    expect(u.uBaseLisa.value).toBe(0);
    // Volver a llenar con menos capas apaga las casillas que sobran.
    llenarUniformes(u, m, [{ op: base }], {}, 0);
    expect(Array.from(u.uActiva.value)).toEqual([1, 0, 0, 0]);
    expect(u.uTipo.value[2]).toBe(0);
  });

  it('las texturas se escriben en su cuadrado del atlas, ya suavizadas o invertidas', () => {
    const u = crearUniformes();
    escribirMapas(u, [{ op: base, textura: cuadros }, { op: { ...base, invertirTextura: true }, textura: cuadros }]);
    const atlas = u.uMapa.value.image.data;
    const lado = LADO_MAPA * 2;
    const dato = (capa, x, y) => atlas[((Math.floor(capa / 2) * LADO_MAPA) + y) * lado + (capa % 2) * LADO_MAPA + x];
    expect(dato(0, 100, 100)).toBeCloseTo(cuadros.datos[100 * cuadros.n + 100], 6);
    expect(dato(1, 100, 100)).toBeCloseTo(1 - cuadros.datos[100 * cuadros.n + 100], 6);
  });

  it('remuestrear no cambia una textura que ya es de 256 y conserva las constantes al cambiar de tamaño', () => {
    expect(remuestrear(cuadros)).toBe(cuadros.datos);
    const chica = { n: 8, datos: new Float32Array(64).fill(0.3) };
    const grande = remuestrear(chica);
    expect(grande.length).toBe(LADO_MAPA * LADO_MAPA);
    expect(grande.every((x) => Math.abs(x - 0.3) < 1e-6)).toBe(true);
  });
});
