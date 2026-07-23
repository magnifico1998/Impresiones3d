const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const { db, Timestamp, DIA_MS, DURACION_LECTURA_DIAS } = require('../admin');

// Corre todos los días a las 03:00 (hora del servidor, UTC) y hace avanzar
// automáticamente el estado de las cuentas vencidas. Es la red de
// seguridad del sistema: aunque el webhook de Mercado Pago falle o se
// pierda una notificación, esto igual detecta la cuenta vencida al otro
// día como muy tarde.
//
// NOTA: usa collectionGroup sobre "suscripcion", así que Firestore va a
// pedir crear un índice compuesto la primera vez que corra en producción
// (el link para crearlo sale solo en los logs de la función si falta).
//
// NOTA 2: usa batch.commit() asumiendo que la cantidad de cuentas que
// cambian de estado en un mismo día no supera 500 (límite de un batch). Si
// el negocio crece mucho, esto se parte en batches de a 500.
exports.transicionSuscripciones = onSchedule('every day 03:00', async () => {
  const ahora = Timestamp.now();
  const batch = db.batch();
  let cambios = 0;

  // 1) Trials vencidos -> modo lectura
  const trialsVencidos = await db.collectionGroup('suscripcion')
    .where('estado', '==', 'trial')
    .where('trialFin', '<=', ahora)
    .get();

  trialsVencidos.forEach((doc) => {
    const fechaLimiteLectura = Timestamp.fromMillis(ahora.toMillis() + DURACION_LECTURA_DIAS * DIA_MS);
    batch.update(doc.ref, { estado: 'lectura', fechaLimiteLectura });
    batch.set(doc.ref.collection('eventos').doc(), { tipo: 'trial_vencido_a_lectura', fecha: ahora });
    cambios++;
  });

  // 2) Ciclos activos vencidos sin renovación registrada -> modo lectura
  //    (si Mercado Pago hubiera avisado el pago a tiempo, el webhook ya
  //    habría corrido cambiarEstadoSuscripcion y movido cicloFin a futuro,
  //    así que estos docs no entrarían acá).
  const ciclosVencidos = await db.collectionGroup('suscripcion')
    .where('estado', '==', 'activa')
    .where('cicloFin', '<=', ahora)
    .get();

  ciclosVencidos.forEach((doc) => {
    const fechaLimiteLectura = Timestamp.fromMillis(ahora.toMillis() + DURACION_LECTURA_DIAS * DIA_MS);
    batch.update(doc.ref, { estado: 'lectura', fechaLimiteLectura });
    batch.set(doc.ref.collection('eventos').doc(), { tipo: 'ciclo_vencido_a_lectura', fecha: ahora });
    cambios++;
  });

  // 3) Modo lectura vencido (pasaron los 10 días de gracia) -> suspendida
  //    Sólo cambia el flag de estado: los datos NO se borran físicamente
  //    (ver definición de Fase 0). Quedan archivados y recuperables a mano.
  const lecturaVencida = await db.collectionGroup('suscripcion')
    .where('estado', '==', 'lectura')
    .where('fechaLimiteLectura', '<=', ahora)
    .get();

  lecturaVencida.forEach((doc) => {
    batch.update(doc.ref, { estado: 'suspendida' });
    batch.set(doc.ref.collection('eventos').doc(), { tipo: 'lectura_a_suspendida', fecha: ahora });
    cambios++;
  });

  if (cambios > 0) {
    await batch.commit();
  }

  logger.info(`transicionSuscripciones: ${trialsVencidos.size} trial->lectura, ${ciclosVencidos.size} activa->lectura, ${lecturaVencida.size} lectura->suspendida`);
});
