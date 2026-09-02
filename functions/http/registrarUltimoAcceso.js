const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { db, Timestamp, FieldValue, DIA_MS, sumarDias, formatearFecha } = require('../admin');
const { enviarEmail, gmailAppPassword } = require('../mailer');
const { renderPlantilla, obtenerOverridesPlantillas } = require('../emailTemplates');

// Días del ciclo nuevo que se le habilita a un plan marcado `gratuito`
// (ej. "Boceto") cuando lo reactiva un ingreso.
const DIAS_EXTENSION_PLAN_GRATUITO = 30;

// Si la cuenta tiene asignado un plan marcado `gratuito: true` en
// planes/{planId} (ver ModalPlan.jsx) Y ya cayó en modo lectura (por no
// haber entrado durante su ciclo anterior), este ingreso le arranca un
// ciclo nuevo de 30 días -- así no requiere que un admin la reactive a
// mano cada vez. A propósito NO toca nada si la cuenta ya está 'activa'
// (ni tampoco revive una 'suspendida' sola): extender cicloFin en cada
// login sin cerrar el ciclo anterior nunca deja que arranque un cicloId
// nuevo, y el conteo de cuotas del plan (pedidos/mes, ver
// dentroDelLimiteDePedidos en firestore.rules) queda pegado al mismo
// ciclo para siempre -- mismo problema que ya evita el cron con el
// beneficio de códigos promocionales (ver "promo renovada" en
// transicionSuscripciones.js, que arranca cicloInicio/cicloId nuevos en
// vez de sólo empujar cicloFin).
async function extenderSiEsPlanGratuito(data) {
  if (data.estado !== 'lectura' || !data.planId) return null;
  const planSnap = await db.doc(`planes/${data.planId}`).get();
  if (!planSnap.exists || !planSnap.data().gratuito) return null;

  const ahora = Timestamp.now();
  return {
    estado: 'activa',
    cicloInicio: ahora,
    cicloId: formatearFecha(ahora),
    cicloFin: sumarDias(ahora, DIAS_EXTENSION_PLAN_GRATUITO),
    fechaLimiteLectura: FieldValue.delete()
  };
}

// Freeze entre avisos de plan gratuito a un mismo suscriptor: antes esto lo
// disparaba un botón manual del panel admin (con confirmación humana antes
// de cada tanda); ahora se manda solo, así que el cooldown es lo único que
// evita saturar a alguien que entra todos los días.
const COOLDOWN_DIAS_AVISO_PLAN_GRATUITO = 10;

// Manda el aviso de que existe el plan gratuito "Boceto" si la cuenta que
// acaba de ingresar es candidata: mismo criterio que tenía el botón manual
// del panel admin (ahora desactivado, ver AdminPage.jsx) -- está en trial, o
// está en modo lectura sin ningún plan asignado (su trial venció sin que
// nadie le asignara un plan pago). No hace falta el filtro de "ingresó hace
// menos de N días" que tenía el botón: acá se sabe que ingresó AHORA MISMO.
async function avisarPlanGratuitoSiCorresponde(subRef, data) {
  const elegible = data.estado === 'trial' || (!data.planId && data.estado === 'lectura');
  if (!elegible || !data.email) return;

  const ultimoEnvioMs = data.avisoPlanGratuitoEnviadoEl?.toMillis?.();
  const cooldownDesde = Date.now() - COOLDOWN_DIAS_AVISO_PLAN_GRATUITO * DIA_MS;
  if (ultimoEnvioMs && ultimoEnvioMs > cooldownDesde) return;

  try {
    const overrides = await obtenerOverridesPlantillas();
    const { subject, html } = renderPlantilla('avisoPlanGratuito', {}, overrides);
    await enviarEmail({ to: data.email, subject, html });
    await subRef.set({ avisoPlanGratuitoEnviadoEl: Timestamp.now() }, { merge: true });
  } catch (e) {
    logger.error('Error al enviar aviso automático de plan gratuito:', e);
  }
}

// La llama el propio cliente (AppContext.jsx) una vez por sesión, apenas
// resuelve qué cuenta efectiva está usando (la propia o la del dueño, si
// es un miembro invitado). Tiene que ser Cloud Function porque
// suscripcion/actual tiene "allow write: if false" para el cliente (ver
// firestore.rules): todo cambio ahí pasa por Admin SDK. Guarda el último
// acceso en el mismo doc que ya lee el admin/revendedor (mismo patrón que
// bibliotecaCount, ver onBibliotecaCambio.js), así el panel de consumo
// puede mostrar "hace cuánto no entra" sin pedir un permiso nuevo.
exports.registrarUltimoAcceso = onCall({ secrets: [gmailAppPassword] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) return { ok: false };

  // Mismo criterio que resolverCuentaId() en AppContext.jsx y esMiembroActivo()
  // en firestore.rules: si el email logueado es un miembro invitado activo,
  // el acceso se registra en la cuenta del DUEÑO, no en la del invitado (no
  // tiene suscripción propia).
  let cuentaId = uid;
  const email = request.auth?.token?.email?.toLowerCase();
  if (email) {
    const invSnap = await db.doc(`invitacionesMiembro/${email}`).get();
    if (invSnap.exists && invSnap.data().estado === 'activo') {
      cuentaId = invSnap.data().ownerUid;
    }
  }

  const subRef = db.doc(`users/${cuentaId}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) return { ok: false };

  const extension = await extenderSiEsPlanGratuito(subSnap.data());
  await subRef.set({ ultimoAcceso: Timestamp.now(), ...(extension || {}) }, { merge: true });
  await avisarPlanGratuitoSiCorresponde(subRef, subSnap.data());
  return { ok: true };
});
