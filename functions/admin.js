const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const DIA_MS = 24 * 60 * 60 * 1000;
const DURACION_TRIAL_DIAS = 7;
const DURACION_LECTURA_DIAS = 10;

// Suma un mes calendario a un Timestamp, anclado al día de activación (no
// a 30 días fijos). Ej: activó el 15/07 -> próximo ciclo 15/08. Si el mes
// siguiente no tiene ese día (activó un 31 y el próximo mes tiene 30 o
// menos días), se recorta al último día disponible de ese mes -- mismo
// criterio que usa Mercado Pago para sus cobros recurrentes mensuales, así
// que cicloFin queda alineado con la fecha real de cobro.
function sumarMesCalendario(timestamp) {
  const fecha = timestamp.toDate();
  const diaOriginal = fecha.getDate();
  const resultado = new Date(fecha);
  resultado.setDate(1); // evita que JS "se pase" de mes al sumar en meses con menos días
  resultado.setMonth(resultado.getMonth() + 1);
  const ultimoDiaDelMesSiguiente = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(diaOriginal, ultimoDiaDelMesSiguiente));
  return Timestamp.fromDate(resultado);
}

function formatearFecha(timestamp) {
  return timestamp.toDate().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

module.exports = { db, Timestamp, FieldValue, DIA_MS, DURACION_TRIAL_DIAS, DURACION_LECTURA_DIAS, sumarMesCalendario, formatearFecha };
