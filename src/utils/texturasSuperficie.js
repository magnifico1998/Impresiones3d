// Texturas de relieve para la herramienta "Modificador de superficies". Cada
// textura es un mapa de alturas: una grilla cuadrada de n × n valores entre 0
// (el punto más hundido) y 1 (el más alto) que se repite sin costuras. Se
// generan por código, así que no hay imágenes que cargar ni derechos de
// terceros.

export const TAM_TEXTURA = 256;

const fr = (x) => x - Math.floor(x);
const mod = (a, n) => ((a % n) + n) % n;
const limitar = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Triángulo: 0 en los enteros, 1 en los medios.
const tri = (x) => 1 - Math.abs(2 * fr(x) - 1);
// Coseno: 1 en los enteros, 0 en los medios.
const onda = (x) => 0.5 + 0.5 * Math.cos(2 * Math.PI * x);
// Distancia con signo al entero más cercano (-0,5 … 0,5), para repetir.
const envolver = (x) => x - Math.round(x);

function hash(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s + 1, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Ruido de valores que se repite cada `pu` celdas en u y cada `pv` en v.
function ruido(u, v, pu, pv, s = 0) {
  const x = fr(u) * pu, y = fr(v) * pv;
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(mod(i, pu), mod(j, pv), s), b = hash(mod(i + 1, pu), mod(j, pv), s);
  const c = hash(mod(i, pu), mod(j + 1, pv), s), d = hash(mod(i + 1, pu), mod(j + 1, pv), s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Ruido en capas: cada una con el doble de detalle y la mitad de fuerza.
function capas(u, v, pu, pv, n = 4, s = 0) {
  let suma = 0, fuerza = 0.5, total = 0;
  for (let o = 0; o < n; o++) {
    suma += fuerza * ruido(u, v, pu * 2 ** o, pv * 2 ** o, s + o);
    total += fuerza;
    fuerza /= 2;
  }
  return suma / total;
}

// ---------- Madera ----------

const madera = {
  vetas: (u, v) => {
    const p = v * 16 + 1.6 * capas(u, v, 2, 3, 3, 1);
    return 0.62 * onda(p) + 0.38 * ruido(u, v, 4, 128, 2);
  },
  onduladas: (u, v) => {
    const p = v * 11 + 3.2 * capas(u, v, 2, 2, 3, 3) + 0.5 * Math.sin(2 * Math.PI * u * 2);
    return 0.7 * onda(p) + 0.3 * ruido(u, v, 3, 96, 4);
  },
  nudos: (u, v) => {
    const nudos = [[0.28, 0.3, 0.012], [0.74, 0.7, 0.008]];
    let p = v * 14 + 0.8 * capas(u, v, 2, 3, 3, 5);
    let hundido = 0;
    for (const [ku, kv, s] of nudos) {
      const dx = envolver(u - ku), dy = envolver(v - kv);
      const r2 = dx * dx + dy * dy;
      p += 1.1 * (dy / 0.1) * Math.exp(-r2 / (s * 6));
      hundido += Math.exp(-r2 / (s * 0.5)) * 0.5 + Math.exp(-r2 / (s * 2.5)) * 0.15;
    }
    return limitar(0.65 * onda(p) + 0.3 * ruido(u, v, 4, 128, 6) + 0.05 - hundido);
  },
  anillos: (u, v) => {
    const d = Math.hypot(envolver(u - 0.5), envolver(v - 0.5));
    const p = d * 13 + 1.4 * capas(u, v, 2, 2, 3, 8);
    return 0.75 * onda(p) + 0.25 * ruido(u, v, 32, 32, 9);
  },
  tablones: (u, v) => {
    const filas = 4;
    const r = mod(Math.floor(v * filas), filas), lv = fr(v * filas);
    const corrimiento = hash(r, 0, 11);
    const uu = u + corrimiento;
    const grano = onda(lv * 6 + 1.3 * capas(uu, v, 2, 4, 3, 12)) * 0.7 + 0.3 * ruido(uu, v, 4, 128, 13);
    const borde = Math.min(lv, 1 - lv);
    const ranuraLado = 1 - suave(0.015, 0.06, borde);
    const ranuraTope = 1 - suave(0.004, 0.014, Math.abs(envolver(u - hash(r, 1, 14))));
    const nivel = 0.9 + (hash(r, 2, 15) - 0.5) * 0.12;
    return limitar(grano * 0.55 * nivel + 0.35) * (1 - 0.92 * Math.max(ranuraLado, ranuraTope));
  },
  corteza: (u, v) => {
    const n = capas(u, v, 10, 1, 4, 16);
    return Math.pow(1 - Math.abs(2 * n - 1), 2.2);
  },
  cepillada: (u, v) => {
    const fino = ruido(u, v, 2, 200, 17), medio = ruido(u, v, 3, 40, 18);
    return limitar(0.35 + 0.35 * fino + 0.3 * medio * onda(v * 5 + 2 * medio));
  },
  acanalada: (u, v) => {
    const estria = 0.5 + 0.5 * Math.cos(2 * Math.PI * u * 10);
    return limitar(0.88 * estria + 0.12 * ruido(u, v, 4, 160, 19));
  }
};

// ---------- Fibra de carbono ----------

// Un tejido de n × n cuadros: en cada uno arriba va el hilo vertical o el
// horizontal, según `arribaVertical(i, j)`. Cada hilo es un cilindro chato que
// se hunde donde pasa por debajo del otro.
function tejido(u, v, n, arribaVertical) {
  const x = fr(u) * n, y = fr(v) * n;
  const i = Math.floor(x), j = Math.floor(y);
  const a = x - i, b = y - j;
  const vertical = arribaVertical(mod(i, n), mod(j, n));
  const ancho = vertical ? a : b;
  const largo = vertical ? b : a;
  const sigue = vertical
    ? arribaVertical(mod(i, n), mod(largo < 0.5 ? j - 1 : j + 1, n))
    : arribaVertical(mod(largo < 0.5 ? i - 1 : i + 1, n), mod(j, n));
  const cerca = Math.min(largo, 1 - largo);
  const hundir = sigue === vertical ? 1 : 0.55 + 0.45 * suave(0, 0.4, cerca);
  const perfil = Math.pow(Math.sin(Math.PI * ancho), 0.55);
  const fibras = 0.035 * Math.cos(2 * Math.PI * ancho * 6);
  return limitar(0.12 + 0.78 * perfil * hundir + fibras);
}

const carbono = {
  sargaFina: (u, v) => tejido(u, v, 24, (i, j) => (i + j) % 4 < 2),
  sargaGruesa: (u, v) => tejido(u, v, 12, (i, j) => (i + j) % 4 < 2),
  telaPlana: (u, v) => tejido(u, v, 16, (i, j) => (i + j) % 2 === 0),
  cesta: (u, v) => tejido(u, v, 16, (i, j) => (Math.floor(i / 2) + Math.floor(j / 2)) % 2 === 0),
  unidireccional: (u, v) => tejido(u, v, 24, (i, j) => j % 8 !== 0),
  forjado: (u, v) => {
    // Trozos de fibra picada, cada uno con su dirección.
    const g = 6;
    const x = fr(u) * g, y = fr(v) * g;
    const ci = Math.floor(x), cj = Math.floor(y);
    let d1 = 9, d2 = 9, ganador = [0, 0];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        const px = i + hash(mod(i, g), mod(j, g), 21), py = j + hash(mod(i, g), mod(j, g), 22);
        const d = Math.hypot(x - px, y - py);
        if (d < d1) { d2 = d1; d1 = d; ganador = [mod(i, g), mod(j, g)]; } else if (d < d2) d2 = d;
      }
    }
    const ang = hash(ganador[0], ganador[1], 23) * Math.PI;
    // Las frecuencias son enteras para que los hilos empalmen al repetir.
    const hilos = 0.5 + 0.5 * Math.cos(2 * Math.PI * (u * Math.round(90 * Math.cos(ang)) + v * Math.round(90 * Math.sin(ang))));
    const nivel = 0.45 + 0.3 * hash(ganador[0], ganador[1], 24);
    return limitar((nivel + 0.18 * hilos) * (0.35 + 0.65 * suave(0, 0.07, d2 - d1)));
  }
};

// ---------- Geométricas ----------

const RAIZ3 = Math.sqrt(3);

// Red de hexágonos de nx columnas y ny filas. Devuelve la distancia al borde
// del hexágono (e) y la posición relativa a su centro (gx, gy).
function hexagono(u, v, nx, ny) {
  const x = fr(u) * nx, y = fr(v) * ny * RAIZ3;
  const ax = mod(x, 1) - 0.5, ay = mod(y, RAIZ3) - RAIZ3 / 2;
  const bx = mod(x - 0.5, 1) - 0.5, by = mod(y - RAIZ3 / 2, RAIZ3) - RAIZ3 / 2;
  const [gx, gy] = ax * ax + ay * ay < bx * bx + by * by ? [ax, ay] : [bx, by];
  const px = Math.abs(gx), py = Math.abs(gy);
  const dist = Math.max(px * 0.5 + py * 0.8660254, px);
  return { e: 0.5 - dist, gx, gy };
}

function voronoi(u, v, g, semilla) {
  const x = fr(u) * g, y = fr(v) * g;
  const ci = Math.floor(x), cj = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const px = i + 0.15 + 0.7 * hash(mod(i, g), mod(j, g), semilla), py = j + 0.15 + 0.7 * hash(mod(i, g), mod(j, g), semilla + 1);
      const d = Math.hypot(x - px, y - py);
      if (d < d1) { d2 = d1; d1 = d; id = hash(mod(i, g), mod(j, g), semilla + 2); } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}

const geometricas = {
  hexagonos: (u, v) => suave(0.015, 0.075, hexagono(u, v, 7, 4).e),
  panal: (u, v) => 1 - suave(0.02, 0.1, hexagono(u, v, 7, 4).e),
  hoyuelos: (u, v) => {
    const { gx, gy } = hexagono(u, v, 7, 4);
    const t = Math.min(Math.hypot(gx, gy) / 0.5, 1);
    return 1 - Math.sqrt(1 - t * t);
  },
  rombos: (u, v) => {
    const n = 6;
    const e = Math.min(tri((u + v) * n), tri((u - v) * n)) / 2;
    return suave(0.02, 0.15, e);
  },
  moleteado: (u, v) => Math.pow(Math.min(tri((u + v) * 9), tri((u - v) * 9)), 0.85),
  cuadros: (u, v) => {
    const n = 8;
    const x = fr(u * n), y = fr(v * n);
    return suave(0.03, 0.1, Math.min(x, 1 - x, y, 1 - y));
  },
  cupulas: (u, v) => {
    const n = 8;
    const t = Math.min(Math.hypot(fr(u * n) - 0.5, fr(v * n) - 0.5) / 0.46, 1);
    return Math.sqrt(1 - t * t);
  },
  triangulos: (u, v) => {
    const { e, gx, gy } = hexagono(u, v, 7, 4);
    const f = fr((Math.atan2(gy, gx) - Math.PI / 6) / (Math.PI / 3));
    const dm = Math.min(f, 1 - f) * (Math.PI / 3);
    const sector = Math.hypot(gx, gy) * Math.sin(dm);
    return limitar(Math.min(e, sector) / 0.1667);
  },
  lineas: (u) => Math.pow(onda(u * 16), 0.8),
  ondas: (u, v) => onda(v * 8 + 0.18 * Math.sin(2 * Math.PI * u * 4)),
  escamas: (u, v) => {
    const n = 8;
    const x = fr(u) * n, y = fr(v) * n;
    const j0 = Math.floor(y);
    // Cada fila de escamas tapa un poco a la anterior: gana la de más abajo.
    let alto = 0.05, fila = -9;
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      const desde = mod(j, 2) ? 0.5 : 0;
      const i0 = Math.floor(x - desde);
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const r = Math.hypot(x - (i + 0.5 + desde), y - (j + 0.5)) / 0.78;
        if (r < 1 && j > fila) { fila = j; alto = 0.25 + 0.75 * (1 - r * r); }
      }
    }
    return limitar(alto);
  },
  ladrillos: (u, v) => {
    const filas = 8, columnas = 4;
    const r = Math.floor(v * filas);
    const x = fr(u * columnas + (r % 2 ? 0.5 : 0)), y = fr(v * filas);
    const junta = suave(0.02, 0.07, Math.min(x, 1 - x) * 0.5) * suave(0.04, 0.12, Math.min(y, 1 - y));
    return limitar(junta * (0.8 + 0.2 * ruido(u, v, 24, 24, 31)));
  },
  voronoi: (u, v) => {
    const { d1, d2 } = voronoi(u, v, 7, 33);
    return suave(0, 0.18, d2 - d1);
  },
  chevron: (u, v) => {
    const zig = Math.abs(fr(u * 4) - 0.5) * 2;
    return onda(v * 8 + zig * 0.5);
  },
  circulos: (u, v) => {
    const n = 3;
    const d = Math.hypot(fr(u * n) - 0.5, fr(v * n) - 0.5);
    return onda(d * 12);
  }
};

// ---------- Catálogo ----------

export const CATEGORIAS_TEXTURA = [
  { id: 'madera', nombre: 'Madera' },
  { id: 'carbono', nombre: 'Fibra de carbono' },
  { id: 'geometricas', nombre: 'Geométricas' }
];

const NOMBRES = {
  vetas: 'Vetas', onduladas: 'Vetas onduladas', nudos: 'Con nudos', anillos: 'Anillos de tronco', tablones: 'Tablones',
  corteza: 'Corteza', cepillada: 'Cepillada', acanalada: 'Acanalada',
  sargaFina: 'Sarga fina', sargaGruesa: 'Sarga gruesa', telaPlana: 'Tela plana', cesta: 'Cesta', unidireccional: 'Unidireccional', forjado: 'Forjado',
  hexagonos: 'Hexágonos', panal: 'Panal', hoyuelos: 'Hoyuelos', rombos: 'Rombos', moleteado: 'Moleteado', cuadros: 'Cuadros',
  cupulas: 'Cúpulas', triangulos: 'Triángulos', lineas: 'Líneas', ondas: 'Ondas', escamas: 'Escamas', ladrillos: 'Ladrillos',
  voronoi: 'Celdas', chevron: 'Chevron', circulos: 'Círculos'
};

// Cuántos detalles caben en una repetición (los cuadros de un tejido, las
// vetas, las celdas): sirve para sugerir la resolución de la malla.
const DETALLES = {
  vetas: 24, onduladas: 20, nudos: 24, anillos: 24, tablones: 28, corteza: 30, cepillada: 30, acanalada: 10,
  sargaFina: 24, sargaGruesa: 12, telaPlana: 16, cesta: 16, unidireccional: 24, forjado: 20,
  hexagonos: 7, panal: 7, hoyuelos: 7, rombos: 6, moleteado: 9, cuadros: 8, cupulas: 8, triangulos: 14, lineas: 16,
  ondas: 10, escamas: 8, ladrillos: 8, voronoi: 7, chevron: 10, circulos: 18
};

export const TEXTURAS = [
  ...Object.entries(madera).map(([k, f]) => ({ id: `madera-${k}`, nombre: NOMBRES[k], categoria: 'madera', detalle: DETALLES[k], f })),
  ...Object.entries(carbono).map(([k, f]) => ({ id: `carbono-${k}`, nombre: NOMBRES[k], categoria: 'carbono', detalle: DETALLES[k], f })),
  ...Object.entries(geometricas).map(([k, f]) => ({ id: `geo-${k}`, nombre: NOMBRES[k], categoria: 'geometricas', detalle: DETALLES[k], f }))
];

// Resolución de malla (mm) con la que se ve bien una textura de ese tamaño:
// unos tres puntos por detalle.
export function resolucionSugerida(textura, tamanoMm) {
  const detalle = textura?.detalle || 12;
  return Math.min(2, Math.max(0.15, Math.round((tamanoMm / (detalle * 3)) * 100) / 100));
}

const cache = new Map();

// Mapa de alturas de una textura del catálogo: { n, datos }.
export function generarTextura(id, n = TAM_TEXTURA) {
  const clave = `${id}:${n}`;
  if (cache.has(clave)) return cache.get(clave);
  const t = TEXTURAS.find((x) => x.id === id);
  if (!t) throw new Error(`No existe la textura ${id}`);
  const datos = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) datos[y * n + x] = limitar(t.f((x + 0.5) / n, (y + 0.5) / n));
  }
  const textura = { n, datos };
  cache.set(clave, textura);
  return textura;
}

// Una imagen (RGBA) convertida en mapa de alturas por su luminosidad.
export function texturaDeImagen(rgba, ancho, alto) {
  const datos = new Float32Array(ancho * alto);
  for (let i = 0; i < datos.length; i++) {
    datos[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  }
  return { n: ancho, alto, datos };
}

// ---------- Uso ----------

// Altura (0 a 1) en (u, v): bilineal, repitiendo la textura.
export function muestrear(textura, u, v) {
  const { n, datos } = textura;
  const m = textura.alto || n;
  const x = fr(u) * n - 0.5, y = fr(v) * m - 0.5;
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const i0 = mod(i, n), i1 = mod(i + 1, n), j0 = mod(j, m), j1 = mod(j + 1, m);
  const a = datos[j0 * n + i0], b = datos[j0 * n + i1], c = datos[j1 * n + i0], d = datos[j1 * n + i1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// Desenfoque gaussiano que se repite en los bordes. `sigma` en píxeles.
export function suavizarTextura(textura, sigma) {
  if (!(sigma > 0)) return textura;
  const { n, datos } = textura;
  const m = textura.alto || n;
  const radio = Math.max(1, Math.ceil(sigma * 3));
  const pesos = [];
  let suma = 0;
  for (let k = -radio; k <= radio; k++) { const p = Math.exp(-(k * k) / (2 * sigma * sigma)); pesos.push(p); suma += p; }
  const pasada = (origen, horizontal) => {
    const salida = new Float32Array(origen.length);
    for (let y = 0; y < m; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -radio; k <= radio; k++) {
          const xx = horizontal ? mod(x + k, n) : x, yy = horizontal ? y : mod(y + k, m);
          s += origen[yy * n + xx] * pesos[k + radio];
        }
        salida[y * n + x] = s / suma;
      }
    }
    return salida;
  };
  return { ...textura, datos: pasada(pasada(datos, true), false) };
}

export function invertirTextura(textura) {
  return { ...textura, datos: textura.datos.map((x) => 1 - x) };
}
