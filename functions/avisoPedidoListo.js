// Decide si hay que avisarle por mail al cliente que su pedido está listo. Sin accesos a Firestore: lo usa el
// trigger onPedidoListo y los tests (pruebas/aviso-pedido-listo.test.js).
//
// Se avisa cuando TODO esto se cumple:
//   - el emprendedor tiene prendido "Avisar por mail cuando el pedido está listo" (cfg.notificarPedidoListo);
//   - el pedido pasó a "listo" (antes tenía otro estado: crear un pedido ya listo o editar uno que ya lo estaba no avisa);
//   - el cliente existe en la libreta, tiene mail y no tiene "No enviarle notificaciones" (cliente.sinNotificaciones).
// Que sea una sola vez por pedido lo garantiza el trigger (documento avisosPedido/{id} creado con create()).

const ESTADO_LISTO = 'listo';
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizar = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function buscarCliente(clientes, nombre) {
  const n = normalizar(nombre);
  if (!n) return null;
  return (clientes || []).find((c) => normalizar(c.nombre) === n) || null;
}

// Devuelve { enviar: true, email, cliente } o { enviar: false, motivo }.
function decidirAviso({ antes, despues, cfg, clientes }) {
  if (!cfg?.notificarPedidoListo) return { enviar: false, motivo: 'funcion-apagada' };
  if (!antes || !despues) return { enviar: false, motivo: 'sin-cambio-de-estado' };
  if (despues.estado !== ESTADO_LISTO || antes.estado === ESTADO_LISTO) return { enviar: false, motivo: 'sin-cambio-de-estado' };
  const cliente = buscarCliente(clientes, despues.cliente);
  if (!cliente) return { enviar: false, motivo: 'cliente-no-cargado' };
  if (cliente.sinNotificaciones) return { enviar: false, motivo: 'cliente-sin-notificaciones' };
  const email = String(cliente.email || '').trim();
  if (!EMAIL_VALIDO.test(email)) return { enviar: false, motivo: 'sin-mail' };
  return { enviar: true, email, cliente };
}

// Productos del pedido para el mail ({{productos}}): "Maceta hexagonal (x2), Llavero y Soporte (x3)". El número
// de pedido es el id interno del documento y al cliente no le dice nada; los nombres de lo que encargó, sí.
// Más de 3 piezas se resumen ("... y 2 productos más") para que el asunto no quede kilométrico.
const MAX_PRODUCTOS = 3;

const cantidadPieza = (p) => {
  const directa = Number(p?.cantidad);
  if (directa > 0) return directa;
  return (p?.versiones || []).reduce((t, v) => t + (Number(v?.cantidad) || 0), 0);
};

function textoProductos(piezas) {
  const items = (piezas || [])
    .map((p) => {
      const nombre = String(p?.nombre || '').trim();
      if (!nombre) return null;
      const cant = cantidadPieza(p);
      return cant > 1 ? `${nombre} (x${cant})` : nombre;
    })
    .filter(Boolean);
  if (!items.length) return 'impresiones 3D';
  const visibles = items.slice(0, MAX_PRODUCTOS);
  const resto = items.length - visibles.length;
  if (resto > 0) visibles.push(`${resto} ${resto === 1 ? 'producto' : 'productos'} más`);
  return visibles.length === 1 ? visibles[0] : `${visibles.slice(0, -1).join(', ')} y ${visibles[visibles.length - 1]}`;
}

module.exports = { decidirAviso, buscarCliente, textoProductos, ESTADO_LISTO };
