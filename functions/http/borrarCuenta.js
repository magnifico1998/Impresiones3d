const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { db } = require('../admin');

// Purga total de una cuenta que nunca se reactivó tras quedar
// "suspendida" (30 días de modo lectura vencidos, ver
// transicionSuscripciones.js). A propósito sólo opera sobre cuentas en ese
// estado exacto -- es la única forma de asegurarse, del lado del servidor,
// de que nunca se borre por error una cuenta con datos vivos (trial,
// activa o incluso en modo lectura todavía). No hay vuelta atrás: no queda
// ningún registro de esta cuenta en Firestore ni en Firebase Auth.
exports.borrarCuenta = onCall(async (request) => {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }

  const { uid } = request.data || {};
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el uid de la cuenta a borrar.');
  }

  const subSnap = await db.doc(`users/${uid}/suscripcion/actual`).get();
  if (!subSnap.exists || subSnap.data().estado !== 'suspendida') {
    throw new HttpsError('failed-precondition', 'Sólo se pueden borrar cuentas que estén en estado "suspendida".');
  }

  // Datos privados (users/{uid} y todas sus subcolecciones: meta,
  // clientes, compras, biblioteca, pedidos, suscripcion/actual con
  // eventos y contadores) y el catálogo web público de esa tienda
  // (catalogoTiendas/{uid} con sus productos y solicitudes recibidas).
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.recursiveDelete(db.doc(`catalogoTiendas/${uid}`));

  // Registros sueltos fuera del árbol users/{uid}.
  await db.doc(`solicitudesContacto/${uid}`).delete();
  await db.doc(`datosSuscriptor/${uid}`).delete();

  // Si esta cuenta era "dueña" de usuarios de equipo agregados (ver
  // EmpresaPage "Usuarios con acceso"), esos vínculos quedan huérfanos si
  // no se limpian acá -- se borran junto con todo lo demás.
  const miembrosSnap = await db.collection('invitacionesMiembro').where('ownerUid', '==', uid).get();
  if (!miembrosSnap.empty) {
    const batch = db.batch();
    miembrosSnap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // Por último, la cuenta de Firebase Auth en sí: si esa persona vuelve a
  // entrar con la misma cuenta de Google, el trigger onNuevoUsuario la
  // trata como alguien nuevo (trial desde cero), no como si reactivara la
  // vieja.
  try {
    await getAuth().deleteUser(uid);
  } catch (e) {
    // No es crítico: lo que más importa (los datos en Firestore) ya se
    // borró. Si el usuario de Auth ya no existía o falló por otro motivo
    // puntual, no tiene sentido revertir el resto.
  }

  return { ok: true };
});
