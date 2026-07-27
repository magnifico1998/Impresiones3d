const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('../admin');
const { DEFAULTS } = require('../emailTemplates');

async function exigirAdmin(request) {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }
  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }
}

// Devuelve todas las plantillas de mail (default + override guardado, si
// hay) para que el panel admin las liste y arme la vista previa. El HTML
// final que efectivamente se manda se arma recién al momento del envío (ver
// emailTemplates.js -> renderPlantilla), acá sólo se expone el contenido
// "crudo" (subject/bodyHtml sin el layout ni las variables sustituidas) más
// datos de ejemplo para previsualizar.
exports.listarPlantillasEmail = onCall(async (request) => {
  await exigirAdmin(request);

  const overridesSnap = await db.doc('configuracion/emailTemplates').get();
  const overrides = overridesSnap.exists ? overridesSnap.data() : {};

  const plantillas = Object.entries(DEFAULTS).map(([id, base]) => {
    const override = overrides[id] || {};
    return {
      id,
      label: base.label,
      subjectDefault: base.subject,
      bodyHtmlDefault: base.bodyHtml,
      subject: override.subject || base.subject,
      bodyHtml: override.bodyHtml || base.bodyHtml,
      personalizado: Boolean(override.subject || override.bodyHtml),
      variables: base.variables,
    };
  });

  return { plantillas };
});

// Guarda (o actualiza) el override de una plantilla puntual. No valida el
// HTML en sí -- confiamos en que es un admin editando desde el panel, no
// input de un usuario final -- pero si viene vacío, se interpreta como
// "sin cambios" en ese campo (no pisa lo que ya había).
exports.guardarPlantillaEmail = onCall(async (request) => {
  await exigirAdmin(request);

  const { id, subject, bodyHtml } = request.data || {};
  if (!id || !DEFAULTS[id]) {
    throw new HttpsError('invalid-argument', 'Plantilla de mail desconocida.');
  }
  if (typeof subject !== 'string' || !subject.trim() || typeof bodyHtml !== 'string' || !bodyHtml.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan el asunto o el contenido del mail.');
  }

  await db.doc('configuracion/emailTemplates').set({
    [id]: { subject: subject.trim(), bodyHtml: bodyHtml.trim() },
  }, { merge: true });

  return { ok: true };
});

// Elimina el override guardado de una plantilla, así vuelve a usarse el
// contenido por defecto de functions/emailTemplates.js.
exports.restablecerPlantillaEmail = onCall(async (request) => {
  await exigirAdmin(request);

  const { id } = request.data || {};
  if (!id || !DEFAULTS[id]) {
    throw new HttpsError('invalid-argument', 'Plantilla de mail desconocida.');
  }

  await db.doc('configuracion/emailTemplates').set({
    [id]: FieldValue.delete(),
  }, { merge: true });

  return { ok: true };
});
