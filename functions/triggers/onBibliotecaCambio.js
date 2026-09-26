const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { db } = require('../admin');

// Mantiene bibliotecaCount en users/{uid}/suscripcion/actual al día cada vez
// que se crea o borra un producto de la Biblioteca. A diferencia de los
// contadores de ciclo (pedidosCreados, aperturasCatalogo, montoFacturado en
// suscripcion/actual/contadores/{cicloId}), éste NO es por ciclo: la
// biblioteca es un límite de cantidad total vigente, no de actividad
// mensual (ver ModalBibGuardar.jsx, que compara biblioteca.length contra
// planContratado.limites.productosBiblioteca). Se guarda directo en
// suscripcion/actual porque ese doc ya lo puede leer el admin y el
// revendedor (ver firestore.rules), así el panel de "consumo" lo muestra
// sin pedir un permiso nuevo.
exports.onBibliotecaCambio = onDocumentWritten('users/{uid}/biblioteca/{docId}', async (event) => {
  const existiaAntes = event.data?.before?.exists;
  const existeAhora = event.data?.after?.exists;
  if (existiaAntes === existeAhora) return; // update de un producto existente: no cambia la cantidad

  const uid = event.params.uid;

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    logger.warn(`onBibliotecaCambio: ${uid} no tiene suscripcion/actual, se omite el contador.`);
    return;
  }

  // Se guarda el total real (count() de la colección) en vez de sumar/
  // restar 1: Firebase puede ejecutar un trigger más de una vez para el
  // mismo evento, y con increment() cada repetición desfasaba el contador
  // para siempre (y con él el límite de productos del plan en
  // firestore.rules). Contar es idempotente y además se autocorrige.
  const conteo = await db.collection(`users/${uid}/biblioteca`).count().get();
  await subRef.set({ bibliotecaCount: conteo.data().count }, { merge: true });
});
