// Calcula qué fecha corresponde guardar en fechaCompletado según el
// estado anterior y el nuevo estado que se está por confirmar.
//
// Regla pedida: la fecha de "pedido completado" es la del día en que el
// pedido se marcó como ENVIADO. Si el pedido nunca pasó por "enviado" (por
// ejemplo, retiro en persona: listo p/entregar -> completado directo), la
// fecha es la del día en que se marcó como COMPLETADO. Si ya tenía fecha
// de envío y después se marca completado, esa fecha de envío no se pisa.
export function calcularFechaCompletado(prevEstado, prevFechaCompletado, newEstado) {
  const hoy = () => new Date().toISOString().slice(0, 10);

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
