const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../admin');
const { arcaCert, arcaKey, ultimoAutorizado, probarConexion } = require('../arca');
const { gmailAppPassword } = require('../mailer');
const { generarFacturaPDF, nombreArchivoFactura } = require('../facturaPDF');
const {
  TIPO_FACTURA_C, TIPO_NC_C, CONCEPTOS, redondear, normalizarReceptor, obtenerEmisor,
  crearFactura, emitirFactura, enviarFacturaPorMail, facturarPagoSuscripcion, crearNotaCredito
} = require('../facturacion');

// Facturación electrónica desde el panel admin (fase 1: el admin factura
// sus suscripciones y sus pedidos). Todo pasa por acá: el cliente sólo
// puede leer facturas/, nunca escribirlas.

// Una emisión puede encadenar varias llamadas a ARCA (30 s de timeout cada
// una) más la espera del candado de numeración.
const OPCIONES = { secrets: [arcaCert, arcaKey, gmailAppPassword], timeoutSeconds: 300 };

async function exigirAdmin(request) {
  const email = request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : null;
  if (!email) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  if (!(await db.doc(`admins/${email}`).get()).exists) {
    throw new HttpsError('permission-denied', 'Sólo un admin puede facturar.');
  }
}

// Los errores de ARCA quedan en el doc de la factura; acá sólo se
// convierten los que cortan antes (configuración incompleta, validación).
async function envolver(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('failed-precondition', e.message);
  }
}

const resumen = (f) => ({
  estado: f.estado, numero: f.numero || null, cae: f.cae || null,
  errores: f.errores || null, incierto: !!f.incierto
});

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

exports.probarConexionArca = onCall(OPCIONES, async (request) => {
  await exigirAdmin(request);
  return envolver(async () => {
    const emisor = await obtenerEmisor();
    const servidores = await probarConexion(emisor);
    // Pedir el último número ejercita el certificado, el ticket de WSAA y
    // la delegación del punto de venta.
    const ultimaFactura = await ultimoAutorizado(emisor, TIPO_FACTURA_C);
    const ultimaNotaCredito = await ultimoAutorizado(emisor, TIPO_NC_C);
    return { ok: true, entorno: emisor.entorno, servidores, ultimaFactura, ultimaNotaCredito };
  });
});

exports.emitirFacturaManual = onCall(OPCIONES, async (request) => {
  await exigirAdmin(request);
  const d = request.data || {};

  const { receptor, error } = normalizarReceptor(d.receptor);
  if (error) throw new HttpsError('invalid-argument', error);

  const concepto = CONCEPTOS[d.concepto];
  if (!concepto) throw new HttpsError('invalid-argument', 'Concepto inválido.');

  const items = (Array.isArray(d.items) ? d.items : []).map((i) => ({
    descripcion: String(i?.descripcion || '').trim().slice(0, 300),
    cantidad: Number(i?.cantidad),
    precioUnitario: redondear(i?.precioUnitario)
  }));
  if (!items.length || items.length > 50) throw new HttpsError('invalid-argument', 'Cargá entre 1 y 50 ítems.');
  if (items.some((i) => !i.descripcion || !(i.cantidad > 0) || !(i.precioUnitario > 0))) {
    throw new HttpsError('invalid-argument', 'Cada ítem necesita descripción, cantidad y precio mayores a cero.');
  }
  const importeTotal = redondear(items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0));

  let servicioDesde = null;
  let servicioHasta = null;
  if (concepto !== CONCEPTOS.productos) {
    if (!ISO_FECHA.test(d.servicioDesde || '') || !ISO_FECHA.test(d.servicioHasta || '') || d.servicioDesde > d.servicioHasta) {
      throw new HttpsError('invalid-argument', 'Para servicios hace falta el período (desde y hasta).');
    }
    servicioDesde = d.servicioDesde.replace(/-/g, '');
    servicioHasta = d.servicioHasta.replace(/-/g, '');
  }

  const id = db.collection('facturas').doc().id;
  await crearFactura(id, {
    tipoCbte: TIPO_FACTURA_C,
    concepto,
    servicioDesde,
    servicioHasta,
    receptor,
    items,
    importeTotal,
    origen: { tipo: 'manual', referencia: String(d.referencia || '').trim().slice(0, 200) || null },
    enviarMail: !!d.enviarMail && !!receptor.email
  });
  const final = await envolver(() => emitirFactura(id));
  return { id, ...resumen(final) };
});

// Factura un cobro de Mercado Pago ya acreditado que no se facturó solo
// (por ejemplo, anterior a habilitar la facturación automática).
exports.facturarPagoMP = onCall(OPCIONES, async (request) => {
  await exigirAdmin(request);
  const paymentId = String(request.data?.paymentId || '');
  if (!/^\d+$/.test(paymentId)) throw new HttpsError('invalid-argument', 'Id de pago inválido.');
  const pago = await db.doc(`pagosMP/${paymentId}`).get();
  if (!pago.exists || !pago.data().aplicado) throw new HttpsError('not-found', 'No hay un cobro acreditado con ese id.');
  const final = await envolver(() => facturarPagoSuscripcion(paymentId, pago.data()));
  if (!final) throw new HttpsError('already-exists', 'Ese cobro ya tiene factura.');
  return { id: `mp_${paymentId}`, ...resumen(final) };
});

exports.reintentarFactura = onCall(OPCIONES, async (request) => {
  await exigirAdmin(request);
  const id = String(request.data?.id || '');
  const snap = id ? await db.doc(`facturas/${id}`).get() : null;
  if (!snap?.exists) throw new HttpsError('not-found', 'No existe esa factura.');
  if (!['error', 'pendiente', 'emitiendo'].includes(snap.data().estado)) {
    throw new HttpsError('failed-precondition', 'Esa factura ya está emitida.');
  }
  return resumen(await envolver(() => emitirFactura(id)));
});

exports.anularFactura = onCall(OPCIONES, async (request) => {
  await exigirAdmin(request);
  const id = String(request.data?.id || '');
  if (!id) throw new HttpsError('invalid-argument', 'Falta la factura.');
  return resumen(await envolver(() => crearNotaCredito(id)));
});

exports.descargarFacturaPDF = onCall(async (request) => {
  await exigirAdmin(request);
  const snap = await db.doc(`facturas/${String(request.data?.id || '')}`).get();
  if (!snap.exists || snap.data().estado !== 'emitida') throw new HttpsError('not-found', 'La factura no está emitida.');
  const f = snap.data();
  return { nombre: nombreArchivoFactura(f), base64: generarFacturaPDF(f).toString('base64') };
});

exports.reenviarFacturaMail = onCall({ secrets: [gmailAppPassword] }, async (request) => {
  await exigirAdmin(request);
  const id = String(request.data?.id || '');
  const ref = db.doc(`facturas/${id}`);
  const snap = id ? await ref.get() : null;
  if (!snap?.exists || snap.data().estado !== 'emitida') throw new HttpsError('not-found', 'La factura no está emitida.');
  const email = String(request.data?.email || snap.data().receptor.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError('invalid-argument', 'Falta un email válido.');
  if (email !== snap.data().receptor.email) await ref.update({ 'receptor.email': email });
  await enviarFacturaPorMail(id, { ...snap.data(), receptor: { ...snap.data().receptor, email } });
  const final = (await ref.get()).data();
  if (final.errorMail) throw new HttpsError('unavailable', `No se pudo enviar: ${final.errorMail}`);
  return { ok: true };
});
