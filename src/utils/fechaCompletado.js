// Calcula qué fecha corresponde guardar en fechaCompletado según el
// estado anterior y el nuevo estado que se está por confirmar.
//
// Regla pedida: la fecha de "pedido completado" es la del día en que el
// pedido se marcó como ENVIADO. Si el pedido nunca pasó por "enviado" (por
// ejemplo, retiro en persona: listo p/entregar -> completado directo), la
// fecha es la del día en que se marcó como COMPLETADO. Si ya tenía fecha
// de envío y después se marca completado, esa fecha de envío no se pisa.
// Fecha de HOY en horario local (YYYY-MM-DD). No usar
// `new Date().toISOString()` para esto -- esa devuelve la fecha en UTC, que
// después de las 21hs en Argentina (UTC-3) ya cayó al día siguiente, y ese
// "mañana" hace que el pedido/compra quede afuera de cualquier filtro por
// período que compare contra la fecha real de hoy.
export function fechaLocalHoy() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function calcularFechaCompletado(prevEstado, prevFechaCompletado, newEstado) {
  const hoy = fechaLocalHoy;

  if (newEstado === 'enviado') {
    // Ya estaba enviado (ej: se re-guarda sin cambiar de estado): no
    // corremos la fecha original de envío.
    return prevEstado === 'enviado' && prevFechaCompletado ? prevFechaCompletado : hoy();
  }

  if (newEstado === 'completado') {
    // Vino de "enviado" -> la fecha que cuenta es la de cuando se envió,
    // no la de hoy.
    if (prevEstado === 'enviado' && prevFechaCompletado) return prevFechaCompletado;
    return hoy();
  }

  // Cualquier otro estado (pendiente, en_verificacion, progreso, listo,
  // cancelado) no tiene fecha de completado.
  return null;
}

export default calcularFechaCompletado;
