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
async function enviarEmail({ to, subject, html }) {
  const transporter = crearTransporter();
  await transporter.sendMail({
    from: `"Manager3D" <${GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

module.exports = { enviarEmail, gmailAppPassword, EMAIL_ADMIN };
