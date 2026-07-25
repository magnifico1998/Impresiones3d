const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp } = require('../admin');

// Gestión de usuarios adicionales por cuenta ("equipo"): un dueño puede dar
// de alta a colaboradores por su email de Gmail hasta el máximo de usuarios
// que permita el plan contratado. El vínculo vive en la colección raíz
// invitacionesMiembro/{emailEnMinusculas} -- el ID es el email para poder
// resolverlo con un getDoc directo en el login (ver AppContext.jsx), sin
// necesidad de custom claims. Todas las escrituras pasan por acá (nunca
// directo desde el cliente, ver firestore.rules) para poder validar el
// límite del plan de forma confiable.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

exports.agregarMiembro = onCall(async (request) => {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  const ownerUid = request.auth?.uid;
  if (!emailSolicitante || !ownerUid) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const emailNuevo = String(request.data?.email || '').trim().toLowerCase();
  if (!emailNuevo || !EMAIL_RE.test(emailNuevo)) {
    throw new HttpsError('invalid-argument', 'Ingresá un email válido.');
  }
  if (emailNuevo === emailSolicitante) {
    throw new HttpsError('invalid-argument', 'No podés agregarte a vos mismo.');
  }

  const invRef = db.doc(`invitacionesMiembro/${emailNuevo}`);
  const invSnap = await invRef.get();
  if (invSnap.exists && invSnap.data().estado === 'activo' && invSnap.data().ownerUid !== ownerUid) {
    throw new HttpsError('already-exists', 'Ese email ya administra otra cuenta.');
  }

  // Límite de usuarios del plan contratado (null = sin límite). El "1" de
  // acá abajo es el propio dueño -- la barra de "Usuarios" en Mi
  // emprendimiento ya cuenta así (usado = 1 + miembros activos).
  const subSnap = await db.doc(`users/${ownerUid}/suscripcion/actual`).get();
  const planId = subSnap.exists ? subSnap.data().planId : null;
  let limiteUsuarios = null;
  if (planId) {
    const planSnap = await db.doc(`planes/${planId}`).get();
    if (planSnap.exists) {
      limiteUsuarios = planSnap.data().limites?.usuarios ?? null;
    }
  }

  if (limiteUsuarios !== null) {
    const activosSnap = await db.collection('invitacionesMiembro')
      .where('ownerUid', '==', ownerUid)
      .where('estado', '==', 'activo')
      .get();
    const totalConNuevo = 1 + activosSnap.size + (invSnap.exists && invSnap.data().estado === 'activo' ? 0 : 1);
    if (totalConNuevo > limiteUsuarios) {
      throw new HttpsError('resource-exhausted', `Tu plan permite hasta ${limiteUsuarios} usuario${limiteUsuarios === 1 ? '' : 's'}. Necesitás un plan superior para agregar más.`);
    }
  }

  await invRef.set({
    email: emailNuevo,
    ownerUid,
    ownerEmail: emailSolicitante,
    estado: 'activo',
    agregadoEn: Timestamp.now()
  });

  return { ok: true };
});

exports.quitarMiembro = onCall(async (request) => {
  const ownerUid = request.auth?.uid;
  if (!ownerUid) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const email = String(request.data?.email || '').trim().toLowerCase();
  if (!email) {
    throw new HttpsError('invalid-argument', 'Falta el email.');
  }

  const invRef = db.doc(`invitacionesMiembro/${email}`);
  const invSnap = await invRef.get();
  if (!invSnap.exists || invSnap.data().ownerUid !== ownerUid) {
    throw new HttpsError('not-found', 'Ese usuario no pertenece a tu cuenta.');
  }

  await invRef.delete();
  return { ok: true };
});
