// Motor de suscripciones de Manager 3D.
// Cada función vive en su propio archivo por responsabilidad; acá sólo se
// re-exportan para que Firebase las descubra.

const { onNuevoUsuario } = require('./triggers/onNuevoUsuario');
const { onPedidoCreado } = require('./triggers/onPedidoCreado');
const { onBibliotecaCambio } = require('./triggers/onBibliotecaCambio');
const { registrarAperturaCatalogo } = require('./http/registrarAperturaCatalogo');
const { registrarUltimoAcceso } = require('./http/registrarUltimoAcceso');
const { cambiarEstadoSuscripcion } = require('./http/cambiarEstadoSuscripcion');
const { webhookMercadoPago } = require('./http/webhookMercadoPago');
const { agregarMiembro, quitarMiembro } = require('./http/gestionarMiembros');
const { borrarCuenta } = require('./http/borrarCuenta');
const { transicionSuscripciones } = require('./scheduled/transicionSuscripciones');
const { reactivacionInactivos } = require('./scheduled/reactivacionInactivos');
const { onNuevaSolicitudContacto } = require('./triggers/onNuevaSolicitudContacto');
const { listarPlantillasEmail, guardarPlantillaEmail, restablecerPlantillaEmail } = require('./http/plantillasEmail');
const { habilitarRevendedor, deshabilitarRevendedor, borrarRevendedor, actualizarDescuentosRevendedor, generarCierreRevendedor, vincularRevendedor, validarCodigoRevendedor } = require('./http/gestionarRevendedores');
const { activarCodigoPromocional, crearCodigoPromocional, actualizarCodigoPromocional, desactivarCodigoPromocional } = require('./http/codigosPromocionales');

module.exports = {
  onNuevoUsuario,
  onPedidoCreado,
  onBibliotecaCambio,
  registrarAperturaCatalogo,
  registrarUltimoAcceso,
  cambiarEstadoSuscripcion,
  webhookMercadoPago,
  agregarMiembro,
  quitarMiembro,
  borrarCuenta,
  transicionSuscripciones,
  reactivacionInactivos,
  onNuevaSolicitudContacto,
  listarPlantillasEmail,
  guardarPlantillaEmail,
  restablecerPlantillaEmail,
  habilitarRevendedor,
  deshabilitarRevendedor,
  actualizarDescuentosRevendedor,
  generarCierreRevendedor,
  vincularRevendedor,
  validarCodigoRevendedor,
  borrarRevendedor,
  activarCodigoPromocional,
  crearCodigoPromocional,
  actualizarCodigoPromocional,
  desactivarCodigoPromocional
};
