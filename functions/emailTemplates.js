const { formatearFecha } = require('./admin');

const APP_URL = 'https://manager3d.vercel.app/';

// Wrapper HTML común a todos los mails: nada de dependencias externas,
// estilos inline (los clientes de mail ignoran <style> en muchos casos).
function layout(titulo, cuerpoHtml) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h2 style="font-size: 18px; margin-bottom: 16px;">${titulo}</h2>
      <div style="font-size: 14px; line-height: 1.6;">${cuerpoHtml}</div>
      <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        Manager3D · Todo para emprender en 3D
      </p>
    </div>
  `;
}

function botonIngresar() {
  return `<p><a href="${APP_URL}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">Ingresar a Manager3D</a></p>`;
}

function plantillaAvisoVencimiento(fechaVencimiento) {
  const fecha = formatearFecha(fechaVencimiento);
  return {
    subject: 'Tu plan en Manager3D vence en 5 días',
    html: layout('Tu plan está por vencer', `
      <p>Te avisamos que tu plan en Manager3D vence el <strong>${fecha}</strong> (en 5 días).</p>
      <p>Para no perder acceso a tus datos, renová o contactate con nosotros desde la app antes de esa fecha.</p>
      ${botonIngresar()}
    `),
  };
}

function plantillaModoLectura() {
  return {
    subject: 'Tu cuenta en Manager3D pasó a modo solo lectura',
    html: layout('Tu cuenta pasó a modo solo lectura', `
      <p>Tu plan venció y tu cuenta pasó a <strong>modo solo lectura</strong>: podés seguir viendo tus datos, pero no cargar ni modificar nada.</p>
      <p>Tenés <strong>30 días</strong> para reactivar tu plan sin perder el acceso completo. Pasado ese plazo, la cuenta se bloquea.</p>
      ${botonIngresar()}
    `),
  };
}

function plantillaAvisoBloqueo(diasRestantes) {
  return {
    subject: `Tu cuenta se bloquea en ${diasRestantes} días si no la reactivás`,
    html: layout('Tu cuenta está por bloquearse', `
      <p>Quedan <strong>${diasRestantes} días</strong> para que se cumpla el plazo de 30 días en modo solo lectura.</p>
      <p>Si no reactivás tu plan antes de esa fecha, tu cuenta se va a <strong>bloquear</strong> (vas a perder incluso el acceso de lectura a tus datos).</p>
      ${botonIngresar()}
    `),
  };
}

function plantillaCuentaBloqueada() {
  return {
    subject: 'Tu cuenta en Manager3D fue bloqueada',
    html: layout('Tu cuenta fue bloqueada', `
      <p>Pasaron los 30 días de modo solo lectura sin reactivar tu plan, así que tu cuenta quedó <strong>bloqueada</strong>: por ahora no podés ni ver ni cargar datos.</p>
      <p>Tus datos siguen guardados y se pueden recuperar si reactivás el plan. Tené en cuenta que si la cuenta permanece bloqueada por mucho tiempo sin reactivarse, la información podría eliminarse definitivamente.</p>
      <p>Contactate con nosotros para reactivar tu cuenta cuando quieras.</p>
      ${botonIngresar()}
    `),
  };
}

function plantillaNuevoSuscriptor(email) {
  return {
    subject: 'Nuevo registro en Manager3D',
    html: layout('Nuevo registro', `
      <p>Se registró un usuario nuevo (arrancó su prueba gratuita de 7 días):</p>
      <p><strong>${email || '(sin email)'}</strong></p>
    `),
  };
}

function plantillaNuevaSolicitudContacto(datos) {
  const filas = [
    ['Nombre', `${datos.nombre || ''} ${datos.apellido || ''}`.trim()],
    ['Documento', `${datos.tipoDocumento || ''} ${datos.numeroDocumento || ''}`.trim()],
    ['Condición impositiva', datos.condicionImpositiva || ''],
    ['Localidad', datos.localidad || ''],
    ['Teléfono', datos.telefono || ''],
    ['Email', datos.email || ''],
    ['¿Qué haría con la app?', datos.resena || ''],
  ];
  const filasHtml = filas
    .map(([label, valor]) => `<tr><td style="padding: 4px 12px 4px 0; color: #666;">${label}</td><td style="padding: 4px 0;">${valor || '-'}</td></tr>`)
    .join('');

  return {
    subject: `Nueva solicitud de contacto: ${datos.nombre || ''} ${datos.apellido || ''}`.trim(),
    html: layout('Nueva solicitud de contacto', `
      <table style="border-collapse: collapse;">${filasHtml}</table>
    `),
  };
}

module.exports = {
  plantillaAvisoVencimiento,
  plantillaModoLectura,
  plantillaAvisoBloqueo,
  plantillaCuentaBloqueada,
  plantillaNuevoSuscriptor,
  plantillaNuevaSolicitudContacto,
};
