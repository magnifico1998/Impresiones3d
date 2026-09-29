const nodemailer = require('nodemailer');
const { defineSecret } = require('firebase-functions/params');

// Contraseña de aplicación de Gmail (no la contraseña normal de la cuenta).
// Se carga con: firebase functions:secrets:set GMAIL_APP_PASSWORD
// Nunca vive en el código ni en un archivo del repo.
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

const GMAIL_USER = 'manager3d.app@gmail.com';
const EMAIL_ADMIN = 'gustavokimmel@gmail.com';

function crearTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: GMAIL_USER,
      pass: gmailAppPassword.value(),
    },
  });
}

// Cualquier función que llame a esto tiene que declarar
// `secrets: [gmailAppPassword]` en sus opciones (v2), si no
// gmailAppPassword.value() viene vacío en producción.
// attachments: formato de nodemailer ([{ filename, content: Buffer }]).
// fromName / replyTo: para mails que se mandan en nombre de un suscriptor
// (ej. sus facturas): la casilla sigue siendo la de Manager3D (Gmail no deja
// mandar como otra dirección), pero se ve su nombre y las respuestas le
// llegan a él.
async function enviarEmail({ to, subject, html, attachments, fromName, replyTo }) {
  const transporter = crearTransporter();
  const nombre = String(fromName || 'Manager3D').replace(/["<>\r\n]/g, '');
  await transporter.sendMail({
    from: `"${nombre}" <${GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments,
    replyTo,
  });
}

module.exports = { enviarEmail, gmailAppPassword, EMAIL_ADMIN };
