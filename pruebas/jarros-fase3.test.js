import { describe, it, expect, beforeAll, vi } from 'vitest';
import { iniciarMotor } from '../src/utils/motorBooleano';
import { PARAMETROS_INICIALES, SIMBOLOS, RESPALDOS, sanearParametros, curvaAsa, armarJarro, armarPlaca, partesDe, radioExteriorFn } from '../src/utils/jarros';
import { cajaMalla, volumenMalla, revisarCerrada, crear3mf } from '../src/utils/mallas3d';
import { CAMAS } from '../src/utils/camasImpresion';

vi.setConfig({ testTimeout: 60000 });
beforeAll(async () => { await iniciarMotor(); });

const cerrada = (m) => revisarCerrada(m).cerrada;
const base = (extra = {}) => ({ ...PARAMETROS_INICIALES, asa: false, ...extra });
const pieza = (j, id) => j.piezas.find((x) => x.id === id);
const ids = (j) => j.piezas.map((x) => x.id);

describe('fase 3: parámetros', () => {
  it('por defecto no hay emblemas ni aros, y los valores raros se sanean', () => {
    expect(PARAMETROS_INICIALES.emblema).toBe(false);
    expect(ids(armarJarro(base()))).toEqual(['cuerpo']);
    const s = sanearParametros({
      emblemaSimbolo: 'no existe', emblemaRespaldo: 'raro', emblemaCantidad: 9.4, emblemaTamano: 500, aroAlto: -3, aroRemaches: 99.6, aroArriba: 1, colores: { aro: 'rojo' }
    });
    expect(s.emblemaSimbolo).toBe('estrella');
    expect(s.emblemaRespaldo).toBe('ovalo');
    expect(s.emblemaCantidad).toBe(4);
    expect(s.emblemaTamano).toBe(80);
    expect(s.aroAlto).toBe(3);
    expect(s.aroRemaches).toBe(36);
    expect(s.aroArriba).toBe(true);
    expect(s.colores.aro).toBe(PARAMETROS_INICIALES.colores.aro);
  });

  it('lo que se meten emblemas y aros en la pared deja al menos 1,4 mm de pared', () => {
    const s = sanearParametros({ pared: 3, emblemaEmpotrado: 4, aroEmpotrado: 4 });
    expect(s.emblemaEmpotrado).toBeCloseTo(1.6, 6);
    expect(s.aroEmpotrado).toBeCloseTo(1.6, 6);
  });
});

describe('fase 3: símbolos', () => {
  it('cada símbolo es un polígono con área y entra en su tamaño', () => {
    for (const sim of SIMBOLOS) {
      const caminos = sim.caminos(30);
      expect(caminos.length, sim.id).toBeGreaterThan(0);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of caminos) for (const q of c) { x0 = Math.min(x0, q.X); x1 = Math.max(x1, q.X); y0 = Math.min(y0, q.Y); y1 = Math.max(y1, q.Y); }
      const ancho = (x1 - x0) / 1000, alto = (y1 - y0) / 1000;
      expect(alto, sim.id).toBeGreaterThan(20);
      expect(alto, sim.id).toBeLessThanOrEqual(30.5);
      expect(ancho, sim.id).toBeGreaterThan(10);
      expect(ancho, sim.id).toBeLessThanOrEqual(30.5);
    }
  });
});

describe('fase 3: emblemas', () => {
  for (const sim of SIMBOLOS) {
    it(`emblema con ${sim.id}: partes cerradas, pegado a la pared del jarro`, () => {
      const j = armarJarro(base({ emblema: true, emblemaSimbolo: sim.id }));
      expect(ids(j)).toEqual(['cuerpo', 'emblema1']);
      const e = pieza(j, 'emblema1');
      expect(e.desmontable).toBe(true);
      expect(e.partes.map((q) => q.id)).toEqual(['respaldo', 'borde', 'simbolo']);
      for (const q of e.partes) expect(volumenMalla(q.malla), `${sim.id} ${q.id}`).toBeGreaterThan(0);
      expect(cerrada(pieza(j, 'cuerpo').malla), 'cuerpo con cavidad').toBe(true);
      // Apoyado en la cama: el emblema entero sale parado desde z = 0
      expect(cajaMalla(e.mallaImpresion).min[2]).toBeCloseTo(0, 5);
    });
  }

  it('el cuerpo pierde volumen con la cavidad (desmontable) y la pierde menos si va pegado', () => {
    const v = (extra) => volumenMalla(pieza(armarJarro(base({ emblema: true, ...extra })), 'cuerpo').malla);
    const sin = volumenMalla(pieza(armarJarro(base()), 'cuerpo').malla);
    const desmontable = v({ emblemaDesmontable: true });
    const pegado = v({ emblemaDesmontable: false });
    expect(desmontable).toBeLessThan(sin - 20);
    expect(pegado).toBeCloseTo(sin, 1);
  });

  it('el emblema se queda a la altura y el ángulo pedidos', () => {
    const j = armarJarro(base({ emblema: true, emblemaAltura: 100, emblemaAngulo: 90, emblemaRespaldo: 'ninguno' }));
    const c = cajaMalla(pieza(j, 'emblema1').malla);
    const zc = (c.min[2] + c.max[2]) / 2;
    expect(zc).toBeGreaterThan(95);
    expect(zc).toBeLessThan(105);
    // 90° desde el frente (frente = -Y): queda hacia +X
    expect((c.min[0] + c.max[0]) / 2).toBeGreaterThan(20);
    expect(Math.abs((c.min[1] + c.max[1]) / 2)).toBeLessThan(15);
  });

  it('sin respaldo el símbolo es la pieza, de un solo color', () => {
    const j = armarJarro(base({ emblema: true, emblemaRespaldo: 'ninguno', emblemaSimbolo: 'corazon' }));
    const e = pieza(j, 'emblema1');
    expect(e.partes.map((q) => q.id)).toEqual(['simbolo']);
    expect(e.partes[0].color).toBe(PARAMETROS_INICIALES.colores.simbolo);
  });

  it('con varios emblemas salen N piezas repartidas parejo alrededor', () => {
    const j = armarJarro(base({ emblema: true, emblemaCantidad: 3, emblemaTamano: 24, emblemaAngulo: 0 }));
    expect(ids(j)).toEqual(['cuerpo', 'emblema1', 'emblema2', 'emblema3']);
    const centros = ['emblema1', 'emblema2', 'emblema3'].map((id) => { const c = cajaMalla(pieza(j, id).malla); return [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2]; });
    const ang = centros.map(([x, y]) => Math.atan2(y, x));
    const difs = [ang[1] - ang[0], ang[2] - ang[1]].map((d) => ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    expect(Math.abs(difs[0] - difs[1])).toBeLessThan(0.15);
    expect(armarJarro(base({ emblema: true, emblemaCantidad: 3 })).piezas.filter((x) => x.desmontable)).toHaveLength(3);
    expect(cerrada(pieza(j, 'cuerpo').malla)).toBe(true);
  });

  it('se los cambia de color por parte y el 3MF los trae agrupados', () => {
    const j = armarJarro(base({ emblema: true, colores: { ...PARAMETROS_INICIALES.colores, simbolo: '#112233' } }));
    expect(partesDe(pieza(j, 'emblema1')).find((q) => q.id === 'simbolo').color).toBe('#112233');
    const placa = armarPlaca(j.piezas.filter((x) => x.desmontable), CAMAS[0]);
    expect(placa.cuerpos.every((c) => c.grupo === 'emblema1')).toBe(true);
    expect(crear3mf(placa.cuerpos, { ensamblado: false }).length).toBeGreaterThan(1000);
  });

  it('avisa si el emblema se pisa con el cartel o con el asa y si no entran varios', () => {
    expect(armarJarro(base({ emblema: true, emblemaAngulo: 0, emblemaCantidad: 4, emblemaTamano: 60 })).avisos.join(' ')).toMatch(/no entran uno al lado del otro/);
    const conAsa = armarJarro({ ...PARAMETROS_INICIALES, emblema: true, emblemaAngulo: 90, emblemaAltura: curvaAsa(PARAMETROS_INICIALES).z1 });
    expect(conAsa.avisos.join(' ')).toMatch(/se pisa con el asa/);
    const lejos = armarJarro({ ...PARAMETROS_INICIALES, emblema: true, emblemaAngulo: 180, emblemaAltura: 85 });
    expect(lejos.avisos.join(' ')).not.toMatch(/se pisa con el asa/);
  });

  it('el emblema se corre para no salirse del jarro', () => {
    const j = armarJarro(base({ emblema: true, emblemaAltura: 300 }));
    expect(j.avisos.join(' ')).toMatch(/Se corrió el emblema/);
    expect(cajaMalla(pieza(j, 'emblema1').malla).max[2]).toBeLessThanOrEqual(j.alto + 0.01);
  });

  for (const r of RESPALDOS) {
    it(`respaldo ${r.id}: arma el emblema con todas sus partes cerradas`, () => {
      const j = armarJarro(base({ emblema: true, emblemaRespaldo: r.id }));
      for (const q of pieza(j, 'emblema1').partes) expect(volumenMalla(q.malla), `${r.id} ${q.id}`).toBeGreaterThan(0);
    });
  }
});

describe('fase 3: aros', () => {
  it('un aro arriba y uno abajo: dos piezas con su cavidad si son desmontables', () => {
    const j = armarJarro(base({ aroArriba: true, aroAbajo: true, aroDesmontable: true }));
    expect(ids(j)).toEqual(['cuerpo', 'aroArriba', 'aroAbajo']);
    expect(pieza(j, 'aroArriba').desmontable).toBe(true);
    for (const id of ['aroArriba', 'aroAbajo']) {
      const a = pieza(j, id);
      expect(a.partes.map((q) => q.id)).toEqual(['aro']);
      expect(volumenMalla(a.malla), id).toBeGreaterThan(0);
      expect(cerrada(a.malla), id).toBe(true);
    }
    expect(cerrada(pieza(j, 'cuerpo').malla)).toBe(true);
    const sin = volumenMalla(pieza(armarJarro(base()), 'cuerpo').malla);
    expect(volumenMalla(pieza(j, 'cuerpo').malla)).toBeLessThan(sin - 100);
  });

  it('pegados no tocan el cuerpo y salen con su alto y a su altura', () => {
    const p = base({ aroArriba: true, aroAlto: 8, aroDistBorde: 10 });
    const j = armarJarro(p);
    const sin = volumenMalla(pieza(armarJarro(base()), 'cuerpo').malla);
    expect(volumenMalla(pieza(j, 'cuerpo').malla)).toBeCloseTo(sin, 1);
    expect(pieza(j, 'aroArriba').desmontable).toBe(false);
    const c = cajaMalla(pieza(j, 'aroArriba').malla);
    expect(c.max[2]).toBeCloseTo(j.alto - 10, 3);
    expect(c.max[2] - c.min[2]).toBeCloseTo(8, 3);
  });

  it('el aro sobresale de la pared lo que dice el relieve y sigue la silueta', () => {
    const p = base({ forma: 'barril', aroArriba: true, aroAbajo: true, aroRelieve: 2 });
    const j = armarJarro(sanearParametros({ ...p, formaPuntos: [[0, 0], [0.5, 9], [1, 0]] }));
    const R = radioExteriorFn(j.parametros);
    for (const id of ['aroArriba', 'aroAbajo']) {
      const c = cajaMalla(pieza(j, id).malla);
      const rMax = Math.max(Math.abs(c.min[0]), c.max[0]);
      const zm = (c.min[2] + c.max[2]) / 2;
      expect(rMax).toBeGreaterThan(R(zm) + 1.4);
      expect(rMax).toBeLessThan(R(zm) + 2.6 + 4);
    }
  });

  it('los remaches se suman como parte aparte del aro, con su color', () => {
    const j = armarJarro(base({ aroArriba: true, aroRemaches: 12, aroAlto: 8 }));
    const a = pieza(j, 'aroArriba');
    expect(a.partes.map((q) => q.id)).toEqual(['aro', 'remaches']);
    expect(a.partes[1].color).toBe(PARAMETROS_INICIALES.colores.aroRemaches);
    const sin = armarJarro(base({ aroArriba: true, aroAlto: 8 }));
    expect(volumenMalla(a.malla)).toBeGreaterThan(volumenMalla(pieza(sin, 'aroArriba').malla));
    expect(armarJarro(base({ aroArriba: true, aroRemaches: 36, aroAlto: 8, diametroHueco: 30, latId: 'propia' })).avisos.join(' ')).toMatch(/demasiados remaches/);
    expect(armarJarro(base({ aroArriba: true, aroRemaches: 6, aroAlto: 3 })).avisos.join(' ')).toMatch(/muy bajo para los remaches/);
  });

  it('avisa si el aro desmontable no se puede deslizar porque el jarro se ensancha', () => {
    const ancho = armarJarro(sanearParametros(base({ aroAbajo: true, aroDesmontable: true, formaPuntos: [[0, 0], [1, 8]] })));
    expect(ancho.avisos.join(' ')).toMatch(/no se puede deslizar desde arriba/);
    const recto = armarJarro(base({ aroAbajo: true, aroDesmontable: true }));
    expect(recto.avisos.join(' ')).not.toMatch(/deslizar/);
  });

  it('avisa si el aro se pisa con las placas del asa', () => {
    const j = armarJarro({ ...PARAMETROS_INICIALES, aroArriba: true, aroDistBorde: 10 });
    expect(j.avisos.join(' ')).toMatch(/aro de arriba se pisa con el asa/);
  });

  it('el aro se imprime parado y entra en la cama', () => {
    const j = armarJarro(base({ aroArriba: true, aroAbajo: true, emblema: true, emblemaCantidad: 2, aroDesmontable: true }));
    const placa = armarPlaca(j.piezas.filter((x) => x.desmontable), CAMAS[0]);
    expect(placa.entra).toBe(true);
    expect(cajaMalla(pieza(j, 'aroAbajo').mallaImpresion).min[2]).toBeCloseTo(0, 5);
  });
});

describe('fase 3: todo junto', () => {
  it('cartel, emblemas y aros a la vez arman un jarro con todas las piezas cerradas', () => {
    const j = armarJarro(base({ emblema: true, emblemaCantidad: 2, emblemaAngulo: 90, aroArriba: true, aroAbajo: true, aroRemaches: 10, aroDesmontable: true }));
    expect(ids(j)).toEqual(['cuerpo', 'emblema1', 'emblema2', 'aroArriba', 'aroAbajo']);
    expect(cerrada(pieza(j, 'cuerpo').malla)).toBe(true);
    expect(j.ancho).toBeGreaterThan(70);
  });
});
