const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { db, Timestamp } = require('../admin');
const { enviarEmail, gmailAppPassword, EMAIL_ADMIN } = require('../mailer');
const { renderPlantilla, obtenerOverridesPlantillas, filasTablaPerfil } = require('../emailTemplates');
const { perfilCompleto, planGratuitoId, camposActivacionGratuito } = require('../planGratuito');

// "Completá tu perfil": el dueño de la cuenta carga sus datos y, a cambio,
// accede al plan gratuito (ver planGratuito.js):
//   - en prueba: la marca para pasar al plan gratuito cuando la prueba vence;
//   - en modo lectura o bloqueada: pasa al plan gratuito ahora mismo.
// Los datos van a datosSuscriptor/{uid} (la ficha que ve el admin en
// "Consultar datos"), que el cliente no puede escribir directo.

const ESTADOS_QUE_ACTIVAN_YA = ['lectura', 'suspendida'];

exports.completarPerfil = onCall({ secrets: [gmailAppPassword] }, async (request) => {
  const uid = request.auth?.uid;
  const email = request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : null;
  if (!uid) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  // Sólo el dueño: un miembro invitado usa la cuenta del dueño.
  if (email) {
    const inv = await db.doc(`invitacionesMiembro/${email}`).get();
    if (inv.exists && inv.data().estado === 'activo') {
      throw new HttpsError('permission-denied', 'Sólo el dueño de la cuenta puede completar el perfil.');
    }
  }

  // Mismos datos que el formulario de contacto (ModalContacto.jsx, que es
  // el formulario de este perfil). Obligatorios: los de perfilCompleto; el
  // resto se guarda si viene.
  const d = request.data || {};
  const texto = (v, max) => String(v || '').trim().slice(0, max);
  const datos = {
    nombre: texto(d.nombre, 100),
    apellido: texto(d.apellido, 100),
    telefono: String(d.telefono || '').replace(/\D/g, ''),
    localidad: texto(d.localidad, 100),
    emprendimiento: texto(d.emprendimiento, 120),
    comoNosConociste: texto(d.comoNosConociste, 80),
    tipoDocumento: ['DNI', 'CUIT'].includes(d.tipoDocumento) ? d.tipoDocumento : '',
    numeroDocumento: String(d.numeroDocumento || '').replace(/\D/g, ''),
    condicionImpositiva: texto(d.condicionImpositiva, 60),
    emailContacto: texto(d.email, 120).toLowerCase()
  };
  if (!datos.nombre) throw new HttpsError('invalid-argument', 'Falta el nombre.');
  if (!datos.apellido) throw new HttpsError('invalid-argument', 'Falta el apellido.');
  if (!/^\d{6,15}$/.test(datos.telefono)) throw new HttpsError('invalid-argument', 'El teléfono no es válido.');
  if (!datos.localidad) throw new HttpsError('invalid-argument', 'Falta la localidad.');
  if (datos.numeroDocumento) {
    const ok = datos.tipoDocumento === 'CUIT' ? /^\d{11}$/.test(datos.numeroDocumento) : /^\d{7,8}$/.test(datos.numeroDocumento);
    if (!ok) throw new HttpsError('invalid-argument', datos.tipoDocumento === 'CUIT' ? 'El CUIT tiene que tener 11 dígitos.' : 'El DNI tiene que tener 7 u 8 dígitos.');
  }
  if (datos.emailContacto && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.emailContacto)) {
    throw new HttpsError('invalid-argument', 'El email no es válido.');
  }
  // Desde el formulario de contacto el admin ya recibe su propio aviso
  // (onNuevaSolicitudContacto): ahí no se manda el de perfil completo.
  const avisarAdmin = d.avisarAdmin !== false;

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const datosRef = db.doc(`datosSuscriptor/${uid}`);
  const planId = await planGratuitoId();
  const ahora = Timestamp.now();

  const resultado = await db.runTransaction(async (tx) => {
    const [subSnap, datosSnap] = await Promise.all([tx.get(subRef), tx.get(datosRef)]);
    if (!subSnap.exists) throw new HttpsError('failed-precondition', 'Tu cuenta todavía no tiene suscripción inicializada.');
    const sub = subSnap.data();
    const previos = datosSnap.exists ? datosSnap.data() : {};

    // No se pisan con vacío los datos opcionales que ya estaban (por
    // ejemplo el documento que cargó al contratar por Mercado Pago).
    const { emailContacto, ...campos } = datos;
    const opcional = (campo) => campos[campo] || previos[campo] || '';
    const nuevos = {
      ...campos,
      emprendimiento: opcional('emprendimiento'),
      comoNosConociste: opcional('comoNosConociste'),
      tipoDocumento: campos.numeroDocumento ? campos.tipoDocumento : (previos.tipoDocumento || ''),
      numeroDocumento: opcional('numeroDocumento'),
      condicionImpositiva: opcional('condicionImpositiva'),
      email: emailContacto || previos.email || sub.email || email || null,
      actualizadoEl: ahora,
      actualizadoDesde: 'perfil',
      ...(datosSnap.exists ? {} : { creadoEl: ahora })
    };
    tx.set(datosRef, nuevos, { merge: true });

    const activaYa = !!planId && ESTADOS_QUE_ACTIVAN_YA.includes(sub.estado) && perfilCompleto({ ...previos, ...nuevos });
    tx.set(subRef, {
      perfilCompleto: true,
      perfilCompletoEl: sub.perfilCompletoEl || ahora,
      ...(activaYa ? camposActivacionGratuito(planId, ahora) : {})
    }, { merge: true });
    tx.set(subRef.collection('eventos').doc(), {
      tipo: activaYa ? 'plan_gratuito_por_perfil' : 'perfil_completado',
      fecha: ahora,
      detalle: { estadoAnterior: sub.estado, planId: activaYa ? planId : null }
    });

    return { activaYa, estadoAnterior: sub.estado, primeraVez: !sub.perfilCompleto, email: sub.email || email, datos: nuevos };
  });

  // Mails después de confirmar: el lead al admin (sólo la primera vez) y,
  // si pasó al plan gratuito, el aviso al usuario.
  try {
    const overrides = await obtenerOverridesPlantillas();
    if (resultado.primeraVez && avisarAdmin) {
      const { subject, html } = renderPlantilla('perfilCompletado', {
        nombre: resultado.datos.nombre, apellido: resultado.datos.apellido, filasTabla: filasTablaPerfil(resultado.datos)
      }, overrides);
      await enviarEmail({ to: EMAIL_ADMIN, subject, html });
    }
    if (resultado.activaYa && resultado.email) {
      const { subject, html } = renderPlantilla('planGratuitoActivado', {}, overrides);
      await enviarEmail({ to: resultado.email, subject, html });
    }
  } catch (e) {
    logger.error('completarPerfil: no se pudieron mandar los mails', e);
  }

  return {
    ok: true,
    pasoAPlanGratuito: resultado.activaYa,
    // En prueba: pasa al plan gratuito cuando venza.
    planGratuitoAlVencer: resultado.estadoAnterior === 'trial' && !!planId
  };
});
