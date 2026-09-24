const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { mpAccessToken, mpWebhookSecret, firmaWebhookValida } = require('../mercadopago');
const { procesarCobroRecurrente, procesarCambioPreapproval } = require('../cobrosMercadoPago');

// Notificaciones de Mercado Pago (panel de MP -> Webhooks, eventos
// "Planes y suscripciones"). Valida la firma y delega en
// cobrosMercadoPago.js, que es la misma lógica que usa la sincronización
// manual desde la app. Maneja dos tipos:
//   - subscription_preapproval: la suscripción cambió de estado.
//   - subscription_authorized_payment: un cobro mensual.
exports.webhookMercadoPago = onRequest({ secrets: [mpAccessToken, mpWebhookSecret] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Método no permitido.');
    return;
  }
  if (!firmaWebhookValida(req, mpWebhookSecret.value())) {
    logger.warn('webhookMercadoPago: firma inválida, se rechaza.', { query: req.query, body: req.body });
    res.status(401).send('Firma inválida.');
    return;
  }

  const tipo = req.body?.type || req.query.type;
  const id = req.query['data.id'] ?? req.body?.data?.id;
  const mpUserId = req.body?.user_id != null ? String(req.body.user_id) : null;

  try {
    if (tipo === 'subscription_authorized_payment') {
      await procesarCobroRecurrente(id, mpUserId);
    } else if (tipo === 'subscription_preapproval') {
      await procesarCambioPreapproval(id, mpUserId);
    } else {
      logger.info(`webhookMercadoPago: tipo "${tipo}" ignorado.`);
    }
    res.status(200).send('ok');
  } catch (e) {
    // El recurso no existe en Mercado Pago (ej. el id de ejemplo del
    // simulador del panel): reintentar no lo va a hacer aparecer.
    if (e.status === 404) {
      logger.warn(`webhookMercadoPago: ${tipo} ${id} no existe en Mercado Pago, se ignora.`);
      res.status(200).send('ok');
      return;
    }
    // 500 para que Mercado Pago reintente: el procesamiento es idempotente.
    logger.error(`webhookMercadoPago: error procesando ${tipo} ${id}:`, e.message, e.data);
    res.status(500).send('Error procesando la notificación.');
  }
});
