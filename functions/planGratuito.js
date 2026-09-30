const { db, Timestamp, FieldValue, sumarDias, formatearFecha } = require('./admin');

// Plan gratuito (ej. "Boceto"): el plan marcado `gratuito: true` en
// planes/{id}. Una cuenta pasa a él sola, sin intervención del admin:
//   - al vencer la prueba de 7 días, si completó su perfil (en vez de
//     caer en modo lectura), ver transicionSuscripciones.js;
//   - al completar el perfil estando en modo lectura o bloqueada, ver
//     http/perfil.js.
// Después se renueva con cada ingreso (registrarUltimoAcceso.js).

// Días del ciclo que se habilita cada vez que la cuenta entra al plan
// gratuito o lo renueva con un ingreso.
const DIAS_PLAN_GRATUITO = 30;

// Datos del perfil obligatorios para acceder al plan gratuito (a cambio,
// el admin recibe un lead completo). El emprendimiento y cómo nos conoció
// se piden pero no son obligatorios: las fichas que ya existían (del
// checkout de Mercado Pago o cargadas por el admin) no los tienen.
const CAMPOS_PERFIL = ['nombre', 'apellido', 'telefono', 'localidad'];

const perfilCompleto = (datos) => !!datos && CAMPOS_PERFIL.every((c) => String(datos[c] || '').trim());

// El plan gratuito (si hubiera más de uno, el de menor orden). No se filtra
// por `activo`: ese campo es "visible para contratar", y un plan gratuito
// puede estar oculto de la lista de planes pagos y usarse igual.
async function planGratuitoId() {
  const snap = await db.collection('planes').where('gratuito', '==', true).get();
  const gratuitos = snap.docs.sort((a, b) => (a.data().orden ?? 99) - (b.data().orden ?? 99));
  return gratuitos[0]?.id || null;
}

// Cambios en suscripcion/actual para arrancar un ciclo del plan gratuito
// desde ahora (ciclo nuevo: los límites por ciclo arrancan de cero).
function camposActivacionGratuito(planId, ahora = Timestamp.now()) {
  return {
    estado: 'activa',
    planId,
    cicloInicio: ahora,
    cicloId: formatearFecha(ahora),
    cicloFin: sumarDias(ahora, DIAS_PLAN_GRATUITO),
    fechaLimiteLectura: FieldValue.delete()
  };
}

module.exports = { DIAS_PLAN_GRATUITO, CAMPOS_PERFIL, perfilCompleto, planGratuitoId, camposActivacionGratuito };
