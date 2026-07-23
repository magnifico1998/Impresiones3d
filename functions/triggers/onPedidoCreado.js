const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { db, FieldValue } = require('../admin');

// Se dispara cada vez que se guarda un pedido nuevo (users/{uid}/pedidos/{id}).
// Suma 1 al contador de pedidos del ciclo de facturación vigente, y suma el
// monto neto (precioVenta - descuento) al contador de facturación. Réplica
// exacta de la fórmula que ya usa el frontend en ModalPedidoDetalle.jsx
// para calcular el neto, para que "monto facturado" del plan coincida con
// lo que el dueño ve en cada pedido.
//
// A propósito NO se decrementa si el pedido se borra después: el contador
// mide actividad del ciclo (para comparar contra el límite del plan), no
// el estado actual de la cuenta.
exports.onPedidoCreado = onDocumentCreated('users/{uid}/pedidos/{pedidoId}', async (event) => {
  const uid = event.params.uid;
  const pedido = event.data?.data();
  if (!pedido) return;

  const subSnap = await db.doc(`users/${uid}/suscripcion/actual`).get();
  if (!subSnap.exists) {
    // Cuenta sin suscripción inicializada todavía (no debería pasar si
    // onNuevoUsuario corrió bien, pero no rompemos el guardado del pedido
    // por esto).
    logger.warn(`onPedidoCreado: ${uid} no tiene suscripcion/actual, se omite el contador.`);
    return;
  }

  const { cicloId } = subSnap.data();
  const periodoId = cicloId || 'trial';

  const precioVenta = Number(pedido.precioVenta) || 0;
  const descuentoMonto = Number(pedido.descuentoMonto) || 0;
  const descuentoPct = Math.max(0, Math.min(100, Number(pedido.descuentoPct) || 0));
  const descuentoTotal = descuentoMonto > 0 ? descuentoMonto : (precioVenta * (descuentoPct / 100));
  const montoNeto = Math.max(0, precioVenta - descuentoTotal);

  const contadorRef = db.doc(`users/${uid}/suscripcion/actual/contadores/${periodoId}`);
  await contadorRef.set({
    pedidosCreados: FieldValue.increment(1),
    montoFacturado: FieldValue.increment(montoNeto),
    actualizadoEl: FieldValue.serverTimestamp()
  }, { merge: true });
});
