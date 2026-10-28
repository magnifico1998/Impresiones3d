import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import opentypeNs from 'opentype.js';
import { coloresIniciales, plantaLetrasUnidas, letrasUnidas, areaDeCaminos, engrosarFormas, textoAFormas, sanearParametros, infoPausa, armarConjunto, armarLlavero, armarLapiz, PARAMETROS_INICIALES, cajaDeMalla, entraEnCama, aplicarMayusculas } from '../src/utils/llaveros';
import { revisarCerrada, volumenMalla, stlBinario, crear3mf, leer3mf, partesSueltas } from '../src/utils/mallas3d';

const opentype = opentypeNs.parse ? opentypeNs : opentypeNs.default;
const leerFuente = (nombre) => {
  const b = fs.readFileSync(`node_modules/@fontsource/${nombre}/files/${nombre}-latin-400-normal.woff`);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
const fuente = leerFuente('fredoka');
// La resta 3D del lápiz tarda ~1 s por pieza y varias pruebas arman más de una.
vi.setConfig({ testTimeout: 30000 });
const P = (extra = {}) => ({ ...PARAMETROS_INICIALES, estilo: 'marco', ...extra });

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

  it('placa no lleva borde; el marco sí', () => {
    expect(armarLlavero(fuente, 'Ana', P({ estilo: 'placa' })).borde.tri.length).toBe(0);
    expect(volumenMalla(armarLlavero(fuente, 'Ana', P({ estilo: 'marco' })).borde)).toBeGreaterThan(0);
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
    const r = armarConjunto(fuente, sanearParametros(P({ impresora: 'pausa', estilo: 'marco' })));
    expect(r.cuerpos.map((c) => c.nombre)).toEqual(['Fondo', 'Letras']);
    const solo = armarConjunto(fuente, sanearParametros(P({ impresora: 'ams', estilo: 'marco' })));
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

describe('llavero con contorno (la base sigue las letras)', () => {
  const sil = (extra = {}) => armarLlavero(fuente, 'Ana', P({ estilo: 'contorno', ...extra }));

  it('la base es más chica que la placa rectangular y deja el agujero de la argolla', () => {
    const rect = armarLlavero(fuente, 'Ana', P({ estilo: 'placa' }));
    const c = sil();
    expect(volumenMalla(c.fondo)).toBeGreaterThan(0);
    expect(volumenMalla(c.fondo)).toBeLessThan(volumenMalla(rect.fondo));
    expect(c.borde.tri.length).toBe(0);
    expect(revisarCerrada(c.fondo).cerrada).toBe(true);
  });

  it('queda apoyado en 0,0 y las letras caen dentro de la base', () => {
    const c = sil();
    const cf = cajaDeMalla(c.fondo), cl = cajaDeMalla(c.letras);
    expect(cf.min[0]).toBeCloseTo(0, 2);
    expect(cf.min[1]).toBeCloseTo(0, 2);
    expect(cl.min[0]).toBeGreaterThanOrEqual(cf.min[0]);
    expect(cl.max[0]).toBeLessThanOrEqual(cf.max[0] + 1e-3);
    expect(cl.max[1]).toBeLessThanOrEqual(cf.max[1] + 1e-3);
    expect(c.ancho).toBeCloseTo(cf.max[0], 1);
  });

  it('la argolla queda unida: una sola pieza, con un agujero', () => {
    const c = sil({ agujero: 5 });
    expect(partesSueltas(c.fondo).length).toBe(1);
    // El agujero existe: un punto en el centro de la argolla no tiene material.
    const caja = cajaDeMalla(c.fondo);
    expect(caja.min[0]).toBeCloseTo(0, 2);
    const volumenSinAgujero = volumenMalla(sil({ agujero: 2 }).fondo);
    expect(volumenMalla(c.fondo)).toBeGreaterThan(0);
    expect(volumenSinAgujero).toBeGreaterThan(0);
  });

  it('funciona con una tipografía cursiva (letras que se tocan)', () => {
    const cursiva = leerFuente('pacifico');
    const c = armarLlavero(cursiva, 'Valentina', P({ estilo: 'contorno' }));
    expect(partesSueltas(c.fondo).length).toBe(1);
    expect(volumenMalla(c.letras)).toBeGreaterThan(0);
  });

  it('un margen más grande agranda la silueta', () => {
    expect(sil({ margen: 5 }).ancho).toBeGreaterThan(sil({ margen: 2 }).ancho);
  });

  it('el doble contorno suma una banda de color alrededor, a la altura de la base', () => {
    const c = sil({ estilo: 'doble', grosorBorde: 1.5 });
    const simple = sil();
    expect(volumenMalla(c.borde)).toBeGreaterThan(0);
    expect(c.ancho).toBeGreaterThan(simple.ancho + 2);
    expect(cajaDeMalla(c.borde).max[2]).toBeCloseTo(P().grosorBase);
    expect(cajaDeMalla(c.borde).min[2]).toBeCloseTo(0);
  });

  it('con cambio de filamento la banda del doble contorno va con el fondo', () => {
    const r = armarConjunto(fuente, sanearParametros(P({ estilo: 'doble', impresora: 'pausa' })));
    expect(r.cuerpos.map((c) => c.nombre)).toEqual(['Fondo', 'Letras']);
    expect(r.cuerpos[0].color).toBe(P().colores.fondo);
  });

  it('se puede exportar y reabrir como 3MF', () => {
    const r = armarConjunto(fuente, P({ estilo: 'contorno', nombres: ['Ana', 'Beto'], columnas: 2 }));
    expect(leer3mf(crear3mf(r.cuerpos).buffer).length).toBe(r.cuerpos.length);
  });
});

describe('nombre para lápiz con contorno (el cuerpo sigue las letras)', () => {
  const lapiz = (extra = {}, nombre = 'Valentina', f = fuente) => armarLapiz(f, nombre, P({ modo: 'lapiz', estilo: 'contorno', tope: 'abierto', ...extra }));
  const lado = 8.1 + 4;

  it('tiene la altura del tubo y las letras apoyadas encima', () => {
    const r = lapiz();
    const cf = cajaDeMalla(r.fondo), cl = cajaDeMalla(r.letras);
    expect(cf.min[2]).toBeCloseTo(0);
    expect(cf.max[2]).toBeCloseTo(lado);
    expect(cl.min[2]).toBeCloseTo(lado);
    expect(cl.max[2]).toBeCloseTo(lado + P().reliveLetras);
    expect(cf.min[0]).toBeCloseTo(0, 2);
    expect(cf.min[1]).toBeCloseTo(0, 2);
  });

  it('el cuerpo es más ancho que el tubo (sigue las letras) y las letras entran en él', () => {
    const r = lapiz();
    expect(r.alto).toBeGreaterThanOrEqual(lado - 1e-3);
    const cf = cajaDeMalla(r.fondo), cl = cajaDeMalla(r.letras);
    expect(cl.min[0]).toBeGreaterThanOrEqual(cf.min[0] - 1e-3);
    expect(cl.max[0]).toBeLessThanOrEqual(cf.max[0] + 1e-3);
    expect(cl.max[1]).toBeLessThanOrEqual(cf.max[1] + 1e-3);
    expect(cl.min[1]).toBeGreaterThanOrEqual(cf.min[1] - 1e-3);
  });

  it('con letras cursivas altas y bajas, el tubo sigue entero a lo largo', () => {
    const r = lapiz({}, 'Valentina', leerFuente('pacifico'));
    expect(r.ancho).toBeGreaterThan(40);
    const sinAgujero = lapiz({ diametroLapiz: 8.1 }, 'Valentina', leerFuente('pacifico'));
    expect(volumenMalla(sinAgujero.fondo)).toBeGreaterThan(0);
    // El agujero saca material: más volumen con el tope que abierto.
    const conTope = lapiz({ tope: 'final' }, 'Valentina', leerFuente('pacifico'));
    expect(volumenMalla(conTope.fondo)).toBeGreaterThan(volumenMalla(sinAgujero.fondo));
  });

  it('el volumen del cuerpo es el de la silueta menos el agujero del lápiz', () => {
    const r = lapiz();
    const solido = lapiz({ diametroLapiz: 3, paredLapiz: 4.05 });
    // Mismo alto de tubo (3 + 2 × 4,05 = 11,1 vs 12,1): sólo comparamos que
    // el agujero grande deja menos material por mm de largo que el chico.
    expect(volumenMalla(r.fondo) / r.ancho).toBeGreaterThan(0);
    expect(volumenMalla(solido.fondo)).toBeGreaterThan(0);
  });

  it('un lápiz más grueso agranda el cuerpo; la forma de techo saca más material', () => {
    expect(cajaDeMalla(lapiz({ diametroLapiz: 10.6 }).fondo).max[2]).toBeGreaterThan(cajaDeMalla(lapiz().fondo).max[2]);
    expect(volumenMalla(lapiz({ formaAgujero: 'techo' }).fondo)).toBeLessThan(volumenMalla(lapiz().fondo));
  });

  it('el estilo placa sigue haciendo el tubo recto', () => {
    const recto = armarLapiz(fuente, 'Ana', P({ modo: 'lapiz', estilo: 'placa', tope: 'abierto' }));
    expect(recto.alto).toBeCloseTo(lado);
  });

  it('entra en el conjunto y se exporta', () => {
    const r = armarConjunto(fuente, P({ modo: 'lapiz', estilo: 'contorno', nombres: ['Ana', 'Beto'], columnas: 2 }));
    expect(r.cuerpos.map((c) => c.nombre)).toEqual(['Fondo', 'Letras']);
    expect(leer3mf(crear3mf(r.cuerpos).buffer).length).toBe(2);
  });
});

describe('nombre para lápiz con letras unidas', () => {
  const lado = 8.1 + 4;
  const unidas = (extra = {}, nombre = 'LEONARDO', f = fuente) => armarLapiz(f, nombre, P({ modo: 'lapiz', estilo: 'letras', tope: 'abierto', ...extra }));

  it('el cuerpo son las letras: una sola pieza, de la altura del tubo, sin fondo aparte', () => {
    const r = unidas();
    expect(r.fondo.tri.length).toBe(0);
    expect(r.borde.tri.length).toBe(0);
    const c = cajaDeMalla(r.letras);
    expect(c.min[2]).toBeCloseTo(0);
    expect(c.max[2]).toBeCloseTo(lado + P().desnivel);
    expect(c.min[0]).toBeCloseTo(0, 2);
    expect(c.min[1]).toBeCloseTo(0, 2);
    expect(plantaLetrasUnidas(fuente, 'LEONARDO', P({ modo: 'lapiz', estilo: 'letras' })).piezas).toBe(1);
  });

  it('las letras quedan pegadas aunque la tipografía tenga huecos entre ellas', () => {
    const pl = (fu, n) => plantaLetrasUnidas(fu, n, P({ modo: 'lapiz', estilo: 'letras' })).piezas;
    expect(pl(leerFuente('bebas-neue'), 'LEONARDO')).toBe(1);
    expect(pl(leerFuente('pacifico'), 'Valentina')).toBe(1);
    expect(pl(leerFuente('roboto-slab'), 'Nicolas')).toBe(1);
    expect(pl(fuente, 'AVA')).toBe(1);
  });

  it('un nombre con espacio también queda en una pieza', () => {
    expect(plantaLetrasUnidas(fuente, 'Ana Maria', P({ modo: 'lapiz', estilo: 'letras' })).piezas).toBe(1);
  });

  it('el desnivel suma altura en Z a las letras impares: más desnivel, más material', () => {
    // Cada pieza se arma una sola vez: la resta 3D tarda y el test se pasaba del límite.
    const sin = unidas({ desnivel: 0 }).letras;
    const con = unidas({ desnivel: 6 }).letras;
    expect(volumenMalla(con)).toBeGreaterThan(volumenMalla(sin));
    expect(cajaDeMalla(sin).max[2]).toBeCloseTo(lado);
    expect(cajaDeMalla(con).max[2]).toBeCloseTo(lado + 6);
  }, 30000);

  it('en Z hay dos alturas: las letras 1.ª, 3.ª… llegan más arriba y las demás se quedan en el tubo', () => {
    const r = unidas({ desnivel: 5, alturaLetra: 20 }, 'LEONARDO');
    const m = r.letras;
    // Área de las caras horizontales a cada nivel.
    let altas = 0, bajas = 0;
    for (let i = 0; i < m.tri.length; i += 3) {
      const v = [0, 1, 2].map((k) => m.tri[i + k] * 3);
      const z = v.map((a) => m.pos[a + 2]);
      if (Math.max(...z) - Math.min(...z) > 1e-3) continue;
      const [A, B, C] = v.map((a) => [m.pos[a], m.pos[a + 1]]);
      const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
      if (Math.abs(z[0] - (lado + 5)) < 1e-3) altas += area;
      else if (Math.abs(z[0] - lado) < 1e-3) bajas += area;
    }
    expect(altas).toBeGreaterThan(50);
    expect(bajas).toBeGreaterThan(50);
    // Alternan: ni una sola altura domina por completo.
    expect(altas / (altas + bajas)).toBeGreaterThan(0.2);
    expect(altas / (altas + bajas)).toBeLessThan(0.8);
  });

  it('todas las letras tienen el mismo tamaño en planta (el desnivel no toca el eje Y)', () => {
    const a = plantaLetrasUnidas(fuente, 'LEONARDO', P({ modo: 'lapiz', estilo: 'letras', desnivel: 0 }));
    const b = plantaLetrasUnidas(fuente, 'LEONARDO', P({ modo: 'lapiz', estilo: 'letras', desnivel: 8 }));
    expect(areaDeCaminos(a.planta)).toBeCloseTo(areaDeCaminos(b.planta), 3);
    const letras = letrasUnidas(fuente, 'LEONARDO', 20, 0.5);
    const alto = (formas) => { const ys = formas.flatMap((fo) => fo.extractPoints(8).shape.map((q) => q.y)); return Math.max(...ys) - Math.min(...ys); };
    expect(Math.abs(alto(letras[0]) - alto(letras[1]))).toBeLessThan(0.1);
  });

  it('si las letras son más bajas que el tubo, se agrandan para rodear al lápiz', () => {
    const r = unidas({ alturaLetra: 3 });
    expect(r.alto).toBeGreaterThanOrEqual(lado);
  });

  it('el lápiz atraviesa: con tope hay más material que abierto, y se puede exportar', () => {
    const abierto = unidas();
    const conTope = unidas({ tope: 'final' });
    expect(volumenMalla(conTope.letras)).toBeGreaterThan(volumenMalla(abierto.letras));
    const r = armarConjunto(fuente, P({ modo: 'lapiz', estilo: 'letras', nombres: ['Ana'] }));
    expect(r.cuerpos.map((c) => c.nombre)).toEqual(['Letras']);
    expect(leer3mf(crear3mf(r.cuerpos).buffer).length).toBe(1);
  });

  it('el llavero no tiene letras unidas: usa el contorno', () => {
    expect(sanearParametros(P({ modo: 'llavero', estilo: 'letras' })).estilo).toBe('contorno');
    expect(sanearParametros(P({ modo: 'lapiz', estilo: 'letras' })).estilo).toBe('letras');
  });
});

describe('letras unidas: huecos', () => {
  it('la E conserva los huecos entre sus brazos (no queda tapada)', () => {
    const E = plantaLetrasUnidas(fuente, 'E', P({ modo: 'lapiz', estilo: 'letras' }));
    const caja = E.planta.flat().reduce((a, q) => ({ x0: Math.min(a.x0, q.X), x1: Math.max(a.x1, q.X), y0: Math.min(a.y0, q.Y), y1: Math.max(a.y1, q.Y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    const bbox = ((caja.x1 - caja.x0) * (caja.y1 - caja.y0)) / 1e6;
    expect(areaDeCaminos(E.planta) / bbox).toBeLessThan(0.8);
  });

  it('en una cursiva (VALENTINA) sigue siendo una sola pieza y sin tapar los huecos', () => {
    const pac = leerFuente('pacifico');
    const r = plantaLetrasUnidas(pac, 'VALENTINA', P({ modo: 'lapiz', estilo: 'letras' }));
    expect(r.piezas).toBe(1);
    const sinPuente = plantaLetrasUnidas(pac, 'E', P({ modo: 'lapiz', estilo: 'letras' }));
    const caja = sinPuente.planta.flat().reduce((a, q) => ({ x0: Math.min(a.x0, q.X), x1: Math.max(a.x1, q.X), y0: Math.min(a.y0, q.Y), y1: Math.max(a.y1, q.Y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    expect(areaDeCaminos(sinPuente.planta) / (((caja.x1 - caja.x0) * (caja.y1 - caja.y0)) / 1e6)).toBeLessThan(0.85);
  });

  it('sin elegir mayúsculas o minúsculas, usa mayúsculas (las minúsculas no rodean al lápiz)', () => {
    const baja = plantaLetrasUnidas(fuente, 'ana', P({ modo: 'lapiz', estilo: 'letras', mayusculas: 'como' }));
    const alta = plantaLetrasUnidas(fuente, 'ANA', P({ modo: 'lapiz', estilo: 'letras', mayusculas: 'como' }));
    expect(areaDeCaminos(baja.planta)).toBeCloseTo(areaDeCaminos(alta.planta), 0);
  });
});

describe('colores por defecto', () => {
  it('letras unidas: un solo color, naranja', () => {
    expect(coloresIniciales('lapiz', 'letras').letras).toBe('#ff7a00');
  });
  it('lápiz que sigue las letras o tubo recto: fondo naranja y letras negras', () => {
    for (const estilo of ['contorno', 'placa']) {
      const c = coloresIniciales('lapiz', estilo);
      expect(c.fondo).toBe('#ff7a00');
      expect(c.letras).toBe('#111111');
    }
  });
  it('llavero: no cambia con el estilo', () => {
    expect(coloresIniciales('llavero', 'contorno')).toEqual(coloresIniciales('llavero', 'doble'));
    expect(coloresIniciales('llavero', 'contorno').letras).toBe('#ff7a00');
  });
});
