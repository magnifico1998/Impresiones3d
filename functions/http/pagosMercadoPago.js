const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { db, Timestamp } = require('../admin');
const { APP_URL } = require('../emailTemplates');
const {
  mpAccessToken, mpPayerEmailPrueba, MONEDA_MP, mpFetch, obtenerMpUserIdPlataforma, tokenDelCobrador, armarReferencia
} = require('../mercadopago');
const { sincronizarPreapproval } = require('../cobrosMercadoPago');

// Autoservicio de pago con débito automático mensual (Suscripciones de
// Mercado Pago). El suscriptor elige un plan desde la app, esta función crea
// la suscripción en Mercado Pago y le devuelve el link para autorizarla. La
// activación del plan NO pasa por acá: recién cuando Mercado Pago avisa el
// pago acreditado, webhookMercadoPago.js le da el ciclo nuevo (así nadie
// queda activo por haber abierto el link sin pagar).

// Sólo el dueño contrata: un miembro invitado usa la suscripción del dueño
// (mismo criterio que registrarUltimoAcceso.js), no tiene una propia.
async function exigirDuenio(request) {
  const uid = request.auth?.uid;
  const email = (request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : undefined);
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }
  if (email) {
    const invSnap = await db.doc(`invitacionesMiembro/${email}`).get();
    if (invSnap.exists && invSnap.data().estado === 'activo') {
      throw new HttpsError('permission-denied', 'Sólo el dueño de la cuenta puede contratar o cancelar el plan.');
    }
  }
  return { uid, email };
}

// En qué cuenta de Mercado Pago se crea la suscripción. Hoy siempre la de
// la plataforma (opción A). Un revendedor con modoCobro 'propio' (opción C,
// todavía no habilitada) cobraría en su propia cuenta: ahí se devolvería su
// mpUserId y tokenDelCobrador resolvería su token.
async function resolverCobrador(uid, datosSuscripcion) {
  let codigo = datosSuscripcion.revendedorCodigo || null;
  if (!codigo && !datosSuscripcion.revendedorUid) {
    const solicitud = await db.doc(`solicitudesContacto/${uid}`).get();
    codigo = solicitud.exists ? (solicitud.data().codigoRevendedor || null) : null;
  }
  if (codigo) {
    const revSnap = await db.doc(`revendedores/${codigo}`).get();
    if (revSnap.exists && revSnap.data().activo && revSnap.data().modoCobro === 'propio') {
      throw new HttpsError('failed-precondition', 'Tu plan se contrata a través de tu ejecutivo. Contactalo para darlo de alta.');
    }
  }
  return { mpUserId: await obtenerMpUserIdPlataforma() };
}

exports.crearSuscripcionMP = onCall({ secrets: [mpAccessToken] }, async (request) => {
  const { uid, email } = await exigirDuenio(request);
  if (!email) {
    throw new HttpsError('failed-precondition', 'Tu cuenta no tiene un email asociado para el pago.');
  }

  const planId = request.data?.planId;
  if (!planId || typeof planId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el plan a contratar.');
  }
  // Mercado Pago puede exigir que quien autoriza el débito esté logueado
  // con una cuenta de MP con este mismo email, que no siempre es el de
  // Google con el que entra a la app -- por eso el suscriptor lo puede
  // indicar (el modal lo precarga con el de Google).
  const emailMP = String(request.data?.emailMP || '').trim().toLowerCase();
  if (emailMP && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailMP)) {
    throw new HttpsError('invalid-argument', 'El email de Mercado Pago no es válido.');
  }
  const planSnap = await db.doc(`planes/${planId}`).get();
  const plan = planSnap.exists ? planSnap.data() : null;
  const precio = Number(plan?.precioMensual || 0);
  if (!plan || plan.activo === false || plan.gratuito || precio <= 0) {
    throw new HttpsError('not-found', 'Ese plan no está disponible para contratar.');
  }

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    throw new HttpsError('failed-precondition', 'Tu cuenta todavía no tiene suscripción inicializada. Contactate con soporte.');
  }

  const { mpUserId } = await resolverCobrador(uid, subSnap.data());

  let preapproval;
  try {
    preapproval = await mpFetch(await tokenDelCobrador(mpUserId), '/preapproval', {
      method: 'POST',
      body: {
        reason: `Manager3D - Plan ${plan.nombre}`,
        external_reference: armarReferencia(uid, planId),
        payer_email: mpPayerEmailPrueba.value() || emailMP || email,
        // La app detecta ?pagoMP al volver y sincroniza el pago (ver
        // sincronizarSuscripcionMP), sin esperar el aviso del webhook.
        back_url: `${APP_URL}?pagoMP=1`,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: precio,
          currency_id: MONEDA_MP
        }
      }
    });
  } catch (e) {
    logger.error('Error al crear la suscripción en Mercado Pago:', e.message, e.data);
    throw new HttpsError('unavailable', 'No se pudo iniciar el pago con Mercado Pago. Probá de nuevo en un momento.');
  }

  await subRef.collection('eventos').add({
    tipo: 'checkout_mp_iniciado',
    fecha: Timestamp.now(),
    detalle: { planId, preapprovalId: preapproval.id, mpUserId, monto: precio, emailMP: emailMP || email }
  });

  return { ok: true, initPoint: preapproval.init_point };
});

// Consulta a Mercado Pago el estado real de la suscripción de esta cuenta
// y aplica lo que corresponda, con la misma lógica idempotente del webhook.
// La llama la app al volver del checkout (y el botón "Verificar pago"), así
// el plan se activa aunque el aviso del webhook se demore o no llegue.
// Revisa la suscripción vigente (renovaciones) y la del último checkout
// (alta o cambio de plan) -- a propósito no las anteriores: revivir una
// suscripción vieja todavía autorizada podría pisar a la que el suscriptor
// eligió después.
exports.sincronizarSuscripcionMP = onCall({ secrets: [mpAccessToken] }, async (request) => {
  const { uid } = await exigirDuenio(request);

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    throw new HttpsError('failed-precondition', 'Tu cuenta todavía no tiene suscripción inicializada.');
  }

  // Sin where+orderBy combinados para no depender de un índice compuesto:
  // se traen los últimos eventos y se filtra acá.
  const eventos = await subRef.collection('eventos').orderBy('fecha', 'desc').limit(30).get();
  const ultimoCheckout = eventos.docs.map((d) => d.data()).find((e) => e.tipo === 'checkout_mp_iniciado');

  const aRevisar = [];
  const cobroActual = subSnap.data().cobro;
  if (cobroActual?.preapprovalId) aRevisar.push({ preapprovalId: cobroActual.preapprovalId, mpUserId: cobroActual.mpUserId });
  const idCheckout = ultimoCheckout?.detalle?.preapprovalId;
  if (idCheckout && idCheckout !== cobroActual?.preapprovalId) {
    aRevisar.push({ preapprovalId: idCheckout, mpUserId: ultimoCheckout.detalle.mpUserId });
  }
  if (aRevisar.length === 0) {
    return { ok: true, encontrado: false };
  }

  let pagosAplicados = 0;
  for (const { preapprovalId, mpUserId } of aRevisar) {
    try {
      pagosAplicados += await sincronizarPreapproval(preapprovalId, mpUserId);
    } catch (e) {
      logger.error(`sincronizarSuscripcionMP: error revisando ${preapprovalId}:`, e.message, e.data);
    }
  }

  const final = (await subRef.get()).data();
  return {
    ok: true,
    encontrado: true,
    pagosAplicados,
    estado: final.estado,
    planId: final.planId || null,
    debito: final.cobro?.estado || null
  };
});

// Da de baja el débito automático. La cuenta NO se desactiva acá: sigue
// activa hasta el cicloFin que ya pagó y después cae sola a modo lectura
// (transicionSuscripciones.js), igual que cualquier ciclo sin renovar.
exports.cancelarSuscripcionMP = onCall({ secrets: [mpAccessToken] }, async (request) => {
  const { uid } = await exigirDuenio(request);

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  const cobro = subSnap.exists ? subSnap.data().cobro : null;
  if (!cobro?.preapprovalId || cobro.estado !== 'authorized') {
    throw new HttpsError('failed-precondition', 'No tenés un débito automático activo.');
  }

  try {
    await mpFetch(await tokenDelCobrador(cobro.mpUserId), `/preapproval/${cobro.preapprovalId}`, {
      method: 'PUT',
      body: { status: 'cancelled' }
    });
  } catch (e) {
    logger.error('Error al cancelar la suscripción en Mercado Pago:', e.message, e.data);
    throw new HttpsError('unavailable', 'No se pudo cancelar el débito automático. Probá de nuevo en un momento.');
  }

  const ahora = Timestamp.now();
  // El webhook también va a reflejar la baja cuando llegue el aviso de
  // Mercado Pago; se marca acá igual para que la app lo muestre al toque.
  await subRef.set({ cobro: { estado: 'cancelled', actualizadoEl: ahora } }, { merge: true });
  await subRef.collection('eventos').add({
    tipo: 'debito_mp_cancelado',
    fecha: ahora,
    detalle: { preapprovalId: cobro.preapprovalId }
  });

  return { ok: true };
});
