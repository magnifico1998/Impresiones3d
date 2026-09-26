const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('../admin');

// La llama el catálogo público (CatalogoPublico.jsx) cuando un visitante
// SIN LOGIN abre /catalogo/{uid}. Por eso tiene que ser una Cloud Function:
// un visitante anónimo no tiene permiso de Firestore para tocar los
// contadores de la tienda que está mirando (ver firestore.rules).
//
// Devuelve { aceptaPedidos }: false cuando esta apertura pasó el límite
// aperturasCatalogoMes del plan de la tienda. El catálogo se sigue
// mostrando pero sin poder enviar solicitudes (CatalogoPublico.jsx), y
// firestore.rules lo hace cumplir igual (dentroDelLimiteDeAperturas) con el
// mismo criterio: la apertura que llega justo al tope todavía puede pedir.
//
// Nota de alcance: esto no tiene protección anti-bot (alguien podría
// scriptear muchas llamadas para inflar el contador de una tienda ajena y,
// desde que el límite frena pedidos, dejarla sin recibir solicitudes hasta
// el próximo ciclo). Si se vuelve un problema, se agrega Firebase App Check
// acá.
exports.registrarAperturaCatalogo = onCall({ maxInstances: 3 }, async (request) => {
  const { uidTienda } = request.data || {};
  // Formato de uid de Firebase Auth: evita que un valor con "/" arme una
  // ruta distinta a users/{uid}/suscripcion/actual.
  if (!uidTienda || typeof uidTienda !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(uidTienda)) {
    throw new HttpsError('invalid-argument', 'Falta uidTienda.');
  }

  const subSnap = await db.doc(`users/${uidTienda}/suscripcion/actual`).get();
  if (!subSnap.exists) return { ok: true, aceptaPedidos: true };

  const { cicloId, planId } = subSnap.data();
  const periodoId = cicloId || 'trial';
  const contadorRef = db.doc(`users/${uidTienda}/suscripcion/actual/contadores/${periodoId}`);

  await contadorRef.set({
    aperturasCatalogo: FieldValue.increment(1),
    actualizadoEl: FieldValue.serverTimestamp()
  }, { merge: true });

  // Sin ciclo o sin plan (trial), el límite no aplica: mismas salidas que
  // dentroDelLimiteDeAperturas en firestore.rules.
  if (!cicloId || !planId) return { ok: true, aceptaPedidos: true };

  const [planSnap, contadorSnap] = await Promise.all([db.doc(`planes/${planId}`).get(), contadorRef.get()]);
  const limite = planSnap.exists ? planSnap.data().limites?.aperturasCatalogoMes : null;
  if (limite == null) return { ok: true, aceptaPedidos: true };

  const aperturas = contadorSnap.exists ? (contadorSnap.data().aperturasCatalogo || 0) : 0;
  return { ok: true, aceptaPedidos: aperturas <= limite };
});
