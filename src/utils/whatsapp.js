// El teléfono de un cliente puede estar cargado con cualquier formato
// (guiones, espacios, +54, paréntesis...), así que siempre se limpia a
// solo dígitos antes de armar el link de wa.me — mismo criterio que ya
// se usa para comparar teléfonos en AppContext.
export function buildWaLink(tel, texto = '') {
  const limpio = (tel || '').replace(/\D/g, '');
  if (!limpio) return null;
  const query = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${limpio}${query}`;
}

// El pedido guarda el nombre del cliente como texto libre, no un id, así
// que hay que buscarlo en la lista de clientes por nombre (mismo patrón
// que ya usan ClientesPage y ModalPedidoDetalle).
export function findClientePedido(clientes, nombreCliente) {
  if (!nombreCliente) return null;
  return clientes.find(c => c.nombre === nombreCliente || c.name === nombreCliente) || null;
}
