import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import opentypeNs from 'opentype.js';
import { engrosarFormas, textoAFormas, sanearParametros, infoPausa, armarConjunto, armarLlavero, armarLapiz, PARAMETROS_INICIALES, cajaDeMalla, entraEnCama, aplicarMayusculas } from '../src/utils/llaveros';
import { revisarCerrada, volumenMalla, stlBinario, crear3mf, leer3mf } from '../src/utils/mallas3d';

const opentype = opentypeNs.parse ? opentypeNs : opentypeNs.default;
const leerFuente = (nombre) => {
  const b = fs.readFileSync(`node_modules/@fontsource/${nombre}/files/${nombre}-latin-400-normal.woff`);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
const fuente = leerFuente('fredoka');
const P = (extra = {}) => ({ ...PARAMETROS_INICIALES, ...extra });

describe('llavero', () => {
  it('arma fondo, letras y borde, cada uno una malla cerrada', () => {
    const r = armarLlavero(fuente, 'Ana', P());
    for (const k of ['fondo', 'letras', 'borde']) {
      expect(r[k].tri.length, k).toBeGreaterThan(0);
      expect(volumenMalla(r[k]), k).toBeGreaterThan(0);
    }
    expect(revisarCerrada(r.fondo).cerrada).toBe(true);
  });

  it('la placa tiene el agujero de la argolla (menos volumen que sin agujero)', () => {
    const con = armarLlavero(fuente, 'Ana', P({ agujero: 5 }));
    const chico = armarLlavero(fuente, 'Ana', P({ agujero: 2 }));
    expect(volumenMalla(con.fondo) / con.ancho / con.alto).toBeLessThan(P().grosorBase);
    expect(chico.ancho).toBeLessThan(con.ancho + 100);
  });

  it('la placa se apoya en z=0 y las letras quedan arriba', () => {
    const r = armarLlavero(fuente, 'Ana', P());
    expect(cajaDeMalla(r.fondo).min[2]).toBeCloseTo(0);
    expect(cajaDeMalla(r.fondo).max[2]).toBeCloseTo(P().grosorBase);
    expect(cajaDeMalla(r.letras).min[2]).toBeCloseTo(P().grosorBase);
    expect(cajaDeMalla(r.letras).max[2]).toBeCloseTo(P().grosorBase + P().reliveLetras);
  });

  it('las letras con agujero (la O) no quedan rellenas', () => {
    const o = armarLlavero(fuente, 'O', P({ estilo: 'placa' }));
    const solida = armarLlavero(fuente, 'I', P({ estilo: 'placa' }));
    const ca = cajaDeMalla(o.letras);
    const area = volumenMalla(o.letras) / P().reliveLetras;
    const cajaArea = (ca.max[0] - ca.min[0]) * (ca.max[1] - ca.min[1]);
    expect(area / cajaArea).toBeGreaterThan(0.3);
    expect(area / cajaArea).toBeLessThan(0.75);
    expect(volumenMalla(solida.letras)).toBeGreaterThan(0);
  });

  it('el estilo cambia el borde: placa sin borde, doble con más borde que contorno', () => {
    const placa = armarLlavero(fuente, 'Ana', P({ estilo: 'placa' }));
    const cont = armarLlavero(fuente, 'Ana', P({ estilo: 'contorno' }));
    const dob = armarLlavero(fuente, 'Ana', P({ estilo: 'doble' }));
    expect(placa.borde.tri.length).toBe(0);
    expect(volumenMalla(dob.borde)).toBeGreaterThan(volumenMalla(cont.borde));
  });

  it('un nombre más largo hace un llavero más ancho; más alto con dividir en líneas', () => {
    const corto = armarLlavero(fuente, 'Ana', P());
    const largo = armarLlavero(fuente, 'Anastasia', P());
    expect(largo.ancho).toBeGreaterThan(corto.ancho);
    const una = armarLlavero(fuente, 'Ana Maria', P());
    const dos = armarLlavero(fuente, 'Ana Maria', P({ dividirLineas: true }));
    expect(dos.alto).toBeGreaterThan(una.alto);
    expect(dos.ancho).toBeLessThan(una.ancho);
  });

  it('el alto fijo manda si es mayor que el natural', () => {
    expect(armarLlavero(fuente, 'Ana', P({ alturaFija: 40 })).alto).toBeCloseTo(40);
  });
});

describe('conjunto', () => {
  it('acomoda varios nombres en columnas sin superponerlos', () => {
    const r = armarConjunto(fuente, P({ nombres: ['Ana', 'Beto', 'Carla', 'Dani'], columnas: 2 }));
    expect(r.cuerpos.map((c) => c.nombre)).toEqual(['Fondo', 'Letras', 'Borde']);
    const solo = armarLlavero(fuente, 'Ana', P());
    expect(r.ancho).toBeGreaterThan(solo.ancho);
    expect(r.alto).toBeGreaterThan(solo.alto * 1.5);
    const caja = cajaDeMalla(r.cuerpos[0].malla);
    expect(caja.min[0]).toBeGreaterThanOrEqual(-1e-3);
    expect(caja.min[1]).toBeGreaterThanOrEqual(-1e-3);
    expect(caja.max[0]).toBeLessThanOrEqual(r.ancho + 1e-3);
    expect(caja.max[1]).toBeLessThanOrEqual(r.alto + 1e-3);
  });

  it('ignora los nombres vacíos', () => {
    expect(armarConjunto(fuente, P({ nombres: ['', '  '] })).cuerpos).toEqual([]);
  });

  it('se exporta a STL y a 3MF con una pieza por color', () => {
    const r = armarConjunto(fuente, P({ nombres: ['Ana'] }));
    const stl = stlBinario(r.cuerpos[0].malla);
    expect(stl.length).toBe(84 + (r.cuerpos[0].malla.tri.length / 3) * 50);
    const partes = leer3mf(crear3mf(r.cuerpos, { ensamblado: true }).buffer);
    expect(partes.length).toBe(r.cuerpos.length);
  });
});

describe('nombre para lápiz', () => {
  it('hace un tubo con el agujero del lápiz a lo largo', () => {
    const r = armarLapiz(fuente, 'Ana', P({ modo: 'lapiz', tope: 'abierto' }));
    const lado = 8.1 + 4;
    expect(r.alto).toBeCloseTo(lado);
    const c = cajaDeMalla(r.fondo);
    expect(c.min[2]).toBeCloseTo(0);
    expect(c.max[2]).toBeCloseTo(lado);
    // Volumen del tubo: (sección cuadrada redondeada − círculo) × largo.
    const hueco = Math.PI * (8.1 / 2) ** 2 * r.ancho;
    expect(volumenMalla(r.fondo)).toBeLessThan(lado * lado * r.ancho - hueco * 0.95);
  });

  it('con tope tiene más material que abierto, y el techo 45° saca más que el redondo menos el círculo', () => {
    const abierto = armarLapiz(fuente, 'Ana', P({ modo: 'lapiz', tope: 'abierto' }));
    const tope = armarLapiz(fuente, 'Ana', P({ modo: 'lapiz', tope: 'final' }));
    const techo = armarLapiz(fuente, 'Ana', P({ modo: 'lapiz', tope: 'abierto', formaAgujero: 'techo' }));
    expect(volumenMalla(tope.fondo)).toBeGreaterThan(volumenMalla(abierto.fondo));
    expect(volumenMalla(techo.fondo)).toBeLessThan(volumenMalla(abierto.fondo));
  });

  it('un lápiz más grueso hace una pieza más grande', () => {
    const e = armarLapiz(fuente, 'Ana', P({ modo: 'lapiz', diametroLapiz: 8.1 }));
    const j = armarLapiz(fuente, 'Ana', P({ modo: 'lapiz', diametroLapiz: 10.6 }));
    expect(j.alto).toBeGreaterThan(e.alto);
  });
});

describe('utilidades', () => {
  it('mayúsculas y minúsculas', () => {
    expect(aplicarMayusculas('Ñandú', 'mayus')).toBe('ÑANDÚ');
    expect(aplicarMayusculas('Ñandú', 'minus')).toBe('ñandú');
    expect(aplicarMayusculas('Ñandú', 'como')).toBe('Ñandú');
  });
  it('avisa si no entra en la cama y si girándolo sí', () => {
    expect(entraEnCama(100, 50, { x: 256, y: 256 }).entra).toBe(true);
    expect(entraEnCama(300, 100, { x: 256, y: 350 })).toEqual({ entra: false, rotar: true });
    expect(entraEnCama(500, 500, { x: 256, y: 256 })).toEqual({ entra: false, rotar: false });
  });
});

describe('letras más gruesas', () => {
  it('engrosar agranda las letras y el llavero, y las mallas siguen válidas', () => {
    const fino = armarLlavero(fuente, 'Ana', P({ engrosar: 0 }));
    const grueso = armarLlavero(fuente, 'Ana', P({ engrosar: 0.6 }));
    expect(volumenMalla(grueso.letras)).toBeGreaterThan(volumenMalla(fino.letras) * 1.05);
    expect(grueso.ancho).toBeGreaterThan(fino.ancho);
    expect(volumenMalla(grueso.letras)).toBeGreaterThan(0);
  });

  it('una letra con hueco (la O) conserva el hueco al engrosar', () => {
    const { formas } = textoAFormas(fuente, 'O', 12, 0.4);
    expect(formas.length).toBe(1);
    expect(formas[0].holes.length).toBe(1);
  });

  it('engrosar una letra sin hueco no inventa huecos; el hueco se achica', () => {
    const base = textoAFormas(fuente, 'O', 12, 0).formas[0].holes[0].getPoints(8);
    const gruesa = textoAFormas(fuente, 'O', 12, 1).formas[0].holes[0].getPoints(8);
    const ancho = (pts) => Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
    expect(ancho(gruesa)).toBeLessThan(ancho(base));
    expect(textoAFormas(fuente, 'I', 12, 0.5).formas[0].holes.length).toBe(0);
  });

  it('sin engrosar devuelve las mismas formas', () => {
    const { formas } = textoAFormas(fuente, 'Ana', 12, 0);
    expect(engrosarFormas(formas, 0)).toBe(formas);
  });
});

describe('color por nombre y tipo de impresora', () => {
  const colores = (f, l, b) => ({ fondo: f, letras: l, borde: b });
  it('con color por nombre, los nombres con distinto color van en piezas distintas', () => {
    const r = armarConjunto(fuente, P({
      nombres: ['Ana', 'Beto'], colorPorNombre: true,
      coloresNombres: [colores('#ff0000', '#ffffff', '#000000'), colores('#00ff00', '#ffffff', '#000000')]
    }));
    const fondos = r.cuerpos.filter((c) => c.nombre.startsWith('Fondo'));
    expect(fondos.length).toBe(2);
    expect(new Set(fondos.map((c) => c.color))).toEqual(new Set(['#ff0000', '#00ff00']));
    // Letras y borde comparten color: una sola pieza cada uno.
    expect(r.cuerpos.filter((c) => c.nombre.startsWith('Letras')).length).toBe(1);
    expect(new Set(r.cuerpos.map((c) => c.id)).size).toBe(r.cuerpos.length);
  });

  it('un nombre sin colores propios usa los generales', () => {
    const r = armarConjunto(fuente, P({ nombres: ['Ana', 'Beto'], colorPorNombre: true, coloresNombres: [colores('#ff0000', '#ffffff', '#000000')] }));
    expect(r.cuerpos.filter((c) => c.nombre.startsWith('Fondo')).map((c) => c.color).sort()).toEqual(['#2f6fdb', '#ff0000']);
  });

  it('los colores de un nombre vacío no se corren a otro', () => {
    const r = armarConjunto(fuente, P({ nombres: ['', 'Beto'], colorPorNombre: true, coloresNombres: [colores('#111111', '#222222', '#333333'), colores('#ff0000', '#ffffff', '#000000')] }));
    expect(r.cuerpos.find((c) => c.nombre.startsWith('Fondo')).color).toBe('#ff0000');
  });

  it('con cambio de filamento hay dos piezas: fondo y relieve (letras + borde)', () => {
    const r = armarConjunto(fuente, sanearParametros(P({ impresora: 'pausa', estilo: 'doble' })));
    expect(r.cuerpos.map((c) => c.nombre)).toEqual(['Fondo', 'Letras']);
    const solo = armarConjunto(fuente, sanearParametros(P({ impresora: 'ams', estilo: 'doble' })));
    expect(volumenMalla(r.cuerpos[1].malla)).toBeCloseTo(volumenMalla(solo.cuerpos[1].malla) + volumenMalla(solo.cuerpos[2].malla), 3);
  });

  it('el cambio de filamento ignora el color por nombre', () => {
    const s = sanearParametros(P({ impresora: 'pausa', colorPorNombre: true, colores: colores('#111111', '#eeeeee', '#ff0000') }));
    expect(s.colorPorNombre).toBe(false);
    expect(s.colores.borde).toBe('#eeeeee');
  });

  it('indica a qué altura y capa pausar', () => {
    expect(infoPausa({ grosorBase: 2.4 }, 0.2)).toEqual({ altura: 2.4, capasHechas: 12 });
  });

  it('un campo vacío o negativo en engrosar no rompe', () => {
    expect(sanearParametros(P({ engrosar: '' })).engrosar).toBe(0);
    expect(sanearParametros(P({ engrosar: -3 })).engrosar).toBe(0);
    expect(sanearParametros(P({ engrosar: 9 })).engrosar).toBe(2);
  });
});
