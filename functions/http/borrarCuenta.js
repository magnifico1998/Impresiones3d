const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { db } = require('../admin');

// Purga total de una cuenta. Pensada originalmente para cuentas que nunca
// se reactivaron tras quedar "suspendida" (30 días de modo lectura
// vencidos, ver transicionSuscripciones.js), pero un admin puede forzarla
// sobre CUALQUIER estado (activa, trial, lectura) sin esperar esos 30 días
// -- para eso, en vez de exigir un estado puntual, se exige confirmar a
// mano el email EXACTO de la cuenta (confirmarEmail), que acá se revalida
// contra el email real (el de la suscripción, o si no está cacheado ahí,
// el de Firebase Auth) -- así nunca se puede borrar la cuenta equivocada
// por un clic de más, esté o no bloqueada. No hay vuelta atrás: no queda
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

  const { uid, confirmarEmail } = request.data || {};
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el uid de la cuenta a borrar.');
  }
  if (!confirmarEmail || typeof confirmarEmail !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta confirmar el email de la cuenta a borrar.');
  }

  const subSnap = await db.doc(`users/${uid}/suscripcion/actual`).get();
  let emailReal = subSnap.exists ? (subSnap.data().email || null) : null;
  if (!emailReal) {
    try {
      emailReal = (await getAuth().getUser(uid)).email || null;
    } catch (e) {
      // Sigue null -- se maneja como "no coincide" más abajo.
    }
  }
  if (!emailReal || emailReal.toLowerCase() !== confirmarEmail.trim().toLowerCase()) {
    throw new HttpsError('failed-precondition', 'El email no coincide con el de la cuenta. No se borró nada.');
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
