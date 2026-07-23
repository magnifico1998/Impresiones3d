const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('../admin');

// La llama el catálogo público (CatalogoPublico.jsx) cuando un visitante
// SIN LOGIN abre /catalogo/{uid}. Por eso tiene que ser una Cloud Function:
// un visitante anónimo no tiene permiso de Firestore para tocar los
// contadores de la tienda que está mirando (ver firestore.rules).
//
// Nota de alcance: esto no tiene protección anti-bot (alguien podría
// scriptear muchas llamadas para inflar el contador de una tienda ajena).
// Para una métrica de uso que hoy sólo afecta límites de plan, el riesgo es
// bajo; si en el futuro se vuelve un problema, se agrega Firebase App
// Check acá.
exports.registrarAperturaCatalogo = onCall(async (request) => {
  const { uidTienda } = request.data || {};
  if (!uidTienda || typeof uidTienda !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta uidTienda.');
  }

  const subSnap = await db.doc(`users/${uidTienda}/suscripcion/actual`).get();
  if (!subSnap.exists) return { ok: true };

  const { cicloId } = subSnap.data();
  const periodoId = cicloId || 'trial';

  await db.doc(`users/${uidTienda}/suscripcion/actual/contadores/${periodoId}`).set({
    aperturasCatalogo: FieldValue.increment(1),
    actualizadoEl: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true };
});
