// Llavero a partir de una imagen: agrupa los colores de la imagen en hasta 4, 8
// o 12, arma una zona por color y las vuelve piezas 3D (una por color) sobre una
// base que sigue la silueta de la imagen, con la argolla pegada. Todo en el
// navegador y sin tocar el DOM: este módulo trabaja con píxeles (RGBA) y se
// prueba en Node.
import {
  ESCALA_CLIPPER as E, desplazarCaminos, unirCaminos, restarCaminos, caminosAFormas, cajaDeCaminos,
  discoCamino, limpiarCaminos, areaInterseccion, interseccionCaminos, areaCamino, esHueco, extruir, moverMalla, unirMallas
} from './llaveros';

export const CANTIDADES_COLORES = [4, 8, 12];
export const SIN_COLOR = 255; // índice de un píxel transparente o de fondo

// Diámetros de boquilla más comunes (mm).
export const BOQUILLAS = [0.2, 0.4, 0.6, 0.8];

export const POSICIONES_ARGOLLA = [
  { id: 'izquierda', nombre: 'Izquierda' },
  { id: 'arriba', nombre: 'Arriba' },
  { id: 'derecha', nombre: 'Derecha' }
];

export const MODOS_IMAGEN = [
  { id: 'plano', nombre: 'Plano (la imagen es la placa)' },
  { id: 'relieve', nombre: 'Relieve (base y colores encima)' }
];

// En cuántas caras van los colores. Plano: con "una" la imagen es una capa fina
// sobre una base lisa del color del borde (la otra cara queda lisa); con "ambas"
// los colores atraviesan la placa y se ven de los dos lados (el dorso se ve
// espejado). Relieve: con "ambas" hay relieve de color arriba y abajo.
export const CARAS_IMAGEN = [
  { id: 'una', nombre: 'Una cara' },
  { id: 'ambas', nombre: 'Ambas caras' }
];

export const PARAMETROS_IMAGEN = Object.freeze({
  colores: 8,
  detalle: 256, // píxeles del lado más largo con los que se trabaja
  quitarFondo: false,
  toleranciaFondo: 40,
  fusion: 10, // colores más parecidos que esto (ΔE) se unen en uno
  suavizado: 1, // pasadas que borran píxeles sueltos
  boquilla: 0.4, // diámetro de la boquilla (mm): sólo ayuda a elegir el ancho mínimo
  anchoMinimo: 0.4, // ancho mínimo de las líneas (mm); 0 = no forzar
  suavizadoBordes: 3, // pasadas que redondean el escalonado de los contornos (0 = sin suavizar)
  minPixeles: 6,
  // Llavero
  anchoMm: 50,
  modo: 'plano',
  caras: 'ambas',
  capaColor: 0.8, // grosor de la capa de color cuando es plano y va en una sola cara
  grosor: 2.4,
  relieve: 0.8,
  margen: 1.5,
  agujero: 4.5,
  argolla: 'izquierda',
  colorBorde: '#222222'
});

// Deja las medidas dentro de rangos que arman una pieza válida (un campo vacío
// o en 0 no rompe la geometría).
const LIMITES = {
  colores: [2, 12], detalle: [32, 512], suavizadoBordes: [0, 4], anchoMinimo: [0, 2], boquilla: [0.1, 1.2], toleranciaFondo: [0, 120], fusion: [0, 40], suavizado: [0, 3],
  minPixeles: [1, 50], anchoMm: [10, 150], grosor: [0.8, 10], relieve: [0.2, 5], capaColor: [0.2, 5], margen: [0, 10], agujero: [2, 10]
};
export function sanearImagen(p) {
  const s = { ...p };
  for (const [k, [min, max]] of Object.entries(LIMITES)) {
    const v = Number(p[k]);
    s[k] = Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  }
  s.caras = p.caras === 'una' ? 'una' : 'ambas';
  s.suavizado = Math.round(s.suavizado);
  s.suavizadoBordes = Math.round(s.suavizadoBordes);
  return s;
}

// ---------- Color ----------

function aLab(r, g, b) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const colorAHex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const hexAColor = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Generador pseudoaleatorio con semilla: el mismo resultado cada vez.
function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Máscara y fondo ----------

// 1 = el píxel se usa; 0 = transparente o fondo. Con `quitarFondo` se borra el
// color de los bordes de la imagen (un fondo liso de un JPG, por ejemplo), sólo
// el que está conectado con el borde, así no se pierden los blancos de adentro.
export function prepararMascara(rgba, w, h, { umbralAlfa = 128, quitarFondo = false, tolerancia = 40 } = {}) {
  const mascara = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mascara[i] = rgba[i * 4 + 3] >= umbralAlfa ? 1 : 0;
  if (!quitarFondo) return mascara;

  // Color de fondo: el más común entre los píxeles del borde (agrupados de a 16 niveles).
  const cuenta = new Map();
  const bordes = [];
  for (let x = 0; x < w; x++) { bordes.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { bordes.push(y * w, y * w + w - 1); }
  for (const i of bordes) {
    if (!mascara[i]) continue;
    const k = `${rgba[i * 4] >> 4},${rgba[i * 4 + 1] >> 4},${rgba[i * 4 + 2] >> 4}`;
    const e = cuenta.get(k) || { n: 0, i };
    e.n += 1;
    cuenta.set(k, e);
  }
  if (!cuenta.size) return mascara;
  const ref = [...cuenta.values()].sort((a, b) => b.n - a.n)[0].i;
  const rr = rgba[ref * 4], rg = rgba[ref * 4 + 1], rb = rgba[ref * 4 + 2];
  const parecido = (i) => Math.hypot(rgba[i * 4] - rr, rgba[i * 4 + 1] - rg, rgba[i * 4 + 2] - rb) <= tolerancia;

  const visto = new Uint8Array(w * h);
  const pila = [];
  for (const i of bordes) if (mascara[i] && !visto[i] && parecido(i)) { visto[i] = 1; pila.push(i); }
  while (pila.length) {
    const i = pila.pop();
    mascara[i] = 0;
    const x = i % w, y = (i - x) / w;
    const vecinos = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const v of vecinos) if (v >= 0 && !visto[v] && mascara[v] && parecido(v)) { visto[v] = 1; pila.push(v); }
  }
  return mascara;
}

// ---------- Agrupar colores ----------

// Agrupa los colores de los píxeles usados en hasta `k` colores. Primero se
// agrupa fino (hasta unos 32 grupos, con k-means sobre el histograma de colores,
// en Lab, que se parece a cómo vemos las diferencias) y después se van uniendo
// de a dos los grupos que menos error agregan al unirse (criterio de Ward: pesa
// la cantidad de píxeles y qué tan distintos son). Así se conserva lo que ocupa
// mucho y lo que contrasta fuerte, como un contorno negro, y se pierden primero
// los detalles chicos y parecidos. Al final se unen los que quedan demasiado
// parecidos (`fusion`), así "hasta 8" no fuerza 8 tonos casi iguales.
// Devuelve { paleta: [[r, g, b]…] (de más a menos usado), indices, cuentas }.
export function cuantizar(rgba, mascara, w, h, k, { fusion = 10, semilla = 7 } = {}) {
  const indices = new Uint8Array(w * h).fill(SIN_COLOR);
  // Histograma de 5 bits por canal: cada casilla guarda cuántos píxeles y su color promedio.
  const casillas = new Map();
  let usados = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mascara[i]) continue;
    usados++;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const clave = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let e = casillas.get(clave);
    if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; casillas.set(clave, e); }
    e.n++; e.r += r; e.g += g; e.b += b;
  }
  if (!usados) return { paleta: [], indices, cuentas: [] };

  const lista = [...casillas.values()].map((e) => ({ lab: aLab(e.r / e.n, e.g / e.n, e.b / e.n), n: e.n }));
  const nb = lista.length;
  const d2 = (a, c) => (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2;

  // 1) Agrupado fino (k-means++ ponderado por cantidad de píxeles).
  const azar = generador(semilla);
  const kk = Math.min(nb, Math.max(k * 4, 32));
  const centros = [];
  let umbral = azar() * usados;
  let primero = nb - 1;
  for (let j = 0; j < nb; j++) { umbral -= lista[j].n; if (umbral <= 0) { primero = j; break; } }
  centros.push([...lista[primero].lab]);
  const minimas = new Float64Array(nb).fill(Infinity);
  while (centros.length < kk) {
    const ultimo = centros[centros.length - 1];
    let total = 0;
    for (let j = 0; j < nb; j++) {
      const d = d2(lista[j].lab, ultimo);
      if (d < minimas[j]) minimas[j] = d;
      total += minimas[j] * lista[j].n;
    }
    if (total === 0) break;
    let u = azar() * total;
    let elegido = nb - 1;
    for (let j = 0; j < nb; j++) { u -= minimas[j] * lista[j].n; if (u <= 0) { elegido = j; break; } }
    centros.push([...lista[elegido].lab]);
  }
  const asignado = new Int32Array(nb);
  for (let iter = 0; iter < 14; iter++) {
    let cambios = 0;
    for (let j = 0; j < nb; j++) {
      let mejor = 0, md = Infinity;
      for (let c = 0; c < centros.length; c++) { const d = d2(lista[j].lab, centros[c]); if (d < md) { md = d; mejor = c; } }
      if (asignado[j] !== mejor) { asignado[j] = mejor; cambios++; }
    }
    const suma = centros.map(() => [0, 0, 0, 0]);
    for (let j = 0; j < nb; j++) {
      const sm = suma[asignado[j]], e = lista[j];
      sm[0] += e.lab[0] * e.n; sm[1] += e.lab[1] * e.n; sm[2] += e.lab[2] * e.n; sm[3] += e.n;
    }
    suma.forEach((sm, c) => { if (sm[3]) centros[c] = [sm[0] / sm[3], sm[1] / sm[3], sm[2] / sm[3]]; });
    if (!cambios) break;
  }
  let grupos = centros.map((lab) => ({ lab, n: 0 }));
  for (let j = 0; j < nb; j++) grupos[asignado[j]].n += lista[j].n;
  grupos = grupos.filter((g) => g.n > 0);

  // Los grupos que son una mezcla de otros dos (el borde suavizado entre dos
  // colores, como el gris entre un contorno negro y un fondo celeste) no son un
  // color propio: se funden con el más cercano de los dos.
  const mezclaDe = (i) => {
    const g = grupos[i];
    for (let a = 0; a < grupos.length; a++) for (let b = a + 1; b < grupos.length; b++) {
      if (a === i || b === i) continue;
      const A = grupos[a], B = grupos[b];
      if (g.n >= Math.min(A.n, B.n)) continue;
      const ab = B.lab.map((v, c) => v - A.lab[c]);
      const largo2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      if (largo2 < 1) continue;
      const t = ((g.lab[0] - A.lab[0]) * ab[0] + (g.lab[1] - A.lab[1]) * ab[1] + (g.lab[2] - A.lab[2]) * ab[2]) / largo2;
      if (t < 0.12 || t > 0.88) continue;
      const proy = A.lab.map((v, c) => v + t * ab[c]);
      if (Math.sqrt(d2(g.lab, proy)) < 9) return t < 0.5 ? a : b;
    }
    return -1;
  };
  for (;;) {
    let hallado = -1, destinoMezcla = -1;
    for (let i = 0; i < grupos.length && hallado < 0; i++) { const d = mezclaDe(i); if (d >= 0) { hallado = i; destinoMezcla = d; } }
    if (hallado < 0) break;
    const A = grupos[destinoMezcla], B = grupos[hallado], t = A.n + B.n;
    grupos[destinoMezcla] = { n: t, lab: A.lab.map((v, c) => (v * A.n + B.lab[c] * B.n) / t) };
    grupos.splice(hallado, 1);
  }

  // 2) Se unen de a dos: primero los que menos error agregan (Ward) hasta quedar `k`,
  //    y después los que quedan más parecidos que `fusion`.
  const unir = (a, b) => {
    const A = grupos[a], B = grupos[b], t = A.n + B.n;
    grupos[a] = { n: t, lab: A.lab.map((v, i) => (v * A.n + B.lab[i] * B.n) / t) };
    grupos.splice(b, 1);
  };
  while (grupos.length > 1) {
    let par = null, mc = Infinity;
    const sobran = grupos.length > k;
    for (let a = 0; a < grupos.length; a++) for (let b = a + 1; b < grupos.length; b++) {
      const d = d2(grupos[a].lab, grupos[b].lab);
      if (!sobran && d >= fusion * fusion) continue;
      const costo = ((grupos[a].n * grupos[b].n) / (grupos[a].n + grupos[b].n)) * d;
      if (costo < mc) { mc = costo; par = [a, b]; }
    }
    if (!par) break;
    unir(par[0], par[1]);
  }

  // 3) Cada píxel va al grupo que le queda más cerca, y el color de cada grupo
  //    es el promedio real de sus píxeles. De más a menos usado.
  const labs = grupos.map((g) => g.lab);
  const sumas = labs.map(() => [0, 0, 0, 0]);
  const destino = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    if (!mascara[i]) continue;
    const px = aLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    let mejor = 0, md = Infinity;
    for (let c = 0; c < labs.length; c++) { const d = d2(px, labs[c]); if (d < md) { md = d; mejor = c; } }
    destino[i] = mejor;
    const sm = sumas[mejor];
    sm[0] += rgba[i * 4]; sm[1] += rgba[i * 4 + 1]; sm[2] += rgba[i * 4 + 2]; sm[3]++;
  }
  const orden = labs.map((_, c) => c).filter((c) => sumas[c][3] > 0).sort((a, b) => sumas[b][3] - sumas[a][3]);
  const nuevo = new Map(orden.map((viejo, i) => [viejo, i]));
  for (let i = 0; i < w * h; i++) if (destino[i] >= 0) indices[i] = nuevo.get(destino[i]);
  return {
    paleta: orden.map((c) => [sumas[c][0] / sumas[c][3], sumas[c][1] / sumas[c][3], sumas[c][2] / sumas[c][3]].map(Math.round)),
    indices,
    cuentas: orden.map((c) => sumas[c][3])
  };
}

// Asigna cada píxel usado al color más cercano de una paleta elegida a mano.
export function asignarAPaleta(rgba, mascara, w, h, paleta) {
  const indices = new Uint8Array(w * h).fill(SIN_COLOR);
  const cuentas = paleta.map(() => 0);
  const labs = paleta.map((c) => aLab(c[0], c[1], c[2]));
  for (let i = 0; i < w * h; i++) {
    if (!mascara[i]) continue;
    const px = aLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    let mejor = 0, md = Infinity;
    for (let c = 0; c < labs.length; c++) {
      const d = (px[0] - labs[c][0]) ** 2 + (px[1] - labs[c][1]) ** 2 + (px[2] - labs[c][2]) ** 2;
      if (d < md) { md = d; mejor = c; }
    }
    indices[i] = mejor;
    cuentas[mejor]++;
  }
  return { paleta: paleta.map((c) => [...c]), indices, cuentas };
}

// Color de la imagen en un punto (promedio de los píxeles usados de alrededor,
// para no tomar el ruido de uno solo), o null si ahí no hay imagen.
export function colorEnPunto(rgba, mascara, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h || !mascara[y * w + x]) return null;
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mascara[ny * w + nx]) continue;
    const i = ny * w + nx;
    r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2]; n++;
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ---------- Limpiar ----------

// Quita las motas: primero un filtro de mayoría (un píxel suelto toma el color
// de casi todos sus vecinos) y después las zonas de menos de `minPixeles`
// píxeles se funden con el color que más las rodea.
export function limpiarIndices(entrada, w, h, { pasadas = 1, minPixeles = 6 } = {}) {
  let indices = Uint8Array.from(entrada);
  const vecinos8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (let p = 0; p < pasadas; p++) {
    const sig = Uint8Array.from(indices);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cuentas = new Map();
      for (const [dx, dy] of vecinos8) {
        const nx = x + dx, ny = y + dy;
        const v = nx < 0 || ny < 0 || nx >= w || ny >= h ? SIN_COLOR : indices[ny * w + nx];
        cuentas.set(v, (cuentas.get(v) || 0) + 1);
      }
      let mejor = indices[y * w + x], mc = 0;
      for (const [v, c] of cuentas) if (c > mc) { mc = c; mejor = v; }
      if (mc >= 7 && mejor !== indices[y * w + x]) sig[y * w + x] = mejor;
    }
    indices = sig;
  }

  // Un contorno de 1 píxel en diagonal son cuadraditos que se tocan sólo por la
  // esquina: al vectorizar y suavizar se sueltan y la línea se rompe en trozos.
  // Se conectan rellenando uno de los dos vecinos (el del color más grande).
  const total = new Map();
  for (const v of indices) total.set(v, (total.get(v) || 0) + 1);
  const mas = (v1, v2) => ((total.get(v1) || 0) >= (total.get(v2) || 0) ? v1 : v2);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x;
    const a = indices[i], b = indices[i + 1], c = indices[i + w], d = indices[i + w + 1];
    const diagonalA = a === d && a !== SIN_COLOR && b !== a && c !== a; // a-d se tocan en diagonal
    const diagonalB = b === c && b !== SIN_COLOR && a !== b && d !== b; // b-c se tocan en diagonal
    // En un tablero (las dos a la vez) se conecta el color más chico: es la línea.
    const conectarA = diagonalA && (!diagonalB || (total.get(a) || 0) <= (total.get(b) || 0));
    if (conectarA) {
      // Se pinta de a el vecino (b o c) de color más grande, sin tocar el vacío.
      const objetivo = b === SIN_COLOR ? c : c === SIN_COLOR ? b : mas(b, c);
      if (objetivo !== SIN_COLOR) indices[objetivo === b ? i + 1 : i + w] = a;
    } else if (diagonalB) {
      const objetivo = a === SIN_COLOR ? d : d === SIN_COLOR ? a : mas(a, d);
      if (objetivo !== SIN_COLOR) indices[objetivo === a ? i : i + w + 1] = b;
    }
  }

  if (minPixeles > 1) {
    const visto = new Uint8Array(w * h);
    for (let ini = 0; ini < w * h; ini++) {
      if (visto[ini]) continue;
      const etiqueta = indices[ini];
      const zona = [ini];
      visto[ini] = 1;
      const vecinosDe = new Map();
      let toca = false;
      for (let i = 0; i < zona.length; i++) {
        const q = zona[i];
        const x = q % w, y = (q - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) toca = true;
        for (const v of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) {
          if (v < 0) continue;
          if (indices[v] === etiqueta) { if (!visto[v]) { visto[v] = 1; zona.push(v); } } else vecinosDe.set(indices[v], (vecinosDe.get(indices[v]) || 0) + 1);
        }
      }
      // El fondo que toca el borde de la imagen es el fondo de verdad: se deja.
      if (zona.length >= minPixeles || !vecinosDe.size || (etiqueta === SIN_COLOR && toca)) continue;
      let nuevo = etiqueta, mc = 0;
      for (const [v, c] of vecinosDe) if (c > mc) { mc = c; nuevo = v; }
      for (const q of zona) indices[q] = nuevo;
    }
  }
  return indices;
}

// Borra una zona tocándola: la zona de un mismo color que contiene el píxel
// (x, y) se funde con el color que más la rodea. Sirve para sacar una raya
// suelta dentro de un ala, por ejemplo. No deja borrar una zona enorme (el
// contorno entero, un color de fondo), para eso está quitar el color.
export function fundirZonaEn(indices, w, h, x, y, maxFraccion = 0.08) {
  if (x < 0 || y < 0 || x >= w || y >= h) return { indices, ok: false, motivo: 'fuera' };
  const etiqueta = indices[y * w + x];
  if (etiqueta === SIN_COLOR) return { indices, ok: false, motivo: 'fondo' };
  const inicio = y * w + x;
  const visto = new Uint8Array(w * h);
  const zona = [inicio];
  visto[inicio] = 1;
  const vecinos = new Map();
  for (let i = 0; i < zona.length; i++) {
    const q = zona[i];
    const qx = q % w, qy = (q - qx) / w;
    for (const v of [qx > 0 ? q - 1 : -1, qx < w - 1 ? q + 1 : -1, qy > 0 ? q - w : -1, qy < h - 1 ? q + w : -1]) {
      if (v < 0) continue;
      if (indices[v] === etiqueta) { if (!visto[v]) { visto[v] = 1; zona.push(v); } } else vecinos.set(indices[v], (vecinos.get(indices[v]) || 0) + 1);
    }
  }
  let usados = 0;
  for (let i = 0; i < indices.length; i++) if (indices[i] !== SIN_COLOR) usados++;
  if (zona.length > usados * maxFraccion) return { indices, ok: false, motivo: 'grande' };
  // Se prefiere un color de la imagen antes que el vacío de afuera.
  let nuevo = null, mc = 0;
  for (const [v, c] of vecinos) if (v !== SIN_COLOR && c > mc) { mc = c; nuevo = v; }
  if (nuevo === null && vecinos.has(SIN_COLOR)) nuevo = SIN_COLOR;
  if (nuevo === null) return { indices, ok: false, motivo: 'aislada' };
  const resultado = Uint8Array.from(indices);
  for (const q of zona) resultado[q] = nuevo;
  return { indices: resultado, ok: true, motivo: null };
}

// Vuelve a aplicar, en orden, las zonas borradas a mano ([x, y] de cada toque).
export function aplicarLimpiezas(indices, w, h, puntos) {
  let actual = indices;
  for (const [x, y] of puntos) actual = fundirZonaEn(actual, w, h, x, y).indices;
  return actual;
}

// ---------- Regiones ----------

// Suaviza el escalonado de los contornos (los píxeles dibujan escalones) cortando
// las esquinas de cada polígono, con un corte de a lo sumo `corteMm` por punta
// (Chaikin con corte limitado). Cada tramo de borde se corta igual venga de
// la zona de un lado o de la del otro, así dos colores vecinos siguen encajando.
export function suavizarCaminos(caminos, pasadas, corteMm) {
  if (!pasadas || !caminos.length) return caminos;
  const corteMax = corteMm * E;
  const suaves = caminos.map((camino) => {
    let pts = camino;
    for (let p = 0; p < pasadas; p++) {
      const n = pts.length;
      if (n < 3) break;
      const sig = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const dx = b.X - a.X, dy = b.Y - a.Y;
        const largo = Math.hypot(dx, dy);
        if (largo === 0) continue;
        const k = Math.min(corteMax, largo / 4) / largo;
        sig.push({ X: Math.round(a.X + dx * k), Y: Math.round(a.Y + dy * k) }, { X: Math.round(b.X - dx * k), Y: Math.round(b.Y - dy * k) });
      }
      pts = sig;
    }
    return pts;
  });
  return limpiarCaminos(suaves);
}

// Engrosa las partes de una zona que son más finas que `w` mm hasta que midan al
// menos `w` (una línea de 0,1 mm no sale con una boquilla de 0,4: el laminador
// la descarta). Los bordes de las partes anchas no se tocan. Se repite, de a
// poco, lo siguiente hasta que no quede nada fino:
//  1) La "apertura" (achicar w/2 y volver a agrandar) deja sólo lo que tiene al
//     menos w de ancho; lo que sobra son las partes finas.
//  2) Entre lo que sobra también hay rebabas en las esquinas de las partes
//     anchas: no son líneas. Las líneas de verdad son las que se alejan más de w
//     de lo ancho (o son toda la zona, como un contorno); de ahí se recupera la
//     línea entera, hasta su base.
//  3) Esas líneas crecen un paso (w/6 por lado). Las que ya llegaron a w dejan de
//     crecer, así todas terminan entre w y w + w/3 de ancho, parejas.
export function engrosarFinas(caminos, w) {
  if (!caminos.length || !(w > 0)) return caminos;
  const paso = w / 6;
  let resultado = caminos;
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const ancha = desplazarCaminos(desplazarCaminos(resultado, -w / 2), w / 2);
    const finas = restarCaminos(resultado, ancha);
    if (!finas.length) break;
    const lejos = ancha.length ? restarCaminos(finas, desplazarCaminos(ancha, w)) : finas;
    if (!lejos.length) break;
    const lineas = ancha.length ? interseccionCaminos(finas, desplazarCaminos(lejos, w)) : finas;
    resultado = limpiarCaminos(unirCaminos(resultado, desplazarCaminos(lineas, paso)));
  }
  return resultado;
}

// Deja las zonas de cada color sin superponerse ni dejar rendijas: cada una crece
// 0,05 mm (así se tocan) y se recorta a la silueta; después, de la más chica a
// la más grande, cada zona cede lo que ya ocupó una anterior. Las chicas
// (contornos, detalles) ganan sobre las grandes (los fondos).
function zonasSinSolape(zonas, silueta) {
  const orden = zonas.map((_, i) => i).filter((i) => zonas[i].length)
    // Área neta (los huecos restan): un marco fino es chico aunque su contorno exterior sea grande.
    .map((i) => ({ i, area: zonas[i].reduce((suma, c) => suma + areaCamino(c), 0) }))
    .sort((a, b) => a.area - b.area);
  const resultado = zonas.map(() => []);
  let ocupado = [];
  for (const { i } of orden) {
    const crecida = interseccionCaminos(desplazarCaminos(zonas[i], 0.05), silueta);
    const zona = ocupado.length ? restarCaminos(crecida, ocupado) : crecida;
    resultado[i] = limpiarCaminos(zona);
    ocupado = unirCaminos(ocupado, zona);
  }
  return resultado;
}

// Quita los huecos de menos de `areaMinMm2` (rendijas que deja el suavizado
// entre dos zonas que se tocan).
function quitarHuecosChicos(caminos, areaMinMm2) {
  return caminos.filter((c) => !(esHueco(c) && Math.abs(areaCamino(c)) < areaMinMm2 * E * E));
}


// Zonas de cada color como polígonos de Clipper, en mm (Y hacia arriba). Cada
// fila de píxeles del mismo color es un rectángulo; se unen todos.
export function regionesPorColor(indices, w, h, nColores, mmPorPixel, omitir = new Set(), origen = [0, 0]) {
  const px = (v) => Math.round(v * mmPorPixel * E);
  const rectangulos = Array.from({ length: nColores }, () => []);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = indices[y * w + x];
      let x2 = x + 1;
      while (x2 < w && indices[y * w + x2] === c) x2++;
      if (c !== SIN_COLOR && c < nColores && !omitir.has(c)) {
        const X0 = px(x - origen[0]), X1 = px(x2 - origen[0]);
        const Y0 = px(h - (y + 1) - origen[1]), Y1 = px(h - y - origen[1]);
        rectangulos[c].push([{ X: X0, Y: Y0 }, { X: X1, Y: Y0 }, { X: X1, Y: Y1 }, { X: X0, Y: Y1 }]);
      }
      x = x2;
    }
  }
  return rectangulos.map((r) => (r.length ? limpiarCaminos(unirCaminos(r, [])) : []));
}

// ---------- Llavero ----------

// Busca dónde pegar la argolla: viene desde afuera del lado elegido hasta pisar
// la base lo suficiente como para quedar bien unida.
function ubicarArgolla(base, caja, radio, lado) {
  const areaDisco = Math.PI * radio * radio * E * E;
  const paso = 0.5;
  const cx0 = (caja.x0 + caja.x1) / 2, cy0 = (caja.y0 + caja.y1) / 2;
  let cx = cx0, cy = cy0, dx = 0, dy = 0;
  if (lado === 'derecha') { cx = caja.x1 + radio; dx = -paso; }
  else if (lado === 'arriba') { cy = caja.y1 + radio; dy = -paso; }
  else { cx = caja.x0 - radio; dx = paso; }
  const limite = Math.max(caja.x1 - caja.x0, caja.y1 - caja.y0) + radio * 2 + 2;
  for (let i = 0; i * paso < limite; i++) {
    if (areaInterseccion([discoCamino(cx, cy, radio)], base) >= areaDisco * 0.3) return { cx, cy };
    cx += dx; cy += dy;
  }
  return { cx: cx0, cy: cy0 };
}

// Píxel de la imagen que corresponde a un punto (X, Y) del modelo armado, en mm,
// para poder tocar el modelo 3D y editar la imagen. `mapa` sale de armarLlaveroImagen.
export function pixelDeModelo(mapa, X, Y) {
  const Xo = X + mapa.cajaX, Yo = Y + mapa.cajaY;
  return { x: Math.floor(Xo / mapa.mm + mapa.x0), y: Math.ceil(mapa.y1 + 1 - Yo / mapa.mm) - 1 };
}

// Arma el llavero. `entrada` = { indices, w, h, paleta }. `opciones`:
// colores (hex por color, para cambiar el de impresión) y excluidos (colores que
// no se imprimen). Devuelve { cuerpos, ancho, alto, avisos } con un cuerpo por
// color más el borde (o la base).
export function armarLlaveroImagen(entrada, p, { colores = [], excluidos = [] } = {}) {
  const { indices, w, h, paleta } = entrada;
  const omitir = new Set(excluidos);
  const vacio = { cuerpos: [], ancho: 0, alto: 0, avisos: [] };

  // Se recorta a lo que se imprime, así el ancho pedido es el del dibujo.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = indices[y * w + x];
    if (c === SIN_COLOR || omitir.has(c)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { ...vacio, avisos: ['No quedó ningún color para imprimir.'] };
  const mm = p.anchoMm / (x1 - x0 + 1);
  const crudas = regionesPorColor(indices, w, h, paleta.length, mm, omitir, [x0, h - 1 - y1]);

  // Suavizado del escalonado y ancho mínimo de las líneas: cada color se suaviza y
  // se engrosa en lo fino; la silueta es la unión de todos, y cada color se recorta
  // a ella para que no sobresalga ni se superponga con otro.
  const pasadasBordes = p.suavizadoBordes || 0;
  const anchoMinimo = p.anchoMinimo || 0;
  let silueta, regiones;
  if (pasadasBordes || anchoMinimo > 0) {
    // Primero se engrosa lo fino y después se suaviza: el suavizado corta esquinas y
    // una línea de 1 píxel (0,1 mm) desaparecería; una de 0,4 mm o más lo aguanta.
    const suaves = crudas.map((r) => {
      if (!r.length) return [];
      return suavizarCaminos(anchoMinimo > 0 ? engrosarFinas(r, anchoMinimo) : r, pasadasBordes, mm * 0.6);
    });
    silueta = quitarHuecosChicos(limpiarCaminos(unirCaminos(suaves.flat(), [])), 0.05);
    regiones = zonasSinSolape(suaves, silueta);
  } else {
    silueta = limpiarCaminos(unirCaminos(crudas.flat(), []));
    regiones = crudas;
  }
  const base0 = p.margen > 0 ? limpiarCaminos(desplazarCaminos(silueta, p.margen)) : silueta;
  const cajaBase = cajaDeCaminos(base0);

  const rAgujero = p.agujero / 2;
  const rAnillo = rAgujero + 1.6;
  const { cx, cy } = ubicarArgolla(base0, cajaBase, rAnillo, p.argolla);
  const hueco = [discoCamino(cx, cy, rAgujero, 48)];
  const conAnillo = limpiarCaminos(unirCaminos(base0, [discoCamino(cx, cy, rAnillo)]));
  const baseFinal = restarCaminos(conAnillo, hueco);
  const caja = cajaDeCaminos(conAnillo);
  const mover = (m) => moverMalla(m, -caja.x0, -caja.y0, 0);

  const avisos = [];
  if (areaInterseccion(hueco, silueta) > 0) avisos.push('El agujero de la argolla tapa un poco de la imagen: subí el margen o cambiá la posición.');

  const cuerpos = [];
  const colorDe = (c) => colores[c] || colorAHex(paleta[c]);
  // Un cuerpo (una pieza de un color) puede tener varias capas a distinta altura.
  const sumar = (id, nombre, color, capas) => {
    const mallas = [];
    for (const { caminos, z0, z1 } of capas) {
      if (!caminos.length || z1 - z0 <= 0) continue;
      // Se limpian los puntos casi repetidos que dejan las restas de polígonos.
      const malla = extruir(caminosAFormas(limpiarCaminos(caminos)), z0, z1);
      if (malla.tri.length) mallas.push(malla);
    }
    if (mallas.length) cuerpos.push({ id, nombre, color, malla: mover(mallas.length === 1 ? mallas[0] : unirMallas(mallas)) });
  };
  const relieve = p.modo === 'relieve';
  const ambas = p.caras !== 'una';
  const T = p.grosor;
  // Capa de color en el plano de una sola cara: nunca más gruesa que la placa menos una base.
  const capa = Math.min(p.capaColor || 0.8, T - 0.4);
  // Relieve en las dos caras: la base sube para dejar lugar al relieve de abajo.
  const subida = relieve && ambas ? p.relieve : 0;
  if (relieve) sumar('base', 'Base', p.colorBorde, [{ caminos: baseFinal, z0: subida, z1: subida + T }]);
  else if (ambas) sumar('borde', 'Borde', p.colorBorde, [{ caminos: restarCaminos(baseFinal, silueta), z0: 0, z1: T }]);
  else sumar('base', 'Base', p.colorBorde, [{ caminos: baseFinal, z0: 0, z1: T - capa }, { caminos: restarCaminos(baseFinal, silueta), z0: T - capa, z1: T }]);
  regiones.forEach((region, c) => {
    if (!region.length || omitir.has(c)) return;
    const sinHueco = restarCaminos(region, hueco);
    let capas;
    if (relieve) {
      capas = [{ caminos: sinHueco, z0: subida + T, z1: subida + T + p.relieve }];
      if (ambas) capas.push({ caminos: sinHueco, z0: 0, z1: p.relieve });
    } else capas = [{ caminos: sinHueco, z0: ambas ? 0 : T - capa, z1: T }];
    sumar(`color-${c}`, `Color ${c + 1}`, colorDe(c), capas);
  });
  // Con esto se pasa un punto del modelo (mm) al píxel de la imagen (ver pixelDeModelo).
  const mapa = { mm, x0, y1, cajaX: caja.x0, cajaY: caja.y0 };
  return { cuerpos, ancho: caja.x1 - caja.x0, alto: caja.y1 - caja.y0, avisos, mapa };
}
