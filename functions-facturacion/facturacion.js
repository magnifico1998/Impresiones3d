const { logger } = require('firebase-functions');
const { db, Timestamp, FieldValue } = require('./admin');
const { ErrorArca, ultimoAutorizado, consultarComprobante, solicitarCae } = require('./arca');
const { generarFacturaPDF, nombreArchivoFactura, numeroCompleto } = require('./facturaPDF');
const { enviarEmail } = require('./mailer');
const { renderPlantilla, obtenerOverridesPlantillas } = require('./emailTemplates');

// Facturación electrónica del admin (fase 1): el emisor es un único
// monotributista, así que siempre se emite Factura C (11) o Nota de
// Crédito C (13), sin IVA discriminado.
//
// Cada comprobante es un doc facturas/{id}. Estados:
//   pendiente -> emitiendo -> emitida
//                          -> error (se puede reintentar desde el panel)
//
// ARCA exige números correlativos por punto de venta y tipo, y rechaza un
// número salteado o repetido. Por eso:
//   - Se emite de a uno por punto de venta/tipo (candado en arcaNumeracion).
//   - El número se toma de ARCA (último autorizado + 1), no de un contador
//     propio que se pueda desincronizar con lo emitido a mano en el portal.
//   - Si un pedido queda "incierto" (timeout: no se sabe si ARCA lo
//     autorizó), antes de reintentar se consulta ese número: si ARCA ya lo
//     tiene con el mismo importe y receptor, se adopta; si no, se pide uno
//     nuevo. Así un reintento nunca duplica una factura.

const TIPO_FACTURA_C = 11;
const TIPO_NC_C = 13;
const CONCEPTOS = { productos: 1, servicios: 2, productosYServicios: 3 };

// Condiciones frente al IVA del receptor (tabla de ARCA,
// FEParamGetCondicionIvaReceptor) admitidas en comprobantes clase C.
const CONDICIONES_IVA = {
  1: 'IVA Responsable Inscripto',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo',
  13: 'Monotributista Social',
  15: 'IVA No Alcanzado'
};
const DOC_TIPOS = { CUIT: 80, DNI: 96, SIN_IDENTIFICAR: 99 };

// Cuánto dura el candado de numeración. Tiene que cubrir el peor caso de
// una emisión (ticket + último + CAE + consulta, cada uno con timeout de
// 30 s); si la función muere a mitad, vence solo.
const DURACION_CANDADO_MS = 3 * 60 * 1000;

// ------------------------------------------------------------ utilidades

const OFFSET_AR_MS = -3 * 60 * 60 * 1000;
// Fecha "YYYYMMDD" en hora argentina, el formato de fechas de WSFEv1.
function yyyymmddAR(ms) {
  return new Date(ms + OFFSET_AR_MS).toISOString().slice(0, 10).replace(/-/g, '');
}

const redondear = (n) => Math.round(Number(n) * 100) / 100;

// La ficha del suscriptor guarda la condición como texto libre (el
// checkout ofrece "Consumidor final", "Monotributo", "Responsable
// inscripto" y "Exento"; el panel admin permite tipearla).
function condicionIvaDesdeTexto(texto) {
  const t = String(texto || '').toLowerCase();
  if (t.includes('monotrib')) return 6;
  if (t.includes('inscript')) return 1;
  if (t.includes('exent')) return 4;
  return 5;
}

// Valida y normaliza un receptor. Devuelve { receptor } o { error }.
function normalizarReceptor(r) {
  const docTipo = Number(r?.docTipo);
  const docNro = String(r?.docNro || '').replace(/\D/g, '');
  const condicionIvaId = Number(r?.condicionIvaId);
  if (![80, 96, 99].includes(docTipo)) return { error: 'Tipo de documento inválido.' };
  if (docTipo === 80 && !/^\d{11}$/.test(docNro)) return { error: 'El CUIT tiene que tener 11 dígitos.' };
  if (docTipo === 96 && !/^\d{7,8}$/.test(docNro)) return { error: 'El DNI tiene que tener 7 u 8 dígitos.' };
  if (!CONDICIONES_IVA[condicionIvaId]) return { error: 'Condición frente al IVA inválida.' };
  // ARCA sólo acepta un receptor sin CUIT si es consumidor final.
  if (docTipo !== 80 && condicionIvaId !== 5) return { error: 'Para esa condición frente al IVA hace falta el CUIT.' };
  const email = String(r?.email || '').trim().toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'El email no es válido.' };
  return {
    receptor: {
      nombre: String(r?.nombre || '').trim().slice(0, 150),
      docTipo,
      docNro: docTipo === 99 ? '0' : docNro,
      condicionIvaId,
      condicionIvaTexto: CONDICIONES_IVA[condicionIvaId],
      domicilio: String(r?.domicilio || '').trim().slice(0, 200),
      email: email || null
    }
  };
}

// Receptor a partir de la ficha datosSuscriptor/{uid}. Nunca falla: si la
// ficha está incompleta, se factura a consumidor final para no frenar la
// facturación automática (queda la advertencia en el doc de la factura).
function receptorDesdeFicha(ficha, emailCuenta) {
  const advertencias = [];
  const tipoDoc = ficha?.tipoDocumento;
  const nro = String(ficha?.numeroDocumento || '');
  let docTipo = DOC_TIPOS.SIN_IDENTIFICAR;
  if (tipoDoc === 'CUIT' && /^\d{11}$/.test(nro)) docTipo = DOC_TIPOS.CUIT;
  else if (tipoDoc === 'DNI' && /^\d{7,8}$/.test(nro)) docTipo = DOC_TIPOS.DNI;
  else advertencias.push('La ficha del suscriptor no tiene un DNI/CUIT válido: se facturó a consumidor final sin identificar.');

  let condicionIvaId = condicionIvaDesdeTexto(ficha?.condicionImpositiva);
  if (condicionIvaId !== 5 && docTipo !== DOC_TIPOS.CUIT) {
    advertencias.push(`La ficha dice "${ficha?.condicionImpositiva}" pero no tiene CUIT: se facturó como consumidor final.`);
    condicionIvaId = 5;
  }
  const { receptor } = normalizarReceptor({
    nombre: [ficha?.nombre, ficha?.apellido].filter(Boolean).join(' '),
    docTipo,
    docNro: nro,
    condicionIvaId,
    domicilio: ficha?.localidad || '',
    email: ficha?.email || emailCuenta || ''
  });
  return { receptor, advertencias };
}

// ---------------------------------------------------------- configuración

// configFacturacion/emisor: la edita el admin desde el panel.
// Dónde viven las facturas y la configuración de cada emisor:
//   - admin (cuentaUid null): facturas/ y configFacturacion/emisor.
//   - suscriptor: users/{uid}/facturas y users/{uid}/facturacion/config.
function refsCuenta(cuentaUid) {
  return cuentaUid
    ? { facturas: db.collection(`users/${cuentaUid}/facturas`), config: db.doc(`users/${cuentaUid}/facturacion/config`) }
    : { facturas: db.collection('facturas'), config: db.doc('configFacturacion/emisor') };
}

// Entorno de ARCA en uso: lo define la configuración del admin, porque el
// certificado cargado (ARCA_CERT) es uno solo y firma por todos los
// emisores (los suscriptores delegan el servicio al CUIT del admin).
async function entornoArca() {
  const snap = await db.doc('configFacturacion/emisor').get();
  return snap.exists && snap.data().entorno === 'produccion' ? 'produccion' : 'homologacion';
}

// Valida y devuelve los datos de un emisor. `c` puede venir ya leído
// (configurarFacturacionCuenta lo valida antes de guardarlo).
function validarEmisor(c) {
  const faltan = [];
  if (!/^\d{11}$/.test(String(c.cuit || ''))) faltan.push('CUIT');
  if (!(Number(c.ptoVta) > 0)) faltan.push('punto de venta');
  if (!c.razonSocial) faltan.push('razón social');
  if (!c.domicilio) faltan.push('domicilio');
  if (!c.inicioActividades) faltan.push('inicio de actividades');
  if (faltan.length) {
    throw new ErrorArca(`Falta completar la configuración de facturación: ${faltan.join(', ')}.`);
  }
  return { ...c, cuit: String(c.cuit), ptoVta: Number(c.ptoVta) };
}

async function obtenerEmisor(cuentaUid = null) {
  const snap = await refsCuenta(cuentaUid).config.get();
  const emisor = validarEmisor(snap.exists ? snap.data() : {});
  return { ...emisor, entorno: await entornoArca() };
}

// ---------------------------------------------------------------- candado

async function tomarCandado(clave, facturaId) {
  const ref = db.doc(`arcaNumeracion/${clave}`);
  for (let intento = 0; intento < 20; intento++) {
    const tomado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const hasta = snap.exists ? snap.data().bloqueadoHasta?.toMillis() || 0 : 0;
      if (hasta > Date.now()) return false;
      tx.set(ref, { bloqueadoHasta: Timestamp.fromMillis(Date.now() + DURACION_CANDADO_MS), por: facturaId }, { merge: true });
      return true;
    });
    if (tomado) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new ErrorArca('Hay otra emisión en curso para ese punto de venta. Probá de nuevo en unos minutos.', { incierto: false });
}

async function soltarCandado(clave, facturaId) {
  const ref = db.doc(`arcaNumeracion/${clave}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().por === facturaId) tx.update(ref, { bloqueadoHasta: Timestamp.fromMillis(0) });
  });
}

// ----------------------------------------------------------------- emisión

// Crea el doc de la factura en estado "pendiente". Si ya existe (por
// ejemplo, el mismo pago procesado dos veces) no hace nada: el id es el
// candado de idempotencia. Devuelve true si la creó.
// datos.cuentaUid: null para el admin, uid de la cuenta para un suscriptor.
async function crearFactura(ref, datos) {
  try {
    await ref.create({
      cuentaUid: null,
      ...datos,
      importeTotal: redondear(datos.importeTotal),
      estado: 'pendiente',
      creadoEl: Timestamp.now()
    });
    return true;
  } catch (e) {
    if (e.code === 6) return false; // ALREADY_EXISTS
    throw e;
  }
}

function armarDetalle(f, numero, fecha) {
  const det = {
    Concepto: f.concepto,
    DocTipo: f.receptor.docTipo,
    DocNro: f.receptor.docNro,
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: fecha,
    ImpTotal: f.importeTotal.toFixed(2),
    ImpTotConc: '0.00',
    ImpNeto: f.importeTotal.toFixed(2),
    ImpOpEx: '0.00',
    ImpTrib: '0.00',
    ImpIVA: '0.00'
  };
  if (f.concepto !== CONCEPTOS.productos) {
    det.FchServDesde = f.servicioDesde;
    det.FchServHasta = f.servicioHasta;
    // Ya cobrado: vence el mismo día de emisión.
    det.FchVtoPago = fecha;
  }
  det.MonId = 'PES';
  det.MonCotiz = 1;
  det.CondicionIVAReceptorId = f.receptor.condicionIvaId;
  if (f.asociada) {
    det.CbtesAsoc = {
      CbteAsoc: {
        Tipo: f.asociada.tipoCbte,
        PtoVta: f.asociada.ptoVta,
        Nro: f.asociada.numero,
        Cuit: f.emisor.cuit,
        CbteFch: f.asociada.fecha
      }
    };
  }
  return det;
}

// ¿El comprobante que ARCA tiene con ese número es el de esta factura?
const coincide = (cbte, f) =>
  cbte && cbte.resultado === 'A' &&
  Math.abs(cbte.importeTotal - f.importeTotal) < 0.01 &&
  String(Number(cbte.docNro)) === String(Number(f.receptor.docNro));

// Emite (o reintenta) la factura del doc `ref`. No tira errores de ARCA:
// los deja registrados en el doc (estado "error"). Devuelve el doc final.
async function emitirFactura(ref) {
  const id = ref.path;
  const inicial = await ref.get();
  if (!inicial.exists) throw new Error(`No existe la factura ${id}.`);
  if (inicial.data().estado === 'emitida') return inicial.data();

  const tipoCbte = inicial.data().tipoCbte;
  let emisor;
  let clave;
  try {
    emisor = await obtenerEmisor(inicial.data().cuentaUid || null);
    // Por CUIT: cada emisor numera por su cuenta en ARCA.
    clave = `${emisor.entorno}_${emisor.cuit}_${emisor.ptoVta}_${tipoCbte}`;
    await tomarCandado(clave, id);
  } catch (e) {
    // Todavía no se tocó ARCA: queda en error para reintentar, sin número.
    await ref.update({ estado: 'error', errores: [{ codigo: 'local', mensaje: e.message }] });
    logger.error(`facturacion: no se pudo empezar a emitir ${id}`, e.message);
    const conError = (await ref.get()).data();
    await actualizarResumenPedido(ref, conError);
    return conError;
  }
  try {
    // Se relee con el candado tomado: otra ejecución pudo haberla emitido.
    const f = (await ref.get()).data();
    if (f.estado === 'emitida') return f;
    const fEmisor = { ...f, emisor: f.emisor || emisor };

    // Intento anterior incierto: primero ver si ARCA ya lo autorizó.
    if (f.numero && f.entorno === emisor.entorno && f.ptoVta === emisor.ptoVta && (!f.emisor || f.emisor.cuit === emisor.cuit)) {
      const previo = await consultarComprobante(emisor, tipoCbte, f.numero);
      if (coincide(previo, fEmisor)) {
        await ref.update({
          estado: 'emitida', cae: previo.cae, caeVto: previo.caeVto, fecha: previo.fecha,
          errores: FieldValue.delete(), incierto: FieldValue.delete(), emitidaEl: Timestamp.now()
        });
        logger.info(`facturacion: ${id} ya estaba autorizada en ARCA (número ${f.numero}), se adopta.`);
        return (await ref.get()).data();
      }
    }

    const numero = (await ultimoAutorizado(emisor, tipoCbte)) + 1;
    const fecha = yyyymmddAR(Date.now());
    // Se guarda el número ANTES de pedir el CAE: si el pedido queda en el
    // aire, el reintento sabe qué número consultar.
    await ref.update({
      estado: 'emitiendo', numero, fecha, ptoVta: emisor.ptoVta, entorno: emisor.entorno,
      emisor: {
        cuit: emisor.cuit, razonSocial: emisor.razonSocial, domicilio: emisor.domicilio,
        iibb: emisor.iibb || '', inicioActividades: emisor.inicioActividades,
        nombreFantasia: emisor.nombreFantasia || '', emailRespuesta: emisor.emailRespuesta || ''
      },
      intentos: FieldValue.increment(1)
    });

    const resp = await solicitarCae(emisor, tipoCbte, armarDetalle({ ...f, emisor }, numero, fecha));
    if (resp.aprobado) {
      await ref.update({
        estado: 'emitida', cae: resp.cae, caeVto: resp.caeVto, observaciones: resp.observaciones,
        errores: FieldValue.delete(), incierto: FieldValue.delete(), emitidaEl: Timestamp.now()
      });
    } else {
      // Rechazado: el número no se consumió, el próximo intento pide otro.
      await ref.update({ estado: 'error', errores: resp.errores, numero: FieldValue.delete(), incierto: false });
      logger.warn(`facturacion: ARCA rechazó ${id}`, resp.errores);
    }
  } catch (e) {
    const errores = e.errores?.length ? e.errores : [{ codigo: 'local', mensaje: e.message }];
    // Si no es incierto, el número guardado no llegó a ARCA: se descarta.
    await ref.update({
      estado: 'error', errores, incierto: !!e.incierto,
      ...(e.incierto ? {} : { numero: FieldValue.delete() })
    });
    logger.error(`facturacion: error emitiendo ${id}`, e.message);
  } finally {
    await soltarCandado(clave, id);
  }

  const final = (await ref.get()).data();
  await actualizarResumenPedido(ref, final);
  if (final.estado === 'emitida' && final.enviarMail && final.receptor.email) {
    await enviarFacturaPorMail(ref, final);
  }
  return final;
}

// Facturas de pedidos de un suscriptor: se refleja el estado en
// users/{uid}/facturasPorPedido/{pedidoId}, que es lo que muestra la app en
// el pedido. Va en un doc aparte y no en el pedido porque el detalle del
// pedido guarda su borrador completo y podría pisar este dato.
async function actualizarResumenPedido(ref, f) {
  if (!f.cuentaUid) return;
  const base = `users/${f.cuentaUid}/facturasPorPedido`;
  if (f.origen?.tipo === 'pedido') {
    await db.doc(`${base}/${f.origen.pedidoId}`).set({
      facturaId: ref.id, estado: f.estado, numero: f.numero || null, ptoVta: f.ptoVta || null,
      importeTotal: f.importeTotal, errores: f.errores || null, actualizadoEl: Timestamp.now()
    }, { merge: true });
  } else if (f.origen?.tipo === 'notaCredito' && f.origen.pedidoId) {
    // La factura queda "anulada" recién cuando ARCA autoriza la nota; si
    // la nota falla, se ve su error para reintentarla.
    await db.doc(`${base}/${f.origen.pedidoId}`).set({
      notaCreditoId: ref.id, notaCreditoEstado: f.estado, notaCreditoNumero: f.numero || null,
      notaCreditoErrores: f.errores || null,
      ...(f.estado === 'emitida' ? { estado: 'anulada' } : {}),
      actualizadoEl: Timestamp.now()
    }, { merge: true });
  }
}

const formatoPesos = (n) => '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function enviarFacturaPorMail(ref, f) {
  try {
    const nombreCbte = `${f.tipoCbte === TIPO_NC_C ? 'Nota de Crédito' : 'Factura'} C ${numeroCompleto(f.ptoVta, f.numero)}`;
    const overrides = await obtenerOverridesPlantillas();
    const adjunto = [{ filename: nombreArchivoFactura(f), content: generarFacturaPDF(f) }];
    if (f.cuentaUid) {
      // Factura de un suscriptor a su cliente: sale de la casilla de
      // Manager3D con el nombre del emprendimiento, y las respuestas le
      // llegan al suscriptor.
      const emprendimiento = f.emisor.nombreFantasia || f.emisor.razonSocial;
      const { subject, html } = renderPlantilla('facturaEmprendimiento', {
        nombre: f.receptor.nombre || '', comprobante: nombreCbte, importe: formatoPesos(f.importeTotal), emprendimiento
      }, overrides);
      await enviarEmail({
        to: f.receptor.email, subject, html, attachments: adjunto,
        fromName: `${emprendimiento} vía Manager3D`, replyTo: f.emisor.emailRespuesta || undefined
      });
    } else {
      const { subject, html } = renderPlantilla('facturaEmitida', {
        nombre: f.receptor.nombre || '', comprobante: nombreCbte, importe: formatoPesos(f.importeTotal)
      }, overrides);
      await enviarEmail({ to: f.receptor.email, subject, html, attachments: adjunto });
    }
    await ref.update({ mailEnviadoEl: Timestamp.now(), errorMail: FieldValue.delete() });
  } catch (e) {
    // La factura ya es válida; un mail fallido no la invalida.
    logger.error(`facturacion: no se pudo mandar el mail de ${ref.path}`, e.message);
    await ref.update({ errorMail: e.message });
  }
}

// --------------------------------------------------- casos de facturación

// Factura de un cobro de suscripción acreditado por Mercado Pago
// (pagosMP/{paymentId} con aplicado = true). Id fijo "mp_{paymentId}".
async function facturarPagoSuscripcion(paymentId, pago) {
  const ref = db.doc(`facturas/mp_${paymentId}`);
  const [fichaSnap, subSnap, planSnap] = await Promise.all([
    db.doc(`datosSuscriptor/${pago.uid}`).get(),
    db.doc(`users/${pago.uid}/suscripcion/actual`).get(),
    db.doc(`planes/${pago.planId}`).get()
  ]);
  const sub = subSnap.exists ? subSnap.data() : {};
  const { receptor, advertencias } = receptorDesdeFicha(fichaSnap.exists ? fichaSnap.data() : null, sub.email);

  // Período del servicio: el ciclo que pagó este cobro. Si la suscripción
  // ya avanzó a otro ciclo, se usa desde la fecha de pago.
  const cicloFin = pago.cicloFin?.toMillis?.() || Date.now();
  const cicloInicio = sub.cicloFin?.toMillis?.() === cicloFin && sub.cicloInicio
    ? sub.cicloInicio.toMillis()
    : pago.fecha.toMillis();
  const servicioDesde = yyyymmddAR(cicloInicio);
  const servicioHasta = yyyymmddAR(Math.max(cicloInicio, cicloFin - 24 * 60 * 60 * 1000));
  const nombrePlan = planSnap.exists ? planSnap.data().nombre : pago.planId;

  const creada = await crearFactura(ref, {
    tipoCbte: TIPO_FACTURA_C,
    concepto: CONCEPTOS.servicios,
    servicioDesde,
    servicioHasta,
    receptor,
    items: [{ descripcion: `Suscripción Manager3D - Plan ${nombrePlan}`, cantidad: 1, precioUnitario: redondear(pago.monto) }],
    importeTotal: pago.monto,
    origen: { tipo: 'suscripcionMP', uid: pago.uid, paymentId: String(paymentId), planId: pago.planId },
    advertencias,
    enviarMail: true
  });
  if (!creada) return null;
  return emitirFactura(ref);
}

// Nota de crédito C por el total de una factura emitida (anulación). La
// nota va en la misma colección que la factura (del admin o de la cuenta).
async function crearNotaCredito(origenRef) {
  const facturaId = origenRef.id;
  const ncRef = origenRef.parent.doc();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(origenRef);
    if (!snap.exists) throw new ErrorArca('No existe la factura.');
    const f = snap.data();
    if (f.estado !== 'emitida' || f.tipoCbte !== TIPO_FACTURA_C) throw new ErrorArca('Sólo se puede anular una factura emitida.');
    if (f.notaCreditoId) throw new ErrorArca('Esa factura ya tiene una nota de crédito.');
    tx.set(ncRef, {
      cuentaUid: f.cuentaUid || null,
      tipoCbte: TIPO_NC_C,
      concepto: f.concepto,
      servicioDesde: f.servicioDesde || null,
      servicioHasta: f.servicioHasta || null,
      receptor: f.receptor,
      items: f.items,
      descuento: f.descuento || 0,
      importeTotal: f.importeTotal,
      asociada: { facturaId, tipoCbte: f.tipoCbte, ptoVta: f.ptoVta, numero: f.numero, fecha: f.fecha },
      origen: { tipo: 'notaCredito', facturaId, pedidoId: f.origen?.pedidoId || null },
      enviarMail: !!f.enviarMail,
      estado: 'pendiente',
      creadoEl: Timestamp.now()
    });
    tx.update(origenRef, { notaCreditoId: ncRef.id });
  });
  return emitirFactura(ncRef);
}

module.exports = {
  TIPO_FACTURA_C, TIPO_NC_C, CONCEPTOS, CONDICIONES_IVA,
  yyyymmddAR, redondear, normalizarReceptor, refsCuenta, entornoArca, validarEmisor, obtenerEmisor,
  crearFactura, emitirFactura, enviarFacturaPorMail, facturarPagoSuscripcion, crearNotaCredito
};
