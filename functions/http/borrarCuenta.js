const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { logger } = require('firebase-functions');
const { db } = require('../admin');
const { mpAccessToken, mpFetch, tokenDelCobrador } = require('../mercadopago');

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
exports.borrarCuenta = onCall({ secrets: [mpAccessToken] }, async (request) => {
  const emailSolicitante = request.auth?.token?.email_verified === true
    ? request.auth.token.email?.toLowerCase()
    : null;
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }

  const { uid, confirmarEmail } = request.data || {};
  if (!uid || typeof uid !== 'string' || uid.includes('/')) {
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
    } catch {
      // Sigue null -- se maneja como "no coincide" más abajo.
    }
  }
  if (!emailReal || emailReal.toLowerCase() !== confirmarEmail.trim().toLowerCase()) {
    throw new HttpsError('failed-precondition', 'El email no coincide con el de la cuenta. No se borró nada.');
  }

  // Antes que nada, cortar el débito automático de Mercado Pago: si no, la
  // persona sigue pagando todos los meses una cuenta que ya no existe (el
  // webhook sólo registraría el pago como aplicado:false). Si Mercado Pago
  // falla no se borra nada, para no perder el preapprovalId que hace falta
  // para cancelarlo a mano.
  const cobro = subSnap.exists ? subSnap.data().cobro : null;
  if (cobro?.preapprovalId && cobro.estado === 'authorized') {
    try {
      await mpFetch(await tokenDelCobrador(cobro.mpUserId), `/preapproval/${cobro.preapprovalId}`, {
        method: 'PUT',
        body: { status: 'cancelled' }
      });
    } catch (e) {
      logger.error(`borrarCuenta: no se pudo cancelar el débito ${cobro.preapprovalId} de ${uid}.`, e.message, e.data);
      throw new HttpsError('unavailable', 'No se pudo cancelar el débito automático en Mercado Pago, así que no se borró nada. Probá de nuevo en un momento.');
    }
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

  // Si esta persona era a su vez miembro de OTRA cuenta, ese vínculo
  // (ID = su email) también se va.
  await db.doc(`invitacionesMiembro/${emailReal.toLowerCase()}`).delete();

  // Archivos en Storage (logo, imágenes de productos): viven en
  // users/{uid}/... (ver storage.rules). No es crítico si falla -- los
  // datos ya se borraron -- pero se loguea para limpiarlo a mano.
  try {
    await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/` });
  } catch (e) {
    logger.error(`borrarCuenta: no se pudieron borrar los archivos de Storage de ${uid}.`, e);
  }

  // Por último, la cuenta de Firebase Auth en sí: si esa persona vuelve a
  // entrar con la misma cuenta de Google, el trigger onNuevoUsuario la
  // trata como alguien nuevo (trial desde cero), no como si reactivara la
  // vieja.
  try {
    await getAuth().deleteUser(uid);
  } catch {
    // No es crítico: lo que más importa (los datos en Firestore) ya se
    // borró. Si el usuario de Auth ya no existía o falló por otro motivo
    // puntual, no tiene sentido revertir el resto.
  }

  return { ok: true };
});
