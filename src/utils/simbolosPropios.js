// Símbolos propios del emblema (Fase 3 del plan en docs/plan-generador-jarros.md): el editor con simetrías y la
// biblioteca de la cuenta. Sin navegador: se prueba en Node.
//
// Un símbolo es una lista de contornos { fuera: [[x, y]…], huecos: [[[x, y]…]…] } con Y hacia arriba, centrado en (0, 0)
// y con el lado mayor igual a 1 (el mismo formato que `contornosDeSvg`). En la biblioteca se guarda como texto JSON (Firestore
// no admite listas dentro de listas).

export const MAX_SIMBOLOS = 50; // por cuenta
export const MAX_PUNTOS_SIMBOLO = 3000;
export const MAX_BYTES_SIMBOLO = 150000;
export const MAX_PUNTOS_EDITOR = 40;

export const SIMETRIAS = [
  { id: 'ninguna', nombre: 'Sin simetría' },
  { id: 'espejo', nombre: 'Espejo (izquierda y derecha)' },
  { id: 'radial', nombre: 'Giratoria' },
  { id: 'radialEspejo', nombre: 'Giratoria con espejo' }
];

const girar = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
// Reflejo respecto de la recta que sale del origen con el ángulo `a`.
const reflejar = ([x, y], a) => {
  const c = Math.cos(2 * a), s = Math.sin(2 * a);
  return [x * c + y * s, x * s - y * c];
};

// Cantidad de repeticiones válidas para las simetrías giratorias.
export const limitarRepeticiones = (n) => Math.min(16, Math.max(2, Math.round(Number(n) || 2)));

// Polígono completo que sale de los puntos dibujados (`puntos`, en el plano del editor con Y hacia arriba) y la simetría:
//  - espejo: lo dibujado es el lado derecho, de arriba hacia abajo; el primero y el último punto se pegan al eje y el
//    lado izquierdo es el reflejo.
//  - radial: lo dibujado es una "porción" de 360/n grados (de 0° a esa porción, en sentido antihorario) que se repite n veces.
//  - radialEspejo: lo dibujado es media porción (de 0° a 180/n°); se refleja contra el borde y se repite n veces.
export function aplicarSimetria(puntos, modo = 'ninguna', n = 6) {
  const pts = (puntos || []).map(([x, y]) => [Number(x) || 0, Number(y) || 0]);
  if (modo === 'espejo') {
    if (pts.length < 2) return [];
    const lado = pts.map(([x, y], i) => (i === 0 || i === pts.length - 1 ? [0, y] : [Math.max(0, x), y]));
    const izquierda = [...lado].reverse().slice(1, -1).map(([x, y]) => [-x, y]);
    return [...lado, ...izquierda];
  }
  if (modo === 'radial' || modo === 'radialEspejo') {
    const k = limitarRepeticiones(n);
    if (pts.length < 2) return [];
    const paso = (2 * Math.PI) / k;
    let porcion = pts;
    if (modo === 'radialEspejo') {
      const eje = paso / 2;
      porcion = [...pts, ...[...pts].reverse().map((q) => reflejar(q, eje))];
    }
    const salida = [];
    for (let i = 0; i < k; i++) for (const q of porcion) salida.push(girar(q, paso * i));
    return salida;
  }
  return pts.length >= 3 ? pts : [];
}

// Suaviza un polígono cerrado cortando las esquinas (Chaikin): cada vuelta duplica los puntos.
export function suavizar(poligono, vueltas = 0) {
  let p = poligono;
  for (let v = 0; v < Math.min(3, vueltas); v++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    p = q;
  }
  return p;
}

// Centra el polígono en su caja y lo escala para que el lado mayor mida 1. Devuelve null si no tiene tamaño.
export function normalizarPoligonos(poligonos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poli of poligonos) for (const [x, y] of poli) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const lado = Math.max(x1 - x0, y1 - y0);
  if (!(lado > 1e-9) || !Number.isFinite(lado)) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return poligonos.map((poli) => poli.map(([x, y]) => [(x - cx) / lado, (y - cy) / lado]));
}

// Contornos del símbolo dibujado en el editor, listos para usar y guardar (null si todavía no es una forma).
export function contornosDeDibujo(puntos, modo, n, vueltasSuavizado = 0) {
  const poli = suavizar(aplicarSimetria(puntos, modo, n), vueltasSuavizado);
  if (poli.length < 3) return null;
  const norm = normalizarPoligonos([poli]);
  if (!norm) return null;
  return simplificarContornos([{ fuera: norm[0], huecos: [] }]);
}

const redondear = (v) => Math.round(v * 10000) / 10000;

// Douglas-Peucker para un polígono cerrado.
function reducir(poli, tolerancia) {
  if (poli.length <= 4) return poli;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const simple = (pts) => {
    if (pts.length < 3) return pts;
    let m = 0, k = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = dist(pts[i], pts[0], pts[pts.length - 1]); if (d > m) { m = d; k = i; } }
    if (m <= tolerancia) return [pts[0], pts[pts.length - 1]];
    return [...simple(pts.slice(0, k + 1)).slice(0, -1), ...simple(pts.slice(k))];
  };
  // Se parte el contorno en el punto más lejano del primero para tratarlo como dos tramos abiertos.
  let lejos = 0, md = -1;
  poli.forEach((q, i) => { const d = Math.hypot(q[0] - poli[0][0], q[1] - poli[0][1]); if (d > md) { md = d; lejos = i; } });
  const a = simple(poli.slice(0, lejos + 1));
  const b = simple([...poli.slice(lejos), poli[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const puntosDe = (contornos) => contornos.reduce((a, c) => a + c.fuera.length + c.huecos.reduce((b, h) => b + h.length, 0), 0);

// Redondea a 4 decimales y, si hay más de MAX_PUNTOS_SIMBOLO puntos, simplifica de a poco hasta que entre.
export function simplificarContornos(contornos, maximo = MAX_PUNTOS_SIMBOLO) {
  let actual = contornos.map((c) => ({ fuera: c.fuera.map(([x, y]) => [redondear(x), redondear(y)]), huecos: c.huecos.map((h) => h.map(([x, y]) => [redondear(x), redondear(y)])) }));
  let tol = 0.0005;
  while (puntosDe(actual) > maximo && tol < 0.05) {
    actual = actual.map((c) => ({ fuera: reducir(c.fuera, tol), huecos: c.huecos.map((h) => reducir(h, tol)).filter((h) => h.length >= 3) }));
    tol *= 1.6;
  }
  return actual;
}

const esPunto = (q) => Array.isArray(q) && q.length === 2 && q.every((v) => Number.isFinite(v));
const esCamino = (p) => Array.isArray(p) && p.length >= 3 && p.every(esPunto);

// Texto JSON de un símbolo ↔ contornos. Al leer se valida todo (viene de la base o de los parámetros).
export const contornosAJson = (contornos) => JSON.stringify(contornos);
export function contornosDeJson(texto) {
  if (typeof texto !== 'string' || !texto || texto.length > MAX_BYTES_SIMBOLO) throw new Error('El símbolo guardado no se puede leer.');
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new Error('El símbolo guardado no se puede leer.'); }
  if (!Array.isArray(datos) || !datos.length) throw new Error('El símbolo guardado no se puede leer.');
  const limpio = datos.map((c) => ({ fuera: c?.fuera, huecos: Array.isArray(c?.huecos) ? c.huecos : [] }));
  if (!limpio.every((c) => esCamino(c.fuera) && c.huecos.every(esCamino))) throw new Error('El símbolo guardado no se puede leer.');
  if (puntosDe(limpio) > MAX_PUNTOS_SIMBOLO * 2) throw new Error('El símbolo guardado tiene demasiados puntos.');
  return limpio;
}

// Nombre de un símbolo de la biblioteca: sin espacios de más y hasta 40 letras.
export const limpiarNombreSimbolo = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
