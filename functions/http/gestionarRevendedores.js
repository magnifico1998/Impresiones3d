const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { db, Timestamp, FieldValue, obtenerContactoRevendedor } = require('../admin');

// Gestión de revendedores: cualquier suscriptor existente puede ser
// habilitado por un admin para vender/administrar suscripciones de otras
// cuentas con un código propio (ver cambiarEstadoSuscripcion.js, que es
// quien realmente autoriza y atribuye cada venta). Todo esto es admin-only
// -- ni siquiera el propio revendedor puede tocar su código (ver
// firestore.rules: revendedores/{codigo} y suscripcion/actual tienen
// allow write: if false para el cliente).

const CODIGO_RE = /^[A-Z0-9]{4,12}$/;

function validarCodigo(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  if (!CODIGO_RE.test(c)) {
    throw new HttpsError('invalid-argument', 'El código debe tener entre 4 y 12 caracteres (letras/números).');
  }
  return c;
}

async function exigirAdmin(request) {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }
  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }
  return emailSolicitante;
}

// El campo que identifica una cuenta acá es el uid de Firebase Auth, no el
// email -- pero es un error fácil de cometer al escribirlo a mano (los dos
// "identifican" a la cuenta para quien lo tipea). Si lo que llega tiene
// forma de email, lo resolvemos contra Firebase Auth antes de tocar
// Firestore, así un typo de este tipo nunca deja un doc fantasma en
// users/{email}/... en vez de users/{uidReal}/....
async function resolverUid(identificador) {
  const valor = String(identificador || '').trim();
  if (!valor) return null;
  if (!valor.includes('@')) return valor;
  try {
    const registro = await getAuth().getUserByEmail(valor.toLowerCase());
    return registro.uid;
  } catch (e) {
    throw new HttpsError('not-found', `No existe ninguna cuenta con el email ${valor}.`);
  }
}

exports.habilitarRevendedor = onCall(async (request) => {
  const emailSolicitante = await exigirAdmin(request);

  const uid = await resolverUid(request.data?.uid);
  const codigo = validarCodigo(request.data?.codigo);
  if (!uid) {
    throw new HttpsError('invalid-argument', 'Falta el uid (o email) de la cuenta.');
  }

  const revRef = db.doc(`revendedores/${codigo}`);
  const revSnap = await revRef.get();
  if (revSnap.exists && revSnap.data().uid !== uid) {
    throw new HttpsError('already-exists', 'Ese código ya está en uso por otra cuenta.');
  }

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  const emailCuenta = subSnap.exists ? (subSnap.data().email || null) : null;
  const codigoAnterior = subSnap.exists ? (subSnap.data().codigoRevendedor || null) : null;

  // Si la cuenta ya tenía OTRO código activo, lo desactivamos para no
  // dejar códigos huérfanos apuntando a la misma cuenta.
  if (codigoAnterior && codigoAnterior !== codigo) {
    await db.doc(`revendedores/${codigoAnterior}`).set({ activo: false }, { merge: true });
  }

  await revRef.set({
    uid,
    email: emailCuenta,
    activo: true,
    creadoEl: revSnap.exists ? revSnap.data().creadoEl : Timestamp.now()
  }, { merge: true });

  await subRef.set({ codigoRevendedor: codigo }, { merge: true });
  await subRef.collection('eventos').add({
    tipo: 'revendedor_habilitado',
    fecha: Timestamp.now(),
    admin: emailSolicitante,
    detalle: { codigo }
  });

  return { ok: true, codigo };
});

exports.deshabilitarRevendedor = onCall(async (request) => {
  await exigirAdmin(request);

  const { uid } = request.data || {};
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el uid de la cuenta.');
  }

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  const codigo = subSnap.exists ? (subSnap.data().codigoRevendedor || null) : null;
  if (!codigo) {
    throw new HttpsError('not-found', 'Esa cuenta no tiene un código de revendedor habilitado.');
  }

  // Se corta el acceso vía reglas de inmediato (esRevendedorDe/
  // miCodigoRevendedor dejan de matchear apenas se borra el campo), sin
  // tocar nada de los suscriptores que ya tenía vinculados -- siguen
  // existiendo y facturados normalmente, sólo que ya no puede operarlos.
  await db.doc(`revendedores/${codigo}`).set({ activo: false }, { merge: true });
  await subRef.update({ codigoRevendedor: FieldValue.delete() });

  return { ok: true };
});

// Borra DEFINITIVAMENTE un código de revendedor -- a diferencia de
// deshabilitar (que sólo lo desactiva y se puede reactivar volviendo a
// llamar a habilitarRevendedor con el mismo uid+código), esto elimina el
// documento entero. Por eso exige que no le queden suscriptores VIGENTES
// (trial o activa) vinculados: borrarlo con gente todavía pagando bajo ese
// código dejaría esas cuentas con un revendedorUid huérfano, sin ninguna
// forma de saber a quién había que facturarle esas renovaciones futuras.
exports.borrarRevendedor = onCall(async (request) => {
  await exigirAdmin(request);

  const codigo = validarCodigo(request.data?.codigo);
  const revRef = db.doc(`revendedores/${codigo}`);
  const revSnap = await revRef.get();
  if (!revSnap.exists) {
    throw new HttpsError('not-found', 'Ese código de revendedor no existe.');
  }
  const uidRevendedor = revSnap.data().uid;

  let vinculadasSnap;
  try {
    vinculadasSnap = await db.collectionGroup('suscripcion')
      .where('revendedorUid', '==', uidRevendedor)
      .get();
  } catch (e) {
    // Cualquier falla acá (ej: el índice de Firestore recién desplegado y
    // todavía construyéndose) no debe filtrar el error crudo de Firestore
    // al panel como un "internal" sin explicación -- mejor no dejar borrar
    // por las dudas y pedir que se reintente.
    console.error('Error al chequear suscriptores vinculados antes de borrar revendedor:', e);
    throw new HttpsError('unavailable', 'No se pudo comprobar si todavía tiene suscriptores. Probá de nuevo en un momento.');
  }
  const tieneSuscriptoresActivos = vinculadasSnap.docs.some(d => ['trial', 'activa'].includes(d.data().estado));
  if (tieneSuscriptoresActivos) {
    throw new HttpsError('failed-precondition', 'Este revendedor todavía tiene suscriptores con una suscripción vigente (trial o activa). Desvinculalos primero desde la tabla de Suscriptores.');
  }

  const subRef = db.doc(`users/${uidRevendedor}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (subSnap.exists && subSnap.data().codigoRevendedor === codigo) {
    await subRef.update({ codigoRevendedor: FieldValue.delete() });
  }

  await revRef.delete();
  return { ok: true };
});

exports.actualizarDescuentosRevendedor = onCall(async (request) => {
  await exigirAdmin(request);

  const { uid, descuentosPorPlan } = request.data || {};
  if (!uid || typeof uid !== 'string' || typeof descuentosPorPlan !== 'object' || descuentosPorPlan === null) {
    throw new HttpsError('invalid-argument', 'Faltan datos (uid, descuentosPorPlan).');
  }

  const subSnap = await db.doc(`users/${uid}/suscripcion/actual`).get();
  const codigo = subSnap.exists ? (subSnap.data().codigoRevendedor || null) : null;
  if (!codigo) {
    throw new HttpsError('not-found', 'Esa cuenta no tiene un código de revendedor habilitado.');
  }

  // Sólo valores 0-100, uno por planId -- son el default que se prellena
  // al activar/renovar, siempre editable por venta desde el panel.
  const limpio = {};
  for (const [planId, pct] of Object.entries(descuentosPorPlan)) {
    const n = Number(pct);
    if (Number.isFinite(n) && n >= 0 && n <= 100) limpio[planId] = n;
  }

  await db.doc(`revendedores/${codigo}`).set({ descuentosPorPlan: limpio }, { merge: true });
  return { ok: true };
});

// Vincula (o desvincula) a mano una cuenta YA EXISTENTE a un revendedor --
// para el caso de suscriptores que el revendedor ya traía de antes de que
// existiera este sistema de códigos (nunca pasaron por el formulario de
// contacto con el código cargado, así que cambiarEstadoSuscripcion nunca
// los habría vinculado solo). No genera ítems de venta retroactivos en el
// ledger -- sólo las renovaciones DE ACÁ EN ADELANTE cuentan para el cierre
// mensual del revendedor.
exports.vincularRevendedor = onCall(async (request) => {
  await exigirAdmin(request);

  const { uid, codigo } = request.data || {};
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el uid de la cuenta.');
  }

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    throw new HttpsError('not-found', 'Esa cuenta todavía no tiene suscripción inicializada.');
  }

  if (!codigo) {
    // Desvincular: la cuenta vuelve a quedar sin revendedor asignado.
    await subRef.update({
      revendedorUid: FieldValue.delete(),
      revendedorCodigo: FieldValue.delete(),
      revendedorContacto: FieldValue.delete()
    });
    return { ok: true, codigo: null };
  }

  const codigoLimpio = validarCodigo(codigo);
  const revSnap = await db.doc(`revendedores/${codigoLimpio}`).get();
  if (!revSnap.exists || !revSnap.data().activo) {
    throw new HttpsError('not-found', 'Ese código de revendedor no existe o está inactivo.');
  }

  await subRef.set({
    revendedorUid: revSnap.data().uid,
    revendedorCodigo: codigoLimpio,
    revendedorContacto: await obtenerContactoRevendedor(revSnap.data().uid)
  }, { merge: true });

  return { ok: true, codigo: codigoLimpio };
});

exports.generarCierreRevendedor = onCall(async (request) => {
  await exigirAdmin(request);

  const { uid, anioMes } = request.data || {};
  if (!uid || typeof uid !== 'string' || !anioMes || !/^\d{4}-\d{2}$/.test(anioMes)) {
    throw new HttpsError('invalid-argument', 'Faltan datos (uid, anioMes en formato YYYY-MM).');
  }

  const subSnap = await db.doc(`users/${uid}/suscripcion/actual`).get();
  const codigo = subSnap.exists ? (subSnap.data().codigoRevendedor || null) : null;
  if (!codigo) {
    throw new HttpsError('not-found', 'Esa cuenta no tiene un código de revendedor habilitado.');
  }

  const emailSolicitante = request.auth.token.email.toLowerCase();
  const ventaRef = db.doc(`revendedores/${codigo}/ventas/${anioMes}`);
  const ventaSnap = await ventaRef.get();
  const datos = ventaSnap.exists ? ventaSnap.data() : {
    items: [], totalPlan: 0, totalDescuento: 0, totalFacturable: 0
  };

  // El cierre es sólo informativo (no bloquea ni modifica suscripciones):
  // se puede volver a generar sin riesgo si hace falta reimprimir el PDF
  // de un mes ya cerrado. Importante: si el doc todavía no existía (mes
  // sin ventas), hay que persistir TAMBIÉN los defaults de "datos" acá --
  // si sólo se guardara {cerrado,...}, el doc quedaría sin items/totales y
  // "Ver ventas" (que lee el doc directo) rompería al no encontrarlos.
  await ventaRef.set({
    ...datos,
    cerrado: true,
    cerradoEl: Timestamp.now(),
    cerradoPor: emailSolicitante
  }, { merge: true });

  return { ok: true, codigo, anioMes, ...datos };
});

// Valida un código de revendedor en vivo desde el formulario de contacto
// (ModalContacto.jsx), devolviendo nombre/apellido/email para que el
// interesado confirme que es el revendedor correcto antes de enviar. NO es
// admin-only (cualquier usuario logueado la puede llamar) -- a propósito
// no exponemos la colección revendedores por lectura directa vía
// firestore.rules para no dejar enumerar códigos/emails ajenos desde el
// cliente; esta función sólo devuelve datos de UN código puntual que el
// usuario ya escribió, nunca un listado.
exports.validarCodigoRevendedor = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }
  const codigo = String(request.data?.codigo || '').trim().toUpperCase();
  if (!CODIGO_RE.test(codigo)) {
    return { valido: false };
  }

  const revSnap = await db.doc(`revendedores/${codigo}`).get();
  if (!revSnap.exists || !revSnap.data().activo) {
    return { valido: false };
  }

  const contacto = await obtenerContactoRevendedor(revSnap.data().uid);
  return { valido: true, ...contacto };
});
