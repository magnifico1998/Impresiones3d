const { onCall } = require('firebase-functions/v2/https');
const { db, Timestamp } = require('../admin');

// La llama el propio cliente (AppContext.jsx) una vez por sesión, apenas
// resuelve qué cuenta efectiva está usando (la propia o la del dueño, si
// es un miembro invitado). Tiene que ser Cloud Function porque
// suscripcion/actual tiene "allow write: if false" para el cliente (ver
// firestore.rules): todo cambio ahí pasa por Admin SDK. Guarda el último
// acceso en el mismo doc que ya lee el admin/revendedor (mismo patrón que
// bibliotecaCount, ver onBibliotecaCambio.js), así el panel de consumo
// puede mostrar "hace cuánto no entra" sin pedir un permiso nuevo.
exports.registrarUltimoAcceso = onCall(async (request) => {
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

  await subRef.set({ ultimoAcceso: Timestamp.now() }, { merge: true });
  return { ok: true };
});
