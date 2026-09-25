const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const { db, Timestamp, DIA_MS, anioMesArgentina } = require('../admin');

// Cierre mensual automático del ledger de cada revendedor
// (revendedores/{codigo}/ventas/{YYYY-MM}, ver ledgerRevendedor.js). Corre
// el día 1 a las 00:00 de Argentina -- o sea, el último día del mes a las
// 24 hs -- y cierra el mes que acaba de terminar: congela totales y saldo,
// y el panel admin sólo lo deja revisar y descargar para facturar. Las
// ventas que entren desde ese momento ya caen en el mes nuevo (el ledger
// agrupa por mes en hora de Argentina), así que nada se suma a un mes
// cerrado.
//
// Es idempotente: si se vuelve a ejecutar sobre un mes ya cerrado, lo
// vuelve a escribir igual sin cambiar sus datos (salvo cerradoEl).

async function cerrarMes(codigo, datosRevendedor, anioMes, ahora) {
  const ventaRef = db.doc(`revendedores/${codigo}/ventas/${anioMes}`);
  const ventaSnap = await ventaRef.get();

  // Un revendedor inactivo sin ventas ese mes no necesita un cierre vacío;
  // uno activo sí, así el panel muestra el mes como cerrado en $0.
  if (!ventaSnap.exists && !datosRevendedor.activo) return null;

  const datos = ventaSnap.exists ? ventaSnap.data() : {};
  const totalFacturable = Number(datos.totalFacturable || 0);
  const totalComisionAPagar = Number(datos.totalComisionAPagar || 0);
  // Neto del mes: positivo = el revendedor le debe a la plataforma,
  // negativo = la plataforma le debe al revendedor.
  const saldo = Math.round((totalFacturable - totalComisionAPagar) * 100) / 100;

  // Si el doc no existía se persisten también los totales en 0: "Ver
  // ventas" lee el doc directo y espera encontrarlos.
  await ventaRef.set({
    items: datos.items || [],
    totalPlan: Number(datos.totalPlan || 0),
    totalDescuento: Number(datos.totalDescuento || 0),
    totalFacturable,
    totalComisionAPagar,
    saldo,
    cerrado: true,
    cerradoEl: ahora,
    cerradoPor: 'automatico'
  }, { merge: true });

  return saldo;
}

exports.cierreMensualRevendedores = onSchedule(
  { schedule: '0 0 1 * *', timeZone: 'America/Argentina/Buenos_Aires' },
  async () => {
    const ahora = Timestamp.now();
    // Corre a las 00:00 del día 1: un día antes cae siempre en el mes que
    // hay que cerrar.
    const anioMes = anioMesArgentina(ahora.toMillis() - DIA_MS);

    const revendedores = await db.collection('revendedores').get();
    let cerrados = 0;
    for (const doc of revendedores.docs) {
      try {
        const saldo = await cerrarMes(doc.id, doc.data(), anioMes, ahora);
        if (saldo !== null) {
          cerrados++;
          logger.info(`cierreMensualRevendedores: ${doc.id} ${anioMes} cerrado, saldo ${saldo}`);
        }
      } catch (e) {
        // Un revendedor que falla no frena el cierre de los demás.
        logger.error(`cierreMensualRevendedores: error cerrando ${doc.id} ${anioMes}:`, e);
      }
    }
    logger.info(`cierreMensualRevendedores: ${cerrados} cierres de ${anioMes} sobre ${revendedores.size} revendedores.`);
  }
);
