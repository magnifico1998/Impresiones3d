// Codebase "facturacion": facturación electrónica de ARCA (facturas de la
// plataforma a sus suscriptores y facturas de cada emprendimiento a sus
// clientes), el PDF de la factura y la consulta de categorías de monotributo.
// Va aparte del resto de las funciones (codebase "default", carpeta functions/)
// para desplegarse y probarse por separado y no arrastrar jspdf, node-forge,
// fast-xml-parser ni qrcode a las demás. Ver docs/arquitectura.md.
//
// admin.js, mailer.js y emailTemplates.js se copian desde functions/ antes de
// cada despliegue (scripts/copiar-comun-functions.mjs): no se editan acá.

// Tope de instancias por función (v2), igual que en el codebase default.
const { setGlobalOptions } = require('firebase-functions/v2');
setGlobalOptions({ maxInstances: 10 });

const { onPagoMPRegistrado } = require('./triggers/onPagoMPRegistrado');
const { probarConexionArca, emitirFacturaManual, facturarPagoMP, reintentarFactura, anularFactura, descargarFacturaPDF, reenviarFacturaMail } = require('./http/facturacion');
const { configurarFacturacionCuenta, facturarPedido, reintentarFacturaCuenta, descartarFacturaCuenta, anularFacturaCuenta, descargarFacturaCuentaPDF, enviarFacturaCuentaMail } = require('./http/facturacionCuenta');
const { buscarCategoriasMonotributo } = require('./http/monotributo');

module.exports = {
  onPagoMPRegistrado,
  probarConexionArca,
  emitirFacturaManual,
  facturarPagoMP,
  reintentarFactura,
  anularFactura,
  descargarFacturaPDF,
  reenviarFacturaMail,
  configurarFacturacionCuenta,
  facturarPedido,
  reintentarFacturaCuenta,
  descartarFacturaCuenta,
  anularFacturaCuenta,
  descargarFacturaCuentaPDF,
  enviarFacturaCuentaMail,
  buscarCategoriasMonotributo
};
