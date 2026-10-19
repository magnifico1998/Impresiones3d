const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp } = require('../admin');
const { normalizarNombre, motivoNombreInvalido } = require('../nombreCatalogo');

// Nombre del catálogo en la dirección (manager3d.com.ar/{nombre}). Cada nombre vive en catalogoNombres/{nombre} =
// { uid, alias, hasta }: la app lo resuelve con un getDoc directo (lectura pública, ver firestore.rules) y sólo esta
// función escribe, así dos cuentas nunca se quedan con el mismo nombre a la vez.
//
// Al cambiar de nombre, el anterior queda como alias de la misma cuenta durante DIAS_ALIAS días para no romper los links
// ya compartidos; pasado ese plazo queda libre (nadie más lo puede tomar mientras el alias esté vigente).

const DIAS_ALIAS = 30;
const ESTADOS_QUE_ESCRIBEN = ['activa', 'trial'];

// Cuenta sobre la que actúa quien llama: la propia o, si es un miembro invitado activo, la del dueño (mismo criterio
// que el resto de las funciones de cuenta).
async function resolverCuenta(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  const email = request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : null;
  if (email) {
    const inv = await db.doc(`invitacionesMiembro/${email}`).get();
    if (inv.exists && inv.data().estado === 'activo') return inv.data().ownerUid;
  }
  return uid;
}

exports.reservarNombreCatalogo = onCall(async (request) => {
  const cuentaUid = await resolverCuenta(request);

  const nombre = normalizarNombre(request.data?.nombre);
  const motivo = motivoNombreInvalido(nombre);
  if (motivo) throw new HttpsError('invalid-argument', motivo);

  const sub = await db.doc(`users/${cuentaUid}/suscripcion/actual`).get();
  if (!ESTADOS_QUE_ESCRIBEN.includes(sub.exists ? sub.data().estado : '')) {
    throw new HttpsError('failed-precondition', 'Tu cuenta está en modo lectura o bloqueada: renová el plan para cambiar la dirección.');
  }

  await db.runTransaction(async (tx) => {
    const refNuevo = db.doc(`catalogoNombres/${nombre}`);
    const refTienda = db.doc(`catalogoTiendas/${cuentaUid}`);
    const [snapNuevo, snapTienda] = await Promise.all([tx.get(refNuevo), tx.get(refTienda)]);
    if (!snapTienda.exists) {
      throw new HttpsError('failed-precondition', 'Primero activá tu catálogo web (Catálogo web → Activar catálogo).');
    }

    const ahora = Date.now();
    const previo = snapNuevo.exists ? snapNuevo.data() : null;
    const vigente = previo && (!previo.alias || (previo.hasta?.toMillis?.() || 0) > ahora);
    if (vigente && previo.uid !== cuentaUid) {
      throw new HttpsError('already-exists', 'Ese nombre ya lo usa otro catálogo: elegí otro.');
    }

    const actual = snapTienda.data().nombreUrl || null;
    if (actual === nombre && previo?.uid === cuentaUid && !previo.alias) return; // ya era el suyo

    tx.set(refNuevo, { uid: cuentaUid, alias: false, hasta: null, actualizado: Timestamp.now() });
    if (actual && actual !== nombre) {
      tx.set(db.doc(`catalogoNombres/${actual}`), {
        uid: cuentaUid, alias: true, hasta: Timestamp.fromMillis(ahora + DIAS_ALIAS * 24 * 60 * 60 * 1000), actualizado: Timestamp.now()
      });
    }
    tx.set(refTienda, { nombreUrl: nombre, actualizado: new Date(ahora).toISOString() }, { merge: true });
  });

  return { nombre };
});
