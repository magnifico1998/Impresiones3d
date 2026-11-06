// Mallas básicas del generador de jarros: sólidos de revolución y cajas. Con los triángulos hacia afuera. Sin navegador.
import { volumenMalla } from './mallas3d';

const SEGMENTOS = 96;

export function invertir(malla) {
  const tri = new Uint32Array(malla.tri.length);
  for (let i = 0; i < tri.length; i += 3) { tri[i] = malla.tri[i]; tri[i + 1] = malla.tri[i + 2]; tri[i + 2] = malla.tri[i + 1]; }
  return { pos: malla.pos, tri };
}

// Sólido de revolución alrededor de Z. `perfil`: puntos [radio, z] de una sección cerrada (los que están en el eje,
// radio 0, se usan una sola vez). Sale con los triángulos hacia afuera.
export function revolucion(perfil, segmentos = SEGMENTOS) {
  const n = perfil.length;
  const enEje = perfil.map(([r]) => Math.abs(r) < 1e-9);
  const pos = [];
  const base = [];
  for (let i = 0; i < n; i++) {
    base.push(pos.length / 3);
    const [r, z] = perfil[i];
    if (enEje[i]) pos.push(0, 0, z);
    else for (let j = 0; j < segmentos; j++) { const a = (2 * Math.PI * j) / segmentos; pos.push(r * Math.cos(a), r * Math.sin(a), z); }
  }
  const v = (i, j) => base[i] + (enEje[i] ? 0 : j % segmentos);
  const tri = [];
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n;
    if (enEje[a] && enEje[b]) continue;
    for (let j = 0; j < segmentos; j++) {
      const cuadro = [v(a, j), v(b, j), v(b, j + 1), v(a, j + 1)].filter((x, k, arr) => x !== arr[(k + 1) % 4]);
      if (cuadro.length === 3) tri.push(...cuadro);
      else if (cuadro.length === 4) tri.push(cuadro[0], cuadro[1], cuadro[2], cuadro[0], cuadro[2], cuadro[3]);
    }
  }
  const malla = { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
  return volumenMalla(malla) < 0 ? invertir(malla) : malla;
}

// Caja alineada con los ejes.
export function caja3d(x0, x1, y0, y1, z0, z1) {
  const pos = Float32Array.from([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const tri = Uint32Array.from([0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { pos, tri };
}

// Saca los triángulos que sobran después de una booleana: los de área casi cero, los repetidos y las parejas
// enfrentadas (la misma cara recorrida en sentidos opuestos, que es una cara interna).
export function limpiarTriangulos(malla, areaMinima = 1e-7) {
  const { pos, tri } = malla;
  const area2 = (a, b, c) => {
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };
  const vistos = new Map(); // vértices ordenados → { orientaciones: Set, índice del primero }
  const lista = [];
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    if (a === b || b === c || a === c || area2(a, b, c) < areaMinima) continue;
    const clave = [a, b, c].sort((x, y) => x - y).join(',');
    // Orientación: 0 si (a,b,c) es una rotación de la versión ordenada, 1 si es la opuesta.
    const orden = [a, b, c];
    const menor = orden.indexOf(Math.min(a, b, c));
    const rot = [orden[menor], orden[(menor + 1) % 3], orden[(menor + 2) % 3]];
    const sentido = rot[1] < rot[2] ? 0 : 1;
    const previo = vistos.get(clave);
    if (!previo) { vistos.set(clave, { sentidos: [sentido], pos: lista.length }); lista.push([a, b, c]); continue; }
    if (previo.sentidos.includes(sentido)) continue; // repetido
    // Pareja enfrentada: se van las dos.
    lista[previo.pos] = null;
    previo.sentidos.push(sentido);
  }
  const nuevo = [];
  for (const q of lista) if (q) nuevo.push(q[0], q[1], q[2]);
  return { pos, tri: Uint32Array.from(nuevo) };
}

// Como `revolucion`, pero la pared exterior puede llevar relieve: los puntos del perfil marcados (tercer valor en true) se
// meten hacia el eje según `hundir(angulo, z)` (mm, 0 o más). Todos los anillos usan los mismos `segmentos`, así que conviene
// que sean muchos sólo cuando el relieve lo pide. Sale con los triángulos hacia afuera.
export function revolucionRelieve(perfil, segmentos, hundir) {
  const n = perfil.length;
  const enEje = perfil.map(([r]) => Math.abs(r) < 1e-9);
  const pos = [];
  const base = [];
  for (let i = 0; i < n; i++) {
    base.push(pos.length / 3);
    const [r, z, relieve] = perfil[i];
    if (enEje[i]) { pos.push(0, 0, z); continue; }
    for (let j = 0; j < segmentos; j++) {
      const a = (2 * Math.PI * j) / segmentos;
      const rr = relieve ? Math.max(0.05, r - hundir(a, z)) : r;
      pos.push(rr * Math.cos(a), rr * Math.sin(a), z);
    }
  }
  const v = (i, j) => base[i] + (enEje[i] ? 0 : j % segmentos);
  const tri = [];
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n;
    if (enEje[a] && enEje[b]) continue;
    for (let j = 0; j < segmentos; j++) {
      const cuadro = [v(a, j), v(b, j), v(b, j + 1), v(a, j + 1)].filter((x, k, arr) => x !== arr[(k + 1) % 4]);
      if (cuadro.length === 3) tri.push(...cuadro);
      else if (cuadro.length === 4) tri.push(cuadro[0], cuadro[1], cuadro[2], cuadro[0], cuadro[2], cuadro[3]);
    }
  }
  const malla = { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
  return volumenMalla(malla) < 0 ? invertir(malla) : malla;
}
