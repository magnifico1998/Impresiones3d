const { db } = require('./admin');

// Dominio de la app: lo usan el botón de los mails y la vuelta del checkout
// de Mercado Pago (back_url en pagosMercadoPago.js). Si cambia, también hay
// que autorizarlo en Firebase Authentication (ver docs/operacion.md).
const APP_URL = 'https://manager3d.com.ar/';

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
      <p>¿No querés pagar por ahora? <strong>Completá tu perfil</strong> desde la app y seguí usando Manager3D gratis con el <strong>plan Boceto</strong>.</p>
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
  // Carta personal del fundador: presenta el proyecto, deja el contacto
  // directo y cuenta las mejoras que salieron de sugerencias de usuarios.
  bienvenida: {
    label: 'Bienvenida al registrarse',
    subject: '¡Bienvenido a Manager3D!',
    bodyHtml: `
      <h2 style="${TITULO}">¡Hola! ¿Cómo estás?</h2>
      <p>Gracias por registrarte en Manager3D. Ya arrancó tu <strong>prueba gratuita de 7 días</strong> con acceso completo a la app, y quería contarte un poco más sobre el proyecto.</p>
      <p>Soy maker, apasionado por la impresión 3D y autodidacta en programación. De la combinación de esas dos pasiones nació Manager3D, una plataforma creada por alguien que vive día a día los mismos desafíos que cualquier emprendimiento de impresión 3D.</p>
      <p>La idea fue desarrollar una herramienta que reúna, desde una perspectiva práctica y real, todo lo necesario para administrar el negocio de forma más simple, ordenada y eficiente: presupuestos, clientes, producción, ventas, inventario y mucho más.</p>
      <p>Pero lo más importante es que Manager3D sigue creciendo gracias a los aportes de su comunidad. Por eso me gusta mantener un contacto directo con quienes usan la plataforma. Si tenés dudas, sugerencias, necesidades específicas o ideas para mejorar alguna funcionalidad, no dudes en escribirme:</p>
      <p>
        📱 WhatsApp: <a href="https://wa.me/5493516617091" style="color: #1a1a1a;"><strong>351 661-7091</strong></a><br>
        📧 Email: <a href="mailto:manager3d.app@gmail.com" style="color: #1a1a1a;"><strong>manager3d.app@gmail.com</strong></a>
      </p>
      <p>Gracias a las sugerencias de los usuarios ya incorporamos mejoras muy importantes, entre ellas:</p>
      <p>
        ✅ Facturación electrónica para los planes con suscripción.<br>
        ✅ Gestión y control de inventario.<br>
        ✅ Simplificación y rediseño de distintas secciones para mejorar la experiencia de uso.<br>
        ✅ Nuevas funcionalidades pedidas por la comunidad.
      </p>
      <p>Nuestro objetivo es seguir evolucionando para que Manager3D se adapte cada vez mejor a las necesidades reales de cada maker y emprendimiento.</p>
      <p>Muchas gracias por sumarte. Espero tus comentarios para seguir construyendo juntos la mejor herramienta de gestión para impresión 3D.</p>
      <p>¡Saludos!<br><strong>Gustavo Kimmel</strong><br>Fundador de Manager3D</p>
      ${BOTON}
    `.trim(),
    variables: {},
  },
  avisoPlanGratuito: {
    label: 'Aviso de plan gratuito disponible (Boceto)',
    subject: 'Podés seguir usando Manager3D gratis con el plan Boceto',
    bodyHtml: `
      <h2 style="${TITULO}">Seguí usando Manager3D sin costo</h2>
      <p>Notamos que tu cuenta está en período de prueba o en modo solo lectura. Antes de que se venza o se bloquee, queremos contarte que tenemos un <strong>plan gratuito llamado Boceto</strong>, pensado para que sigas usando la plataforma sin necesidad de abonar.</p>
      <p>Para tenerlo, sólo tenés que entrar a la app y <strong>completar tu perfil</strong> (nombre, teléfono y localidad). Si estás en prueba, pasás a Boceto automáticamente cuando termine; si tu cuenta está en modo lectura o bloqueada, se activa en el momento.</p>
      ${BOTON}
    `.trim(),
    variables: {},
  },
  reactivacion: {
    label: 'Reactivación de suscriptores inactivos',
    subject: 'Te extrañamos en Manager3D 👋',
    bodyHtml: `
      <h2 style="${TITULO}">¿Cómo podemos mejorar?</h2>
      <p>Hace un tiempo que no te vemos por Manager3D y queríamos preguntarte directamente: ¿qué te frenó, o qué le falta a la app para que la sigas usando?</p>
      <p>Nos importa mucho tu opinión. Contanos qué se puede mejorar o qué funcionalidad te gustaría que agreguemos, respondiendo este mismo mail.</p>
      <p>¡Gracias por tu tiempo, esperamos verte de nuevo pronto!</p>
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
  planGratuitoActivado: {
    label: 'Plan gratuito Boceto activado',
    subject: 'Ya tenés el plan Boceto de Manager3D',
    bodyHtml: `
      <h2 style="${TITULO}">Seguís usando Manager3D gratis</h2>
      <p>Tu cuenta pasó al <strong>plan Boceto</strong>: podés seguir cargando presupuestos, pedidos y clientes sin costo, dentro de los límites del plan.</p>
      <p>El plan se renueva solo cada vez que entrás a la app. Si en algún momento necesitás más, podés pasarte a un plan pago desde <strong>Mi emprendimiento</strong>.</p>
      ${BOTON}
    `.trim(),
    variables: {},
  },
  perfilCompletado: {
    label: 'Aviso interno: un usuario completó su perfil (a admin)',
    subject: 'Perfil completo: {{nombre}} {{apellido}}',
    bodyHtml: `
      <h2 style="${TITULO}">Un usuario completó su perfil</h2>
      <table style="border-collapse: collapse;">{{filasTabla}}</table>
    `.trim(),
    // Mismo criterio que nuevaSolicitudContacto: {{filasTabla}} se arma
    // siempre desde los datos reales (ver filasTablaPerfil más abajo).
    variables: {
      nombre: 'Juana',
      apellido: 'Pérez',
      filasTabla: filasTablaPerfil({
        nombre: 'Juana', apellido: 'Pérez', telefono: '3511234567', localidad: 'Córdoba',
        emprendimiento: 'Impresiones Juana', comoNosConociste: 'Instagram', email: 'juana@ejemplo.com'
      }),
    },
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
  nuevoPedidoCatalogo: {
    label: 'Aviso al emprendedor: nuevo pedido desde el catálogo',
    subject: 'Nuevo pedido en tu catálogo: {{cliente}}',
    bodyHtml: `
      <h2 style="${TITULO}">🔔 Nuevo pedido en tu catálogo</h2>
      <table style="border-collapse: collapse;">{{filasTabla}}</table>
      ${BOTON}
    `.trim(),
    // Mismo criterio que nuevaSolicitudContacto: {{filasTabla}} se arma
    // siempre desde los datos reales de la solicitud (ver más abajo), acá
    // sólo hay datos de ejemplo para la vista previa del panel.
    variables: {
      cliente: 'Juana Pérez',
      filasTabla: filasTablaPedidoCatalogo({
        cliente: 'Juana Pérez', telefono: '351-1234567', email: 'juana@ejemplo.com',
        totalEstimado: 45000, items: [{ nombre: 'Maceta hexagonal', cantidad: 2 }, { nombre: 'Llavero', cantidad: 3 }],
      }),
    },
  },
  facturaEmitida: {
    label: 'Factura electrónica emitida (con el PDF adjunto)',
    subject: 'Tu comprobante de Manager3D: {{comprobante}}',
    bodyHtml: `
      <h2 style="${TITULO}">Tu comprobante</h2>
      <p>Hola {{nombre}}, te adjuntamos la <strong>{{comprobante}}</strong> por <strong>{{importe}}</strong>.</p>
      <p>Gracias por confiar en Manager3D.</p>
      ${BOTON}
    `.trim(),
    variables: { nombre: 'Juana', comprobante: 'Factura C 00003-00000012', importe: '$ 15.000,00' },
  },
  facturaEmprendimiento: {
    label: 'Factura de un emprendimiento a su cliente (con el PDF adjunto)',
    subject: '{{emprendimiento}}: tu {{comprobante}}',
    bodyHtml: `
      <h2 style="${TITULO}">Tu comprobante de {{emprendimiento}}</h2>
      <p>Hola {{nombre}}, te adjuntamos la <strong>{{comprobante}}</strong> por <strong>{{importe}}</strong>.</p>
      <p>Si tenés alguna consulta, respondé este mail y le llega directamente a {{emprendimiento}}.</p>
    `.trim(),
    variables: { nombre: 'Juana', comprobante: 'Factura C 00002-00000015', importe: '$ 45.000,00', emprendimiento: 'Impresiones Lucas' },
  },
};

// Los valores de este formulario los tipea cualquier cuenta autenticada
// (ModalContacto.jsx) y terminan, tal cual, en un mail HTML a la casilla
// real del admin -- si no se escapan acá, alguien podría inyectar un link
// de phishing o una imagen de rastreo disfrazada de "solicitud de contacto".
function escapeHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function filasTablaContacto(datos) {
  const filas = [
    ['Nombre', `${datos.nombre || ''} ${datos.apellido || ''}`.trim()],
    ['Emprendimiento', datos.emprendimiento || ''],
    ['Documento', `${datos.tipoDocumento || ''} ${datos.numeroDocumento || ''}`.trim()],
    ['Condición impositiva', datos.condicionImpositiva || ''],
    ['Localidad', datos.localidad || ''],
    ['Teléfono', datos.telefono || ''],
    ['Email', datos.email || ''],
    ['Cómo nos conoció', datos.comoNosConociste || ''],
    ['¿Qué haría con la app?', datos.resena || ''],
  ];
  return filas
    .map(([label, valor]) => `<tr><td style="padding: 4px 12px 4px 0; color: #666;">${label}</td><td style="padding: 4px 0;">${escapeHtml(valor || '-')}</td></tr>`)
    .join('');
}

// Datos del perfil (http/perfil.js): los tipea el usuario, así que se
// escapan acá igual que en filasTablaContacto.
function filasTablaPerfil(datos) {
  const filas = [
    ['Nombre', `${datos.nombre || ''} ${datos.apellido || ''}`.trim()],
    ['Emprendimiento', datos.emprendimiento || ''],
    ['Documento', `${datos.tipoDocumento || ''} ${datos.numeroDocumento || ''}`.trim()],
    ['Condición impositiva', datos.condicionImpositiva || ''],
    ['Localidad', datos.localidad || ''],
    ['Teléfono', datos.telefono || ''],
    ['Email', datos.email || ''],
    ['Cómo nos conoció', datos.comoNosConociste || ''],
  ];
  return filas
    .map(([label, valor]) => `<tr><td style="padding: 4px 12px 4px 0; color: #666;">${label}</td><td style="padding: 4px 0;">${escapeHtml(valor || '-')}</td></tr>`)
    .join('');
}

// La solicitud de catálogo la carga cualquier visitante sin login
// (CatalogoPublico.jsx) -- mismo motivo que filasTablaContacto para
// escapar cada valor acá adentro en vez de dejarlo como variable de texto
// libre en la plantilla.
function filasTablaPedidoCatalogo(datos) {
  const itemsTexto = (datos.items || [])
    .map(it => `${it.cantidad}x ${it.nombre}`)
    .join(', ') || '—';
  const filas = [
    ['Cliente', datos.cliente || ''],
    ['Teléfono', datos.telefono || ''],
    ['Email', datos.email || ''],
    ['Total estimado', datos.totalEstimado != null ? `$${Number(datos.totalEstimado).toLocaleString('es-AR')}` : '—'],
    ['Productos', itemsTexto],
  ];
  return filas
    .map(([label, valor]) => `<tr><td style="padding: 4px 12px 4px 0; color: #666;">${label}</td><td style="padding: 4px 0;">${escapeHtml(valor || '-')}</td></tr>`)
    .join('');
}

// filasTabla ya llega como HTML seguro (cada valor de datos del usuario se
// escapó adentro de filasTablaContacto/filasTablaPedidoCatalogo): es la
// única variable que se deja pasar sin re-escapar en el cuerpo del mail.
// Cualquier otra variable que use el cuerpo de una plantilla se escapa
// siempre, así una plantilla nueva no puede reabrir sin querer el mismo
// agujero por descuido.
const VARIABLES_HTML_CONFIABLE = new Set(['filasTabla']);

function sustituirVariables(texto, vars, { escaparHtml = false } = {}) {
  return (texto || '').replace(/\{\{(\w+)\}\}/g, (_, clave) => {
    const valor = vars[clave] ?? '';
    if (escaparHtml && !VARIABLES_HTML_CONFIABLE.has(clave)) return escapeHtml(valor);
    return valor;
  });
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
// {{variables}} y envuelve el cuerpo en el layout común. El asunto no se
// escapa (es texto plano, no se renderiza como HTML); el cuerpo sí, para
// que ninguna variable pueda inyectar markup en el mail final.
function renderPlantilla(id, vars, overrides = {}) {
  const base = DEFAULTS[id];
  if (!base) throw new Error(`Plantilla de mail desconocida: ${id}`);
  const override = overrides[id] || {};
  const subject = sustituirVariables(override.subject || base.subject, vars);
  const bodyHtml = sustituirVariables(override.bodyHtml || base.bodyHtml, vars, { escaparHtml: true });
  return { subject, html: layout(bodyHtml) };
}

module.exports = {
  APP_URL,
  DEFAULTS,
  obtenerOverridesPlantillas,
  renderPlantilla,
  filasTablaContacto,
  filasTablaPedidoCatalogo,
  filasTablaPerfil,
};
