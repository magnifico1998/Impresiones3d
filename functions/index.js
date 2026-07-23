// Motor de suscripciones de Manager 3D.
// Cada función vive en su propio archivo por responsabilidad; acá sólo se
// re-exportan para que Firebase las descubra.

const { onNuevoUsuario } = require('./triggers/onNuevoUsuario');
const { onPedidoCreado } = require('./triggers/onPedidoCreado');
const { registrarAperturaCatalogo } = require('./http/registrarAperturaCatalogo');
const { cambiarEstadoSuscripcion } = require('./http/cambiarEstadoSuscripcion');
const { webhookMercadoPago } = require('./http/webhookMercadoPago');
const { transicionSuscripciones } = require('./scheduled/transicionSuscripciones');

module.exports = {
  onNuevoUsuario,
  onPedidoCreado,
  registrarAperturaCatalogo,
  cambiarEstadoSuscripcion,
  webhookMercadoPago,
  transicionSuscripciones
};
