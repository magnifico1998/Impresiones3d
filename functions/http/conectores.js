const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('crypto');
const { db, Timestamp } = require('../admin');

// Conector de impresión (carpeta conector/): un programa que corre en una PC
// del taller, toma los trabajos de la cola de la cuenta y los manda a las
// impresoras por la red local.
//
// Vinculación, sin poner contraseñas en la PC:
//   1. En la app, "Vincular un conector" llama a crearCodigoConector y
//      muestra un código de 8 caracteres (vale 10 minutos, una sola vez).
//   2. El conector lo manda a vincularConector, que le crea un usuario
//      técnico de Firebase (email @EMAIL_CONECTOR, contraseña al azar) con
//      el permiso conectorDe = cuenta, y la ficha users/{cuenta}/conectores/{id}.
//   3. El conector entra con ese usuario: las reglas le dejan leer los
//      archivos G-code y la cola de trabajos de esa cuenta, y nada más.
// Desvincular = borrar la ficha: onConectorBorrado borra el usuario técnico.
//
//   codigosConector/{codigo}    { cuentaId, creadoPor, expira }

const EMAIL_CONECTOR = 'conectores.manager3d.invalid';
exports.EMAIL_CONECTOR = EMAIL_CONECTOR;

const MINUTOS_CODIGO = 10;
const MAX_CONECTORES = 5;
// Sin letras ni números que se confunden (0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

function codigoAlAzar(largo = 8) {
  const bytes = crypto.randomBytes(largo);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

// Cuenta de quien pide el código: la propia o, si es miembro activo de un
// equipo, la del dueño (mismo criterio que los tickets).
async function cuentaDe(uid, email) {
  if (!email) return uid;
  const inv = await db.doc(`invitacionesMiembro/${email}`).get();
  return inv.exists && inv.data().estado === 'activo' && inv.data().ownerUid ? inv.data().ownerUid : uid;
}

exports.crearCodigoConector = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || request.auth.token?.conectorDe) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  const email = request.auth.token?.email_verified ? request.auth.token.email?.toLowerCase() : null;
  const cuentaId = await cuentaDe(uid, email);

  const actuales = await db.collection(`users/${cuentaId}/conectores`).count().get();
  if (actuales.data().count >= MAX_CONECTORES) {
    throw new HttpsError('resource-exhausted', `Ya tenés ${MAX_CONECTORES} conectores vinculados. Desvinculá alguno para sumar otro.`);
  }

  const codigo = codigoAlAzar();
  const expira = Timestamp.fromMillis(Date.now() + MINUTOS_CODIGO * 60 * 1000);
  await db.doc(`codigosConector/${codigo}`).set({ cuentaId, creadoPor: uid, expira });
  return { codigo, expira: expira.toMillis(), minutos: MINUTOS_CODIGO };
});

// Lo llama el conector (sin sesión todavía), con { codigo, equipo }.
exports.vincularConector = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Usá POST.' });
    return;
  }
  const codigo = texto(req.body?.codigo, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const equipo = texto(req.body?.equipo, 60) || 'Conector';
  if (codigo.length !== 8) {
    res.status(400).json({ error: 'El código tiene 8 caracteres.' });
    return;
  }

  const codigoRef = db.doc(`codigosConector/${codigo}`);
  let cuentaId;
  try {
    // Se consume dentro de una transacción: el mismo código no sirve dos veces.
    cuentaId = await db.runTransaction(async (tx) => {
      const snap = await tx.get(codigoRef);
      if (!snap.exists) return null;
      tx.delete(codigoRef);
      return snap.data().expira.toMillis() > Date.now() ? snap.data().cuentaId : null;
    });
  } catch (e) {
    logger.error('vincularConector: no se pudo leer el código', e);
    res.status(500).json({ error: 'No se pudo vincular. Probá de nuevo.' });
    return;
  }
  if (!cuentaId) {
    res.status(404).json({ error: 'El código no existe o venció. Generá uno nuevo en Manager3D.' });
    return;
  }

  const conectorRef = db.collection(`users/${cuentaId}/conectores`).doc();
  const emailTecnico = `${cuentaId}-${conectorRef.id}@${EMAIL_CONECTOR}`.toLowerCase();
  const password = crypto.randomBytes(24).toString('base64url');
  try {
    const usuario = await getAuth().createUser({ email: emailTecnico, password, displayName: `Conector ${equipo}`, emailVerified: true });
    await getAuth().setCustomUserClaims(usuario.uid, { conectorDe: cuentaId, conectorId: conectorRef.id });
    await conectorRef.set({
      equipo,
      authUid: usuario.uid,
      creadoEl: Timestamp.now(),
      ultimaConexion: null,
      version: null,
      impresoras: []
    });
    res.json({ cuentaId, conectorId: conectorRef.id, email: emailTecnico, password });
  } catch (e) {
    logger.error('vincularConector: no se pudo crear el conector', e);
    res.status(500).json({ error: 'No se pudo vincular. Probá de nuevo.' });
  }
});

// Desvincular (la cuenta borra la ficha): se borra el usuario técnico, así el
// conector pierde el acceso aunque la PC conserve la contraseña.
exports.onConectorBorrado = onDocumentDeleted('users/{uid}/conectores/{conectorId}', async (event) => {
  const authUid = event.data?.data()?.authUid;
  if (!authUid) return;
  try {
    await getAuth().deleteUser(authUid);
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') logger.error(`onConectorBorrado: no se pudo borrar ${authUid}`, e);
  }
});
