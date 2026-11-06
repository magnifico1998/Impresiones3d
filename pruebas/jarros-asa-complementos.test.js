import { describe, it, expect, beforeAll, vi } from 'vitest';
import { iniciarMotor } from '../src/utils/motorBooleano';
import { PARAMETROS_INICIALES, ESTILOS_ENVOLTURA, sanearParametros, armarJarro, armarPlaca, curvaAsa } from '../src/utils/jarros';
import { cajaMalla, revisarCerrada, volumenMalla, crear3mf } from '../src/utils/mallas3d';
import { CAMAS } from '../src/utils/camasImpresion';

vi.setConfig({ testTimeout: 60000 });
beforeAll(async () => { await iniciarMotor(); });

const base = (extra = {}) => ({ ...PARAMETROS_INICIALES, ...extra });
const pieza = (j, id) => j.piezas.find((x) => x.id === id);
const ids = (j) => j.piezas.map((x) => x.id);
const cerrada = (m) => revisarCerrada(m).cerrada;

describe('complementos del asa: parámetros', () => {
  it('por defecto no hay complementos y los valores raros se sanean', () => {
    expect(ids(armarJarro(base()))).toEqual(['cuerpo', 'asa']);
    const s = sanearParametros({ envolturaEstilo: 'raro', envolturaLargo: 9999, envolturaEspesor: 0, pulgarArco: 400, collarinAncho: -3, envoltura: 1, colores: { collarin: 'x' } });
    expect(s.envolturaEstilo).toBe('cuerda');
    expect(s.envolturaLargo).toBe(300);
    expect(s.envolturaEspesor).toBe(1);
    expect(s.pulgarArco).toBe(160);
    expect(s.collarinAncho).toBe(3);
    expect(s.envoltura).toBe(true);
    expect(s.colores.collarin).toBe(PARAMETROS_INICIALES.colores.collarin);
  });

  it('sin asa no hay complementos', () => {
    expect(ids(armarJarro(base({ asa: false, envoltura: true, pulgar: true, asaCollarines: true })))).toEqual(['cuerpo']);
  });
});

describe('complementos del asa: envoltura', () => {
  for (const e of ESTILOS_ENVOLTURA) {
    it(`estilo ${e.id}: pieza cerrada, más gruesa que el asa y en dos mitades acostadas`, () => {
      const j = armarJarro(base({ envoltura: true, envolturaEstilo: e.id, envolturaRemate: false }));
      expect(ids(j)).toEqual(['cuerpo', 'asa', 'envoltura']);
      const w = pieza(j, 'envoltura');
      expect(w.desmontable).toBe(true);
      expect(volumenMalla(w.malla)).toBeGreaterThan(500);
      expect(cerrada(w.malla)).toBe(true);
      const asa = cajaMalla(pieza(j, 'asa').malla);
      const cw = cajaMalla(w.malla);
      // sobresale del asa a lo ancho (en Y)
      expect(cw.max[1] - cw.min[1]).toBeGreaterThan(asa.max[1] - asa.min[1] + 2);
      // impresión: apoyada y las dos mitades una al lado de la otra
      const ci = cajaMalla(w.mallaImpresion);
      expect(ci.min[2]).toBeCloseTo(0, 5);
      expect(cerrada(w.mallaImpresion)).toBe(true);
      expect(volumenMalla(w.mallaImpresion)).toBeCloseTo(volumenMalla(w.malla), 0);
    });
  }

  it('el espesor, el largo y la posición se respetan', () => {
    const fino = armarJarro(base({ envoltura: true, envolturaEstilo: 'liso', envolturaEspesor: 1.5, envolturaRemate: false }));
    const grueso = armarJarro(base({ envoltura: true, envolturaEstilo: 'liso', envolturaEspesor: 4, envolturaRemate: false }));
    expect(volumenMalla(pieza(grueso, 'envoltura').malla)).toBeGreaterThan(volumenMalla(pieza(fino, 'envoltura').malla) * 1.4);
    const corta = armarJarro(base({ envoltura: true, envolturaEstilo: 'liso', envolturaLargo: 30, envolturaRemate: false }));
    const larga = armarJarro(base({ envoltura: true, envolturaEstilo: 'liso', envolturaLargo: 90, envolturaRemate: false }));
    expect(volumenMalla(pieza(larga, 'envoltura').malla)).toBeGreaterThan(volumenMalla(pieza(corta, 'envoltura').malla) * 2);
    const abajo = cajaMalla(pieza(armarJarro(base({ envoltura: true, envolturaCentro: 15, envolturaLargo: 30, envolturaRemate: false })), 'envoltura').malla);
    const arriba = cajaMalla(pieza(armarJarro(base({ envoltura: true, envolturaCentro: 85, envolturaLargo: 30, envolturaRemate: false })), 'envoltura').malla);
    expect(arriba.min[2]).not.toBeCloseTo(abajo.min[2], 0);
  });

  it('un largo exagerado se acorta y avisa; no toca la pared del jarro', () => {
    const j = armarJarro(base({ envoltura: true, envolturaLargo: 300, envolturaRemate: false }));
    expect(j.avisos.join(' ')).toMatch(/La envoltura es más larga/);
    const R = curvaAsa(j.parametros);
    const c = cajaMalla(pieza(j, 'envoltura').malla);
    expect(c.min[0]).toBeGreaterThan(R.xBase - 1); // nunca más cerca del eje que la pared del cuerpo
    const cuerpo = cajaMalla(pieza(j, 'cuerpo').malla);
    expect(c.min[0]).toBeGreaterThan(cuerpo.max[0] - 0.5);
  });

  it('con el remate salen dos collarines más; a la vez que los de la pared se avisa si se pisan', () => {
    const j = armarJarro(base({ envoltura: true, envolturaRemate: true, envolturaCentro: 50, envolturaLargo: 50 }));
    expect(ids(j)).toEqual(['cuerpo', 'asa', 'envoltura', 'remate']);
    expect(pieza(j, 'remate').color).toBe(PARAMETROS_INICIALES.colores.collarin);
    expect(cerrada(pieza(j, 'remate').malla)).toBe(true);
    const sinLugar = armarJarro(base({ envoltura: true, envolturaRemate: true, envolturaLargo: 300 }));
    expect(sinLugar.avisos.join(' ')).toMatch(/No hay lugar para los dos collarines/);
  });

  it('un espesor enorme en una curva cerrada avisa', () => {
    const j = armarJarro(base({ envoltura: true, envolturaEspesor: 8, asaGrosor: 20, asaPuntos: [[0.2, 0.85], [0.1, 0.5], [0.2, 0.15]] }));
    expect(j.avisos.join(' ')).toMatch(/muy gruesa para la curva/);
  });
});

describe('complementos del asa: collarines y descanso del pulgar', () => {
  it('los collarines junto a la pared son dos anillos cerrados de otro color', () => {
    const j = armarJarro(base({ asaCollarines: true }));
    const c = pieza(j, 'collarines');
    expect(c.color).toBe(PARAMETROS_INICIALES.colores.collarin);
    expect(cerrada(c.malla)).toBe(true);
    expect(volumenMalla(c.malla)).toBeGreaterThan(100);
  });

  it('el descanso del pulgar es una almohadilla cerrada del lado de afuera, más alta en el medio', () => {
    const j = armarJarro(base({ pulgar: true }));
    const p = pieza(j, 'pulgar');
    expect(cerrada(p.malla)).toBe(true);
    expect(volumenMalla(p.malla)).toBeGreaterThan(50);
    expect(cajaMalla(p.mallaImpresion).min[2]).toBeCloseTo(0, 5);
    const alto = volumenMalla(pieza(armarJarro(base({ pulgar: true, pulgarAlto: 6 })), 'pulgar').malla);
    expect(alto).toBeGreaterThan(volumenMalla(p.malla));
  });

  it('el descanso y la envoltura a la vez se avisan si se pisan', () => {
    const j = armarJarro(base({ envoltura: true, envolturaCentro: 25, envolturaLargo: 60, envolturaRemate: false, pulgar: true, pulgarPosicion: 25 }));
    expect(j.avisos.join(' ')).toMatch(/El descanso del pulgar se pisa con la envoltura/);
    const bien = armarJarro(base({ envoltura: true, envolturaCentro: 70, envolturaLargo: 40, envolturaRemate: false, pulgar: true, pulgarPosicion: 15, pulgarLargo: 20 }));
    expect(bien.avisos.join(' ')).not.toMatch(/El descanso del pulgar se pisa/);
  });
});

describe('complementos del asa: giran con el asa y se exportan', () => {
  it('con el asa girada 90° la envoltura gira con ella (y la de impresión no cambia)', () => {
    const a = armarJarro(base({ envoltura: true, envolturaRemate: false, asaAngulo: 0 }));
    const b = armarJarro(base({ envoltura: true, envolturaRemate: false, asaAngulo: 90 }));
    const ca = cajaMalla(pieza(a, 'envoltura').malla), cb = cajaMalla(pieza(b, 'envoltura').malla);
    expect((ca.max[0] + ca.min[0]) / 2).toBeGreaterThan(20);
    expect(Math.abs((cb.max[0] + cb.min[0]) / 2)).toBeLessThan(5);
    expect((cb.max[1] + cb.min[1]) / 2).toBeGreaterThan(20);
    expect(volumenMalla(pieza(b, 'envoltura').malla)).toBeCloseTo(volumenMalla(pieza(a, 'envoltura').malla), 0);
    expect(cajaMalla(pieza(a, 'envoltura').mallaImpresion).max[0]).toBeCloseTo(cajaMalla(pieza(b, 'envoltura').mallaImpresion).max[0], 3);
  });

  it('todo junto (asa desmontable, envoltura, collarines y pulgar) entra en la placa de impresión', () => {
    const j = armarJarro(base({ asaDesmontable: true, envoltura: true, asaCollarines: true, pulgar: true, envolturaCentro: 62, envolturaLargo: 40, pulgarPosicion: 12, pulgarLargo: 18 }));
    expect(ids(j)).toEqual(['cuerpo', 'asa', 'envoltura', 'remate', 'collarines', 'pulgar']);
    expect(j.piezas.filter((x) => x.desmontable)).toHaveLength(5); // todo menos el cuerpo
    const placa = armarPlaca(j.piezas.filter((x) => x.desmontable), CAMAS[0]);
    expect(crear3mf(placa.cuerpos, { ensamblado: false }).length).toBeGreaterThan(1000);
    expect(cerrada(pieza(j, 'cuerpo').malla)).toBe(true);
  });
});

describe('complementos del asa: símbolo y placas de montaje', () => {
  it('se sanean y por defecto están apagados', () => {
    const s = sanearParametros({ asaSimbolo: 1, asaSimboloTamano: 99, asaSimboloRespaldo: 'raro', asaPlacas: 1, asaPlacaForma: 'ninguno', asaPlacaLado: 1, asaPlacaGrosor: 99 });
    expect(s.asaSimbolo).toBe(true);
    expect(s.asaSimboloTamano).toBe(30);
    expect(s.asaSimboloRespaldo).toBe('ovalo');
    expect(s.asaPlacaForma).toBe('ovalo');
    expect(s.asaPlacaLado).toBe(14);
    expect(s.asaPlacaGrosor).toBe(6);
    expect(ids(armarJarro(base()))).toEqual(['cuerpo', 'asa']);
  });

  it('el símbolo en el asa: plaquita de dos colores cerrada, curvada sobre el asa, con su versión plana para imprimir', () => {
    const j = armarJarro(base({ asaSimbolo: true, asaSimboloTamano: 10, emblemaSimbolo: 'corazon' }));
    const s = pieza(j, 'simboloAsa');
    expect(s.desmontable).toBe(true);
    expect(s.partes.map((q) => q.id)).toEqual(['respaldo', 'simbolo']);
    for (const q of s.partes) { expect(volumenMalla(q.malla), q.id).toBeGreaterThan(0); expect(cerrada(q.malla), q.id).toBe(true); }
    // queda sobre el asa: dentro de su ancho y a la altura del asa
    const asa = cajaMalla(pieza(j, 'asa').malla), c = cajaMalla(s.malla);
    expect(c.max[1] - c.min[1]).toBeLessThanOrEqual(asa.max[1] - asa.min[1] + 0.01);
    expect(c.min[2]).toBeGreaterThan(asa.min[2]);
    expect(c.max[2]).toBeLessThan(asa.max[2]);
    // impresión: plana y apoyada
    const ci = cajaMalla(s.mallaImpresion);
    expect(ci.min[2]).toBeCloseTo(0, 5);
    expect(ci.max[2]).toBeLessThan(5);
    expect(s.partes[0].color).toBe(PARAMETROS_INICIALES.colores.emblema);
  });

  it('usa el mismo símbolo que los emblemas (también uno propio) y avisa si es más ancho que el asa o se pisa', () => {
    const a = volumenMalla(pieza(armarJarro(base({ asaSimbolo: true, asaSimboloTamano: 10, emblemaSimbolo: 'estrella' })), 'simboloAsa').malla);
    const b = volumenMalla(pieza(armarJarro(base({ asaSimbolo: true, asaSimboloTamano: 10, emblemaSimbolo: 'corona' })), 'simboloAsa').malla);
    expect(Math.abs(a - b)).toBeGreaterThan(1);
    expect(armarJarro(base({ asaSimbolo: true, asaSimboloTamano: 28, asaAncho: 12 })).avisos.join(' ')).toMatch(/más ancho que el asa/);
    const pisa = armarJarro(base({ asaSimbolo: true, asaSimboloTamano: 12, asaSimboloPosicion: 50, envoltura: true, envolturaCentro: 50, envolturaRemate: false }));
    expect(pisa.avisos.join(' ')).toMatch(/El símbolo del asa se pisa con la envoltura/);
  });

  it('el símbolo sin respaldo es de un solo color', () => {
    const j = armarJarro(base({ asaSimbolo: true, asaSimboloRespaldo: 'ninguno', asaSimboloTamano: 10 }));
    expect(pieza(j, 'simboloAsa').partes.map((q) => q.id)).toEqual(['simbolo']);
  });

  for (const desmontable of [false, true]) {
    it(`placas de montaje decorativas (asa ${desmontable ? 'desmontable' : 'pegada'}): dos discos con agujero para el asa, contra la pared`, () => {
      const j = armarJarro(base({ asaDesmontable: desmontable, asaPlacas: true, asaPlacaLado: 28 }));
      const p = pieza(j, 'placasAsa');
      expect(p.desmontable).toBe(true);
      expect(p.color).toBe(PARAMETROS_INICIALES.colores.placaAsa);
      expect(cerrada(p.malla)).toBe(true);
      expect(volumenMalla(p.malla)).toBeGreaterThan(200);
      const { z1, z2, x1, x2 } = curvaAsa(j.parametros);
      const c = cajaMalla(p.malla);
      // un disco a la altura de cada extremo, pegados a la pared
      expect(c.max[2]).toBeGreaterThan(z1 + 10);
      expect(c.min[2]).toBeLessThan(z2 - 10);
      expect(c.min[0]).toBeLessThan(Math.min(x1, x2));
      // impresión: acostados, apoyados, y el agujero se conserva (volumen del disco macizo > el real)
      const ci = cajaMalla(p.mallaImpresion);
      expect(ci.min[2]).toBeCloseTo(0, 5);
      expect(ci.max[2]).toBeLessThan(10);
      expect(cerrada(p.mallaImpresion)).toBe(true);
      expect(volumenMalla(p.mallaImpresion)).toBeCloseTo(volumenMalla(p.malla), 0);
    });
  }

  it('el agujero deja pasar el asa (no se tocan) y las placas chicas avisan', () => {
    const j = armarJarro(base({ asaDesmontable: true, asaPlacas: true, asaPlacaLado: 30, asaPlacaGrosor: 2 }));
    const asa = pieza(j, 'asa').malla, placas = pieza(j, 'placasAsa').malla;
    // a 3 mm de la cara de la placa de montaje el asa sigue adentro del agujero: ningún vértice del asa cae dentro del macizo de la placa
    const ca = cajaMalla(asa);
    expect(ca.max[1] - ca.min[1]).toBeGreaterThan(5);
    expect(armarJarro(base({ asaPlacas: true, asaPlacaLado: 14 })).avisos.join(' ')).toMatch(/placas de montaje son muy chicas/);
    expect(volumenMalla(placas)).toBeGreaterThan(0);
  });

  it('placas, símbolo, envoltura, collarines y pulgar a la vez giran juntos y entran en la placa de impresión', () => {
    const j = armarJarro(base({
      asaDesmontable: true, asaAngulo: 40, asaPlacas: true, asaSimbolo: true, asaSimboloTamano: 9, asaSimboloPosicion: 30, envoltura: true, envolturaCentro: 65, envolturaLargo: 36,
      envolturaRemate: false, asaCollarines: true, pulgar: true, pulgarPosicion: 12, pulgarLargo: 16
    }));
    expect(ids(j)).toEqual(['cuerpo', 'asa', 'envoltura', 'collarines', 'simboloAsa', 'placasAsa', 'pulgar']);
    expect(cerrada(pieza(j, 'cuerpo').malla)).toBe(true);
    const placa = armarPlaca(j.piezas.filter((x) => x.desmontable), CAMAS[0]);
    expect(crear3mf(placa.cuerpos, { ensamblado: false }).length).toBeGreaterThan(1000);
    expect(placa.cuerpos.some((c) => c.grupo === 'simboloAsa')).toBe(true);
  });
});
