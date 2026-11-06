import { describe, it, expect, beforeAll } from 'vitest';
import { iniciarMotor } from '../src/utils/motorBooleano';

// Las placas y ranuras usan el motor Manifold (WebAssembly): hay que cargarlo antes.
beforeAll(async () => { await iniciarMotor(); });
import {
  LATAS, LATA_PROPIA, PARAMETROS_INICIALES, sanearParametros, conLata, revolucion, caja3d, armarJarro, armarPlaca, entraArmado, nombreJarro, claveEncuadre
} from '../src/utils/jarros';
import { cajaMalla, volumenMalla, revisarCerrada, stlBinario, crear3mf } from '../src/utils/mallas3d';
import { CAMAS } from '../src/utils/camasImpresion';

const cerrada = (m) => revisarCerrada(m).cerrada;
const pieza = (j, id) => j.piezas.find((x) => x.id === id);

describe('jarros: latas y medidas', () => {
  it('arranca con la lata de 500 ml de 70 × 170 mm y un hueco con holgura', () => {
    const l = LATAS.find((x) => x.id === '500');
    expect(l).toMatchObject({ diametro: 70, alto: 170 });
    expect(PARAMETROS_INICIALES).toMatchObject({ latId: '500', holgura: 0.5, diametroHueco: 70.5, altoHueco: 170 });
  });

  it('elegir una lata fija el hueco (lata + holgura) y su alto; una medida propia no los toca', () => {
    const p = conLata({ ...PARAMETROS_INICIALES, holgura: 0.8 }, '330');
    expect(p).toMatchObject({ latId: '330', diametroHueco: 67, altoHueco: 115 });
    expect(conLata(p, LATA_PROPIA)).toMatchObject({ latId: LATA_PROPIA, diametroHueco: 67, altoHueco: 115 });
  });

  it('las medidas se limitan a lo razonable y un campo vacío vuelve a su valor de siempre', () => {
    const p = sanearParametros({ diametroHueco: 5, altoHueco: 9999, pared: '', fondo: 'x', asaAncho: 500 });
    expect(p.diametroHueco).toBe(30);
    expect(p.altoHueco).toBe(300);
    expect(p.pared).toBe(PARAMETROS_INICIALES.pared);
    expect(p.fondo).toBe(PARAMETROS_INICIALES.fondo);
    expect(p.asaAncho).toBeLessThanOrEqual(30);
  });

  it('el ancho del asa no pasa del radio del hueco y los extremos no se pisan', () => {
    const chico = sanearParametros({ diametroHueco: 40, asaAncho: 30 });
    expect(chico.asaAncho).toBeLessThanOrEqual(1.4 * 20 - 6);
    const p = sanearParametros({ altoHueco: 60, asaDistTope: 40, asaDistBase: 40 });
    const alto = p.fondo + p.altoHueco;
    expect(alto - p.asaDistTope - p.asaDistBase).toBeGreaterThanOrEqual(p.asaGrosor + 14 - 1e-9);
  });

  it('los colores inválidos vuelven al de siempre', () => {
    const c = sanearParametros({ colores: { cuerpo: 'rojo', asa: '#00ff00', letras: 'x' } }).colores;
    expect(c.cuerpo).toBe(PARAMETROS_INICIALES.colores.cuerpo);
    expect(c.asa).toBe('#00ff00');
    expect(c.letras).toBe(PARAMETROS_INICIALES.colores.letras);
    expect(Object.keys(c)).toEqual(Object.keys(PARAMETROS_INICIALES.colores));
  });
});

describe('jarros: mallas básicas', () => {
  it('la revolución y la caja son sólidos cerrados, hacia afuera', () => {
    const cil = revolucion([[0, 0], [10, 0], [10, 20], [0, 20]], 64);
    expect(cerrada(cil)).toBe(true);
    expect(volumenMalla(cil)).toBeGreaterThan(0);
    // Un cilindro de 64 lados tiene casi el volumen del cilindro exacto.
    expect(volumenMalla(cil) / (Math.PI * 100 * 20)).toBeGreaterThan(0.99);
    const c = caja3d(0, 2, 0, 3, 0, 4);
    expect(cerrada(c)).toBe(true);
    expect(volumenMalla(c)).toBeCloseTo(24, 4);
  });
});

describe('jarros: cuerpo y asa pegada', () => {
  const j = armarJarro(PARAMETROS_INICIALES);
  const cuerpo = pieza(j, 'cuerpo');
  const asa = pieza(j, 'asa');
  const Ri = 35.25, Ro = 38.25, H = 174;

  it('el cuerpo es un sólido cerrado con el hueco de la lata', () => {
    expect(cerrada(cuerpo.malla)).toBe(true);
    const esperado = Math.PI * (Ro * Ro - Ri * Ri) * H + Math.PI * Ri * Ri * 4;
    expect(volumenMalla(cuerpo.malla) / esperado).toBeGreaterThan(0.995);
    expect(volumenMalla(cuerpo.malla) / esperado).toBeLessThan(1.001);
    const caja = cajaMalla(cuerpo.malla);
    expect(caja.min[2]).toBeCloseTo(0, 4);
    expect(caja.max[2]).toBeCloseTo(H, 4);
    expect(caja.max[0]).toBeCloseTo(Ro, 2);
  });

  it('la lata entra: el hueco mide la lata más la holgura y la lata de referencia queda adentro', () => {
    expect(j.radioHueco * 2).toBeCloseTo(70.5, 6);
    const lata = cajaMalla(j.lata);
    expect(lata.max[0]).toBeCloseTo(35, 2);
    expect(lata.min[2]).toBeCloseTo(4, 4);
    expect(lata.max[2]).toBeCloseTo(174, 4);
    expect(lata.max[0]).toBeLessThan(j.radioHueco);
  });

  it('el asa es un sólido cerrado, se mete en la pared y no entra al hueco', () => {
    expect(cerrada(asa.malla)).toBe(true);
    expect(volumenMalla(asa.malla)).toBeGreaterThan(0);
    const c = cajaMalla(asa.malla);
    expect(c.min[0]).toBeLessThan(Ro); // penetra en la pared
    expect(c.min[0]).toBeGreaterThan(Ri); // pero no llega al hueco
    expect(c.max[0]).toBeGreaterThan(Ro + 35);
    expect(c.min[2]).toBeGreaterThanOrEqual(0);
    expect(c.max[2]).toBeLessThanOrEqual(H);
    expect(asa.desmontable).toBe(false);
  });

  it('las piezas son cuerpo y asa, con su color y despiece', () => {
    expect(j.piezas.map((x) => x.id)).toEqual(['cuerpo', 'asa']);
    expect(cuerpo.color).toBe(PARAMETROS_INICIALES.colores.cuerpo);
    expect(asa.color).toBe(PARAMETROS_INICIALES.colores.asa);
    expect(asa.despiece[0]).toBeGreaterThan(0);
  });

  it('avisa que el asa pegada necesita soportes y que se puede hacer desmontable', () => {
    expect(j.avisos.join(' ')).toMatch(/soportes/);
    expect(j.avisos.join(' ')).toMatch(/desmontable/);
  });

  it('sin asa queda sólo el cuerpo', () => {
    const solo = armarJarro({ ...PARAMETROS_INICIALES, asa: false });
    expect(solo.piezas.map((x) => x.id)).toEqual(['cuerpo']);
  });

  it('la altura y el tamaño de otra lata se reflejan', () => {
    const k = armarJarro(conLata(PARAMETROS_INICIALES, '330'));
    expect(k.alto).toBeCloseTo(119, 4);
    expect(k.radioHueco * 2).toBeCloseTo(66.7, 4);
  });
});

describe('jarros: asa desmontable con encastre', () => {
  const p = { ...PARAMETROS_INICIALES, asaDesmontable: true };
  const j = armarJarro(p);
  const cuerpo = pieza(j, 'cuerpo');
  const asa = pieza(j, 'asa');
  const s = sanearParametros(p);
  const Ri = 35.25, Ro = 38.25;

  it('el cuerpo con las placas y las ranuras sigue siendo un sólido cerrado', () => {
    expect(cerrada(cuerpo.malla)).toBe(true);
    expect(volumenMalla(cuerpo.malla)).toBeGreaterThan(0);
    // Las placas sobresalen de la pared.
    expect(cajaMalla(cuerpo.malla).max[0]).toBeCloseTo(Ro + s.placa, 1);
  });

  it('las placas suman material y las ranuras lo sacan: queda más que el cuerpo liso, pero menos que con las placas macizas', () => {
    const liso = armarJarro({ ...PARAMETROS_INICIALES, asa: false }).piezas[0];
    const maciza = (s.asaAncho + 6) * (s.asaGrosor + 6) * (s.placa + 1.5) * 2;
    const extra = volumenMalla(cuerpo.malla) - volumenMalla(liso.malla);
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThan(maciza);
  });

  it('el asa es una pieza desmontable, cerrada, con espigas que entran en las ranuras con holgura', () => {
    expect(asa.desmontable).toBe(true);
    expect(cerrada(asa.malla)).toBe(true);
    const c = cajaMalla(asa.malla);
    // Las espigas bajan hasta casi el fondo de la ranura (1,2 mm de pared + 0,4 de juego), sin tocar el hueco.
    expect(c.min[0]).toBeCloseTo(Ri + 1.2 + 0.4, 2);
    expect(c.min[0]).toBeGreaterThan(Ri);
    expect(c.max[0]).toBeGreaterThan(Ro + s.placa + 30);
    expect(s.holguraEncastre).toBeGreaterThan(0);
  });

  it('el asa suelta se imprime acostada: sin soportes y con su ancho como alto', () => {
    const c = cajaMalla(asa.mallaImpresion);
    expect(c.min).toEqual([0, 0, 0].map((x, i) => (Math.abs(c.min[i]) < 1e-4 ? 0 : c.min[i])));
    const alto = c.max[2] - c.min[2];
    // Su alto es el ancho de la sección, más grueso en los extremos.
    const esperado = s.asaAncho * (s.asaExtremos / 100);
    expect(alto).toBeGreaterThan(esperado - 0.5);
    expect(alto).toBeLessThan(esperado + 0.5);
    expect(cerrada(asa.mallaImpresion)).toBe(true);
  });

  it('avisa distinto: el asa se imprime aparte, acostada', () => {
    expect(j.avisos.join(' ')).toMatch(/acostada/);
  });
});

describe('jarros: placa de impresión y exportación', () => {
  const j = armarJarro({ ...PARAMETROS_INICIALES, asaDesmontable: true });
  const bambu = CAMAS.find((c) => c.id === 'bambu');
  const chica = CAMAS.find((c) => c.id === 'chica');

  it('acomoda las piezas sueltas dentro de la cama, sin pisarse', () => {
    const { cuerpos, entra } = armarPlaca(j.piezas, bambu);
    expect(entra).toBe(true);
    expect(cuerpos).toHaveLength(2);
    const cajas = cuerpos.map((c) => cajaMalla(c.malla));
    for (const c of cajas) {
      expect(c.min[0]).toBeGreaterThanOrEqual(0);
      expect(c.min[1]).toBeGreaterThanOrEqual(0);
      expect(c.max[0]).toBeLessThanOrEqual(bambu.x);
      expect(c.max[1]).toBeLessThanOrEqual(bambu.y);
      expect(c.min[2]).toBeCloseTo(0, 4);
    }
    const [a, b] = cajas;
    const separadas = a.max[0] <= b.min[0] || b.max[0] <= a.min[0] || a.max[1] <= b.min[1] || b.max[1] <= a.min[1];
    expect(separadas).toBe(true);
  });

  it('avisa si las piezas no entran en una cama chica', () => {
    expect(armarPlaca(j.piezas, { x: 60, y: 60 }).entra).toBe(false);
    expect(armarPlaca(j.piezas, chica).entra).toBe(true);
  });

  it('exporta STL y 3MF con una pieza por cuerpo', () => {
    const todo = j.piezas.map((x) => x.malla);
    expect(stlBinario(todo[0], 'Cuerpo').length).toBeGreaterThan(84);
    const cuerpos = j.piezas.map((x) => ({ nombre: x.nombre, color: x.color, malla: x.malla }));
    expect(crear3mf(cuerpos, { ensamblado: true }).length).toBeGreaterThan(100);
    expect(crear3mf(armarPlaca(j.piezas, bambu).cuerpos, { ensamblado: false }).length).toBeGreaterThan(100);
  });

  it('el jarro parado entra en la cama de 256 mm y el nombre del archivo lleva las medidas', () => {
    expect(entraArmado(j, bambu).entra).toBe(true);
    expect(j.alto).toBeLessThan(250);
    expect(nombreJarro(PARAMETROS_INICIALES)).toBe('Jarro 71x170');
  });
});

describe('jarros: encuadre de la cámara', () => {
  it('sólo cambia con el tamaño de la lata: no al mover el cartel, el asa o la silueta', () => {
    const base = claveEncuadre(PARAMETROS_INICIALES);
    const otros = [
      { cartel: true, cartelAngulo: 40, cartelAltura: 120 }, { asaAngulo: 90 }, { asaSalida: 60 }, { asaDesmontable: true },
      { formaPuntos: [[0, 0], [0.5, 12], [1, 0]] }, { aberturaFondo: 30 }, { pared: 5 }
    ];
    for (const extra of otros) expect(claveEncuadre({ ...PARAMETROS_INICIALES, ...extra }), JSON.stringify(extra)).toBe(base);
    expect(claveEncuadre(conLata(PARAMETROS_INICIALES, '330'))).not.toBe(base);
    expect(claveEncuadre({ ...PARAMETROS_INICIALES, altoHueco: 200 })).not.toBe(base);
  });
});
