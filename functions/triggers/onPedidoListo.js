const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { db, Timestamp } = require('../admin');
const { enviarEmail, gmailAppPassword } = require('../mailer');
const { renderPlantilla, obtenerOverridesPlantillas } = require('../emailTemplates');
const { decidirAviso } = require('../avisoPedidoListo');

// Aviso por mail al cliente cuando su pedido pasa a "Listo p/ entregar". Reglas en ../avisoPedidoListo.js.
// Una sola vez por pedido: se reserva users/{uid}/avisosPedido/{pedidoId} con create(), que falla si ya existe
// (también cubre que la función se ejecute dos veces por el mismo cambio). Si el envío falla, la reserva se
// borra para que un próximo cambio a "listo" pueda reintentar.
exports.onPedidoListo = onDocumentUpdated(
  { document: 'users/{uid}/pedidos/{pedidoId}', secrets: [gmailAppPassword] },
  async (event) => {
    const { uid, pedidoId } = event.params;
    const antes = event.data?.before?.data();
    const despues = event.data?.after?.data();
    if (!antes || !despues || antes.estado === despues.estado) return;

    const metaSnap = await db.doc(`users/${uid}/meta/config`).get();
    const meta = metaSnap.exists ? metaSnap.data() : {};
    const cfg = meta.config || {};
    if (!cfg.notificarPedidoListo) return;

    const clientesSnap = await db.collection(`users/${uid}/clientes`).get();
    const decision = decidirAviso({ antes, despues, cfg, clientes: clientesSnap.docs.map((d) => d.data()) });
    if (!decision.enviar) {
      logger.info(`onPedidoListo: ${uid}/${pedidoId} sin aviso (${decision.motivo}).`);
      return;
    }

    const reserva = db.doc(`users/${uid}/avisosPedido/${pedidoId}`);
    try {
      await reserva.create({ email: decision.email, fecha: Timestamp.now() });
    } catch (e) {
      if (e.code === 6 || /already exists/i.test(e.message || '')) return;
      throw e;
    }

    try {
      const empresa = meta.empresa || {};
      const emprendimiento = String(empresa.nombre || '').trim() || 'Tu emprendimiento';
      const overrides = await obtenerOverridesPlantillas();
      const { subject, html } = renderPlantilla('pedidoListo', {
        nombre: decision.cliente.nombre || '',
        numero: String(pedidoId).padStart(4, '0'),
        emprendimiento
      }, overrides);
      await enviarEmail({
        to: decision.email, subject, html,
        fromName: `${emprendimiento} vía Manager3D`,
        replyTo: String(empresa.email || '').trim() || undefined
      });
      logger.info(`onPedidoListo: aviso enviado (${uid}/${pedidoId}).`);
    } catch (e) {
      logger.error(`onPedidoListo: no se pudo avisar ${uid}/${pedidoId}`, e.message);
      await reserva.delete().catch(() => {});
    }
  }
);
