// Estados de un pedido, en el orden del flujo, con su ícono. Una sola
// definición para los desplegables y los avisos, así el nombre y el ícono
// son iguales en toda la app.
export const ESTADOS_PEDIDO = [
  { id: 'en_verificacion', nombre: 'En verificación', icono: '🔎' },
  { id: 'pendiente', nombre: 'Pendiente', icono: '⏳' },
  { id: 'progreso', nombre: 'En progreso', icono: '⚙️' },
  { id: 'listo', nombre: 'Listo p/ entregar', icono: '✅' },
  { id: 'enviado', nombre: 'Enviado', icono: '📦' },
  { id: 'completado', nombre: 'Completado', icono: '✔️' },
  { id: 'cancelado', nombre: 'Cancelado', icono: '❌' }
];

// "⏳ Pendiente" (o el id tal cual si no es un estado conocido).
export function textoEstadoPedido(id) {
  const e = ESTADOS_PEDIDO.find((x) => x.id === id);
  return e ? `${e.icono} ${e.nombre}` : id;
}
