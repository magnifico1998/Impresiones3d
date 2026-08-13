const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const { db, Timestamp, DIA_MS } = require('../admin');
const { enviarEmail, gmailAppPassword } = require('../mailer');
const { renderPlantilla, obtenerOverridesPlantillas } = require('../emailTemplates');

const DIAS_INACTIVIDAD = 10;
const COOLDOWN_DIAS = 30;

// Corre todos los días a las 04:00 (hora del servidor, UTC) y manda el mail
// de "reactivación" (plantilla `reactivacion`, pide feedback de qué
// mejorar) a todo suscriptor que lleve DIAS_INACTIVIDAD días sin ingresar.
// Antes era un botón manual del panel admin (filtro plan + días, que un
// admin tenía que apretar a mano tanda por tanda, ver historial de
// AdminPage.jsx); se reemplaza por este cron para no depender de que
// alguien se acuerde de mandarlo. El cooldown de COOLDOWN_DIAS entre
// reenvíos a un mismo suscriptor es el mismo que ya tenía el botón.
//
// NOTA: usa collectionGroup sobre "suscripcion", así que Firestore va a
// pedir crear un índice compuesto la primera vez que corra en producción
// (el link para crearlo sale solo en los logs de la función si falta).
exports.reactivacionInactivos = onSchedule(
  { schedule: 'every day 04:00', secrets: [gmailAppPassword] },
  async () => {
    const ahora = Timestamp.now();
    const umbralInactividad = Timestamp.fromMillis(ahora.toMillis() - DIAS_INACTIVIDAD * DIA_MS);
    const cooldownDesde = ahora.toMillis() - COOLDOWN_DIAS * DIA_MS;

    const inactivos = await db.collectionGroup('suscripcion')
      .where('ultimoAcceso', '<=', umbralInactividad)
      .get();

    const candidatos = inactivos.docs.filter((doc) => {
      const data = doc.data();
      if (!data.email) return false;
      const ultimoEnvioMs = data.reactivacionEnviadaEl?.toMillis?.();
      return !ultimoEnvioMs || ultimoEnvioMs <= cooldownDesde;
    });

    if (candidatos.length === 0) {
      logger.info('reactivacionInactivos: sin candidatos hoy.');
      return;
    }

    const overrides = await obtenerOverridesPlantillas();
    const { subject, html } = renderPlantilla('reactivacion', {}, overrides);

    let enviados = 0;
    let fallidos = 0;
    await Promise.all(
      candidatos.map(async (doc) => {
        try {
          await enviarEmail({ to: doc.data().email, subject, html });
          await doc.ref.set({ reactivacionEnviadaEl: ahora }, { merge: true });
          enviados++;
        } catch (e) {
          logger.error(`Error al enviar mail de reactivación a ${doc.ref.path}:`, e);
          fallidos++;
        }
      })
    );

    logger.info(`reactivacionInactivos: ${enviados} mail(s) enviado(s), ${fallidos} fallido(s).`);
  }
);
