const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { getAuth } = require('firebase-admin/auth');
const { db, Timestamp } = require('../admin');
const { enviarEmail, gmailAppPassword } = require('../mailer');

// Tope de avisos por mail por tienda y por hora. Las solicitudes las crea
// cualquiera sin login, y todos los mails de la app salen de la misma
// cuenta de Gmail (tope diario de envíos): sin esto, un script que cargue
// solicitudes en loop agota esa cuota y deja a toda la app sin mails
// (bienvenidas, vencimientos). Las solicitudes igual quedan guardadas y se
// ven en "Catálogo web"; sólo se deja de avisar por mail hasta la hora
// siguiente.
const MAX_AVISOS_POR_HORA = 10;
const HORA_MS = 60 * 60 * 1000;

async function reservarAviso(uidTienda) {
  const ref = db.doc(`limitesNotificacion/${uidTienda}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const ahoraMs = Date.now();
    const datos = snap.exists ? snap.data() : null;
    const dentroDeVentana = datos && (ahoraMs - datos.desde.toMillis()) < HORA_MS;
    const enviados = dentroDeVentana ? (datos.enviados || 0) : 0;
    if (enviados >= MAX_AVISOS_POR_HORA) return false;
    tx.set(ref, {
      desde: dentroDeVentana ? datos.desde : Timestamp.fromMillis(ahoraMs),
      enviados: enviados + 1
    });
    return true;
  });
}
const { renderPlantilla, obtenerOverridesPlantillas, filasTablaPedidoCatalogo } = require('../emailTemplates');

// El pedido del catálogo público no pasa por ninguna Cloud Function al
// crearse (CatalogoPublico.jsx hace un addDoc directo, sin login) y recién
// se convierte en pedido "en_verificacion" cuando el dueño lo importa a
// mano desde CatalogoAdminPage -- eso ya es una acción manual, no sirve
// como disparador. Este trigger sobre la propia creación de la solicitud
// es el único punto donde algo pasa sin intervención humana.
//
// Empezó siendo una alerta por WhatsApp (CallMeBot), pero ese servicio no
// oficial demoraba/perdía mensajes sin avisar -- se reemplazó por mail,
// reusando la infraestructura ya probada de functions/mailer.js.
exports.onNuevaSolicitudCatalogo = onDocumentCreated(
  { document: 'catalogoTiendas/{uidTienda}/solicitudes/{solicitudId}', secrets: [gmailAppPassword] },
  async (event) => {
    const { uidTienda } = event.params;
    const solicitud = event.data.data();

    try {
      if (!(await reservarAviso(uidTienda))) {
        logger.warn(`onNuevaSolicitudCatalogo: ${uidTienda} superó ${MAX_AVISOS_POR_HORA} avisos en la última hora, no se manda mail.`);
        return;
      }

      // Destinatarios: el dueño de la cuenta + todos los usuarios con
      // acceso compartido (ver invitacionesMiembro, EmpresaPage "Usuarios
      // con acceso") -- así nadie con acceso a la cuenta se queda afuera
      // del aviso. El email del dueño sale de Firebase Auth (fuente
      // confiable: no depende de que haya completado el campo "Email" en
      // Mi emprendimiento, que ni siquiera se sincroniza a catalogoTiendas
      // -- mismo patrón que borrarCuenta.js / obtenerContactoRevendedor).
      const [duenio, miembrosSnap] = await Promise.all([
        getAuth().getUser(uidTienda).catch((e) => {
          logger.warn(`No se pudo obtener el email del dueño (${uidTienda}) desde Auth:`, e);
          return null;
        }),
        db.collection('invitacionesMiembro')
          .where('ownerUid', '==', uidTienda)
          .where('estado', '==', 'activo')
          .get()
      ]);

      const emails = [...new Set([
        duenio?.email,
        ...miembrosSnap.docs.map(d => d.data().email)
      ].filter(Boolean))];

      if (!emails.length) {
        logger.warn(`No se encontró ningún email para notificar el pedido de catalogoTiendas/${uidTienda}.`);
        return;
      }

      const overrides = await obtenerOverridesPlantillas();
      const vars = {
        cliente: solicitud.cliente || 'sin nombre',
        filasTabla: filasTablaPedidoCatalogo(solicitud)
      };
      const { subject, html } = renderPlantilla('nuevoPedidoCatalogo', vars, overrides);

      await enviarEmail({ to: emails.join(','), subject, html });
    } catch (e) {
      logger.error('Error al enviar aviso por mail de nueva solicitud de catálogo:', e);
    }
  }
);
