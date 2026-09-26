// Tope de instancias por función (v2): acota lo que puede costar un abuso
// de las funciones públicas (catálogo sin login, webhook) mientras no haya
// App Check. Tiene que ir antes de cargar las funciones.
const { setGlobalOptions } = require('firebase-functions/v2');
setGlobalOptions({ maxInstances: 10 });

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
const { crearSuscripcionMP, sincronizarSuscripcionMP, cancelarSuscripcionMP } = require('./http/pagosMercadoPago');
const { agregarMiembro, quitarMiembro, responderInvitacion } = require('./http/gestionarMiembros');
const { borrarCuenta } = require('./http/borrarCuenta');
const { transicionSuscripciones } = require('./scheduled/transicionSuscripciones');
const { reactivacionInactivos } = require('./scheduled/reactivacionInactivos');
const { onNuevaSolicitudContacto } = require('./triggers/onNuevaSolicitudContacto');
const { onNuevaSolicitudCatalogo } = require('./triggers/onNuevaSolicitudCatalogo');
const { listarPlantillasEmail, guardarPlantillaEmail, restablecerPlantillaEmail } = require('./http/plantillasEmail');
const { habilitarRevendedor, deshabilitarRevendedor, borrarRevendedor, actualizarDescuentosRevendedor, marcarCierreFacturado, vincularRevendedor, validarCodigoRevendedor } = require('./http/gestionarRevendedores');
const { cierreMensualRevendedores } = require('./scheduled/cierreMensualRevendedores');
const { activarCodigoPromocional, crearCodigoPromocional, actualizarCodigoPromocional, desactivarCodigoPromocional } = require('./http/codigosPromocionales');

module.exports = {
  onNuevoUsuario,
  onPedidoCreado,
  onBibliotecaCambio,
  registrarAperturaCatalogo,
  registrarUltimoAcceso,
  cambiarEstadoSuscripcion,
  webhookMercadoPago,
  crearSuscripcionMP,
  sincronizarSuscripcionMP,
  cancelarSuscripcionMP,
  agregarMiembro,
  quitarMiembro,
  responderInvitacion,
  borrarCuenta,
  transicionSuscripciones,
  reactivacionInactivos,
  onNuevaSolicitudContacto,
  onNuevaSolicitudCatalogo,
  listarPlantillasEmail,
  guardarPlantillaEmail,
  restablecerPlantillaEmail,
  habilitarRevendedor,
  deshabilitarRevendedor,
  actualizarDescuentosRevendedor,
  cierreMensualRevendedores,
  marcarCierreFacturado,
  vincularRevendedor,
  validarCodigoRevendedor,
  borrarRevendedor,
  activarCodigoPromocional,
  crearCodigoPromocional,
  actualizarCodigoPromocional,
  desactivarCodigoPromocional
};
