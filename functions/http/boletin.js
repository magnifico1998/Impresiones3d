const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { db, Timestamp } = require('../admin');
const { enviarEmail, gmailAppPassword, EMAIL_ADMIN } = require('../mailer');
const { renderContenido, contenidoPlantilla, obtenerOverridesPlantillas } = require('../emailTemplates');

// Boletín de novedades: un mail a todos los suscriptores con el contenido
// de la plantilla "boletin" (se edita desde el panel para cada campaña).
//   boletines/{id}          cada envío: copia del asunto y del cuerpo,
//                           destinatarios, enviados y fallidos (lo lee el admin)
//   configuracion/boletin   { excluidos: [emails] }: las bajas
//
// Gmail acepta unos 500 destinatarios por día desde una cuenta común: cada
// tanda manda como mucho MAX_POR_TANDA y, si quedan pendientes (o Gmail
// corta por el límite), el boletín queda "pausado" para reanudarlo otro día
// con el mismo contenido.

const MAX_POR_TANDA = 400;
const ESTADOS = ['trial', 'activa', 'lectura', 'suspendida'];

async function exigirAdmin(request) {
  const email = request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : null;
  if (!email) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  if (!(await db.doc(`admins/${email}`).get()).exists) throw new HttpsError('permission-denied', 'Sólo un admin puede mandar el boletín.');
  return email;
}

const normalEmail = (e) => String(e || '').trim().toLowerCase();

async function excluidos() {
  const snap = await db.doc('configuracion/boletin').get();
  return new Set((snap.exists ? snap.data().excluidos || [] : []).map(normalEmail));
}

// Suscriptores (el email de cada cuenta) por estado, sin repetidos ni bajas.
async function suscriptores() {
  const [snap, bajas] = await Promise.all([db.collectionGroup('suscripcion').get(), excluidos()]);
  const vistos = new Set();
  const lista = [];
  for (const d of snap.docs) {
    if (d.id !== 'actual') continue;
    const { email, estado } = d.data();
    const e = normalEmail(email);
    if (!e || vistos.has(e) || bajas.has(e)) continue;
    vistos.add(e);
    lista.push({ uid: d.ref.parent.parent.id, email: e, estado: estado || '' });
  }
  return lista;
}

// "Hola Juana," con el nombre de la ficha del suscriptor, o "Hola,".
async function saludos(uids) {
  const mapa = {};
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((uid) => db.doc(`datosSuscriptor/${uid}`));
    const docs = refs.length ? await db.getAll(...refs) : [];
    docs.forEach((d) => {
      const nombre = d.exists ? String(d.data().nombre || '').trim() : '';
      mapa[d.id] = nombre ? `Hola ${nombre},` : 'Hola,';
    });
  }
  return mapa;
}

// El corte de Gmail por cantidad de envíos (no un destinatario inválido).
const esLimiteGmail = (e) => /quota|daily user sending|5\.4\.5/i.test(String(e?.message || e?.response || ''));

// Manda la próxima tanda de un boletín y actualiza su estado.
async function enviarTanda(ref) {
  const b = (await ref.get()).data();
  const hechos = new Set([...(b.enviados || []), ...(b.fallidos || []).map((f) => f.email)]);
  const pendientes = b.destinatarios.filter((d) => !hechos.has(d.email));
  const tanda = pendientes.slice(0, MAX_POR_TANDA);
  const saludo = await saludos(tanda.map((d) => d.uid));
  const enviados = [];
  const fallidos = [];
  let cortadoPorLimite = false;
  // El progreso se guarda cada tanto: si la función se corta en el medio,
  // al reanudar no se le vuelve a mandar a quien ya lo recibió.
  const guardarProgreso = () => ref.update({
    enviados: [...(b.enviados || []), ...enviados],
    fallidos: [...(b.fallidos || []), ...fallidos],
    actualizadoEl: Timestamp.now()
  });

  for (const [i, d] of tanda.entries()) {
    if (i > 0 && i % 25 === 0) await guardarProgreso();
    const { subject, html } = renderContenido(b.subject, b.bodyHtml, { saludo: saludo[d.uid] || 'Hola,' });
    try {
      await enviarEmail({ to: d.email, subject, html, replyTo: EMAIL_ADMIN });
      enviados.push(d.email);
    } catch (e) {
      if (esLimiteGmail(e)) {
        cortadoPorLimite = true;
        logger.warn('boletin: Gmail cortó por el límite diario', { boletin: ref.id, enviados: enviados.length });
        break;
      }
      logger.error('boletin: no se pudo mandar a', d.email, e);
      fallidos.push({ email: d.email, error: String(e?.message || e).slice(0, 200) });
    }
  }

  const totalEnviados = (b.enviados || []).length + enviados.length;
  const totalFallidos = (b.fallidos || []).length + fallidos.length;
  const quedan = b.destinatarios.length - totalEnviados - totalFallidos;
  await ref.update({
    enviados: [...(b.enviados || []), ...enviados],
    fallidos: [...(b.fallidos || []), ...fallidos],
    estado: quedan > 0 ? 'pausado' : 'terminado',
    motivoPausa: quedan > 0 ? (cortadoPorLimite ? 'Gmail llegó al límite diario de envíos' : `Se manda de a ${MAX_POR_TANDA} por vez`) : null,
    actualizadoEl: Timestamp.now()
  });
  return { enviados: enviados.length, fallidos: fallidos.length, quedan };
}

exports.gestionarBoletin = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  const adminEmail = await exigirAdmin(request);
  const d = request.data || {};

  switch (d.accion) {
    // Cuántos suscriptores hay por estado (sin bajas) y la lista de bajas.
    case 'resumen': {
      const lista = await suscriptores();
      const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, lista.filter((s) => s.estado === e).length]));
      return { porEstado, excluidos: [...(await excluidos())].sort() };
    }

    case 'guardarExcluidos': {
      const lista = [...new Set((Array.isArray(d.excluidos) ? d.excluidos : []).map(normalEmail).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
      await db.doc('configuracion/boletin').set({ excluidos: lista }, { merge: true });
      return { ok: true, excluidos: lista };
    }

    // Prueba: el contenido actual, sólo al admin que la pide.
    case 'prueba': {
      const { subject, bodyHtml } = contenidoPlantilla('boletin', await obtenerOverridesPlantillas());
      const r = renderContenido(subject, bodyHtml, { saludo: 'Hola,' });
      await enviarEmail({ to: adminEmail, subject: `[Prueba] ${r.subject}`, html: r.html });
      return { ok: true, a: adminEmail };
    }

    // Envío real: copia el contenido actual y arma la lista de destinatarios.
    case 'enviar': {
      const estados = (Array.isArray(d.estados) ? d.estados : []).filter((e) => ESTADOS.includes(e));
      if (!estados.length) throw new HttpsError('invalid-argument', 'Elegí al menos un estado de suscripción.');
      const destinatarios = (await suscriptores()).filter((s) => estados.includes(s.estado)).map(({ uid, email }) => ({ uid, email }));
      if (!destinatarios.length) throw new HttpsError('failed-precondition', 'No hay suscriptores para esos estados.');
      const { subject, bodyHtml } = contenidoPlantilla('boletin', await obtenerOverridesPlantillas());
      const ref = db.collection('boletines').doc();
      const ahora = Timestamp.now();
      await ref.set({
        subject, bodyHtml, estados, destinatarios, enviados: [], fallidos: [],
        estado: 'enviando', creadoEl: ahora, actualizadoEl: ahora, creadoPor: adminEmail
      });
      return { id: ref.id, total: destinatarios.length, ...(await enviarTanda(ref)) };
    }

    case 'reanudar': {
      const ref = db.doc(`boletines/${String(d.boletinId || '')}`);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError('not-found', 'No existe ese boletín.');
      if (snap.data().estado === 'terminado') throw new HttpsError('failed-precondition', 'Ese boletín ya se mandó completo.');
      await ref.update({ estado: 'enviando', actualizadoEl: Timestamp.now() });
      return { id: ref.id, ...(await enviarTanda(ref)) };
    }

    default:
      throw new HttpsError('invalid-argument', 'Acción desconocida.');
  }
});
