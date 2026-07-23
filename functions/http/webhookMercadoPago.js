const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');

// TODO (fase de integración con Mercado Pago): esto queda deshabilitado a
// propósito. Un webhook de pagos NO se puede dejar "andando a medias":
// sin validar la firma (header x-signature) que manda Mercado Pago,
// cualquiera podría pegarle a esta URL simulando un aviso de pago
// aprobado y activar una cuenta gratis. Falta:
//   1. Las credenciales del Application de Mercado Pago (Access Token +
//      clave del webhook), que hoy no tenemos.
//   2. Implementar la validación de firma según la documentación oficial
//      de Mercado Pago (cambia de vez en cuando, hay que mirar la vigente).
//   3. Buscar la cuenta (uid) correspondiente al preapproval que avisa el
//      webhook -- probablemente vía external_reference al crear la
//      suscripción en Mercado Pago (Fase de checkout).
//   4. Llamar a la misma lógica de cambiarEstadoSuscripcion.js (acción
//      "activar" o "renovarCiclo") para no duplicar la lógica de fechas.
// Hasta entonces devuelve 501 y loggea lo que llegó, para poder revisarlo
// cuando se dé de alta la cuenta de Mercado Pago.
exports.webhookMercadoPago = onRequest(async (req, res) => {
  logger.warn('webhookMercadoPago: recibido pero la integración todavía no está activa.', {
    headers: req.headers,
    body: req.body
  });
  res.status(501).send('Integración con Mercado Pago pendiente.');
});
