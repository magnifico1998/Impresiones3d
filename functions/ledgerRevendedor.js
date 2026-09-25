const { db, FieldValue, anioMesArgentina } = require('./admin');

// Ledger mensual de ventas de cada revendedor
// (revendedores/{codigo}/ventas/{YYYY-MM}), que después consume el cierre
// del mes (ver scheduled/cierreMensualRevendedores.js).
//
// Cada venta registra QUIÉN cobró la plata, porque eso define para qué lado
// va la deuda del cierre:
//   - cobradoPor 'revendedor': venta manual (el revendedor le cobró al
//     suscriptor por fuera y la activó desde el panel) -- el revendedor le
//     debe a la plataforma el precio menos su comisión (montoFacturable).
//   - cobradoPor 'plataforma': pago por Mercado Pago acreditado en la cuenta
//     de la plataforma -- la plataforma le debe al revendedor su comisión.
// `saldo` va con signo desde el punto de vista de la plataforma (positivo =
// el revendedor debe, negativo = la plataforma debe), así el cierre neto es
// siempre totalFacturable - totalComisionAPagar, sin importar la mezcla de
// ventas del mes. El día que un revendedor cobre en su propia cuenta de
// Mercado Pago (modoCobro 'propio'), esas ventas entran como 'revendedor'
// sin tocar nada de acá.

const redondear2 = (n) => Math.round(n * 100) / 100;

// % de comisión del revendedor para un plan (lo que el panel muestra como
// "descuento"): el default que el admin configuró en
// revendedores/{codigo}.descuentosPorPlan, acotado a 0-100.
function pctComision(datosRevendedor, planId) {
  const pct = Number(datosRevendedor?.descuentosPorPlan?.[planId]) || 0;
  return Math.max(0, Math.min(100, pct));
}

// Arma la escritura del ledger sin ejecutarla, para que cada llamador la
// aplique como le convenga (set directo o dentro de una transacción).
function armarVentaLedger({ codigo, uid, email, planId, fecha, montoPlan, pct, cobradoPor, referencia = null }) {
  const montoComision = redondear2(montoPlan * pct / 100);
  const cobroRevendedor = cobradoPor === 'revendedor';
  const montoFacturable = cobroRevendedor ? redondear2(montoPlan - montoComision) : 0;
  const comisionAPagar = cobroRevendedor ? 0 : montoComision;
  const anioMes = anioMesArgentina(fecha.toMillis());

  return {
    ref: db.doc(`revendedores/${codigo}/ventas/${anioMes}`),
    datos: {
      items: FieldValue.arrayUnion({
        uid,
        email,
        planId,
        fecha,
        montoPlan,
        descuentoPct: pct,
        montoFacturable,
        cobradoPor,
        montoComision,
        saldo: cobroRevendedor ? montoFacturable : -comisionAPagar,
        referencia
      }),
      totalPlan: FieldValue.increment(montoPlan),
      totalDescuento: FieldValue.increment(montoComision),
      totalFacturable: FieldValue.increment(montoFacturable),
      totalComisionAPagar: FieldValue.increment(comisionAPagar),
      actualizadoEl: fecha
    }
  };
}

module.exports = { pctComision, armarVentaLedger };
