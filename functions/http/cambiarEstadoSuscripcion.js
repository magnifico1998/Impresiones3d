const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp, FieldValue, sumarMesCalendario, formatearFecha } = require('../admin');

// Única puerta de entrada para que un admin cambie el estado de la
// suscripción de una cuenta desde el panel. Centralizarlo acá (en vez de
// dejar que AdminPage.jsx escriba Firestore directo) asegura que:
//  - cada cambio de estado toque TODOS los campos relacionados de forma
//    atómica (ej: activar sin actualizar cicloFin dejaría el sistema en un
//    estado inconsistente),
//  - quede un registro en "eventos" de quién hizo qué y cuándo,
//  - el día de mañana el webhook de Mercado Pago reutilice exactamente
//    esta misma lógica para la acción "activar" cuando llegue un pago.
exports.cambiarEstadoSuscripcion = onCall(async (request) => {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }

  const { uid, accion, planId } = request.data || {};
  if (!uid || typeof uid !== 'string' || !accion || typeof accion !== 'string') {
    throw new HttpsError('invalid-argument', 'Faltan datos (uid, accion).');
  }

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    throw new HttpsError('not-found', 'Esa cuenta todavía no tiene suscripción inicializada.');
  }

  const ahora = Timestamp.now();
  let update = {};

  switch (accion) {
    case 'activar': {
      // Ancla el ciclo al día de HOY (o al día en que Mercado Pago
      // confirme el pago, cuando se conecte el webhook), no al mes
      // calendario -- ver definición de Fase 1.
      const cicloFin = sumarMesCalendario(ahora);
      update = {
        estado: 'activa',
        planId: planId || subSnap.data().planId || null,
        cicloInicio: ahora,
        cicloId: formatearFecha(ahora),
        cicloFin,
        fechaLimiteLectura: FieldValue.delete()
      };
      break;
    }

    case 'renovarCiclo': {
      // La usa (a futuro) el webhook de Mercado Pago cuando confirma un
      // pago de renovación: corre el ciclo un mes más desde el cicloFin
      // anterior (no desde "ahora"), para no regalar ni recortar días si
      // el pago llega un poco antes o después de la fecha exacta.
      const cicloAnteriorFin = subSnap.data().cicloFin || ahora;
      const nuevoCicloInicio = cicloAnteriorFin;
      const nuevoCicloFin = sumarMesCalendario(cicloAnteriorFin);
      update = {
        estado: 'activa',
        cicloInicio: nuevoCicloInicio,
        cicloId: formatearFecha(nuevoCicloInicio),
        cicloFin: nuevoCicloFin,
        fechaLimiteLectura: FieldValue.delete()
      };
      break;
    }

    case 'extenderTrial': {
      const trialFinActual = subSnap.data().trialFin || ahora;
      const nuevoTrialFin = Timestamp.fromMillis(
        Math.max(trialFinActual.toMillis(), ahora.toMillis()) + 7 * 24 * 60 * 60 * 1000
      );
      update = { estado: 'trial', trialFin: nuevoTrialFin };
      break;
    }

    case 'suspender':
      update = { estado: 'suspendida' };
      break;

    case 'reactivar':
      // Reactivación manual (ej: pagó por transferencia y vos lo activás
      // a mano). Le da un ciclo nuevo completo desde hoy.
      update = {
        estado: 'activa',
        cicloInicio: ahora,
        cicloId: formatearFecha(ahora),
        cicloFin: sumarMesCalendario(ahora),
        fechaLimiteLectura: FieldValue.delete()
      };
      break;

    default:
      throw new HttpsError('invalid-argument', `Acción desconocida: ${accion}`);
  }

  await subRef.set(update, { merge: true });
  await subRef.collection('eventos').add({
    tipo: accion,
    fecha: ahora,
    admin: emailSolicitante,
    detalle: { planId: planId || null }
  });

  return { ok: true };
});
