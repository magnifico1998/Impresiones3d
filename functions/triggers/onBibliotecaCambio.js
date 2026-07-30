const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { db, FieldValue } = require('../admin');

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
  const delta = existeAhora ? 1 : -1;

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    logger.warn(`onBibliotecaCambio: ${uid} no tiene suscripcion/actual, se omite el contador.`);
    return;
  }

  await subRef.set({ bibliotecaCount: FieldValue.increment(delta) }, { merge: true });
});
