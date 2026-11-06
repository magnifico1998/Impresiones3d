// Vista previa de impresión del jarro (Fase 6 del plan en docs/plan-generador-jarros.md): cuánto material por color, cuánto
// tarda y cuánto cuesta, con los mismos valores y fórmulas de costos que la Calculadora de Manager3D. Es una ESTIMACIÓN a partir
// del volumen de las piezas (no se lamina nada): sirve para tener un número orientativo antes de imprimir y para cargar el
// producto en la Biblioteca. Sin navegador: se prueba en Node.
import { cajaMalla, volumenMalla } from './mallas3d';

export const AJUSTES_IMPRESION = {
  relleno: 15, // % de relleno interno
  paredes: 3, // perímetros
  capasSolidas: 4, // capas de arriba y de abajo
  alturaCapa: 0.2, // mm
  flujo: 12, // mm³/s de plástico depositado, en promedio (con las aceleraciones y los movimientos en vacío)
  cambioColorMin: 0.5, // minutos por cada cambio de filamento
  densidad: 1.24 // g/cm³ (PLA)
};
export const DIAMETRO_BOQUILLA = 0.42; // mm de ancho de cada perímetro

// Área de la superficie de una malla (mm²).
export function areaMalla({ pos, tri }) {
  let a = 0;
  for (let i = 0; i < tri.length; i += 3) {
    const p = tri[i] * 3, q = tri[i + 1] * 3, r = tri[i + 2] * 3;
    const ux = pos[q] - pos[p], uy = pos[q + 1] - pos[p + 1], uz = pos[q + 2] - pos[p + 2];
    const vx = pos[r] - pos[p], vy = pos[r + 1] - pos[p + 1], vz = pos[r + 2] - pos[p + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}

// Material (mm³) que gasta una parte maciza de volumen V y superficie A: la cáscara (perímetros y tapas) más el relleno.
export function materialDeParte(V, A, a) {
  const grosorCascara = a.paredes * DIAMETRO_BOQUILLA + 0.25 * a.capasSolidas * a.alturaCapa;
  const cascara = Math.min(V, A * grosorCascara);
  return cascara + (V - cascara) * (a.relleno / 100);
}

// Estima la impresión de las piezas del jarro. Cada pieza imprime sus partes (colores); `mallaImpresion` es la malla apoyada
// como se imprime. Devuelve { colores: [{ color, volumenMm3, gramos }], gramos, horas, cambios } con los colores en orden de aparición.
export function estimarImpresion(piezas, ajustes = {}) {
  const a = { ...AJUSTES_IMPRESION, ...ajustes };
  const porColor = new Map();
  let cambios = 0;
  let volumenTotal = 0;
  for (const pieza of piezas) {
    const partes = pieza.partes || [{ color: pieza.color, mallaImpresion: pieza.mallaImpresion }];
    partes.forEach((parte, i) => {
      const m = parte.mallaImpresion;
      if (!m || !m.tri.length) return;
      const V = Math.max(0, volumenMalla(m));
      const mat = materialDeParte(V, areaMalla(m), a);
      const color = String(parte.color || '#cccccc').toUpperCase();
      porColor.set(color, (porColor.get(color) || 0) + mat);
      volumenTotal += mat;
      // Las partes de color de una misma pieza se imprimen juntas: cada parte que no es la primera obliga a cambiar de
      // filamento en las capas que ocupa, y a volver.
      if (i > 0) {
        const c = cajaMalla(m);
        cambios += 2 * Math.max(1, Math.round((c.max[2] - c.min[2]) / a.alturaCapa));
      }
    });
  }
  const colores = [...porColor.entries()].map(([color, v]) => ({ color, volumenMm3: v, gramos: (v / 1000) * a.densidad }));
  const gramos = colores.reduce((s, c) => s + c.gramos, 0);
  const horas = volumenTotal / a.flujo / 3600 + (cambios * a.cambioColorMin) / 60;
  return { colores, gramos, horas, cambios };
}

// Costo de lo estimado, con la misma fórmula de la Calculadora (CalculadoraPage): filamento con desperdicio, electricidad,
// mantenimiento de la impresora, mano de obra y extras; el precio sugerido le suma el margen a todo (como con "aplica margen"
// tildado en todos los rubros). `v`: { precioKg, nombreFilamento, desperdicio, watts, kwh, mantHora, moHora, horasTrabajo, margen, extras }.
export function costearImpresion(est, v) {
  const dsp = Number(v.desperdicio) || 0;
  const precioKg = Number(v.precioKg) || 0;
  const filDetalle = est.colores.map((c) => ({
    label: `${v.nombreFilamento || 'Filamento'} (${(Math.round(c.gramos * 10) / 10).toLocaleString('es-AR')}g)`,
    costo: ((c.gramos * (1 + dsp / 100)) / 1000) * precioKg,
    color: c.color
  }));
  const costeFil = filDetalle.reduce((s, x) => s + x.costo, 0);
  const costeElec = ((Number(v.watts) || 0) / 1000) * est.horas * (Number(v.kwh) || 0);
  const costeMant = (Number(v.mantHora) || 0) * est.horas;
  const costeMO = (Number(v.moHora) || 0) * (Number(v.horasTrabajo) || 0);
  const extras = Number(v.extras) || 0;
  const total = costeFil + costeElec + costeMant + costeMO + extras;
  const margen = Number(v.margen) || 0;
  return { filDetalle, costeFil, costeElec, costeMant, costeMO, extras, total, margen, precio: Math.round(total * (1 + margen / 100)) };
}

// El "presupuesto" que espera el modal Guardar en la Biblioteca (el mismo formato que arma la Calculadora).
export function presupuestoParaBiblioteca({ nombre, est, costos, v, impresoraNombre, archivos = [], foto = null }) {
  const multi = est.colores.length > 1;
  return {
    nombreArchivo: `${nombre}.3mf`,
    gcodeArchivos: archivos.map((f) => f.name),
    archivosParaSubir: archivos,
    esModelo: true, // el archivo es el modelo (3MF sin laminar), no un G-code
    fotoInicial: foto,
    costeFil: costos.costeFil,
    filDetalle: costos.filDetalle,
    costeElec: costos.costeElec,
    costeMant: costos.costeMant,
    costeMO: costos.costeMO,
    costeIns: 0,
    extras: costos.extras,
    total: costos.total,
    precio: costos.precio,
    horas: est.horas,
    cantidad: 1,
    margen: costos.margen,
    aplicaMargen: { elec: true, mant: true, mo: true, ins: true, extras: true },
    impresoraNombre: impresoraNombre || null,
    gramos: multi ? 0 : est.gramos,
    precioRollo: multi ? 0 : Number(v.precioKg) || 0,
    watts: Number(v.watts) || 0,
    precioKwh: Number(v.kwh) || 0,
    moHora: Number(v.moHora) || 0,
    horasTrab: Number(v.horasTrabajo) || 0,
    desperdicio: Number(v.desperdicio) || 0,
    gcodeNombre: archivos[0]?.name || null,
    materiales: multi ? est.colores.map((c) => ({ type: v.nombreFilamento || 'PLA', color: c.color, totalG: c.gramos, precioKg: Number(v.precioKg) || 0 })) : null,
    multiMat: multi,
    matData: multi ? est.colores.map((c) => ({ totalG: c.gramos, precioKg: Number(v.precioKg) || 0 })) : null
  };
}

// Horas como "3 h 20 min".
export function formatoHoras(h) {
  const min = Math.round((Number(h) || 0) * 60);
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh ? `${hh} h ${mm ? `${mm} min` : ''}`.trim() : `${mm} min`;
}
