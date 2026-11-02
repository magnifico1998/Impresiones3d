import { describe, it, expect } from 'vitest';
import { soldar, leerStl, stlBinario, volumenMalla, revisarCerrada, crear3mf, leer3mf, partesSueltas, transformarMalla, matrizRotacion, matrizAlinear, afinarMalla } from '../src/utils/mallas3d';
import { seleccionVarita, seleccionPincel, suavizarSeleccion, repararPuntas, separarZona, revisarResultado, triangular, ErrorCorte } from '../src/utils/separarPiezas';
import { puedeUsarHerramientas } from '../src/utils/accesoHerramientas';

// Caja de lx × ly × lz mm con cada cara dividida en n × n cuadrados (como
// una malla de grilla, con muchos puntos alineados en los bordes).
function caja(lx, ly, lz, n = 8) {
  const sopa = [];
  const cara = (o, a, b) => {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = (s, t) => [0, 1, 2].map((k) => o[k] + a[k] * s / n + b[k] * t / n);
      const p00 = p(i, j), p10 = p(i + 1, j), p11 = p(i + 1, j + 1), p01 = p(i, j + 1);
      sopa.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  };
  cara([0, 0, lz], [lx, 0, 0], [0, ly, 0]); // arriba (+z)
  cara([0, 0, 0], [0, ly, 0], [lx, 0, 0]); // abajo
  cara([0, 0, 0], [lx, 0, 0], [0, 0, lz]); // y = 0
  cara([0, ly, 0], [0, 0, lz], [lx, 0, 0]); // y = ly
  cara([0, 0, 0], [0, 0, lz], [0, ly, 0]); // x = 0
  cara([lx, 0, 0], [0, ly, 0], [0, 0, lz]); // x = lx
  return soldar(Float32Array.from(sopa));
}

// Marca los triángulos de la cara de arriba cuyo centro cae en el rectángulo.
function seleccionArriba(m, x0, x1, y0, y1, lz) {
  const sel = new Uint8Array(m.tri.length / 3);
  for (let t = 0; t < sel.length; t++) {
    const c = [0, 1, 2].map((k) => (m.pos[m.tri[t * 3] * 3 + k] + m.pos[m.tri[t * 3 + 1] * 3 + k] + m.pos[m.tri[t * 3 + 2] * 3 + k]) / 3);
    if (Math.abs(c[2] - lz) < 1e-4 && c[0] > x0 && c[0] < x1 && c[1] > y0 && c[1] < y1) sel[t] = 1;
  }
  return sel;
}

describe('mallas', () => {
  it('la caja de prueba es un sólido cerrado con el volumen correcto', () => {
    const m = caja(20, 10, 5);
    expect(revisarCerrada(m).cerrada).toBe(true);
    expect(volumenMalla(m)).toBeCloseTo(1000, 3);
  });
  it('STL binario: escribe y vuelve a leer igual', () => {
    const m = caja(20, 10, 5, 3);
    const leida = leerStl(stlBinario(m).buffer);
    expect(leida.tri.length).toBe(m.tri.length);
    expect(volumenMalla(leida)).toBeCloseTo(1000, 2);
  });
  it('STL ASCII', () => {
    const txt = `solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t`;
    const m = leerStl(new TextEncoder().encode(txt).buffer);
    expect(m.tri.length).toBe(3);
    expect(m.pos.length).toBe(9);
  });
  it('3MF: escribe y vuelve a leer las piezas con su posición', () => {
    const a = caja(10, 10, 10, 2);
    const b = transformarMalla(caja(5, 5, 5, 2), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1]);
    const zip = crear3mf([{ nombre: 'A', color: '#ff0000', malla: a }, { nombre: 'B', color: '#00ff00', malla: b }]);
    const cuerpos = leer3mf(zip.buffer);
    expect(cuerpos.length).toBe(2);
    expect(volumenMalla(cuerpos[1].malla)).toBeCloseTo(125, 2);
    expect(cuerpos[1].malla.pos[0]).toBeGreaterThanOrEqual(20);
  });
  it('separa partes sueltas', () => {
    const a = caja(10, 10, 10, 2);
    const b = transformarMalla(caja(5, 5, 5, 2), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1]);
    const junta = { pos: Float32Array.from([...a.pos, ...b.pos]), tri: Uint32Array.from([...a.tri, ...[...b.tri].map((v) => v + a.pos.length / 3)]) };
    expect(partesSueltas(junta).length).toBe(2);
  });
  it('rotaciones: alinear un vector con otro', () => {
    const m = matrizAlinear([0, 0, 1], [0, 0, -1]);
    const r = transformarMalla({ pos: Float32Array.from([0, 0, 1]), tri: new Uint32Array() }, m);
    expect(r.pos[2]).toBeCloseTo(-1, 6);
    const m2 = matrizAlinear([1, 0, 0], [0, 0, -1]);
    const r2 = transformarMalla({ pos: Float32Array.from([1, 0, 0]), tri: new Uint32Array() }, m2);
    expect([...r2.pos].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([0, 0, -1]);
    expect(volumenMalla(transformarMalla(caja(2, 2, 2, 1), matrizRotacion('x', 90)))).toBeCloseTo(8, 4);
  });
});

describe('selección', () => {
  it('la varita se frena en las aristas vivas', () => {
    const m = caja(20, 10, 5, 4);
    const sel = seleccionVarita(m, 0, { anguloMax: 30 });
    expect(sel.length).toBe(32); // una cara entera: 4×4×2
  });
  it('el pincel marca sólo lo cercano', () => {
    const m = caja(20, 20, 5, 10);
    const sel = seleccionPincel(m, 0, [1, 1, 5], 3);
    expect(sel.length).toBeGreaterThan(1);
    expect(sel.length).toBeLessThan(80);
  });
  it('suavizar rellena agujeritos', () => {
    const m = caja(20, 20, 5, 10);
    const sel = seleccionArriba(m, 4, 16, 4, 16, 5);
    const conAgujero = Uint8Array.from(sel);
    const idx = sel.findIndex((v, i) => v && i > 60);
    conAgujero[idx] = 0;
    const s = suavizarSeleccion(m, conAgujero);
    expect(s[idx]).toBe(1);
  });
});

describe('triangular', () => {
  it('usa los puntos alineados', () => {
    const cuadrado = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
    const caras = triangular(cuadrado, []);
    const usados = new Set(caras.flat());
    expect(usados.size).toBe(8);
    const area = caras.reduce((s, [a, b, c]) => s + Math.abs((cuadrado[b][0] - cuadrado[a][0]) * (cuadrado[c][1] - cuadrado[a][1]) - (cuadrado[c][0] - cuadrado[a][0]) * (cuadrado[b][1] - cuadrado[a][1])) / 2, 0);
    expect(area).toBeCloseTo(4, 6);
  });
});

describe('separar una zona', () => {
  const lz = 10;
  const m = caja(40, 40, lz, 10);
  const sel = seleccionArriba(m, 8, 32, 8, 32, lz);

  it('cierre plano sin encastre: dos sólidos cerrados que suman el volumen original', () => {
    const r = separarZona(m, sel, { cierre: 'plano', profundidad: 3, encastre: 'ninguno' });
    const rev = revisarResultado(m, r);
    expect(rev.problemas).toEqual([]);
    expect(rev.volumenPieza).toBeCloseTo(24 * 24 * 3, 1);
    expect(rev.diferenciaVolumen).toBeCloseTo(0, 1);
  });
  for (const encastre of ['perno', 'doble', 'llave']) {
    it(`cierre plano con ${encastre}: sólidos cerrados`, () => {
      const r = separarZona(m, sel, { cierre: 'plano', profundidad: 4, encastre, diametro: 4, alto: 2, holgura: 0.15 });
      const rev = revisarResultado(m, r);
      expect(rev.problemas).toEqual([]);
      // El agujero lleva holgura: la suma queda apenas por debajo del original.
      expect(rev.diferenciaVolumen).toBeLessThan(0);
      expect(rev.diferenciaVolumen).toBeGreaterThan(-20);
    });
  }
  it('cierre curvo: cerrado', () => {
    const r = separarZona(m, sel, { cierre: 'curvo', profundidad: 2 });
    const rev = revisarResultado(m, r);
    expect(rev.problemas).toEqual([]);
    expect(rev.diferenciaVolumen).toBeCloseTo(0, 1);
  });
  it('avisa si el hueco atraviesa el modelo', () => {
    const r = separarZona(m, sel, { cierre: 'plano', profundidad: 9.5 });
    const rev = revisarResultado(m, r);
    expect(rev.problemas.some((p) => p.tipo === 'error' && p.puntos.length > 0)).toBe(true);
  });
  it('rechaza un encastre que no entra', () => {
    const chica = seleccionArriba(m, 16, 24, 16, 24, lz);
    expect(() => separarZona(m, chica, { cierre: 'plano', profundidad: 3, encastre: 'perno', diametro: 8, alto: 2 })).toThrow(ErrorCorte);
  });
  it('rechaza seleccionar todo o nada', () => {
    expect(() => separarZona(m, new Uint8Array(m.tri.length / 3), {})).toThrow(ErrorCorte);
    expect(() => separarZona(m, new Uint8Array(m.tri.length / 3).fill(1), {})).toThrow(ErrorCorte);
  });
  it('zona que se dobla: pide cierre curvo', () => {
    // Esfera (caja afinada e inflada) con casi toda la superficie marcada.
    const c = afinarMalla(transformarMalla(caja(2, 2, 2, 1), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, -1, -1, 1]), 0.3);
    for (let i = 0; i < c.pos.length; i += 3) {
      const l = Math.hypot(c.pos[i], c.pos[i + 1], c.pos[i + 2]) / 10;
      c.pos[i] /= l; c.pos[i + 1] /= l; c.pos[i + 2] /= l;
    }
    const s = repararPuntas(c, Uint8Array.from({ length: c.tri.length / 3 }, (_, t) => (c.pos[c.tri[t * 3] * 3 + 2] > -5 ? 1 : 0)));
    expect(() => separarZona(c, s, { cierre: 'plano' })).toThrow(/curvo/);
    const r = separarZona(c, s, { cierre: 'curvo', profundidad: 1 });
    expect(revisarResultado(c, r).problemas).toEqual([]);
  });
});

describe('acceso por plan', () => {
  it('prueba sin plan, plan con la herramienta y admin', () => {
    expect(puedeUsarHerramientas({ suscripcion: { estado: 'trial' }, planContratado: null })).toBe(true);
    expect(puedeUsarHerramientas({ suscripcion: { estado: 'activa', planId: 'p' }, planContratado: { herramientasStl: true } })).toBe(true);
    expect(puedeUsarHerramientas({ suscripcion: { estado: 'activa', planId: 'p' }, planContratado: { herramientasStl: false } })).toBe(false);
    expect(puedeUsarHerramientas({ suscripcion: { estado: 'lectura', planId: 'p' }, planContratado: { herramientasStl: true } })).toBe(false);
    expect(puedeUsarHerramientas({ suscripcion: { estado: 'lectura' }, planContratado: null, isAdmin: true })).toBe(true);
  });
});

describe('afinar malla', () => {
  it('parte los triángulos largos sin cambiar la forma y sigue cerrada', () => {
    const m = caja(20, 10, 5, 1);
    const f = afinarMalla(m, 1);
    expect(f.tri.length).toBeGreaterThan(m.tri.length * 20);
    expect(revisarCerrada(f).cerrada).toBe(true);
    expect(volumenMalla(f)).toBeCloseTo(1000, 2);
  });
  it('respeta el tope de triángulos', () => {
    const f = afinarMalla(caja(100, 100, 100, 1), 0.1, 5000);
    expect(f.tri.length / 3).toBeLessThan(5000 * 4 + 1);
  });
});
