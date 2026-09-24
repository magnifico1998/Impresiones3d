const crypto = require('crypto');
const { defineSecret, defineString } = require('firebase-functions/params');

// Cliente mínimo de la API de Mercado Pago (fetch nativo de Node 20, sin
// SDK). Se cargan con:
//   firebase functions:secrets:set MP_ACCESS_TOKEN     (Access Token de producción o de prueba)
//   firebase functions:secrets:set MP_WEBHOOK_SECRET   (clave secreta de Webhooks del panel de MP)
// Cualquier función que use esto tiene que declarar los secrets que toca en
// sus opciones, si no .value() viene vacío en producción.
const mpAccessToken = defineSecret('MP_ACCESS_TOKEN');
const mpWebhookSecret = defineSecret('MP_WEBHOOK_SECRET');

// SÓLO PARA PRUEBAS: con credenciales de prueba Mercado Pago exige que
// pague un usuario comprador de prueba (test_user_...@testuser.com), que no
// es una cuenta de Google con la que se pueda entrar a la app. Si está
// cargado (functions/.env, no se sube al repo), se usa como payer_email en
// vez del email de la cuenta. En producción tiene que quedar vacío.
const mpPayerEmailPrueba = defineString('MP_PAYER_EMAIL_PRUEBA', { default: '' });

const MP_API = 'https://api.mercadopago.com';
const MONEDA_MP = 'ARS';

async function mpFetch(token, path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Un POST reintentado (timeout de red, doble click) no debe crear dos
  // suscripciones en Mercado Pago.
  if (method === 'POST') headers['X-Idempotency-Key'] = crypto.randomUUID();
  const res = await fetch(`${MP_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(`Mercado Pago ${method} ${path} -> ${res.status}: ${data.message || data.error || 'sin detalle'}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

// user_id de la cuenta de Mercado Pago de la plataforma. Se resuelve una
// sola vez por instancia (con el propio Access Token) en vez de hardcodearlo,
// así cambiar de credenciales de prueba a producción es sólo cambiar el secret.
let mpUserIdPlataforma = null;
async function obtenerMpUserIdPlataforma() {
  if (!mpUserIdPlataforma) {
    const yo = await mpFetch(mpAccessToken.value(), '/users/me');
    mpUserIdPlataforma = String(yo.id);
  }
  return mpUserIdPlataforma;
}

// Único punto donde se decide con qué Access Token se opera sobre una cuenta
// de Mercado Pago ("cobrador"). Hoy todo se cobra en la cuenta de la
// plataforma (opción A). Para que un revendedor cobre en su propia cuenta
// (opción C) alcanza con resolver acá su token OAuth -- guardado en
// credencialesMP/{mpUserId}, colección cerrada al cliente en firestore.rules
// -- sin tocar el checkout ni el webhook, que siempre pasan por esta función.
async function tokenDelCobrador(mpUserId) {
  const idPlataforma = await obtenerMpUserIdPlataforma();
  if (!mpUserId || String(mpUserId) === idPlataforma) return mpAccessToken.value();
  throw new Error(`No hay credenciales para operar la cuenta de Mercado Pago ${mpUserId}.`);
}

// external_reference de cada suscripción de Mercado Pago: "uid|planId". Es
// lo que vincula un cobro con la cuenta de Manager3D y el plan que eligió.
const armarReferencia = (uid, planId) => `${uid}|${planId}`;
function parsearReferencia(referencia) {
  const [uid, planId] = String(referencia || '').split('|');
  return uid && planId ? { uid, planId } : null;
}

// Valida el header x-signature que Mercado Pago agrega a cada notificación
// (HMAC-SHA256 con la clave secreta de Webhooks). Sin esto cualquiera podría
// pegarle al webhook simulando un pago aprobado. Formato del manifest según
// la documentación de Mercado Pago: "id:{data.id};request-id:{x-request-id};ts:{ts};",
// omitiendo las partes que no vengan en la notificación.
function firmaWebhookValida(req, secreto) {
  const xSignature = req.get('x-signature');
  if (!xSignature || !secreto) return false;

  const partes = {};
  xSignature.split(',').forEach((parte) => {
    const [clave, valor] = parte.split('=').map((s) => s && s.trim());
    if (clave && valor) partes[clave] = valor;
  });
  if (!partes.ts || !partes.v1) return false;

  const dataId = req.query['data.id'] ?? req.body?.data?.id;
  const xRequestId = req.get('x-request-id');
  let manifest = '';
  if (dataId != null) manifest += `id:${String(dataId).toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${partes.ts};`;

  const esperado = crypto.createHmac('sha256', secreto).update(manifest).digest('hex');
  const recibido = partes.v1;
  return recibido.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

module.exports = {
  mpAccessToken,
  mpWebhookSecret,
  mpPayerEmailPrueba,
  MONEDA_MP,
  mpFetch,
  obtenerMpUserIdPlataforma,
  tokenDelCobrador,
  armarReferencia,
  parsearReferencia,
  firmaWebhookValida
};
