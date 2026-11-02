import { describe, it, expect, vi } from 'vitest';
import { soldar, afinarMalla, revisarCerrada, volumenMalla, cajaMalla } from '../src/utils/mallas3d';
import { generarTextura } from '../src/utils/texturasSuperficie';
import { texturizar } from '../src/utils/superficie';
import { decimar } from '../src/utils/decimacion';

vi.setConfig({ testTimeout: 60000 });

function cubo(l = 20) {
  const p = [[0, 0, 0], [l, 0, 0], [l, l, 0], [0, l, 0], [0, 0, l], [l, 0, l], [l, l, l], [0, l, l]];
  const caras = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  const sopa = [];
  for (const [a, b, c, d] of caras) sopa.push(...p[a], ...p[b], ...p[c], ...p[a], ...p[c], ...p[d]);
  return soldar(Float32Array.from(sopa));
}

// Esfera de radio r hecha de franjas de latitud y longitud.
function esfera(r = 10, nLat = 32, nLon = 48) {
  const s = [];
  const p = (i, j) => {
    const a = (i / nLat) * Math.PI, b = (j / nLon) * 2 * Math.PI;
    return [r * Math.sin(a) * Math.cos(b), r * Math.sin(a) * Math.sin(b), r * Math.cos(a)];
  };
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      if (i > 0) s.push(...a, ...d, ...b);
      if (i < nLat - 1) s.push(...b, ...d, ...c);
    }
  }
  return soldar(Float32Array.from(s));
}

describe('decimar', () => {
  it('un cubo con las caras llenas de triángulos vuelve a casi nada sin perder la forma', () => {
    const fino = afinarMalla(cubo(), 1);
    expect(fino.tri.length / 3).toBeGreaterThan(10000);
    const r = decimar(fino, { tolerancia: 0.001 });
    expect(r.despues).toBeLessThan(100);
    expect(revisarCerrada(r).cerrada).toBe(true);
    expect(volumenMalla(r)).toBeCloseTo(8000, 0);
    const c = cajaMalla(r);
    for (let k = 0; k < 3; k++) { expect(c.min[k]).toBeCloseTo(0, 4); expect(c.max[k]).toBeCloseTo(20, 4); }
  });

  it('llega a la cantidad pedida en un modelo con textura y mantiene el sólido cerrado y casi igual', () => {
    const textura = texturizar(cubo(), generarTextura('geo-cuadros'), { resolucion: 0.45, tamanoU: 7, tamanoV: 7, profundidad: 0.6 }).malla;
    const antes = textura.tri.length / 3;
    expect(antes).toBeGreaterThan(40000);
    const objetivo = Math.round(antes / 3);
    const r = decimar(textura, { objetivo });
    expect(r.despues).toBeLessThanOrEqual(objetivo * 1.02);
    expect(r.despues).toBeGreaterThan(objetivo * 0.5);
    expect(revisarCerrada(r).cerrada).toBe(true);
    expect(r.pos.every(Number.isFinite)).toBe(true);
    const v0 = volumenMalla(textura), v1 = volumenMalla(r);
    expect(Math.abs(v1 - v0) / v0).toBeLessThan(0.02);
    const c0 = cajaMalla(textura), c1 = cajaMalla(r);
    for (let k = 0; k < 3; k++) { expect(Math.abs(c1.max[k] - c0.max[k])).toBeLessThan(0.35); expect(Math.abs(c1.min[k] - c0.min[k])).toBeLessThan(0.35); }
  });

  it('una esfera pierde triángulos sin cambiar de volumen ni de tamaño', () => {
    const m = esfera();
    const r = decimar(m, { objetivo: Math.round(m.tri.length / 3 / 2) });
    expect(r.despues).toBeLessThanOrEqual(Math.round(m.tri.length / 3 / 2) * 1.02);
    expect(revisarCerrada(r).cerrada).toBe(true);
    expect(Math.abs(volumenMalla(r) - volumenMalla(m)) / volumenMalla(m)).toBeLessThan(0.03);
  });

  it('sin meta sólo quita lo que no cambia la forma: una esfera casi no se toca', () => {
    const m = esfera();
    const r = decimar(m, { tolerancia: 0.0005 });
    expect(r.despues).toBeGreaterThan((m.tri.length / 3) * 0.9);
  });

  it('no toca el borde de una malla abierta', () => {
    const placa = afinarMalla(soldar(Float32Array.from([0, 0, 0, 20, 0, 0, 20, 20, 0, 0, 0, 0, 20, 20, 0, 0, 20, 0])), 2);
    const r = decimar(placa, { tolerancia: 0.001 });
    expect(r.despues).toBeLessThan(placa.tri.length / 3);
    const c = cajaMalla(r);
    expect(c.min[0]).toBeCloseTo(0, 5); expect(c.max[0]).toBeCloseTo(20, 5);
    expect(c.min[1]).toBeCloseTo(0, 5); expect(c.max[1]).toBeCloseTo(20, 5);
    // La placa sigue siendo plana.
    expect(c.max[2]).toBeCloseTo(0, 5);
  });

  it('con meta cero y tolerancia cero deja la malla como está', () => {
    const m = esfera(10, 8, 12);
    const r = decimar(m, { tolerancia: 0 });
    expect(r.despues).toBe(m.tri.length / 3);
  });
});
