const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { db, Timestamp, sumarMesCalendario, formatearFecha } = require('../admin');

// Backfill para cuentas que se registraron ANTES de que existiera
// onNuevoUsuario: recorre TODOS los usuarios de Firebase Auth, y a los que
// todavía no tienen users/{uid}/suscripcion/actual les crea una en estado
// "activa" (sin plan asignado todavía), para que aparezcan en la tabla del
// panel y el admin las pueda ir editando una por una desde ahí -- en vez
// de tener que ir cuenta por cuenta a mano desde Firestore Console.
exports.inicializarCuentasLegacy = onCall(async (request) => {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }

  // Junta TODOS los usuarios de Firebase Auth, paginando de a 1000 (el
  // máximo por página que permite el Admin SDK).
  const usuarios = [];
  let pageToken;
  do {
    const resultado = await getAuth().listUsers(1000, pageToken);
    usuarios.push(...resultado.users);
    pageToken = resultado.pageToken;
  } while (pageToken);

  const ahora = Timestamp.now();
  let creadas = 0;

  for (const u of usuarios) {
    const subRef = db.doc(`users/${u.uid}/suscripcion/actual`);
    const subSnap = await subRef.get();
    if (subSnap.exists) continue; // ya tiene, no la tocamos

    await subRef.set({
      estado: 'activa',
      planId: null,
      email: u.email || null,
      trialInicio: null,
      trialFin: null,
      cicloInicio: ahora,
      cicloId: formatearFecha(ahora),
      cicloFin: sumarMesCalendario(ahora),
      fechaLimiteLectura: null,
      mpPreapprovalId: null
    });
    await subRef.collection('eventos').add({
      tipo: 'alta_legacy_activa',
      fecha: ahora,
      admin: emailSolicitante,
      detalle: { motivo: 'backfill de cuenta creada antes del sistema de suscripciones' }
    });
    creadas++;
  }

  return { ok: true, totalUsuarios: usuarios.length, creadas };
});
