const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const { db, Timestamp, FieldValue, DIA_MS, DURACION_LECTURA_DIAS, formatearFecha, sumarMesCalendario } = require('../admin');
const { enviarEmail, gmailAppPassword } = require('../mailer');
const { renderPlantilla, obtenerOverridesPlantillas } = require('../emailTemplates');

// Manda un mail por cada doc de una lista, sin dejar que un fallo de mail
// tire abajo nada más (nunca debe afectar la transición de estados real,
// que es la parte crítica de esta función). Cada doc necesita { email }.
// `armarVars` arma las variables de esa plantilla a partir del doc (o {} si
// la plantilla no tiene variables).
async function mandarEnLote(docs, plantillaId, armarVars, overrides) {
  const resultados = await Promise.allSettled(
    docs.map(async (doc) => {
      const email = doc.data().email;
      if (!email) return;
      const { subject, html } = renderPlantilla(plantillaId, armarVars(doc), overrides);
      await enviarEmail({ to: email, subject, html });
    })
  );
  resultados.forEach((r) => {
    if (r.status === 'rejected') logger.error('Error al enviar mail de suscripción:', r.reason);
  });
}

// Corre todos los días a las 03:00 (hora del servidor, UTC) y hace avanzar
// automáticamente el estado de las cuentas vencidas, además de mandar los
// mails de aviso de vencimiento/bloqueo. Es la red de seguridad del
// sistema: aunque el webhook de Mercado Pago falle o se pierda una
// notificación, esto igual detecta la cuenta vencida al otro día como muy
// tarde.
//
// NOTA: usa collectionGroup sobre "suscripcion", así que Firestore va a
// pedir crear un índice compuesto la primera vez que corra en producción
// (el link para crearlo sale solo en los logs de la función si falta).
//
// NOTA 2: usa batch.commit() asumiendo que la cantidad de cuentas que
// cambian de estado en un mismo día no supera 500 (límite de un batch). Si
// el negocio crece mucho, esto se parte en batches de a 500.
exports.transicionSuscripciones = onSchedule(
  { schedule: 'every day 03:00', secrets: [gmailAppPassword] },
  async () => {
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
    //    EXCEPCIÓN: cuentas con un beneficio de código promocional todavía
    //    vigente (promoCiclosRestantes > 0, ver codigosPromocionales.js) no
    //    pagan, así que nada más las va a renovar -- acá mismo se les
    //    prorroga el ciclo un mes más gratis y se descuenta un ciclo del
    //    beneficio. Recién cuando se agota (promoCiclosRestantes llega a 0)
    //    caen al mismo camino de modo lectura que cualquier otra cuenta.
    const ciclosVencidos = await db.collectionGroup('suscripcion')
      .where('estado', '==', 'activa')
      .where('cicloFin', '<=', ahora)
      .get();

    const ciclosVencidosSinPromo = [];
    ciclosVencidos.forEach((doc) => {
      const data = doc.data();
      if (data.promoCiclosRestantes > 0) {
        const cicloAnteriorFin = data.cicloFin || ahora;
        const nuevoCicloFin = sumarMesCalendario(cicloAnteriorFin);
        batch.update(doc.ref, {
          cicloInicio: cicloAnteriorFin,
          cicloId: formatearFecha(cicloAnteriorFin),
          cicloFin: nuevoCicloFin,
          promoCiclosRestantes: FieldValue.increment(-1)
        });
        batch.set(doc.ref.collection('eventos').doc(), { tipo: 'promo_renovada', fecha: ahora });
        cambios++;
        return;
      }
      ciclosVencidosSinPromo.push(doc);
    });

    ciclosVencidosSinPromo.forEach((doc) => {
      const fechaLimiteLectura = Timestamp.fromMillis(ahora.toMillis() + DURACION_LECTURA_DIAS * DIA_MS);
      batch.update(doc.ref, { estado: 'lectura', fechaLimiteLectura });
      batch.set(doc.ref.collection('eventos').doc(), { tipo: 'ciclo_vencido_a_lectura', fecha: ahora });
      cambios++;
    });

    // 3) Modo lectura vencido (pasaron los DURACION_LECTURA_DIAS días de
    //    gracia) -> suspendida. A partir de acá firestore.rules le corta
    //    también la LECTURA de sus datos (ver cuentaPuedeLeer), no sólo la
    //    escritura -- el cambio de estado acá es lo único que dispara ese
    //    bloqueo. Los datos en sí NO se borran físicamente (ver definición de
    //    Fase 0): quedan archivados y recuperables a mano por un admin, o se
    //    pueden purgar del todo con la Cloud Function borrarCuenta si nunca
    //    se reactiva (ver panel de Suscriptores).
    const lecturaVencida = await db.collectionGroup('suscripcion')
      .where('estado', '==', 'lectura')
      .where('fechaLimiteLectura', '<=', ahora)
      .get();

    lecturaVencida.forEach((doc) => {
      batch.update(doc.ref, { estado: 'suspendida' });
      batch.set(doc.ref.collection('eventos').doc(), { tipo: 'lectura_a_suspendida', fecha: ahora });
      cambios++;
    });

    // 4) Avisos de "faltan N días" -- no cambian estado, sólo mandan mail.
    //    Cada bloque busca cuentas cuya fecha límite cae en una ventana de
    //    ~24hs alrededor del umbral (coincide con la cadencia diaria de este
    //    cron), y marca un campo con la fecha límite que ya se avisó para
    //    no mandar el mismo mail dos veces (y para que se re-arme solo si
    //    la cuenta se renueva y la fecha límite cambia).
    const ventana = (diasDesde, diasHasta) => [
      Timestamp.fromMillis(ahora.toMillis() + diasDesde * DIA_MS),
      Timestamp.fromMillis(ahora.toMillis() + diasHasta * DIA_MS),
    ];

    // 4a) Trial por vencer en 5 días
    const [trialDesde, trialHasta] = ventana(4, 5);
    const trialsPorVencer = await db.collectionGroup('suscripcion')
      .where('estado', '==', 'trial')
      .where('trialFin', '>=', trialDesde)
      .where('trialFin', '<', trialHasta)
      .get();
    const trialsPorVencerAAvisar = trialsPorVencer.docs.filter(
      (doc) => doc.data().avisoVencimiento5dEnviadoPara !== doc.data().trialFin.toMillis()
    );
    trialsPorVencerAAvisar.forEach((doc) => {
      batch.update(doc.ref, { avisoVencimiento5dEnviadoPara: doc.data().trialFin.toMillis() });
    });

    // 4b) Ciclo activo por vencer en 5 días
    const [cicloDesde, cicloHasta] = ventana(4, 5);
    const ciclosPorVencer = await db.collectionGroup('suscripcion')
      .where('estado', '==', 'activa')
      .where('cicloFin', '>=', cicloDesde)
      .where('cicloFin', '<', cicloHasta)
      .get();
    const ciclosPorVencerAAvisar = ciclosPorVencer.docs.filter(
      (doc) => doc.data().avisoVencimiento5dEnviadoPara !== doc.data().cicloFin.toMillis()
    );
    ciclosPorVencerAAvisar.forEach((doc) => {
      batch.update(doc.ref, { avisoVencimiento5dEnviadoPara: doc.data().cicloFin.toMillis() });
    });

    // 4c) Modo lectura, faltan 10 días para el bloqueo
    const [b10Desde, b10Hasta] = ventana(9, 10);
    const bloqueo10d = await db.collectionGroup('suscripcion')
      .where('estado', '==', 'lectura')
      .where('fechaLimiteLectura', '>=', b10Desde)
      .where('fechaLimiteLectura', '<', b10Hasta)
      .get();
    const bloqueo10dAAvisar = bloqueo10d.docs.filter(
      (doc) => doc.data().avisoBloqueo10dEnviadoPara !== doc.data().fechaLimiteLectura.toMillis()
    );
    bloqueo10dAAvisar.forEach((doc) => {
      batch.update(doc.ref, { avisoBloqueo10dEnviadoPara: doc.data().fechaLimiteLectura.toMillis() });
    });

    // 4d) Modo lectura, faltan 5 días para el bloqueo
    const [b5Desde, b5Hasta] = ventana(4, 5);
    const bloqueo5d = await db.collectionGroup('suscripcion')
      .where('estado', '==', 'lectura')
      .where('fechaLimiteLectura', '>=', b5Desde)
      .where('fechaLimiteLectura', '<', b5Hasta)
      .get();
    const bloqueo5dAAvisar = bloqueo5d.docs.filter(
      (doc) => doc.data().avisoBloqueo5dEnviadoPara !== doc.data().fechaLimiteLectura.toMillis()
    );
    bloqueo5dAAvisar.forEach((doc) => {
      batch.update(doc.ref, { avisoBloqueo5dEnviadoPara: doc.data().fechaLimiteLectura.toMillis() });
    });

    if (cambios > 0 || trialsPorVencerAAvisar.length || ciclosPorVencerAAvisar.length || bloqueo10dAAvisar.length || bloqueo5dAAvisar.length) {
      await batch.commit();
    }

    // Los mails se mandan DESPUÉS de que el batch se confirmó, para no
    // avisar de un cambio que en definitiva no se guardó. Los overrides de
    // plantillas se leen una sola vez acá y se reusan en todo el lote, en
    // vez de una lectura a Firestore por cada mail individual.
    try {
      const overrides = await obtenerOverridesPlantillas();
      const sinVars = () => ({});
      await Promise.all([
        mandarEnLote(trialsVencidos.docs, 'modoLectura', sinVars, overrides),
        mandarEnLote(ciclosVencidosSinPromo, 'modoLectura', sinVars, overrides),
        mandarEnLote(lecturaVencida.docs, 'cuentaBloqueada', sinVars, overrides),
        mandarEnLote(trialsPorVencerAAvisar, 'avisoVencimiento', (doc) => ({ fecha: formatearFecha(doc.data().trialFin) }), overrides),
        mandarEnLote(ciclosPorVencerAAvisar, 'avisoVencimiento', (doc) => ({ fecha: formatearFecha(doc.data().cicloFin) }), overrides),
        mandarEnLote(bloqueo10dAAvisar, 'avisoBloqueo', () => ({ diasRestantes: '10' }), overrides),
        mandarEnLote(bloqueo5dAAvisar, 'avisoBloqueo', () => ({ diasRestantes: '5' }), overrides),
      ]);
    } catch (e) {
      logger.error('Error al leer overrides de plantillas de mail:', e);
    }

    logger.info(
      `transicionSuscripciones: ${trialsVencidos.size} trial->lectura, ${ciclosVencidosSinPromo.length} activa->lectura, ${ciclosVencidos.size - ciclosVencidosSinPromo.length} promo renovada, ` +
      `${lecturaVencida.size} lectura->suspendida, ${trialsPorVencerAAvisar.length + ciclosPorVencerAAvisar.length} avisos de vencimiento, ` +
      `${bloqueo10dAAvisar.length} avisos de bloqueo (10d), ${bloqueo5dAAvisar.length} avisos de bloqueo (5d)`
    );
  }
);
