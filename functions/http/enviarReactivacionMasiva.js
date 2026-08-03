const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { db, Timestamp, DIA_MS } = require('../admin');
const { enviarEmail, gmailAppPassword } = require('../mailer');
const { renderPlantilla, obtenerOverridesPlantillas } = require('../emailTemplates');

const COOLDOWN_DIAS = 30;
const MAX_UIDS = 500;

// Manda el mail de "reactivación" (plantilla `reactivacion`) a una lista
// puntual de suscriptores que el admin ya filtró y confirmó a mano en el
// panel (por plan + días sin ingresar, ver AdminPage.jsx). El cliente sólo
// decide A QUIÉN mostrarle el botón de confirmación; el servidor es la
// autoridad final sobre el cooldown de 30 días entre reenvíos -- aunque el
// filtro del cliente esté desactualizado (otra pestaña ya le mandó el mail
// hace 2 días), acá se vuelve a chequear contra el dato real de Firestore
// antes de mandar nada, así nunca se satura a un mismo suscriptor.
exports.enviarReactivacionMasiva = onCall({ secrets: [gmailAppPassword] }, async (request) => {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }
  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }

  const { uids } = request.data || {};
  if (!Array.isArray(uids) || uids.length === 0) {
    throw new HttpsError('invalid-argument', 'Faltan los uids de los suscriptores a contactar.');
  }
  if (uids.length > MAX_UIDS) {
    throw new HttpsError('invalid-argument', `Máximo ${MAX_UIDS} suscriptores por envío.`);
  }

  const ahora = Timestamp.now();
  const cooldownDesde = ahora.toMillis() - COOLDOWN_DIAS * DIA_MS;
  const overrides = await obtenerOverridesPlantillas();

  let enviados = 0;
  let omitidos = 0;
  let fallidos = 0;

  await Promise.all(
    uids.map(async (uid) => {
      try {
        const subRef = db.doc(`users/${uid}/suscripcion/actual`);
        const snap = await subRef.get();
        if (!snap.exists) { omitidos++; return; }

        const data = snap.data();
        const ultimoEnvioMs = data.reactivacionEnviadaEl?.toMillis?.();
        if (!data.email || (ultimoEnvioMs && ultimoEnvioMs > cooldownDesde)) {
          omitidos++;
          return;
        }

        const { subject, html } = renderPlantilla('reactivacion', {}, overrides);
        await enviarEmail({ to: data.email, subject, html });
        await subRef.set({ reactivacionEnviadaEl: ahora }, { merge: true });
        enviados++;
      } catch (e) {
        logger.error(`Error al enviar mail de reactivación a ${uid}:`, e);
        fallidos++;
      }
    })
  );

  return { ok: true, enviados, omitidos, fallidos };
});
