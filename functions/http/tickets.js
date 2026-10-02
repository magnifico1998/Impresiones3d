const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { db, Timestamp, FieldValue } = require('../admin');
const { enviarEmail, gmailAppPassword, EMAIL_ADMIN } = require('../mailer');
const { renderPlantilla, obtenerOverridesPlantillas, filasTablaTicket } = require('../emailTemplates');

// Tickets de soporte. El suscriptor (o un miembro de su equipo) crea un
// ticket con un comentario y el log de la sesión (ver
// src/utils/registroSoporte.js); el admin lo ve en el panel y le responde
// por mail. El cliente no escribe estas colecciones: todo pasa por acá.
//   tickets/{id}                 el ticket (lo leen el admin y la cuenta)
//   tickets/{id}/adjuntos/log    el log y el contexto (sólo el admin)
//   contadores/tickets           último número asignado (TKT-0001...)
//   soporteCuotas/{uid}          tickets creados hoy, para el tope diario

const MAX_TICKETS_POR_DIA = 5;
const CATEGORIAS = ['error', 'consulta', 'facturacion', 'sugerencia'];
const ESTADOS = ['abierto', 'analisis', 'respondido', 'cerrado'];
const MAX_EVENTOS = 400;
// Un doc de Firestore admite hasta 1 MiB: el log queda bastante por debajo.
const MAX_BYTES_LOG = 600000;
const TIPOS_ERROR = ['error', 'excepcion', 'promesa', 'aviso'];

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

const emailVerificado = (request) =>
  (request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : null);

// Día en Argentina (YYYY-MM-DD), para el tope diario.
function diaArgentina(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(fecha);
}

// Deja el log con la forma esperada y acotado, venga lo que venga del cliente.
function sanearLog(log) {
  const eventos = (Array.isArray(log?.eventos) ? log.eventos : []).slice(-MAX_EVENTOS).map((e) => {
    const evento = { t: Number(e?.t) || 0, tipo: texto(e?.tipo, 20), msg: texto(e?.msg, 600) };
    if (e?.extra && typeof e.extra === 'object') {
      const extra = JSON.stringify(e.extra);
      if (extra.length <= 300) evento.extra = JSON.parse(extra);
    }
    return evento;
  });
  const contexto = {};
  for (const [k, v] of Object.entries(log?.contexto || {}).slice(0, 30)) {
    contexto[texto(k, 40)] = typeof v === 'boolean' || typeof v === 'number' ? v : texto(v, 300);
  }
  return { eventos, contexto, grabado: log?.grabado === true };
}

// Cuenta a la que pertenece quien crea el ticket: la propia o, si es un
// miembro activo de un equipo, la del dueño.
async function cuentaDe(uid, email) {
  if (!email) return uid;
  const inv = await db.doc(`invitacionesMiembro/${email}`).get();
  return inv.exists && inv.data().estado === 'activo' && inv.data().ownerUid ? inv.data().ownerUid : uid;
}

exports.crearTicket = onCall({ secrets: [gmailAppPassword] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  const email = emailVerificado(request);
  const d = request.data || {};

  const categoria = CATEGORIAS.includes(d.categoria) ? d.categoria : 'error';
  const asunto = texto(d.asunto, 120);
  const comentario = texto(d.comentario, 5000);
  if (!asunto) throw new HttpsError('invalid-argument', 'Falta el asunto.');
  if (!comentario) throw new HttpsError('invalid-argument', 'Contanos qué pasó en el comentario.');
  const log = sanearLog(d.log);
  if (JSON.stringify(log).length > MAX_BYTES_LOG) throw new HttpsError('invalid-argument', 'El log es demasiado grande.');

  const cuentaId = await cuentaDe(uid, email);
  const errores = log.eventos.filter((e) => TIPOS_ERROR.includes(e.tipo) || (e.tipo === 'funcion' && e.extra?.ok === false));
  const ahora = Timestamp.now();
  const hoy = diaArgentina();
  const ticketRef = db.collection('tickets').doc();

  const numero = await db.runTransaction(async (tx) => {
    const cuotaRef = db.doc(`soporteCuotas/${uid}`);
    const contadorRef = db.doc('contadores/tickets');
    const [cuota, contador] = await Promise.all([tx.get(cuotaRef), tx.get(contadorRef)]);
    const usadosHoy = cuota.exists && cuota.data().dia === hoy ? cuota.data().cantidad || 0 : 0;
    if (usadosHoy >= MAX_TICKETS_POR_DIA) {
      throw new HttpsError('resource-exhausted', `Llegaste al máximo de ${MAX_TICKETS_POR_DIA} tickets por día. Si es urgente, respondé el mail de un ticket anterior.`);
    }
    const n = (contador.exists ? contador.data().ultimo || 0 : 0) + 1;
    tx.set(contadorRef, { ultimo: n }, { merge: true });
    tx.set(cuotaRef, { dia: hoy, cantidad: usadosHoy + 1 });
    tx.set(ticketRef, {
      numero: n,
      uid,
      cuentaId,
      email: email || null,
      categoria,
      asunto,
      comentario,
      errorOrigen: texto(d.errorOrigen, 300) || null,
      estado: 'abierto',
      creadoEl: ahora,
      actualizadoEl: ahora,
      resumen: {
        eventos: log.eventos.length,
        errores: errores.length,
        ultimoError: errores.length ? errores[errores.length - 1].msg.slice(0, 200) : null,
        grabado: log.grabado,
        version: texto(log.contexto.version, 20) || null,
        seccion: texto(log.contexto.seccion, 40) || null
      },
      respuestas: []
    });
    tx.set(ticketRef.collection('adjuntos').doc('log'), { ...log, guardadoEl: ahora });
    return n;
  });

  const numeroTexto = `TKT-${String(numero).padStart(4, '0')}`;
  try {
    const overrides = await obtenerOverridesPlantillas();
    const aviso = renderPlantilla('ticketNuevoAdmin', {
      numero: numeroTexto,
      asunto,
      filasTabla: filasTablaTicket({ numero: numeroTexto, categoria, asunto, comentario, email, cuentaId, errores: errores.length, eventos: log.eventos.length, grabado: log.grabado, version: log.contexto.version, seccion: log.contexto.seccion })
    }, overrides);
    await enviarEmail({ to: EMAIL_ADMIN, subject: aviso.subject, html: aviso.html, replyTo: email || undefined });
    if (email) {
      const recibido = renderPlantilla('ticketRecibido', { numero: numeroTexto, asunto }, overrides);
      await enviarEmail({ to: email, subject: recibido.subject, html: recibido.html });
    }
  } catch (e) {
    logger.error('crearTicket: no se pudieron mandar los mails', e);
  }

  return { ok: true, id: ticketRef.id, numero };
});

// Admin: cambia el estado y/o responde (la respuesta le llega por mail al
// suscriptor y queda en el ticket).
exports.actualizarTicket = onCall({ secrets: [gmailAppPassword] }, async (request) => {
  const email = emailVerificado(request);
  if (!email) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  if (!(await db.doc(`admins/${email}`).get()).exists) throw new HttpsError('permission-denied', 'Sólo un admin puede gestionar tickets.');

  const d = request.data || {};
  const ref = db.doc(`tickets/${texto(d.ticketId, 64)}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No existe ese ticket.');
  const ticket = snap.data();
  const respuesta = texto(d.respuesta, 5000);
  const estado = ESTADOS.includes(d.estado) ? d.estado : (respuesta ? 'respondido' : null);
  if (!estado && !respuesta) throw new HttpsError('invalid-argument', 'No hay cambios.');

  const ahora = Timestamp.now();
  await ref.update({
    ...(estado ? { estado } : {}),
    ...(respuesta ? { respuestas: FieldValue.arrayUnion({ fecha: ahora, texto: respuesta, autor: email }) } : {}),
    actualizadoEl: ahora
  });

  let mailEnviado = false;
  if (respuesta && ticket.email) {
    try {
      const overrides = await obtenerOverridesPlantillas();
      const { subject, html } = renderPlantilla('ticketRespondido', {
        numero: `TKT-${String(ticket.numero).padStart(4, '0')}`, asunto: ticket.asunto, respuesta
      }, overrides);
      await enviarEmail({ to: ticket.email, subject, html, replyTo: EMAIL_ADMIN });
      mailEnviado = true;
    } catch (e) {
      logger.error('actualizarTicket: no se pudo mandar el mail', e);
    }
  }
  return { ok: true, mailEnviado };
});
