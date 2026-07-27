const { db } = require('./admin');

const APP_URL = 'https://manager3d.vercel.app/';

// Wrapper HTML común a todos los mails: nada de dependencias externas,
// estilos inline (los clientes de mail ignoran <style> en muchos casos).
// El título ya va DENTRO del bodyHtml de cada plantilla (así el admin lo
// puede editar libremente desde el panel), acá sólo se arma el contenedor y
// el pie de página fijo.
function layout(cuerpoHtml) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <div style="font-size: 14px; line-height: 1.6;">${cuerpoHtml}</div>
      <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        Manager3D · Todo para emprender en 3D
      </p>
    </div>
  `;
}

const TITULO = 'font-size: 18px; margin: 0 0 16px;';
const BOTON = `<p><a href="${APP_URL}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">Ingresar a Manager3D</a></p>`;

// Registro de plantillas editables desde el panel admin (ver
// functions/http/plantillasEmail.js). Cada una define su asunto y cuerpo
// por defecto (con placeholders {{variable}}), más los datos de ejemplo que
// se usan para armar la vista previa en el panel. Un admin puede pisar
// subject/bodyHtml guardando un override en Firestore
// (configuracion/emailTemplates/{id}); si no hay override, se usa lo de acá.
const DEFAULTS = {
  avisoVencimiento: {
    label: 'Aviso de vencimiento (5 días antes)',
    subject: 'Tu plan en Manager3D vence en 5 días',
    bodyHtml: `
      <h2 style="${TITULO}">Tu plan está por vencer</h2>
      <p>Te avisamos que tu plan en Manager3D vence el <strong>{{fecha}}</strong> (en 5 días).</p>
      <p>Para no perder acceso a tus datos, renová o contactate con nosotros desde la app antes de esa fecha.</p>
      ${BOTON}
    `.trim(),
    variables: { fecha: '15/08/2026' },
  },
  modoLectura: {
    label: 'Cuenta pasó a modo solo lectura',
    subject: 'Tu cuenta en Manager3D pasó a modo solo lectura',
    bodyHtml: `
      <h2 style="${TITULO}">Tu cuenta pasó a modo solo lectura</h2>
      <p>Tu plan venció y tu cuenta pasó a <strong>modo solo lectura</strong>: podés seguir viendo tus datos, pero no cargar ni modificar nada.</p>
      <p>Tenés <strong>30 días</strong> para reactivar tu plan sin perder el acceso completo. Pasado ese plazo, la cuenta se bloquea.</p>
      ${BOTON}
    `.trim(),
    variables: {},
  },
  avisoBloqueo: {
    label: 'Aviso de bloqueo próximo (10 y 5 días antes)',
    subject: 'Tu cuenta se bloquea en {{diasRestantes}} días si no la reactivás',
    bodyHtml: `
      <h2 style="${TITULO}">Tu cuenta está por bloquearse</h2>
      <p>Quedan <strong>{{diasRestantes}} días</strong> para que se cumpla el plazo de 30 días en modo solo lectura.</p>
      <p>Si no reactivás tu plan antes de esa fecha, tu cuenta se va a <strong>bloquear</strong> (vas a perder incluso el acceso de lectura a tus datos).</p>
      ${BOTON}
    `.trim(),
    variables: { diasRestantes: '5' },
  },
  cuentaBloqueada: {
    label: 'Cuenta bloqueada',
    subject: 'Tu cuenta en Manager3D fue bloqueada',
    bodyHtml: `
      <h2 style="${TITULO}">Tu cuenta fue bloqueada</h2>
      <p>Pasaron los 30 días de modo solo lectura sin reactivar tu plan, así que tu cuenta quedó <strong>bloqueada</strong>: por ahora no podés ni ver ni cargar datos.</p>
      <p>Tus datos siguen guardados y se pueden recuperar si reactivás el plan. Tené en cuenta que si la cuenta permanece bloqueada por mucho tiempo sin reactivarse, la información podría eliminarse definitivamente.</p>
      <p>Contactate con nosotros para reactivar tu cuenta cuando quieras.</p>
      ${BOTON}
    `.trim(),
    variables: {},
  },
  bienvenida: {
    label: 'Bienvenida al registrarse',
    subject: '¡Bienvenido a Manager3D!',
    bodyHtml: `
      <h2 style="${TITULO}">¡Bienvenido a Manager3D!</h2>
      <p>Gracias por registrarte. Ya arrancó tu prueba gratuita de 7 días con acceso completo a la app.</p>
      <p>Ante cualquier duda o inconveniente, escribinos a <strong>manager3d.app@gmail.com</strong> y te ayudamos.</p>
      ${BOTON}
    `.trim(),
    variables: {},
  },
  nuevoSuscriptor: {
    label: 'Aviso interno: nuevo registro (a admin)',
    subject: 'Nuevo registro en Manager3D',
    bodyHtml: `
      <h2 style="${TITULO}">Nuevo registro</h2>
      <p>Se registró un usuario nuevo (arrancó su prueba gratuita de 7 días):</p>
      <p><strong>{{email}}</strong></p>
    `.trim(),
    variables: { email: 'usuario@ejemplo.com' },
  },
  nuevaSolicitudContacto: {
    label: 'Aviso interno: nueva solicitud de contacto (a admin)',
    subject: 'Nueva solicitud de contacto: {{nombre}} {{apellido}}',
    bodyHtml: `
      <h2 style="${TITULO}">Nueva solicitud de contacto</h2>
      <table style="border-collapse: collapse;">{{filasTabla}}</table>
    `.trim(),
    // {{filasTabla}} es especial: no se edita como texto libre, se arma
    // siempre a partir de los datos reales del formulario (ver más abajo).
    // Para la vista previa del panel se muestra con datos de ejemplo.
    variables: {
      nombre: 'Juana',
      apellido: 'Pérez',
      filasTabla: filasTablaContacto({
        nombre: 'Juana', apellido: 'Pérez', tipoDocumento: 'DNI', numeroDocumento: '30111222',
        condicionImpositiva: 'Monotributo', localidad: 'Córdoba', telefono: '351-1234567',
        email: 'juana@ejemplo.com', resena: 'Vender piezas impresas a medida.',
      }),
    },
  },
};

function filasTablaContacto(datos) {
  const filas = [
    ['Nombre', `${datos.nombre || ''} ${datos.apellido || ''}`.trim()],
    ['Documento', `${datos.tipoDocumento || ''} ${datos.numeroDocumento || ''}`.trim()],
    ['Condición impositiva', datos.condicionImpositiva || ''],
    ['Localidad', datos.localidad || ''],
    ['Teléfono', datos.telefono || ''],
    ['Email', datos.email || ''],
    ['¿Qué haría con la app?', datos.resena || ''],
  ];
  return filas
    .map(([label, valor]) => `<tr><td style="padding: 4px 12px 4px 0; color: #666;">${label}</td><td style="padding: 4px 0;">${valor || '-'}</td></tr>`)
    .join('');
}

function sustituirVariables(texto, vars) {
  return (texto || '').replace(/\{\{(\w+)\}\}/g, (_, clave) => (vars[clave] ?? ''));
}

// Trae los overrides guardados desde el panel admin (un único doc con un
// campo por plantilla). Se llama UNA vez por ejecución de función y el
// resultado se pasa a renderPlantilla, para no pegarle a Firestore por cada
// mail que se manda en un mismo lote (ver transicionSuscripciones.js).
async function obtenerOverridesPlantillas() {
  const snap = await db.doc('configuracion/emailTemplates').get();
  return snap.exists ? snap.data() : {};
}

// Arma { subject, html } final de una plantilla: toma el override guardado
// (si existe y tiene ese campo) o el default hardcodeado, sustituye
// {{variables}} y envuelve el cuerpo en el layout común.
function renderPlantilla(id, vars, overrides = {}) {
  const base = DEFAULTS[id];
  if (!base) throw new Error(`Plantilla de mail desconocida: ${id}`);
  const override = overrides[id] || {};
  const subject = sustituirVariables(override.subject || base.subject, vars);
  const bodyHtml = sustituirVariables(override.bodyHtml || base.bodyHtml, vars);
  return { subject, html: layout(bodyHtml) };
}

module.exports = {
  DEFAULTS,
  obtenerOverridesPlantillas,
  renderPlantilla,
  filasTablaContacto,
};
