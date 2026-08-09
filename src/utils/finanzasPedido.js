import { precioNeto } from './precioNeto';

// Pedidos viejos guardan la fecha de creación en "creado" como dd/mm/aaaa
// en vez de aaaa-mm-dd (ver PedidosPage.jsx / ModalClienteDetalle.jsx, que
// la parsean igual con split('/')). La normalizamos para que sea comparable
// con fechaAbonado/fechaCompletado, que siempre son aaaa-mm-dd.
const normalizarFecha = (f) => {
  if (!f || typeof f !== 'string') return null;
  if (f.includes('-') && f.length === 10) return f;
  const partes = f.split('/');
  if (partes.length === 3) return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
  return null;
};

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

  const entregado = p.estado === 'enviado' || p.estado === 'completado';
  const abonado = montoAbonadoDe(p);
  // Pedidos viejos, cargados antes de que existieran fechaAbonado/
  // fechaCompletado (o que nunca pasaron por el flujo de estados que las
  // completa), se quedan sin ninguna de las dos. Si ya se entregaron, la
  // fecha del pedido es mejor aproximación de cuándo se concretó la venta
  // que perderla del todo por falta de fecha.
  const fechaEntrega = p.fechaCompletado || p.fechaPedido || p.fecha || normalizarFecha(p.creado) || null;
  const movimientos = [];
  if (abonado > 0) {
    const fecha = p.fechaAbonado || (entregado ? fechaEntrega : null) || null;
    movimientos.push({ monto: abonado, fecha });
  }

  if (entregado) {
    const saldo = neto - abonado;
    if (saldo > 0) {
      movimientos.push({ monto: saldo, fecha: fechaEntrega });
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
