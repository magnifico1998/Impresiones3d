import { describe, it, expect, vi } from 'vitest';
import { sanearImagen, prepararMascara, cuantizar, asignarAPaleta, colorEnPunto, fundirZonaEn, aplicarLimpiezas, suavizarCaminos, pixelDeModelo, engrosarFinas, limpiarIndices, regionesPorColor, armarLlaveroImagen, PARAMETROS_IMAGEN, SIN_COLOR, hexAColor } from '../src/utils/imagenLlavero';
import { areaDeCaminos } from '../src/utils/llaveros';
import { volumenMalla, revisarCerrada } from '../src/utils/mallas3d';

vi.setConfig({ testTimeout: 30000 });

// Imagen sintética: rectángulos de colores sobre un fondo (blanco o transparente).
function imagen(w, h, { fondo = [255, 255, 255, 255], rects = [] } = {}) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set(fondo, i * 4);
  for (const [x0, y0, x1, y1, color] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgba.set([...color, 255], (y * w + x) * 4);
  }
  return rgba;
}
const ROJO = [220, 30, 30], VERDE = [30, 170, 60], AZUL = [30, 60, 220], AMARILLO = [240, 220, 40];

describe('máscara y fondo', () => {
  it('los píxeles transparentes quedan afuera', () => {
    const rgba = imagen(10, 10, { fondo: [0, 0, 0, 0], rects: [[2, 2, 8, 8, ROJO]] });
    const m = prepararMascara(rgba, 10, 10);
    expect(m.reduce((a, b) => a + b, 0)).toBe(36);
  });

  it('quitar fondo borra el fondo liso conectado con el borde, no los blancos de adentro', () => {
    // Un marco rojo con un hueco blanco en el medio, sobre fondo blanco.
    const rgba = imagen(20, 20, { rects: [[4, 4, 16, 16, ROJO], [8, 8, 12, 12, [255, 255, 255]]] });
    const m = prepararMascara(rgba, 20, 20, { quitarFondo: true, tolerancia: 30 });
    expect(m[0]).toBe(0); // esquina: fondo
    expect(m[10 * 20 + 10]).toBe(1); // el blanco de adentro se conserva
    expect(m[5 * 20 + 5]).toBe(1); // el rojo también
  });
});

describe('agrupar colores', () => {
  const rgba = imagen(40, 40, { rects: [[0, 0, 20, 20, ROJO], [20, 0, 40, 20, VERDE], [0, 20, 20, 40, AZUL], [20, 20, 40, 40, AMARILLO]] });
  const mascara = new Uint8Array(40 * 40).fill(1);

  it('encuentra los 4 colores de la imagen', () => {
    const r = cuantizar(rgba, mascara, 40, 40, 4);
    expect(r.paleta.length).toBe(4);
    expect(r.cuentas.reduce((a, b) => a + b, 0)).toBe(1600);
    expect(r.cuentas.every((c) => c === 400)).toBe(true);
  });

  it('con "hasta 8" o "hasta 12" no inventa colores: sigue habiendo 4', () => {
    expect(cuantizar(rgba, mascara, 40, 40, 8).paleta.length).toBe(4);
    expect(cuantizar(rgba, mascara, 40, 40, 12).paleta.length).toBe(4);
  });

  it('limita a la cantidad pedida: 4 colores distintos en hasta 2', () => {
    expect(cuantizar(rgba, mascara, 40, 40, 2).paleta.length).toBe(2);
  });

  it('une los tonos casi iguales (ruido de una foto) en un solo color', () => {
    const ruido = imagen(30, 30, { rects: [[0, 0, 30, 30, [200, 40, 40]]] });
    for (let i = 0; i < 900; i++) { ruido[i * 4] += (i * 7) % 6; ruido[i * 4 + 1] += (i * 3) % 5; }
    const r = cuantizar(ruido, new Uint8Array(900).fill(1), 30, 30, 12);
    expect(r.paleta.length).toBe(1);
  });

  it('es repetible: la misma imagen da la misma paleta', () => {
    expect(cuantizar(rgba, mascara, 40, 40, 4).paleta).toEqual(cuantizar(rgba, mascara, 40, 40, 4).paleta);
  });

  it('los píxeles fuera de la máscara quedan sin color', () => {
    const m = new Uint8Array(1600).fill(1);
    m[0] = 0;
    expect(cuantizar(rgba, m, 40, 40, 4).indices[0]).toBe(SIN_COLOR);
  });

  it('una imagen vacía no rompe', () => {
    expect(cuantizar(rgba, new Uint8Array(1600), 40, 40, 4).paleta).toEqual([]);
  });
});

describe('limpiar motas', () => {
  it('un píxel suelto toma el color de su alrededor', () => {
    const idx = new Uint8Array(100).fill(0);
    idx[55] = 1;
    expect(limpiarIndices(idx, 10, 10, { pasadas: 1, minPixeles: 1 })[55]).toBe(0);
  });

  it('una zona chica rodeada de otro color se funde con él', () => {
    const idx = new Uint8Array(400).fill(0);
    for (const i of [5 * 20 + 5, 5 * 20 + 6, 6 * 20 + 5, 6 * 20 + 6]) idx[i] = 1;
    expect(limpiarIndices(idx, 20, 20, { pasadas: 0, minPixeles: 6 })[5 * 20 + 5]).toBe(0);
    // Con un mínimo menor se conserva.
    expect(limpiarIndices(idx, 20, 20, { pasadas: 0, minPixeles: 3 })[5 * 20 + 5]).toBe(1);
  });

  it('el fondo que toca el borde no se rellena', () => {
    const idx = new Uint8Array(100).fill(0);
    idx[0] = SIN_COLOR;
    expect(limpiarIndices(idx, 10, 10, { pasadas: 0, minPixeles: 6 })[0]).toBe(SIN_COLOR);
  });
});

describe('regiones', () => {
  it('el área de cada color es la de sus píxeles', () => {
    const idx = new Uint8Array(100).fill(SIN_COLOR);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) idx[y * 10 + x] = x < 4 ? 0 : 1;
    const r = regionesPorColor(idx, 10, 10, 2, 0.5);
    expect(areaDeCaminos(r[0])).toBeCloseTo(20 * 0.25, 2); // 20 píxeles de 0,5 mm
    expect(areaDeCaminos(r[1])).toBeCloseTo(30 * 0.25, 2);
  });

  it('un color con un agujero deja el agujero', () => {
    const idx = new Uint8Array(100).fill(0);
    for (const i of [44, 45, 54, 55]) idx[i] = 1;
    const r = regionesPorColor(idx, 10, 10, 2, 1);
    expect(areaDeCaminos(r[0])).toBeCloseTo(96, 1);
    expect(areaDeCaminos(r[1])).toBeCloseTo(4, 1);
  });
});

describe('llavero de imagen', () => {
  const w = 40, h = 30;
  const rgba = imagen(w, h, { fondo: [0, 0, 0, 0], rects: [[5, 5, 20, 25, ROJO], [20, 5, 35, 25, AZUL]] });
  const mascara = prepararMascara(rgba, w, h);
  const q = cuantizar(rgba, mascara, w, h, 4);
  const entrada = { indices: q.indices, w, h, paleta: q.paleta };
  const P = (extra = {}) => ({ ...PARAMETROS_IMAGEN, ...extra });
  const rangoZ = (m) => { const a = []; for (let i = 2; i < m.pos.length; i += 3) a.push(m.pos[i]); return [Math.min(...a), Math.max(...a)]; };

  it('arma una pieza por color más el borde, y el ancho es el pedido más el margen', () => {
    const r = armarLlaveroImagen(entrada, P({ anchoMm: 60, margen: 2 }));
    expect(r.cuerpos.map((c) => c.nombre).sort()).toEqual(['Borde', 'Color 1', 'Color 2']);
    // 60 mm de dibujo + 2 × 2 mm de margen + la argolla pegada del lado izquierdo.
    expect(r.ancho).toBeGreaterThan(64);
    expect(r.ancho).toBeLessThan(64 + 12);
    r.cuerpos.forEach((c) => expect(volumenMalla(c.malla)).toBeGreaterThan(0));
  });

  it('en modo plano todas las piezas tienen el mismo grosor', () => {
    const r = armarLlaveroImagen(entrada, P({ modo: 'plano', grosor: 2.4 }));
    for (const c of r.cuerpos) {
      const [zmin, zmax] = rangoZ(c.malla);
      expect(zmin).toBeCloseTo(0);
      expect(zmax).toBeCloseTo(2.4);
    }
  });

  it('en modo relieve hay una base y los colores van encima', () => {
    const r = armarLlaveroImagen(entrada, P({ modo: 'relieve', caras: 'una', grosor: 1.6, relieve: 0.8 }));
    const base = r.cuerpos.find((c) => c.nombre === 'Base');
    const color = r.cuerpos.find((c) => c.nombre === 'Color 1');
    expect(rangoZ(base.malla)[1]).toBeCloseTo(1.6);
    expect(rangoZ(color.malla)[0]).toBeCloseTo(1.6);
    expect(rangoZ(color.malla)[1]).toBeCloseTo(2.4);
  });

  it('la argolla queda pegada y con agujero: el borde tiene el volumen de la base menos la imagen', () => {
    const r = armarLlaveroImagen(entrada, P({ margen: 2, agujero: 5 }));
    const borde = r.cuerpos.find((c) => c.nombre === 'Borde');
    const volumenTotal = r.cuerpos.reduce((a, c) => a + volumenMalla(c.malla), 0);
    expect(volumenMalla(borde.malla)).toBeGreaterThan(0);
    // La placa entera (borde + colores) no puede ser mayor que su caja ni menor que la imagen sola.
    expect(volumenTotal).toBeLessThan(r.ancho * r.alto * 2.4);
    expect(volumenTotal).toBeGreaterThan(50 * 20 * 2.4 * 0.9);
    // Quedan a lo sumo unas pocas uniones en T (un vértice de más sobre un borde recto, de la
    // triangulación de three): la pieza es hermética, pero no una malla perfecta.
    expect(revisarCerrada(borde.malla).abiertas).toBeLessThanOrEqual(12);
    expect(revisarCerrada(borde.malla).repetidas).toBe(0);
  });

  it('se puede pegar la argolla arriba, a la derecha o a la izquierda', () => {
    const lados = ['izquierda', 'arriba', 'derecha'].map((argolla) => armarLlaveroImagen(entrada, P({ argolla })));
    // Arriba suma alto; a los costados, ancho.
    expect(lados[1].alto).toBeGreaterThan(lados[0].alto);
    expect(lados[0].ancho).toBeGreaterThan(lados[1].ancho);
    expect(lados[2].ancho).toBeCloseTo(lados[0].ancho, 0);
  });

  it('un color excluido no se imprime', () => {
    const completo = armarLlaveroImagen(entrada, P());
    const sin = armarLlaveroImagen(entrada, P(), { excluidos: [1] });
    expect(sin.cuerpos.some((c) => c.nombre === 'Color 2')).toBe(false);
    expect(sin.cuerpos.length).toBe(completo.cuerpos.length - 1);
  });

  it('se puede cambiar el color con el que se imprime cada zona', () => {
    const r = armarLlaveroImagen(entrada, P(), { colores: ['#00ff00', '#0000ff'] });
    expect(r.cuerpos.find((c) => c.nombre === 'Color 1').color).toBe('#00ff00');
  });

  it('sin colores para imprimir avisa y no rompe', () => {
    const r = armarLlaveroImagen(entrada, P(), { excluidos: [0, 1] });
    expect(r.cuerpos).toEqual([]);
    expect(r.avisos.length).toBe(1);
  });

  it('los colores salen como hex', () => {
    const r = armarLlaveroImagen(entrada, P());
    r.cuerpos.forEach((c) => expect(c.color).toMatch(/^#[0-9a-f]{6}$/i));
    expect(hexAColor('#ff7a00')).toEqual([255, 122, 0]);
  });
});

describe('calidad: no perder lo chico pero importante', () => {
  // Un dibujo como un avión de caricatura: mucho fondo celeste, un cuerpo blanco,
  // detalles rojos y amarillos chicos y un contorno negro de 1 píxel.
  const w = 80, h = 60;
  const BLANCO = [250, 250, 250], CELESTE = [175, 215, 240], NEGRO = [25, 25, 30];
  const rgba = imagen(w, h, { fondo: [...CELESTE, 255], rects: [
    [15, 20, 65, 40, BLANCO], [50, 10, 56, 20, ROJO], [18, 38, 26, 44, AMARILLO]
  ] });
  // Contorno negro de 1 píxel alrededor del cuerpo.
  for (let x = 14; x < 66; x++) for (const y of [19, 40]) rgba.set([...NEGRO, 255], (y * w + x) * 4);
  for (let y = 19; y < 41; y++) for (const x of [14, 65]) rgba.set([...NEGRO, 255], (y * w + x) * 4);
  const mascara = new Uint8Array(w * h).fill(1);
  const hay = (paleta, prueba) => paleta.some(prueba);
  const luz = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

  it('con 8 colores aparecen el negro del contorno, el blanco, el rojo y el amarillo', () => {
    const { paleta } = cuantizar(rgba, mascara, w, h, 8);
    expect(hay(paleta, (c) => luz(c) < 60)).toBe(true); // negro
    expect(hay(paleta, (c) => c[0] > 235 && c[1] > 235 && c[2] > 235)).toBe(true); // blanco
    expect(hay(paleta, (c) => c[0] > 200 && c[1] < 80)).toBe(true); // rojo
    expect(hay(paleta, (c) => c[0] > 220 && c[1] > 200 && c[2] < 90)).toBe(true); // amarillo
  });

  it('con 4 colores el contorno negro y el blanco no se pierden', () => {
    const { paleta } = cuantizar(rgba, mascara, w, h, 4);
    expect(hay(paleta, (c) => luz(c) < 60)).toBe(true);
    expect(hay(paleta, (c) => c[0] > 235 && c[1] > 235 && c[2] > 235)).toBe(true);
  });

  it('una línea de 1 píxel sobrevive a la limpieza', () => {
    const idx = new Uint8Array(100).fill(0);
    for (let y = 0; y < 10; y++) idx[y * 10 + 5] = 1;
    const r = limpiarIndices(idx, 10, 10, { pasadas: 1, minPixeles: 6 });
    for (let y = 0; y < 10; y++) expect(r[y * 10 + 5]).toBe(1);
  });
});

describe('bordes suavizados', () => {
  it('el gris que mezcla un negro y un blanco no cuenta como un color más', () => {
    // Mitad negra, mitad blanca, con una columna intermedia por el suavizado del borde.
    const w = 40, h = 20;
    const rgba = imagen(w, h, { fondo: [0, 0, 0, 255], rects: [[20, 0, 40, 20, [255, 255, 255]], [19, 0, 20, 20, [128, 128, 128]], [18, 0, 19, 20, [60, 60, 60]], [20, 0, 21, 20, [200, 200, 200]]] });
    const r = cuantizar(rgba, new Uint8Array(w * h).fill(1), w, h, 8);
    expect(r.paleta.length).toBe(2);
  });

  it('un color propio chico que no está entre otros dos se conserva', () => {
    const w = 40, h = 20;
    const rgba = imagen(w, h, { fondo: [0, 0, 0, 255], rects: [[20, 0, 40, 20, [255, 255, 255]], [5, 5, 8, 8, [230, 40, 40]]] });
    const r = cuantizar(rgba, new Uint8Array(w * h).fill(1), w, h, 8);
    expect(r.paleta.length).toBe(3);
  });
});

describe('paleta elegida a mano', () => {
  const w = 20, h = 10;
  const rgba = imagen(w, h, { fondo: [0, 0, 0, 255], rects: [[0, 0, 10, 10, [250, 10, 10]], [10, 0, 20, 10, [10, 10, 240]]] });
  const mascara = new Uint8Array(w * h).fill(1);

  it('cada píxel va al color más cercano de la paleta', () => {
    const r = asignarAPaleta(rgba, mascara, w, h, [[255, 0, 0], [0, 0, 255], [255, 255, 255]]);
    expect(r.indices[0]).toBe(0);
    expect(r.indices[19]).toBe(1);
    expect(r.cuentas).toEqual([100, 100, 0]);
  });

  it('si se saca un color, sus píxeles pasan al más parecido que queda', () => {
    const r = asignarAPaleta(rgba, mascara, w, h, [[255, 0, 0]]);
    expect(r.cuentas).toEqual([200]);
  });

  it('el color en un punto sale de la imagen, y fuera de la imagen no hay color', () => {
    expect(colorEnPunto(rgba, mascara, w, h, 2, 2)).toEqual([250, 10, 10]);
    expect(colorEnPunto(rgba, mascara, w, h, 15, 5)).toEqual([10, 10, 240]);
    expect(colorEnPunto(rgba, mascara, w, h, -1, 0)).toBe(null);
    const m = new Uint8Array(w * h);
    expect(colorEnPunto(rgba, m, w, h, 2, 2)).toBe(null);
  });
});

describe('líneas finas en diagonal', () => {
  // Cuenta las zonas conectadas por los lados (no por las esquinas) de un color.
  const zonas = (idx, w, h, color) => {
    const visto = new Uint8Array(w * h); let n = 0;
    for (let ini = 0; ini < w * h; ini++) {
      if (visto[ini] || idx[ini] !== color) continue;
      n++; const pila = [ini]; visto[ini] = 1;
      while (pila.length) {
        const q = pila.pop(); const x = q % w;
        for (const v of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, q >= w ? q - w : -1, q < w * (h - 1) ? q + w : -1]) {
          if (v >= 0 && !visto[v] && idx[v] === color) { visto[v] = 1; pila.push(v); }
        }
      }
    }
    return n;
  };

  it('una diagonal de 1 píxel (que se toca sólo por las esquinas) queda en una sola zona', () => {
    const idx = new Uint8Array(100).fill(0);
    for (let i = 1; i < 9; i++) idx[i * 10 + i] = 1;
    expect(zonas(idx, 10, 10, 1)).toBe(8); // antes: 8 píxeles sueltos
    const r = limpiarIndices(idx, 10, 10, { pasadas: 1, minPixeles: 6 });
    expect(zonas(r, 10, 10, 1)).toBe(1);
  });

  it('la otra diagonal también', () => {
    const idx = new Uint8Array(100).fill(0);
    for (let i = 1; i < 9; i++) idx[i * 10 + (9 - i)] = 1;
    const r = limpiarIndices(idx, 10, 10, { pasadas: 1, minPixeles: 6 });
    expect(zonas(r, 10, 10, 1)).toBe(1);
  });

  it('un contorno diagonal no se rompe en trozos al suavizar', () => {
    const w = 30, h = 30; const idx = new Uint8Array(w * h).fill(0);
    for (let i = 3; i < 27; i++) idx[i * w + i] = 1;
    const limpio = limpiarIndices(idx, w, h, { pasadas: 1, minPixeles: 6 });
    const r = regionesPorColor(limpio, w, h, 2, 1);
    expect(suavizarCaminos(r[1], 3, 0.6).filter((c) => c.length > 3 && areaDeCaminos([c]) > 0).length).toBe(1);
  });
});

describe('borrar una zona tocándola', () => {
  // Fondo (0), un ala roja (1) y una raya negra (2) suelta adentro del ala.
  const w = 30, h = 20;
  const idx = new Uint8Array(w * h).fill(0);
  for (let y = 4; y < 16; y++) for (let x = 5; x < 25; x++) idx[y * w + x] = 1;
  for (let x = 10; x < 18; x++) idx[10 * w + x] = 2;

  it('la raya se funde con el rojo que la rodea', () => {
    const r = fundirZonaEn(idx, w, h, 12, 10);
    expect(r.ok).toBe(true);
    expect(r.indices[10 * w + 12]).toBe(1);
    expect(r.indices.filter((v) => v === 2).length).toBe(0);
  });

  it('no toca el original', () => {
    fundirZonaEn(idx, w, h, 12, 10);
    expect(idx[10 * w + 12]).toBe(2);
  });

  it('un toque afuera o sobre el fondo no hace nada', () => {
    expect(fundirZonaEn(idx, w, h, -1, 0).ok).toBe(false);
    expect(fundirZonaEn(idx, w, h, 0, 0).motivo).toBe('grande'); // el fondo es la zona más grande
  });

  it('no deja borrar una zona enorme (el color del ala entera)', () => {
    const r = fundirZonaEn(idx, w, h, 8, 6, 0.05);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('grande');
  });

  it('las limpiezas se pueden volver a aplicar en orden', () => {
    const dos = new Uint8Array(idx);
    for (let x = 6; x < 10; x++) dos[6 * w + x] = 2;
    const r = aplicarLimpiezas(dos, w, h, [[12, 10], [7, 6]]);
    expect(r.filter((v) => v === 2).length).toBe(0);
  });
});

describe('tocar el modelo y llegar al píxel de la imagen', () => {
  // Imagen asimétrica: así un error de espejo o de desplazamiento se nota.
  const w = 40, h = 30;
  const rgba = imagen(w, h, { fondo: [0, 0, 0, 0], rects: [[4, 3, 22, 12, ROJO], [22, 3, 36, 20, AZUL], [8, 12, 20, 27, VERDE]] });
  const q = cuantizar(rgba, prepararMascara(rgba, w, h), w, h, 4);
  const entrada = { indices: q.indices, w, h, paleta: q.paleta };

  for (const [nombre, extra, minimo, exactitud] of [['sin suavizar', { suavizadoBordes: 0, anchoMinimo: 0 }, 4, 1], ['con suavizado', { suavizadoBordes: 3 }, 10, 0.85]]) {
    it(`cada punto de una pieza cae en un píxel de ese mismo color (${nombre})`, () => {
      const r = armarLlaveroImagen(entrada, { ...PARAMETROS_IMAGEN, anchoMm: 60, margen: 2, argolla: 'arriba', ...extra });
      let probados = 0, aciertos = 0;
      for (const c of r.cuerpos.filter((b) => b.id.startsWith('color-'))) {
        const indice = Number(c.id.slice(6));
        const m = c.malla;
        let zmax = -Infinity;
        for (let i = 2; i < m.pos.length; i += 3) zmax = Math.max(zmax, m.pos[i]);
        for (let i = 0; i < m.tri.length; i += 3) {
          const v = [0, 1, 2].map((k) => m.tri[i + k] * 3);
          if (!v.every((a) => Math.abs(m.pos[a + 2] - zmax) < 1e-4)) continue;
          const X = (m.pos[v[0]] + m.pos[v[1]] + m.pos[v[2]]) / 3;
          const Y = (m.pos[v[0] + 1] + m.pos[v[1] + 1] + m.pos[v[2] + 1]) / 3;
          const { x, y } = pixelDeModelo(r.mapa, X, Y);
          probados++;
          if (x >= 0 && y >= 0 && x < w && y < h && q.indices[y * w + x] === indice) aciertos++;
        }
      }
      expect(probados).toBeGreaterThanOrEqual(minimo);
      // Sin suavizar, todos. Con suavizado el borde se corre hasta medio píxel, así que los
      // triángulos pegados al borde de dos colores pueden caer en el píxel vecino.
      expect(aciertos / probados).toBeGreaterThanOrEqual(exactitud);
    });
  }

  it('las esquinas de la imagen caen en las esquinas del modelo, sin espejo', () => {
    const r = armarLlaveroImagen(entrada, { ...PARAMETROS_IMAGEN, anchoMm: 36, margen: 0, argolla: 'derecha', suavizadoBordes: 0, anchoMinimo: 0 });
    // 36 mm para 32 píxeles de ancho (4..35): 1,125 mm por píxel. Se arma sin margen.
    const mm = r.mapa.mm;
    const aXY = (px, py) => ({ X: (px - r.mapa.x0 + 0.5) * mm - r.mapa.cajaX, Y: (r.mapa.y1 - py + 0.5) * mm - r.mapa.cajaY });
    for (const [px, py] of [[4, 3], [35, 3], [4, 26], [35, 19], [20, 12]]) {
      const { X, Y } = aXY(px, py);
      expect(pixelDeModelo(r.mapa, X, Y)).toEqual({ x: px, y: py });
    }
    // Arriba del dibujo en la imagen es más Y en el modelo.
    expect(aXY(4, 3).Y).toBeGreaterThan(aXY(4, 26).Y);
    // Izquierda en la imagen es menos X en el modelo.
    expect(aXY(4, 3).X).toBeLessThan(aXY(35, 3).X);
  });
});

describe('colores en una cara o en ambas', () => {
  const w = 40, h = 30;
  const rgba = imagen(w, h, { fondo: [0, 0, 0, 0], rects: [[5, 5, 20, 25, ROJO], [20, 5, 35, 25, AZUL]] });
  const q = cuantizar(rgba, prepararMascara(rgba, w, h), w, h, 4);
  const entrada = { indices: q.indices, w, h, paleta: q.paleta };
  const P = (extra = {}) => ({ ...PARAMETROS_IMAGEN, suavizadoBordes: 0, anchoMinimo: 0, ...extra });
  const rangoZ = (m) => { const a = []; for (let i = 2; i < m.pos.length; i += 3) a.push(m.pos[i]); return [Math.min(...a), Math.max(...a)]; };
  const color = (r, n) => r.cuerpos.find((c) => c.nombre === n);

  it('plano en ambas caras: los colores atraviesan toda la placa', () => {
    const r = armarLlaveroImagen(entrada, P({ modo: 'plano', caras: 'ambas', grosor: 2.4 }));
    for (const c of r.cuerpos) {
      const [min, max] = rangoZ(c.malla);
      expect(min).toBeCloseTo(0);
      expect(max).toBeCloseTo(2.4);
    }
  });

  it('plano en una cara: una capa fina de color arriba y una base lisa abajo', () => {
    const r = armarLlaveroImagen(entrada, P({ modo: 'plano', caras: 'una', grosor: 2.4, capaColor: 0.8 }));
    const base = color(r, 'Base');
    expect(rangoZ(base.malla)[0]).toBeCloseTo(0);
    expect(rangoZ(base.malla)[1]).toBeCloseTo(2.4);
    for (const c of r.cuerpos.filter((b) => b.id.startsWith('color-'))) {
      const [min, max] = rangoZ(c.malla);
      expect(min).toBeCloseTo(1.6); // 2,4 − 0,8
      expect(max).toBeCloseTo(2.4);
    }
    // El dorso queda liso: ningún color toca la cama.
    expect(r.cuerpos.filter((b) => b.id.startsWith('color-')).every((c) => rangoZ(c.malla)[0] > 1)).toBe(true);
  });

  it('el material total es parecido: la placa es la misma con colores en una o en ambas caras', () => {
    const vol = (r) => r.cuerpos.reduce((a, c) => a + volumenMalla(c.malla), 0);
    const ambas = armarLlaveroImagen(entrada, P({ modo: 'plano', caras: 'ambas' }));
    const una = armarLlaveroImagen(entrada, P({ modo: 'plano', caras: 'una' }));
    expect(vol(una) / vol(ambas)).toBeGreaterThan(0.97);
    expect(vol(una) / vol(ambas)).toBeLessThan(1.03);
  });

  it('con una sola cara hay menos material de color (el resto es base)', () => {
    const colorVol = (r) => r.cuerpos.filter((b) => b.id.startsWith('color-')).reduce((a, c) => a + volumenMalla(c.malla), 0);
    const ambas = armarLlaveroImagen(entrada, P({ modo: 'plano', caras: 'ambas' }));
    const una = armarLlaveroImagen(entrada, P({ modo: 'plano', caras: 'una' }));
    expect(colorVol(una)).toBeLessThan(colorVol(ambas) * 0.5);
  });

  it('una capa de color más gruesa que la placa no rompe: queda siempre una base', () => {
    const r = armarLlaveroImagen(entrada, P({ modo: 'plano', caras: 'una', grosor: 1.2, capaColor: 5 }));
    expect(rangoZ(color(r, 'Base').malla)[1]).toBeCloseTo(1.2);
    expect(rangoZ(color(r, 'Color 1').malla)[0]).toBeGreaterThanOrEqual(0.39);
  });

  it('relieve en una cara: el relieve sólo arriba', () => {
    const r = armarLlaveroImagen(entrada, P({ modo: 'relieve', caras: 'una', grosor: 1.6, relieve: 0.8 }));
    expect(rangoZ(color(r, 'Base').malla)).toEqual([expect.closeTo(0), expect.closeTo(1.6)]);
    expect(rangoZ(color(r, 'Color 1').malla)[0]).toBeCloseTo(1.6);
    expect(rangoZ(color(r, 'Color 1').malla)[1]).toBeCloseTo(2.4);
  });

  it('relieve en ambas caras: la base sube y hay relieve arriba y abajo', () => {
    const r = armarLlaveroImagen(entrada, P({ modo: 'relieve', caras: 'ambas', grosor: 1.6, relieve: 0.8 }));
    const base = rangoZ(color(r, 'Base').malla);
    expect(base[0]).toBeCloseTo(0.8);
    expect(base[1]).toBeCloseTo(2.4);
    const rojo = rangoZ(color(r, 'Color 1').malla);
    expect(rojo[0]).toBeCloseTo(0); // relieve de abajo, sobre la cama
    expect(rojo[1]).toBeCloseTo(3.2); // relieve de arriba: 0,8 + 1,6 + 0,8
  });

  it('un valor desconocido de caras se trata como ambas', () => {
    expect(sanearImagen(P({ caras: 'tres' })).caras).toBe('ambas');
    expect(sanearImagen(P({ caras: 'una' })).caras).toBe('una');
  });
});

describe('ancho mínimo de las líneas', () => {
  // Una imagen de 100 × 60 píxeles a 10 mm de ancho: 1 píxel = 0,1 mm.
  const w = 100, h = 60;
  const celeste = [180, 220, 245], negro = [20, 20, 30], rojo = [220, 40, 40];
  const construir = (dibujar) => {
    const rgba = imagen(w, h, { fondo: [...celeste, 255] });
    dibujar((x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgba.set([...c, 255], (y * w + x) * 4); });
    const q = cuantizar(rgba, prepararMascara(rgba, w, h), w, h, 4, { fusion: 5 });
    return { indices: q.indices, w, h, paleta: q.paleta };
  };
  const arma = (entrada, extra = {}) => armarLlaveroImagen(entrada, { ...PARAMETROS_IMAGEN, anchoMm: 10, margen: 1, suavizadoBordes: 0, minPixeles: 1, ...extra });
  const cuerpoDe = (r, rgb) => r.cuerpos.filter((c) => c.id.startsWith('color-')).find((c) => {
    const [a, b, k] = [1, 3, 5].map((i) => parseInt(c.color.slice(i, i + 2), 16));
    return Math.abs(a - rgb[0]) + Math.abs(b - rgb[1]) + Math.abs(k - rgb[2]) < 60;
  });
  const caja = (m) => {
    const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 2; k++) { mn[k] = Math.min(mn[k], m.pos[i + k]); mx[k] = Math.max(mx[k], m.pos[i + k]); }
    return { ancho: mx[0] - mn[0], alto: mx[1] - mn[1] };
  };

  it('una línea de 1 píxel (0,1 mm) sin forzar queda de 0,1 mm', () => {
    const e = construir((r) => r(10, 28, 90, 29, negro));
    const r = arma(e, { anchoMinimo: 0 });
    expect(caja(cuerpoDe(r, negro).malla).alto).toBeLessThan(0.15);
  });

  it('con ancho mínimo 0,4 la misma línea mide al menos 0,4 mm, sin pasarse mucho', () => {
    const e = construir((r) => r(10, 28, 90, 29, negro));
    const alto = caja(cuerpoDe(arma(e, { anchoMinimo: 0.4 }), negro).malla).alto;
    expect(alto).toBeGreaterThanOrEqual(0.39);
    expect(alto).toBeLessThan(0.7); // w + hasta w/3 de la última vuelta + 0,1 mm del contacto entre colores
  });

  it('el ancho mínimo se adapta a la boquilla: 0,6 da líneas más anchas que 0,4', () => {
    const e = construir((r) => r(10, 28, 90, 29, negro));
    const a4 = caja(cuerpoDe(arma(e, { anchoMinimo: 0.4 }), negro).malla).alto;
    const a6 = caja(cuerpoDe(arma(e, { anchoMinimo: 0.6 }), negro).malla).alto;
    expect(a6).toBeGreaterThanOrEqual(0.59);
    expect(a6).toBeGreaterThan(a4 + 0.1);
  });

  it('una línea que ya es ancha no se toca', () => {
    const e = construir((r) => r(10, 25, 90, 31, negro)); // 0,6 mm
    const sin = caja(cuerpoDe(arma(e, { anchoMinimo: 0 }), negro).malla).alto;
    const con = caja(cuerpoDe(arma(e, { anchoMinimo: 0.4 }), negro).malla).alto;
    // Sólo el crecimiento de 0,05 mm por lado con el que los colores se tocan; no se engrosa hasta otro ancho.
    expect(con).toBeGreaterThanOrEqual(sin - 0.01);
    expect(con).toBeLessThanOrEqual(sin + 0.12);
  });

  it('una línea fina pegada a una zona ancha también se engrosa, y la zona ancha no cambia de tamaño', () => {
    // Un rectángulo rojo de 30 × 30 con una raya negra de 1 píxel que sale de él.
    const e = construir((r) => { r(10, 15, 40, 45, rojo); r(40, 30, 90, 31, negro); });
    const sin = arma(e, { anchoMinimo: 0 });
    const con = arma(e, { anchoMinimo: 0.4 });
    expect(caja(cuerpoDe(con, negro).malla).alto).toBeGreaterThanOrEqual(0.39);
    const rojoSin = volumenMalla(cuerpoDe(sin, rojo).malla), rojoCon = volumenMalla(cuerpoDe(con, rojo).malla);
    // La zona ancha sólo gana su borde de 0,05 mm (el contacto con los vecinos), no se infla.
    expect(Math.abs(rojoCon - rojoSin) / rojoSin).toBeLessThan(0.08);
  });

  it('un contorno de 1 píxel que rodea una zona (todo el color es fino) queda de al menos 0,4 mm', () => {
    const e = construir((r) => { r(20, 10, 80, 50, negro); r(21, 11, 79, 49, rojo); });
    const alto = (r) => {
      const m = cuerpoDe(r, negro).malla;
      // Grosor del lado de arriba: el contorno no puede ser más fino que el pedido.
      return caja(m).alto;
    };
    expect(alto(arma(e, { anchoMinimo: 0.4 }))).toBeGreaterThan(3); // sigue siendo el marco entero
    // Volumen: con el mínimo el marco tiene más material que sin él.
    expect(volumenMalla(cuerpoDe(arma(e, { anchoMinimo: 0.4 }), negro).malla)).toBeGreaterThan(volumenMalla(cuerpoDe(arma(e, { anchoMinimo: 0 }), negro).malla) * 2);
  });

  it('engrosarFinas devuelve lo mismo si todo es ancho o si no se pide mínimo', () => {
    const rect = [[{ X: 0, Y: 0 }, { X: 10000, Y: 0 }, { X: 10000, Y: 10000 }, { X: 0, Y: 10000 }]];
    expect(engrosarFinas(rect, 0)).toBe(rect);
    const r = engrosarFinas(rect, 0.4);
    expect(areaDeCaminos(r)).toBeCloseTo(100, 0);
  });

  it('con un ancho mínimo enorme no se rompe', () => {
    const e = construir((r) => r(10, 28, 90, 29, negro));
    expect(() => arma(e, { anchoMinimo: 2 })).not.toThrow();
  });

  it('el valor por defecto viene activo para una boquilla de 0,4', () => {
    expect(PARAMETROS_IMAGEN.anchoMinimo).toBe(0.4);
    expect(PARAMETROS_IMAGEN.boquilla).toBe(0.4);
  });
});
