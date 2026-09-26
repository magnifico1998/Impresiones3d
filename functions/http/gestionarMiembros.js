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
//
// La invitación nace 'pendiente' y recién pasa a 'activo' cuando el
// invitado la acepta (responderInvitacion). Antes nacía 'activo': cualquier
// usuario podía cargar el email de otra persona y, en su próximo ingreso,
// la app la metía de prepo en la cuenta ajena (perdía acceso a la suya,
// no podía contratar su plan y todo lo que cargaba lo veía el otro).
// firestore.rules/storage.rules sólo dan acceso con estado 'activo'.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Email del token sólo si Google/el link mágico lo verificaron: el vínculo
// se resuelve por email, así que uno sin verificar no puede reclamarlo.
function emailVerificado(request) {
  const token = request.auth?.token;
  return token?.email && token.email_verified === true ? token.email.toLowerCase() : null;
}

exports.agregarMiembro = onCall(async (request) => {
  const emailSolicitante = emailVerificado(request);
  const ownerUid = request.auth?.uid;
  if (!emailSolicitante || !ownerUid) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const emailNuevo = String(request.data?.email || '').trim().toLowerCase();
  if (!emailNuevo || !EMAIL_RE.test(emailNuevo) || emailNuevo.includes('/')) {
    throw new HttpsError('invalid-argument', 'Ingresá un email válido.');
  }
  if (emailNuevo === emailSolicitante) {
    throw new HttpsError('invalid-argument', 'No podés agregarte a vos mismo.');
  }

  // Un miembro activo de otra cuenta no puede armar un equipo propio desde
  // ahí: su sesión opera sobre la cuenta del dueño, no sobre la suya.
  const miInvSnap = await db.doc(`invitacionesMiembro/${emailSolicitante}`).get();
  if (miInvSnap.exists && miInvSnap.data().estado === 'activo') {
    throw new HttpsError('permission-denied', 'Sólo el dueño de la cuenta puede agregar usuarios.');
  }

  // Límite de usuarios del plan contratado (null = sin límite). El "1" de
  // acá abajo es el propio dueño -- la barra de "Usuarios" en Mi
  // emprendimiento ya cuenta así (usado = 1 + miembros activos/pendientes).
  const subSnap = await db.doc(`users/${ownerUid}/suscripcion/actual`).get();
  const planId = subSnap.exists ? subSnap.data().planId : null;
  let limiteUsuarios = null;
  if (planId) {
    const planSnap = await db.doc(`planes/${planId}`).get();
    if (planSnap.exists) {
      limiteUsuarios = planSnap.data().limites?.usuarios ?? null;
    }
  }

  const invRef = db.doc(`invitacionesMiembro/${emailNuevo}`);
  // Transacción: dos altas casi simultáneas no pueden pasarse del límite.
  await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(invRef);
    if (invSnap.exists && invSnap.data().estado === 'activo' && invSnap.data().ownerUid !== ownerUid) {
      throw new HttpsError('already-exists', 'Ese email ya administra otra cuenta.');
    }
    if (invSnap.exists && invSnap.data().ownerUid === ownerUid) {
      return; // ya estaba invitado (pendiente o activo) a esta misma cuenta
    }

    if (limiteUsuarios !== null) {
      const ocupadosSnap = await tx.get(db.collection('invitacionesMiembro')
        .where('ownerUid', '==', ownerUid)
        .where('estado', 'in', ['activo', 'pendiente']));
      if (1 + ocupadosSnap.size + 1 > limiteUsuarios) {
        throw new HttpsError('resource-exhausted', `Tu plan permite hasta ${limiteUsuarios} usuario${limiteUsuarios === 1 ? '' : 's'}. Necesitás un plan superior para agregar más.`);
      }
    }

    tx.set(invRef, {
      email: emailNuevo,
      ownerUid,
      ownerEmail: emailSolicitante,
      estado: 'pendiente',
      agregadoEn: Timestamp.now()
    });
  });

  return { ok: true };
});

exports.quitarMiembro = onCall(async (request) => {
  const ownerUid = request.auth?.uid;
  if (!ownerUid) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const email = String(request.data?.email || '').trim().toLowerCase();
  if (!email || email.includes('/')) {
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

// La llama el propio invitado (nunca el dueño): aceptar pasa su invitación
// pendiente a 'activo'; rechazar la borra -- y sirve también para salir de
// una cuenta compartida en la que ya estaba activo.
exports.responderInvitacion = onCall(async (request) => {
  const email = emailVerificado(request);
  if (!email || !request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado con un email verificado.');
  }
  const aceptar = request.data?.aceptar === true;

  const invRef = db.doc(`invitacionesMiembro/${email}`);
  const invSnap = await invRef.get();
  if (!invSnap.exists) {
    throw new HttpsError('not-found', 'No tenés ninguna invitación.');
  }

  if (!aceptar) {
    await invRef.delete();
    return { ok: true, estado: null };
  }
  if (invSnap.data().estado !== 'pendiente') {
    return { ok: true, estado: invSnap.data().estado };
  }
  await invRef.update({ estado: 'activo', aceptadoEn: Timestamp.now() });
  return { ok: true, estado: 'activo' };
});
