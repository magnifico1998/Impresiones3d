const { logger } = require('firebase-functions');
const {
  db, Timestamp, FieldValue, DIA_MS, DIAS_GRACIA_DEBITO_AUTOMATICO,
  sumarMesCalendario, formatearFecha, calcularCicloActivacion, obtenerContactoRevendedor
} = require('./admin');
const { pctComision, armarVentaLedger } = require('./ledgerRevendedor');
const { mpFetch, obtenerMpUserIdPlataforma, tokenDelCobrador, parsearReferencia } = require('./mercadopago');

// Procesamiento de suscripciones y cobros de Mercado Pago. Lo usan tanto el
// webhook (webhookMercadoPago.js, cuando Mercado Pago avisa) como la
// sincronización manual (sincronizarSuscripcionMP en pagosMercadoPago.js,
// cuando el suscriptor vuelve del checkout), así el plan se activa aunque el
// aviso no llegue. Todo se revalida contra la API de Mercado Pago, y cada
// pago se aplica una única vez sin importar cuántas veces se procese
// (pagosMP/{paymentId}).
//   - Suscripción (preapproval): el suscriptor la autorizó, la pausó o la
//     canceló -> se refleja en suscripcion/actual.cobro. NO activa el plan.
//   - Cobro mensual (authorized_payment): si quedó aprobado, activa/renueva
//     el plan y, si la cuenta es de un revendedor, registra su comisión en
//     el ledger del mes.

// Revendedor al que se le atribuye un pago, con las lecturas hechas dentro
// de la transacción. Mismo criterio que "activar" en
// cambiarEstadoSuscripcion.js: si la cuenta ya está vinculada sigue siendo
// de ese revendedor; si no, se vincula al código que cargó en su
// solicitud de contacto (si está activo).
async function resolverRevendedorEnTx(tx, uid, datos) {
  if (datos.revendedorUid) {
    let codigo = datos.revendedorCodigo || null;
    if (!codigo) {
      const rev = await tx.get(db.collection('revendedores').where('uid', '==', datos.revendedorUid).limit(1));
      codigo = rev.empty ? null : rev.docs[0].id;
    }
    const revSnap = codigo ? await tx.get(db.doc(`revendedores/${codigo}`)) : null;
    return { uid: datos.revendedorUid, codigo, datos: revSnap?.exists ? revSnap.data() : null, vinculacionNueva: false };
  }
  const solicitud = await tx.get(db.doc(`solicitudesContacto/${uid}`));
  const codigo = solicitud.exists ? (solicitud.data().codigoRevendedor || null) : null;
  if (!codigo) return null;
  const revSnap = await tx.get(db.doc(`revendedores/${codigo}`));
  if (!revSnap.exists || !revSnap.data().activo) return null;
  return { uid: revSnap.data().uid, codigo, datos: revSnap.data(), vinculacionNueva: true };
}

// Un débito automático que llega poco después de cicloFin (dentro de la
// gracia, con la cuenta todavía activa) es la renovación normal del mes:
// el ciclo sigue desde cicloFin, así la fecha de corte no se corre unos
// días cada mes. Cualquier otro caso usa la regla general de "activar".
function cicloParaPago(datos, ahora) {
  const atrasoMs = datos.cicloFin ? ahora.toMillis() - datos.cicloFin.toMillis() : null;
  if (datos.estado === 'activa' && atrasoMs !== null && atrasoMs >= 0 && atrasoMs <= DIAS_GRACIA_DEBITO_AUTOMATICO * DIA_MS) {
    return {
      cicloInicio: datos.cicloFin,
      cicloId: formatearFecha(datos.cicloFin),
      cicloFin: sumarMesCalendario(datos.cicloFin)
    };
  }
  return calcularCicloActivacion(datos, ahora);
}

async function acreditarPago({ uid, planId, paymentId, preapprovalId, monto, mpUserId }) {
  const ahora = Timestamp.now();
  const pagoRef = db.doc(`pagosMP/${paymentId}`);
  const subRef = db.doc(`users/${uid}/suscripcion/actual`);

  const resultado = await db.runTransaction(async (tx) => {
    const pagoSnap = await tx.get(pagoRef);
    if (pagoSnap.exists) return { duplicado: true };

    const registroPago = { uid, planId, preapprovalId, monto, mpUserId, fecha: ahora };
    const subSnap = await tx.get(subRef);
    if (!subSnap.exists) {
      // Queda registrado (no se reintenta en loop) para resolverlo a mano.
      tx.set(pagoRef, { ...registroPago, aplicado: false, motivo: 'La cuenta no tiene suscripcion/actual.' });
      return { aplicado: false };
    }
    const datos = subSnap.data();
    const revendedor = await resolverRevendedorEnTx(tx, uid, datos);
    const pct = revendedor?.codigo ? pctComision(revendedor.datos, planId) : 0;

    const update = {
      estado: 'activa',
      planId,
      ...cicloParaPago(datos, ahora),
      fechaLimiteLectura: FieldValue.delete()
    };
    if (revendedor?.vinculacionNueva) {
      update.revendedorUid = revendedor.uid;
      update.revendedorCodigo = revendedor.codigo;
    }

    tx.set(subRef, update, { merge: true });
    tx.set(subRef.collection('eventos').doc(), {
      tipo: 'pago_mp',
      fecha: ahora,
      detalle: {
        paymentId,
        preapprovalId,
        planId,
        monto,
        revendedorUid: revendedor?.uid || null,
        descuentoPct: revendedor ? pct : null
      }
    });
    tx.set(pagoRef, { ...registroPago, aplicado: true, revendedorCodigo: revendedor?.codigo || null, cicloFin: update.cicloFin });

    // Se liquida sobre lo efectivamente cobrado (monto), no sobre el precio
    // actual del plan: una suscripción vieja puede seguir debitando el
    // precio anterior hasta que se actualice.
    if (revendedor?.codigo) {
      const venta = armarVentaLedger({
        codigo: revendedor.codigo,
        uid,
        email: datos.email || null,
        planId,
        fecha: ahora,
        montoPlan: monto,
        pct,
        cobradoPor: 'plataforma',
        referencia: paymentId
      });
      tx.set(venta.ref, venta.datos, { merge: true });
    }

    return { aplicado: true, revendedorUid: revendedor?.uid || null };
  });

  // Mismo refresco que hace cambiarEstadoSuscripcion en cada renovación:
  // copia del contacto del revendedor para "Mi emprendimiento".
  if (resultado.revendedorUid) {
    await subRef.set({ revendedorContacto: await obtenerContactoRevendedor(resultado.revendedorUid) }, { merge: true });
  }
  return resultado;
}

// Aplica un cobro mensual (authorized_payment) ya leído de la API de
// Mercado Pago. Devuelve true si el pago estaba aprobado y quedó aplicado
// (ahora o en un procesamiento anterior).
async function aplicarCobroAutorizado(cobro, token, mpUserId) {
  const pago = cobro.payment || {};
  if (pago.status !== 'approved' || !pago.id) {
    logger.info(`cobrosMercadoPago: cobro ${cobro.id} sin pago aprobado (estado ${pago.status || cobro.status}), no se aplica.`);
    return false;
  }

  let referencia = parsearReferencia(cobro.external_reference);
  if (!referencia) {
    const pre = await mpFetch(token, `/preapproval/${cobro.preapproval_id}`);
    referencia = parsearReferencia(pre.external_reference);
  }
  if (!referencia) {
    logger.error(`cobrosMercadoPago: pago ${pago.id} aprobado sin external_reference válida, revisar a mano.`, { cobro });
    return false;
  }

  const resultado = await acreditarPago({
    uid: referencia.uid,
    planId: referencia.planId,
    paymentId: String(pago.id),
    preapprovalId: cobro.preapproval_id || null,
    monto: Number(cobro.transaction_amount || 0),
    mpUserId: mpUserId || await obtenerMpUserIdPlataforma()
  });
  logger.info(`cobrosMercadoPago: pago ${pago.id} de ${referencia.uid}`, resultado);
  return resultado.aplicado || resultado.duplicado || false;
}

async function procesarCobroRecurrente(id, mpUserId) {
  const token = await tokenDelCobrador(mpUserId);
  const cobro = await mpFetch(token, `/authorized_payments/${id}`);
  await aplicarCobroAutorizado(cobro, token, mpUserId);
}

async function procesarCambioPreapproval(id, mpUserId) {
  const token = await tokenDelCobrador(mpUserId);
  const pre = await mpFetch(token, `/preapproval/${id}`);
  const referencia = parsearReferencia(pre.external_reference);
  if (!referencia) {
    logger.warn(`cobrosMercadoPago: preapproval ${id} sin external_reference válida, se ignora.`);
    return pre;
  }

  const subRef = db.doc(`users/${referencia.uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    logger.error(`cobrosMercadoPago: preapproval ${id} de una cuenta sin suscripcion/actual (${referencia.uid}).`);
    return pre;
  }
  const cobroActual = subSnap.data().cobro || null;
  const ahora = Timestamp.now();

  if (cobroActual?.preapprovalId === pre.id && cobroActual.estado === pre.status) {
    return pre; // sin cambios desde el último procesamiento
  }

  if (pre.status === 'authorized') {
    // Cambio de plan: la suscripción nueva reemplaza a la anterior, que se
    // cancela para no debitar dos planes a la vez.
    if (cobroActual?.preapprovalId && cobroActual.preapprovalId !== pre.id && cobroActual.estado === 'authorized') {
      try {
        await mpFetch(await tokenDelCobrador(cobroActual.mpUserId), `/preapproval/${cobroActual.preapprovalId}`, {
          method: 'PUT',
          body: { status: 'cancelled' }
        });
      } catch (e) {
        logger.error(`cobrosMercadoPago: no se pudo cancelar la suscripción anterior ${cobroActual.preapprovalId}, cancelarla a mano.`, e.message);
      }
    }
    await subRef.set({
      cobro: {
        // Opción C: acá iría el uid del revendedor cuando la suscripción
        // viva en su cuenta de Mercado Pago.
        cobrador: 'plataforma',
        mpUserId: String(pre.collector_id || mpUserId || await obtenerMpUserIdPlataforma()),
        preapprovalId: pre.id,
        planId: referencia.planId,
        monto: Number(pre.auto_recurring?.transaction_amount || 0),
        estado: 'authorized',
        actualizadoEl: ahora
      }
    }, { merge: true });
  } else if (cobroActual?.preapprovalId === pre.id) {
    // Sólo se refleja el estado de la suscripción vigente: el aviso de
    // "cancelled" de una anterior (reemplazada por cambio de plan) no pisa
    // a la nueva.
    await subRef.set({ cobro: { estado: pre.status, actualizadoEl: ahora } }, { merge: true });
  } else {
    return pre;
  }

  await subRef.collection('eventos').add({
    tipo: `debito_mp_${pre.status}`,
    fecha: ahora,
    detalle: { preapprovalId: pre.id, planId: referencia.planId }
  });
  return pre;
}

// Revisa una suscripción contra la API de Mercado Pago sin depender de
// ningún aviso: refleja su estado y aplica los cobros aprobados que falten.
// Devuelve cuántos cobros aprobados tiene (aplicados ahora o antes).
async function sincronizarPreapproval(preapprovalId, mpUserId) {
  await procesarCambioPreapproval(preapprovalId, mpUserId);
  const token = await tokenDelCobrador(mpUserId);
  const busqueda = await mpFetch(token, `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`);
  let pagosAprobados = 0;
  for (const cobro of busqueda.results || []) {
    if (await aplicarCobroAutorizado(cobro, token, mpUserId)) pagosAprobados++;
  }
  return pagosAprobados;
}

module.exports = { aplicarCobroAutorizado, procesarCobroRecurrente, procesarCambioPreapproval, sincronizarPreapproval };
