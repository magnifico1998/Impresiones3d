// Texturas del cuerpo del jarro (Fase 4 del plan en docs/plan-generador-jarros.md): relieve REAL en la pared exterior, con
// los mapas de alturas de la herramienta de superficies o con DUELAS de madera como geometría propia (cantidad, separación,
// irregularidad y veta). Sin navegador: se prueba en Node.
//
// El relieve sólo HUNDE la pared hacia adentro respecto de la silueta: lo más alto de la textura toca la silueta de siempre.
// Así el cartel, los emblemas, los aros y el asa (que se apoyan en esa silueta) siguen calzando. La profundidad se limita
// para dejar al menos 1,4 mm de pared. La pared exterior se arma como una grilla (ángulo × altura) cuya finura sale de la
// calidad: la VISTA es liviana (grilla gruesa) y el modelo FINAL, que es el que se exporta, tiene el detalle completo, con un tope de
// triángulos para que el laminador no se trabe.
import { revolucionRelieve } from './mallasJarro';
import { TEXTURAS, CATEGORIAS_TEXTURA, generarTextura, muestrear, resolucionSugerida } from './texturasSuperficie';

export const TEXTURA_NINGUNA = 'ninguna';
export const TEXTURA_DUELAS = 'duelas';
export { TEXTURAS, CATEGORIAS_TEXTURA };

export const MIN_PARED_TEXTURA = 1.4; // mm de pared que no se tocan
export const MAX_TRIANGULOS_FINAL = 600000;
export const MAX_TRIANGULOS_VISTA = 150000;
const MUESTRAS_MIN_ALTURA = 48;

export const esTextura = (id) => id === TEXTURA_DUELAS || TEXTURAS.some((t) => t.id === id);

// Cuánto se puede hundir la pared como máximo (mm).
export const profundidadMaxima = (s) => Math.max(0, s.pared - MIN_PARED_TEXTURA);

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DOS_PI = 2 * Math.PI;

// Números al azar repetibles (mulberry32).
function azar(semilla) {
  let a = (Number(semilla) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Función de relieve de las duelas: (ángulo, z) → mm hacia adentro. `Rm` es el radio medio (para pasar de ángulo a mm).
function relieveDuelas(s, Rm, tope) {
  const n = Math.round(s.duelasCantidad);
  const rnd = azar(s.duelasSemilla);
  const irr = s.duelasIrregularidad;
  const paso = DOS_PI / n;
  // Fronteras entre duelas, algo corridas con la irregularidad (nunca más de un tercio del ancho).
  const frontera = Array.from({ length: n }, (_, i) => paso * i + irr * 0.3 * paso * (rnd() * 2 - 1));
  const hundida = Array.from({ length: n }, () => rnd() * irr); // cada duela algo más hundida que la silueta
  const fase = Array.from({ length: n }, () => rnd() * 20);
  const fase2 = Array.from({ length: n }, () => rnd() * 20);
  const w = s.duelasSeparacion;
  const e = Math.min(0.3, w / 3); // borde redondeado de la ranura
  const P = s.duelasProfundidad;
  const veta = s.duelasVeta * 0.4; // mm de profundidad máxima de las vetas
  return (a, z) => {
    let t = a % DOS_PI;
    if (t < 0) t += DOS_PI;
    let k = n - 1;
    for (let i = 0; i < n; i++) { if (frontera[i] <= t) k = i; else break; }
    const ini = frontera[k];
    const fin = k === n - 1 ? frontera[0] + DOS_PI : frontera[k + 1];
    const sA = (t >= ini ? t - ini : t + DOS_PI - ini) * Rm; // mm desde el comienzo de la duela
    const sB = (fin - (t >= ini ? t : t + DOS_PI)) * Rm;
    const ranura = 1 - suave(w / 2 - e, w / 2 + e, Math.min(sA, sB));
    let d = P * ranura + (1 - ranura) * hundida[k] * P * 0.4;
    if (veta > 0) {
      const lineas = 0.5 + 0.5 * Math.sin(sA * 2.3 + fase[k] + 1.7 * Math.sin(z * 0.045 + fase2[k]) + 0.8 * Math.sin(sA * 0.7 + z * 0.02));
      d += (1 - ranura) * veta * lineas;
    }
    return Math.min(tope, d);
  };
}

// Función de relieve de una textura del catálogo: se repite un número entero de veces alrededor para que cierre sin costura.
function relieveCatalogo(s, Rm, tope) {
  const tex = generarTextura(s.textura);
  const tam = s.texturaTamano;
  const repeticiones = Math.max(1, Math.round((DOS_PI * Rm) / tam));
  const P = Math.min(s.texturaProfundidad, tope);
  return (a, z) => {
    let h = muestrear(tex, (a / DOS_PI) * repeticiones, z / tam);
    if (s.texturaInvertir) h = 1 - h;
    return (1 - h) * P;
  };
}

// Qué tan fina es la grilla: mm entre puntos en ángulo (arco) y en altura.
function pasosGrilla(s, calidad) {
  const duelas = s.textura === TEXTURA_DUELAS;
  let base;
  if (s.texturaResolucion > 0) base = Math.max(0.3, s.texturaResolucion);
  else if (duelas) base = Math.max(0.3, Math.min(0.5, s.duelasSeparacion / 3));
  else base = Math.min(2, Math.max(0.35, resolucionSugerida(TEXTURAS.find((t) => t.id === s.textura), s.texturaTamano)));
  const k = calidad === 'final' ? 1 : 2.2;
  const pasoA = base * k;
  // Las duelas son rectas hacia arriba: en altura alcanza con pocos puntos (la silueta ya pide al menos 48).
  const pasoZ = duelas ? Math.max(4, base * k * 4) : base * k;
  return { pasoA, pasoZ };
}

// Cantidad de puntos de la grilla y triángulos que salen, ajustados al tope de la calidad. { na, nz, triangulos, bajada }
export function grillaTextura(s, R, H, calidad = 'final') {
  const Rmax = Math.max(...Array.from({ length: 25 }, (_, k) => R((H * k) / 24)));
  const { pasoA, pasoZ } = pasosGrilla(s, calidad);
  const tope = calidad === 'final' ? MAX_TRIANGULOS_FINAL : MAX_TRIANGULOS_VISTA;
  const cuenta = (f) => {
    const na = Math.min(1200, Math.max(96, Math.ceil((DOS_PI * Rmax) / (pasoA * f))));
    const nz = Math.min(800, Math.max(MUESTRAS_MIN_ALTURA, Math.ceil(H / (pasoZ * f))));
    return { na, nz, triangulos: 2 * na * nz };
  };
  let f = 1;
  let g = cuenta(f);
  while (g.triangulos > tope && f < 20) { f *= 1.12; g = cuenta(f); }
  return { ...g, bajada: f > 1 };
}

// Estimación (sin armar nada) de los triángulos del cuerpo con textura, para mostrarla en la pantalla.
export function estimarTriangulosTextura(s, R, H, calidad = 'final') {
  if (!s.textura || s.textura === TEXTURA_NINGUNA) return 0;
  return grillaTextura(s, R, H, calidad).triangulos;
}

const ultimos = {}; // por calidad: { clave, resultado }. Armar la grilla es lo más pesado y no cambia al tocar el asa o el cartel

// Cuerpo del jarro con la pared exterior texturada. Devuelve { malla, triangulos, avisos } o null sin textura.
export function armarCuerpoTexturado(s, R, Ri, H, calidad = 'final') {
  if (!s.textura || s.textura === TEXTURA_NINGUNA || !esTextura(s.textura)) return null;
  const clave = JSON.stringify([
    calidad, s.textura, s.texturaTamano, s.texturaProfundidad, s.texturaInvertir, s.texturaBorde, s.texturaResolucion,
    s.duelasCantidad, s.duelasSeparacion, s.duelasProfundidad, s.duelasIrregularidad, s.duelasVeta, s.duelasSemilla,
    s.formaPuntos, s.diametroHueco, s.pared, s.fondo, s.altoHueco, s.aberturaFondo
  ]);
  if (ultimos[calidad]?.clave === clave) return ultimos[calidad].resultado;

  const avisos = [];
  const tope = profundidadMaxima(s);
  const pedida = s.textura === TEXTURA_DUELAS ? s.duelasProfundidad + s.duelasVeta * 0.4 : s.texturaProfundidad;
  if (pedida > tope + 1e-6) avisos.push(`La textura se limitó a ${(Math.round(tope * 10) / 10).toLocaleString('es-AR')} mm de profundidad para dejar ${MIN_PARED_TEXTURA} mm de pared: engrosá la pared si querés más relieve.`);
  const Rm = R(H / 2);
  const relieve = s.textura === TEXTURA_DUELAS ? relieveDuelas(s, Rm, tope) : relieveCatalogo(s, Rm, tope);
  // Cerca del borde de arriba y del fondo el relieve se va apagando (el borde queda liso y limpio).
  const b = s.texturaBorde;
  const hundir = (a, z) => {
    const f = b > 0 ? Math.min(suave(0, b, z), suave(0, b, H - z)) : 1;
    return f > 0 ? Math.min(tope, relieve(a, z)) * f : 0;
  };
  const g = grillaTextura(s, R, H, calidad);
  if (g.bajada && calidad === 'final') avisos.push('La textura tiene tanto detalle que se bajó un poco la resolución para que el archivo no pese demasiado.');
  const rAb = s.aberturaFondo / 2;
  const exterior = [];
  for (let k = 0; k <= g.nz; k++) { const z = (H * k) / g.nz; exterior.push([R(z), z, true]); }
  const malla = revolucionRelieve([[rAb, 0, false], ...exterior, [Ri, H, false], [Ri, s.fondo, false], [rAb, s.fondo, false]], g.na, hundir);
  const resultado = { malla, triangulos: malla.tri.length / 3, avisos };
  ultimos[calidad] = { clave, resultado };
  return resultado;
}
