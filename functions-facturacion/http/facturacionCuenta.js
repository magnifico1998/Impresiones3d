const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp } = require('../admin');
const { arcaCert, arcaKey, ultimoAutorizado, puntosDeVenta } = require('../arca');
const { gmailAppPassword } = require('../mailer');
const { generarFacturaPDF, nombreArchivoFactura } = require('../facturaPDF');
const {
  TIPO_FACTURA_C, CONCEPTOS, redondear, normalizarReceptor, refsCuenta, entornoArca,
  validarEmisor, crearFactura, emitirFactura, enviarFacturaPorMail, crearNotaCredito
} = require('../facturacion');

// Facturación electrónica de los suscriptores (fase 2): cada cuenta factura
// sus pedidos con su propio CUIT. El suscriptor delega en ARCA el servicio
// de Facturación Electrónica al CUIT del admin, y el certificado de
// Manager3D firma por él (Auth.Cuit = CUIT del suscriptor). Sólo Factura C
// (monotributistas).
//
// Como la delegación es a Manager3D y no a una cuenta en particular, un
// CUIT queda reservado para la primera cuenta que lo configura
// (cuitsFacturacion/{cuit}): si no, otro suscriptor podría cargar un CUIT
// ajeno que ya delegó y facturar en su nombre.

const OPCIONES = { secrets: [arcaCert, arcaKey, gmailAppPassword], timeoutSeconds: 300 };
const ESTADOS_QUE_ESCRIBEN = ['activa', 'trial'];
const MAX_ITEMS = 30;

// Cuenta sobre la que actúa quien llama: la propia o, si es un miembro
// invitado activo, la del dueño (mismo criterio que registrarUltimoAcceso
// y esMiembroActivo en firestore.rules).
async function resolverCuenta(request, { soloDuenio = false } = {}) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  const email = request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : null;
  let cuentaUid = uid;
  if (email) {
    const inv = await db.doc(`invitacionesMiembro/${email}`).get();
    if (inv.exists && inv.data().estado === 'activo') {
      if (soloDuenio) throw new HttpsError('permission-denied', 'Sólo el dueño de la cuenta puede configurar la facturación.');
      cuentaUid = inv.data().ownerUid;
    }
  }
  return { uid, cuentaUid };
}

// El plan tiene que tener la facturación activada (planes/{id}.
// facturacionElectronica, se prende desde el panel admin) y, para emitir,
// la cuenta no puede estar en modo lectura ni bloqueada.
async function exigirFacturacionHabilitada(cuentaUid, { paraEscribir = true } = {}) {
  const sub = await db.doc(`users/${cuentaUid}/suscripcion/actual`).get();
  const datos = sub.exists ? sub.data() : {};
  if (paraEscribir && !ESTADOS_QUE_ESCRIBEN.includes(datos.estado)) {
    throw new HttpsError('failed-precondition', 'Tu cuenta está en modo lectura o bloqueada: renová el plan para poder facturar.');
  }
  const plan = datos.planId ? await db.doc(`planes/${datos.planId}`).get() : null;
  if (!plan?.exists || !plan.data().facturacionElectronica) {
    throw new HttpsError('failed-precondition', 'Tu plan no incluye facturación electrónica.');
  }
}

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

// Dígito verificador del CUIT (módulo 11): evita guardar uno mal tipeado.
function cuitValido(cuit) {
  if (!/^\d{11}$/.test(cuit)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(cuit[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(cuit[10]);
}

// Traduce los errores de ARCA más comunes al configurar a algo accionable.
function mensajeConfiguracion(e, cuitAdmin) {
  const texto = `${e.message} ${(e.errores || []).map((x) => x.mensaje).join(' ')}`.toLowerCase();
  if (texto.includes('relacion') || texto.includes('no autorizado') || texto.includes('600')) {
    return `ARCA todavía no tiene la delegación: en "Administrador de Relaciones de Clave Fiscal" delegá el servicio "Facturación Electrónica" al CUIT ${cuitAdmin || 'de Manager3D'}. Puede tardar unos minutos en impactar.`;
  }
  return e.message;
}

exports.configurarFacturacionCuenta = onCall(OPCIONES, async (request) => {
  const { cuentaUid } = await resolverCuenta(request, { soloDuenio: true });
  await exigirFacturacionHabilitada(cuentaUid);
  const d = request.data || {};
  const texto = (v, max) => String(v || '').trim().slice(0, max);

  const config = {
    cuit: String(d.cuit || '').replace(/\D/g, ''),
    ptoVta: Number(d.ptoVta),
    razonSocial: texto(d.razonSocial, 120),
    nombreFantasia: texto(d.nombreFantasia, 120),
    domicilio: texto(d.domicilio, 200),
    iibb: texto(d.iibb, 40),
    inicioActividades: texto(d.inicioActividades, 10),
    emailRespuesta: texto(d.emailRespuesta, 120).toLowerCase()
  };
  if (!cuitValido(config.cuit)) throw new HttpsError('invalid-argument', 'El CUIT no es válido (revisá los 11 dígitos).');
  if (!Number.isInteger(config.ptoVta) || config.ptoVta < 1 || config.ptoVta > 99998) {
    throw new HttpsError('invalid-argument', 'El punto de venta tiene que ser un número entre 1 y 99998.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.inicioActividades)) {
    throw new HttpsError('invalid-argument', 'Falta la fecha de inicio de actividades.');
  }
  if (config.emailRespuesta && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.emailRespuesta)) {
    throw new HttpsError('invalid-argument', 'El email para respuestas no es válido.');
  }
  try {
    validarEmisor(config);
  } catch (e) {
    throw new HttpsError('invalid-argument', e.message);
  }

  const { config: configRef } = refsCuenta(cuentaUid);
  const anterior = await configRef.get();
  const cuitAnterior = anterior.exists ? anterior.data().cuit : null;

  // Reserva del CUIT para esta cuenta (y libera el anterior si cambió).
  await db.runTransaction(async (tx) => {
    const reservaRef = db.doc(`cuitsFacturacion/${config.cuit}`);
    const reserva = await tx.get(reservaRef);
    if (reserva.exists && reserva.data().uid !== cuentaUid) {
      throw new HttpsError('already-exists', 'Ese CUIT ya está configurado en otra cuenta de Manager3D. Si es tuyo, escribinos para revisarlo.');
    }
    if (cuitAnterior && cuitAnterior !== config.cuit) {
      const viejaRef = db.doc(`cuitsFacturacion/${cuitAnterior}`);
      const vieja = await tx.get(viejaRef);
      if (vieja.exists && vieja.data().uid === cuentaUid) tx.delete(viejaRef);
    }
    tx.set(reservaRef, { uid: cuentaUid, reservadoEl: Timestamp.now() });
    tx.set(configRef, { ...config, verificado: false, actualizadoEl: Timestamp.now() });
  });

  // Verificación contra ARCA: delegación (el pedido pasa o no) y punto de
  // venta Web Services existente.
  const entorno = await entornoArca();
  const emisor = { ...config, entorno };
  const adminSnap = await db.doc('configFacturacion/emisor').get();
  const cuitAdmin = adminSnap.exists ? adminSnap.data().cuit : null;
  try {
    const ptos = await puntosDeVenta(emisor);
    const activos = ptos.filter((p) => !p.bloqueado && !p.baja);
    // En homologación ARCA no lista puntos de venta: se saltea el chequeo.
    if (entorno === 'produccion' && !activos.some((p) => p.numero === config.ptoVta)) {
      const disponibles = activos.map((p) => p.numero).join(', ');
      throw new Error(disponibles
        ? `El punto de venta ${config.ptoVta} no está habilitado para Web Services. Tus puntos de venta Web Services son: ${disponibles}.`
        : `No encontramos puntos de venta Web Services en tu CUIT. Creá uno en ARCA ("Administración de puntos de venta y domicilios", sistema "Factura Electrónica - Monotributo - Web Services").`);
    }
    const ultimaFactura = await ultimoAutorizado(emisor, TIPO_FACTURA_C);
    await configRef.update({ verificado: true, verificadoEl: Timestamp.now(), errorVerificacion: null });
    return { ok: true, ultimaFactura };
  } catch (e) {
    const mensaje = mensajeConfiguracion(e, cuitAdmin);
    await configRef.update({ verificado: false, errorVerificacion: mensaje });
    return { ok: false, mensaje };
  }
});

exports.facturarPedido = onCall(OPCIONES, async (request) => {
  const { uid, cuentaUid } = await resolverCuenta(request);
  await exigirFacturacionHabilitada(cuentaUid);
  const d = request.data || {};

  const pedidoId = String(d.pedidoId || '');
  const pedido = pedidoId ? await db.doc(`users/${cuentaUid}/pedidos/${pedidoId}`).get() : null;
  if (!pedido?.exists) throw new HttpsError('not-found', 'No existe ese pedido.');
  if (['cancelado', 'en_verificacion'].includes(pedido.data().estado)) {
    throw new HttpsError('failed-precondition', 'No se puede facturar un pedido cancelado o sin confirmar.');
  }

  const config = await refsCuenta(cuentaUid).config.get();
  if (!config.exists || !config.data().verificado) {
    throw new HttpsError('failed-precondition', 'Primero configurá y verificá la facturación en Configuración → Facturación electrónica.');
  }

  const { receptor, error } = normalizarReceptor(d.receptor);
  if (error) throw new HttpsError('invalid-argument', error);

  const items = (Array.isArray(d.items) ? d.items : []).map((i) => ({
    descripcion: String(i?.descripcion || '').trim().slice(0, 300),
    cantidad: Number(i?.cantidad),
    precioUnitario: redondear(i?.precioUnitario)
  }));
  if (!items.length || items.length > MAX_ITEMS) throw new HttpsError('invalid-argument', `Cargá entre 1 y ${MAX_ITEMS} ítems.`);
  if (items.some((i) => !i.descripcion || !(i.cantidad > 0) || !(i.precioUnitario > 0))) {
    throw new HttpsError('invalid-argument', 'Cada ítem necesita descripción, cantidad y precio mayores a cero.');
  }
  const subtotal = redondear(items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0));
  const descuento = redondear(Math.max(0, Number(d.descuento) || 0));
  const importeTotal = redondear(subtotal - descuento);
  if (!(importeTotal > 0)) throw new HttpsError('invalid-argument', 'El total a facturar tiene que ser mayor a cero.');

  // Una factura vigente por pedido. El resumen es a la vez el candado: si
  // hay una emitida o en curso no se crea otra; si la anterior se anuló con
  // nota de crédito, se puede volver a facturar.
  const { facturas } = refsCuenta(cuentaUid);
  const ref = facturas.doc();
  const resumenRef = db.doc(`users/${cuentaUid}/facturasPorPedido/${pedidoId}`);
  await db.runTransaction(async (tx) => {
    const r = await tx.get(resumenRef);
    const estado = r.exists ? r.data().estado : null;
    if (['emitida', 'emitiendo', 'pendiente'].includes(estado)) {
      throw new HttpsError('already-exists', 'Este pedido ya tiene una factura.');
    }
    if (estado === 'error') {
      throw new HttpsError('failed-precondition', 'Este pedido tiene una factura con error: reintentala o descartala antes de hacer otra.');
    }
    tx.set(resumenRef, { facturaId: ref.id, estado: 'pendiente', importeTotal, actualizadoEl: Timestamp.now() });
  });

  try {
    await crearFactura(ref, {
      cuentaUid,
      tipoCbte: TIPO_FACTURA_C,
      concepto: CONCEPTOS.productos,
      receptor,
      items,
      descuento,
      importeTotal,
      origen: { tipo: 'pedido', pedidoId, cliente: String(pedido.data().cliente || '') },
      creadoPor: uid,
      enviarMail: !!d.enviarMail && !!receptor.email
    });
  } catch (e) {
    // Sin factura creada, el resumen "pendiente" dejaría el pedido trabado.
    await resumenRef.delete();
    throw e;
  }
  const final = await envolver(() => emitirFactura(ref));
  return { id: ref.id, ...resumen(final) };
});

// Lee una factura de la cuenta de quien llama.
async function facturaDeLaCuenta(request, opciones) {
  const { cuentaUid } = await resolverCuenta(request);
  const id = String(request.data?.id || '');
  if (!id) throw new HttpsError('invalid-argument', 'Falta la factura.');
  const ref = refsCuenta(cuentaUid).facturas.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No existe esa factura.');
  if (opciones?.paraEscribir !== false) await exigirFacturacionHabilitada(cuentaUid);
  return { cuentaUid, ref, f: snap.data() };
}

exports.reintentarFacturaCuenta = onCall(OPCIONES, async (request) => {
  const { ref, f } = await facturaDeLaCuenta(request);
  if (f.estado === 'emitida') throw new HttpsError('failed-precondition', 'Esa factura ya está emitida.');
  if (f.estado === 'descartada') throw new HttpsError('failed-precondition', 'Esa factura se descartó.');
  return resumen(await envolver(() => emitirFactura(ref)));
});

// Descarta una factura que quedó en error, para poder hacer otra. No se
// permite si el último intento quedó "incierto" (ARCA podría haberla
// autorizado): en ese caso hay que reintentar, que primero lo consulta.
exports.descartarFacturaCuenta = onCall(OPCIONES, async (request) => {
  const { cuentaUid, ref, f } = await facturaDeLaCuenta(request);
  if (f.estado !== 'error') throw new HttpsError('failed-precondition', 'Sólo se puede descartar una factura con error.');
  if (f.incierto) throw new HttpsError('failed-precondition', 'No sabemos si ARCA la llegó a autorizar: tocá Reintentar, que primero lo verifica.');
  await ref.update({ estado: 'descartada', descartadaEl: Timestamp.now() });
  if (f.origen?.tipo === 'pedido') {
    const resumenRef = db.doc(`users/${cuentaUid}/facturasPorPedido/${f.origen.pedidoId}`);
    const r = await resumenRef.get();
    if (r.exists && r.data().facturaId === ref.id) await resumenRef.delete();
  }
  return { ok: true };
});

exports.anularFacturaCuenta = onCall(OPCIONES, async (request) => {
  const { ref } = await facturaDeLaCuenta(request);
  return resumen(await envolver(() => crearNotaCredito(ref)));
});

exports.descargarFacturaCuentaPDF = onCall(async (request) => {
  const { f } = await facturaDeLaCuenta(request, { paraEscribir: false });
  if (f.estado !== 'emitida') throw new HttpsError('failed-precondition', 'La factura no está emitida.');
  return { nombre: nombreArchivoFactura(f), base64: generarFacturaPDF(f).toString('base64') };
});

exports.enviarFacturaCuentaMail = onCall({ secrets: [gmailAppPassword] }, async (request) => {
  const { ref, f } = await facturaDeLaCuenta(request);
  if (f.estado !== 'emitida') throw new HttpsError('failed-precondition', 'La factura no está emitida.');
  const email = String(request.data?.email || f.receptor.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError('invalid-argument', 'Falta un email válido.');
  if (email !== f.receptor.email) await ref.update({ 'receptor.email': email });
  await enviarFacturaPorMail(ref, { ...f, receptor: { ...f.receptor, email } });
  const final = (await ref.get()).data();
  if (final.errorMail) throw new HttpsError('unavailable', `No se pudo enviar: ${final.errorMail}`);
  return { ok: true };
});

