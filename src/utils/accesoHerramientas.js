// Quién puede usar las herramientas de modelado de STL (separar piezas por
// color y las que se sumen). Se habilitan por plan desde el panel admin
// (planes/{id}.herramientasStl), igual que la facturación electrónica.
//
// - En prueba sin plan asignado: sí, para que las conozcan antes de pagar.
// - Con plan: manda el plan, aunque la cuenta siga en prueba.
// - En lectura o suspendida: no (son un beneficio del plan pago).
// - Admin: siempre.
//
// Es un chequeo sólo del cliente: la herramienta corre entera en el
// navegador y no guarda nada en la base, así que no hay datos que proteger
// con reglas.
export function puedeUsarHerramientas({ suscripcion, planContratado, isAdmin }) {
  if (isAdmin) return true;
  const estado = suscripcion?.estado;
  if (estado !== 'trial' && estado !== 'activa') return false;
  if (!suscripcion?.planId) return estado === 'trial';
  return !!planContratado?.herramientasStl;
}
