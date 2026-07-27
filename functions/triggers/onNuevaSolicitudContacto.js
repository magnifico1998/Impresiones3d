const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { enviarEmail, gmailAppPassword, EMAIL_ADMIN } = require('../mailer');
const { plantillaNuevaSolicitudContacto } = require('../emailTemplates');

// solicitudesContacto/{uid} tiene ID fijo = uid (ver ModalContacto.jsx,
// que hace setDoc con merge), así que reenviar el formulario actualiza el
// mismo doc en vez de crear uno nuevo -- este onCreate sólo dispara una
// vez por cuenta, sin necesidad de deduplicar nada acá.
exports.onNuevaSolicitudContacto = onDocumentCreated(
  { document: 'solicitudesContacto/{uid}', secrets: [gmailAppPassword] },
  async (event) => {
    const datos = event.data.data();
    try {
      const { subject, html } = plantillaNuevaSolicitudContacto(datos);
      await enviarEmail({ to: EMAIL_ADMIN, subject, html });
    } catch (e) {
      logger.error('Error al enviar mail de nueva solicitud de contacto:', e);
    }
  }
);
