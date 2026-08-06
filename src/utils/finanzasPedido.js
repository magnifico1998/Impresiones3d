import { precioNeto } from './precioNeto';

// Reglas de reconocimiento de "venta" y "pendiente" por pedido:
//
// - en_verificacion / cancelado: no aportan nada a ninguno de los dos (el
//   primero todavía no es un pedido confirmado, el segundo se dio de baja).
// - enviado / completado: el pedido ya se entregó, así que TODO el precio
//   neto pasa a ser venta -- lo abonado se reconoce en su fecha de abono, y
//   el saldo restante (si lo hay) se reconoce en fechaCompletado (la fecha
//   en que el pedido pasó a "enviado", ver utils/fechaCompletado.js). No
//   queda nada pendiente: cobrar lo que falte es aparte de si la venta ya
//   se concretó.
// - cualquier otro estado (pendiente, progreso, listo): sólo lo ya abonado
//   cuenta como venta (en su fecha de abono); el resto sigue pendiente.

export const montoAbonadoDe = (p) => {
  if (!p) return 0;
  return Math.min(precioNeto(p), Math.max(0, parseFloat(p.montoAbonado) || 0));
};

// Movimientos { monto, fecha } que este pedido aporta a "ventas". Puede
// devolver hasta dos: uno por lo abonado y otro por el saldo reconocido al
// enviar/completar.
export const movimientosVenta = (p) => {
  if (!p || p.estado === 'en_verificacion' || p.estado === 'cancelado') return [];
  const neto = precioNeto(p);
  if (neto <= 0) return [];

  const abonado = montoAbonadoDe(p);
  const movimientos = [];
  if (abonado > 0) {
    movimientos.push({ monto: abonado, fecha: p.fechaAbonado || null });
  }

  if (p.estado === 'enviado' || p.estado === 'completado') {
    const saldo = neto - abonado;
    if (saldo > 0) {
      movimientos.push({ monto: saldo, fecha: p.fechaCompletado || null });
    }
  }

  return movimientos;
};

export const ventasDePedido = (p) => movimientosVenta(p).reduce((s, m) => s + m.monto, 0);

export const pendienteDePedido = (p) => {
  if (!p || p.estado === 'en_verificacion' || p.estado === 'cancelado') return 0;
  if (p.estado === 'enviado' || p.estado === 'completado') return 0;
  const neto = precioNeto(p);
  return Math.max(0, neto - montoAbonadoDe(p));
};

export default { montoAbonadoDe, movimientosVenta, ventasDePedido, pendienteDePedido };
