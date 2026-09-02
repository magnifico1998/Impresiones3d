const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { getAuth } = require('firebase-admin/auth');
const { db } = require('../admin');
const { enviarEmail, gmailAppPassword } = require('../mailer');
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
