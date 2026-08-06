const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { db, FieldValue } = require('../admin');

// Se dispara en cada escritura de un pedido (users/{uid}/pedidos/{id}).
// pedidosCreados suma 1 sólo cuando el documento se CREA; montoFacturado
// acumula la DIFERENCIA de monto neto (precioVenta - descuento, la misma
// fórmula que usa el frontend en ModalPedidoDetalle.jsx) entre la versión
// anterior y la nueva del pedido.
//
// Antes esto era un onDocumentCreated que registraba el neto una única vez
// al crear: un pedido creado vacío desde "Nuevo pedido" y cargado con
// piezas después contaba $0 para siempre en el consumo del ciclo, y
// cualquier cambio de precio posterior tampoco se reflejaba. Con el delta,
// el contador acompaña las ediciones; los borrados (hoy sólo los hace la
// restauración de backup, que borra y reescribe todo) restan lo suyo y el
// neto queda consistente. Ojo: si el pedido se edita en un ciclo posterior
// al de su creación, el delta impacta en el ciclo VIGENTE — mide actividad
// del período, no reasigna montos históricos.
//
// (El nombre onPedidoCreado se mantiene aunque ahora escuche todas las
// escrituras: es el id de la función ya desplegada, y renombrarla
// obligaría a borrar la vieja y crear una nueva en el próximo deploy.)

const netoDePedido = (pedido) => {
  if (!pedido) return 0;
  const precioVenta = Number(pedido.precioVenta) || 0;
  const descuentoMonto = Number(pedido.descuentoMonto) || 0;
  const descuentoPct = Math.max(0, Math.min(100, Number(pedido.descuentoPct) || 0));
  const descuentoTotal = descuentoMonto > 0 ? descuentoMonto : (precioVenta * (descuentoPct / 100));
  return Math.max(0, precioVenta - descuentoTotal);
};

exports.onPedidoCreado = onDocumentWritten('users/{uid}/pedidos/{pedidoId}', async (event) => {
  const uid = event.params.uid;
  const antes = event.data?.before?.exists ? event.data.before.data() : null;
  const despues = event.data?.after?.exists ? event.data.after.data() : null;

  const esCreacion = !antes && !!despues;
  const deltaMonto = netoDePedido(despues) - netoDePedido(antes);

  // La mayoría de las escrituras no cambian el neto (marcar piezas como
  // elaboradas, cambiar estado, notas): no hay nada que contar.
  if (!esCreacion && deltaMonto === 0) return;

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

  const cambios = {
    montoFacturado: FieldValue.increment(deltaMonto),
    actualizadoEl: FieldValue.serverTimestamp()
  };
  if (esCreacion) {
    cambios.pedidosCreados = FieldValue.increment(1);
  }

  const contadorRef = db.doc(`users/${uid}/suscripcion/actual/contadores/${periodoId}`);
  await contadorRef.set(cambios, { merge: true });
});
