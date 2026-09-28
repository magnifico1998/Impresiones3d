const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { db } = require('../admin');
const { arcaCert, arcaKey } = require('../arca');
const { gmailAppPassword } = require('../mailer');
const { facturarPagoSuscripcion } = require('../facturacion');

// Factura automática de cada cobro de suscripción acreditado. Se engancha
// al alta de pagosMP/{paymentId} (que es el candado de idempotencia de los
// cobros) en vez de facturar dentro de cobrosMercadoPago.js: así una caída
// de ARCA nunca frena la activación del plan, y la factura se puede
// reintentar aparte desde el panel.
exports.onPagoMPRegistrado = onDocumentCreated(
  { document: 'pagosMP/{paymentId}', secrets: [arcaCert, arcaKey, gmailAppPassword], timeoutSeconds: 300 },
  async (event) => {
    const pago = event.data.data();
    if (!pago.aplicado || !(pago.monto > 0)) return;

    const config = await db.doc('configFacturacion/emisor').get();
    if (!config.exists || !config.data().facturarSuscripciones) return;

    try {
      const factura = await facturarPagoSuscripcion(event.params.paymentId, pago);
      if (factura) logger.info(`onPagoMPRegistrado: pago ${event.params.paymentId} -> factura ${factura.estado}`);
    } catch (e) {
      // Los errores de ARCA ya quedan en el doc de la factura; esto es algo
      // anterior (ej. Firestore). Queda en el log y se factura a mano con
      // facturarPagoMP.
      logger.error(`onPagoMPRegistrado: no se pudo facturar el pago ${event.params.paymentId}`, e);
    }
  }
);
