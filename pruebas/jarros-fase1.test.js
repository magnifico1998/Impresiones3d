import { describe, it, expect, beforeAll } from 'vitest';
import { iniciarMotor } from '../src/utils/motorBooleano';

// Las placas y ranuras usan el motor Manifold (WebAssembly): hay que cargarlo antes.
beforeAll(async () => { await iniciarMotor(); });
import {
  PARAMETROS_INICIALES, FORMAS, FORMAS_ASA, EXTRA_MAX, sanearParametros, conForma, conFormaAsa, armarJarro, curvaAsa, perfilExterior, radioExteriorFn
} from '../src/utils/jarros';
import { cajaMalla, volumenMalla, revisarCerrada } from '../src/utils/mallas3d';

const cerrada = (m) => revisarCerrada(m).cerrada;

describe('jarros fase 1: silueta del cuerpo', () => {
  const Ri = 35.25, pared = 3, H = 174;

  it('las siluetas de la lista son sólidos cerrados y la pared nunca queda más fina que la pedida', () => {
    for (const f of FORMAS) {
      const p = conForma({ ...PARAMETROS_INICIALES, asa: false }, f.id);
      const j = armarJarro(p);
      const cuerpo = j.piezas[0].malla;
      expect(cerrada(cuerpo), f.id).toBe(true);
      expect(volumenMalla(cuerpo), f.id).toBeGreaterThan(0);
      const R = radioExteriorFn(p);
      for (let k = 0; k <= 20; k++) expect(R((H * k) / 20), f.id).toBeGreaterThanOrEqual(Ri + pared - 1e-9);
    }
  });

  it('un barril se ensancha en el medio y mantiene el borde y la base', () => {
    const p = conForma(PARAMETROS_INICIALES, 'barril');
    const R = radioExteriorFn(p);
    expect(R(0)).toBeCloseTo(Ri + pared, 4);
    expect(R(H)).toBeCloseTo(Ri + pared, 4);
    expect(R(H / 2)).toBeGreaterThan(Ri + pared + 8);
    const perfil = perfilExterior(p);
    expect(Math.max(...perfil.map(([r]) => r))).toBeLessThanOrEqual(Ri + pared + EXTRA_MAX);
  });

  it('los puntos de la silueta se ordenan, se limitan y siempre hay uno en cada punta', () => {
    const p = sanearParametros({ formaPuntos: [[0.9, 5], [0.5, 99], [0.52, 4], [0.1, -3], [5, 1]] });
    const t = p.formaPuntos.map((q) => q[0]);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(1);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeGreaterThanOrEqual(0.029);
    for (const [, e] of p.formaPuntos) { expect(e).toBeGreaterThanOrEqual(0); expect(e).toBeLessThanOrEqual(EXTRA_MAX); }
    expect(sanearParametros({ formaPuntos: 'x' }).formaPuntos).toEqual([[0, 0], [1, 0]]);
  });

  it('avisa si la pared se abre demasiado hacia arriba', () => {
    const suave = armarJarro({ ...conForma(PARAMETROS_INICIALES, 'cono'), asa: false });
    expect(suave.avisos.join(' ')).not.toMatch(/se abre/);
    const abierta = armarJarro({ ...PARAMETROS_INICIALES, asa: false, altoHueco: 40, formaPuntos: [[0, 0], [0.1, 0], [0.2, 30], [1, 30]] });
    expect(abierta.aperturaPared).toBeGreaterThan(45);
    expect(abierta.avisos.join(' ')).toMatch(/se abre/);
  });

  it('una silueta a medida con el asa pegada y desmontable sigue siendo cerrada', () => {
    for (const asaDesmontable of [false, true]) {
      const j = armarJarro({ ...conForma(PARAMETROS_INICIALES, 'barril'), asaDesmontable });
      expect(cerrada(j.piezas[0].malla), String(asaDesmontable)).toBe(true);
      expect(cerrada(j.piezas[1].malla), String(asaDesmontable)).toBe(true);
    }
  });

  it('el asa pegada sigue la pared curva: empieza dentro de la pared y no llega al hueco', () => {
    const p = conForma(PARAMETROS_INICIALES, 'barril');
    const j = armarJarro(p);
    const c = curvaAsa(p);
    const R = radioExteriorFn(p);
    const entra = cajaMalla(j.piezas[1].malla).min[0];
    expect(entra).toBeLessThan(Math.max(R(c.z1), R(c.z2)));
    expect(entra).toBeGreaterThan(sanearParametros(p).diametroHueco / 2);
  });
});

describe('jarros fase 1: abertura del fondo', () => {
  it('sin abertura el fondo es macizo y con abertura queda un agujero pasante', () => {
    const sin = armarJarro({ ...PARAMETROS_INICIALES, asa: false }).piezas[0].malla;
    const con = armarJarro({ ...PARAMETROS_INICIALES, asa: false, aberturaFondo: 30 }).piezas[0].malla;
    expect(cerrada(con)).toBe(true);
    const quitado = volumenMalla(sin) - volumenMalla(con);
    expect(quitado).toBeGreaterThan(Math.PI * 15 * 15 * 4 * 0.99);
    expect(quitado).toBeLessThan(Math.PI * 15 * 15 * 4 * 1.01);
  });

  it('se limita para dejar aro alrededor y los valores chicos o vacíos son "sin abertura"', () => {
    expect(sanearParametros({ aberturaFondo: 500 }).aberturaFondo).toBeLessThanOrEqual(70.5 - 12);
    expect(sanearParametros({ aberturaFondo: 2 }).aberturaFondo).toBe(0);
    expect(sanearParametros({ aberturaFondo: '' }).aberturaFondo).toBe(0);
  });
});

describe('jarros fase 1: asa de curva libre', () => {
  it('todas las formas de la lista dan un asa cerrada, pegada y desmontable', () => {
    for (const f of FORMAS_ASA) {
      for (const asaDesmontable of [false, true]) {
        const j = armarJarro({ ...conFormaAsa(PARAMETROS_INICIALES, f.id), asaDesmontable });
        const asa = j.piezas[1];
        expect(cerrada(asa.malla), `${f.id} ${asaDesmontable}`).toBe(true);
        expect(volumenMalla(asa.malla), f.id).toBeGreaterThan(0);
        expect(cerrada(j.piezas[0].malla), f.id).toBe(true);
      }
    }
  });

  it('la forma "Sin soportes" se imprime parada sin soportes y sin plegarse sobre sí misma', () => {
    const p = conFormaAsa(PARAMETROS_INICIALES, 'sinsoportes');
    const c = curvaAsa(p);
    const s = sanearParametros(p);
    expect(c.plano).toBeLessThanOrEqual(12);
    expect(c.radioMin).toBeGreaterThan((s.asaGrosor * s.asaExtremos) / 200 + 0.5);
    const j = armarJarro(p);
    expect(j.avisos.join(' ')).not.toMatch(/soportes/);
    expect(j.soportesAsa).toBeLessThanOrEqual(12);
  });

  it('la clásica avisa de los soportes y dice cuántos milímetros son', () => {
    const j = armarJarro(PARAMETROS_INICIALES);
    expect(j.soportesAsa).toBeGreaterThan(12);
    expect(j.avisos.join(' ')).toMatch(/Unos \d+ mm del asa tienen menos de 40°/);
  });

  it('la curva marca qué tramos son planos y los extremos son rectos y horizontales', () => {
    const c = curvaAsa(PARAMETROS_INICIALES);
    expect(c.segPlano).toHaveLength(c.puntos.length - 1);
    expect(c.segPlano.some(Boolean)).toBe(true);
    const [a, b] = [c.puntos[0], c.puntos[1]];
    expect(Math.abs(b[1] - a[1])).toBeLessThan(1e-6);
    const [y, z] = [c.puntos[c.puntos.length - 2], c.puntos[c.puntos.length - 1]];
    expect(Math.abs(z[1] - y[1])).toBeLessThan(1e-6);
    expect(c.z1).toBeGreaterThan(c.z2);
  });

  it('una esquina viva queda como giro brusco y los puntos raros se sanean', () => {
    const angular = curvaAsa(conFormaAsa(PARAMETROS_INICIALES, 'angular'));
    expect(angular.radioMin).toBe(Infinity); // sólo hay rectas y esquinas
    const raro = sanearParametros({ asaPuntos: [[-5, 9], ['x', null], [0.5, 0.5]], asaEsquinas: [0, 7, 'a', 2, 2] });
    for (const [u, v] of raro.asaPuntos) { expect(u).toBeGreaterThanOrEqual(0.08); expect(v).toBeLessThanOrEqual(1.1); }
    expect(raro.asaEsquinas).toEqual([0, 2]);
    expect(sanearParametros({ asaPuntos: [] }).asaPuntos.length).toBeGreaterThan(0);
  });

  it('más gruesa en los extremos: el asa pesa más y los extremos miden más que el medio', () => {
    const gruesa = armarJarro({ ...PARAMETROS_INICIALES, asaExtremos: 150 }).piezas[1].malla;
    const igual = armarJarro({ ...PARAMETROS_INICIALES, asaExtremos: 100 }).piezas[1].malla;
    expect(volumenMalla(gruesa)).toBeGreaterThan(volumenMalla(igual));
    const ancho = (m) => { const c = cajaMalla(m); return c.max[1] - c.min[1]; };
    expect(ancho(igual)).toBeCloseTo(13, 1);
    expect(ancho(gruesa)).toBeCloseTo(13 * 1.5, 1);
  });

  it('girar el asa la lleva alrededor del jarro sin cambiar su forma', () => {
    const a0 = armarJarro({ ...PARAMETROS_INICIALES, asaAngulo: 0 }).piezas[1];
    const a90 = armarJarro({ ...PARAMETROS_INICIALES, asaAngulo: 90 }).piezas[1];
    const c0 = cajaMalla(a0.malla), c90 = cajaMalla(a90.malla);
    expect(c0.max[0]).toBeGreaterThan(40);
    expect(c0.max[1] - c0.min[1]).toBeLessThan(18);
    expect(c90.max[1]).toBeGreaterThan(40); // a 90° sale hacia +Y
    expect(volumenMalla(a90.malla)).toBeCloseTo(volumenMalla(a0.malla), -1);
    expect(cerrada(a90.malla)).toBe(true);
    // La pieza para imprimir no depende del giro.
    expect(cajaMalla(a90.mallaImpresion).max[0]).toBeCloseTo(cajaMalla(a0.mallaImpresion).max[0], 3);
    expect(a90.despiece[1]).toBeGreaterThan(1);
  });

  it('con el asa desmontable girada el cuerpo sigue cerrado y las placas giran con ella', () => {
    const j = armarJarro({ ...PARAMETROS_INICIALES, asaDesmontable: true, asaAngulo: 90 });
    expect(cerrada(j.piezas[0].malla)).toBe(true);
    const c = cajaMalla(j.piezas[0].malla);
    expect(c.max[1]).toBeGreaterThan(c.max[0] + 3); // la placa sobresale en +Y, no en +X
  });
});
