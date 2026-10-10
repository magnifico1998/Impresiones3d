import { textoEstadoPedido } from './estadosPedido';

// Unir dos pedidos de una misma persona (por ejemplo, uno cargado a mano y otro que llegó del catálogo web).
// Nunca es automático: la app avisa cuando un cliente ya tiene un pedido abierto y la unión la decide el usuario,
// desde el detalle del pedido ("Unir pedidos").
//
// Qué pasa al unir `origen` en `destino`:
//   - destino conserva su número y suma las piezas, el precio, el envío, lo abonado, los insumos y las notas de origen.
//   - los descuentos se pasan a monto y se suman (un 10 % de un pedido y $ 500 del otro quedan como un solo monto).
//   - el estado es el MENOS avanzado de los dos (si uno estaba pendiente y el otro listo, el unido está pendiente).
//   - origen queda cancelado con la marca "unido al pedido #N" (los pedidos no se borran) y conserva sus datos.
// Sólo se unen pedidos abiertos: los enviados o completados ya tienen entregas, cobros y consumo de inventario.

export const ESTADOS_UNIBLES = ['en_verificacion', 'pendiente', 'progreso', 'listo'];

export const normalizarCliente = (nombre) => String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');
export const esUnible = (p) => !!p && ESTADOS_UNIBLES.includes(p.estado);
const numero = (id) => String(id).padStart(4, '0');
const aNumero = (v) => parseFloat(v) || 0;

// Pedidos abiertos de un cliente (por nombre, sin mayúsculas ni espacios de más), sin contar `exceptoId`.
export function pedidosAbiertosDelCliente(pedidos, cliente, exceptoId = null) {
  const c = normalizarCliente(cliente);
  if (!c || c === 'sin nombre') return [];
  return (pedidos || []).filter((p) => esUnible(p) && p.id !== exceptoId && normalizarCliente(p.cliente) === c);
}

// Nombre con el que quedaría un pedido nacido de una solicitud del catálogo: el del cliente ya cargado (por teléfono
// primero, que es lo único que no cambia, y después por nombre), o el que escribió. Mismo criterio que
// importarSolicitudComoPedido en AppContext.
export function clienteDeSolicitud(clientes, solicitud) {
  const nombre = String(solicitud?.cliente || '').trim();
  const tel = String(solicitud?.telefono || '').replace(/\D/g, '');
  let existente = null;
  if (tel) existente = (clientes || []).find((c) => String(c.tel || '').replace(/\D/g, '') === tel) || null;
  if (!existente && nombre) existente = (clientes || []).find((c) => String(c.nombre || '').trim().toLowerCase() === nombre.toLowerCase()) || null;
  return existente?.nombre || nombre || 'Sin nombre';
}

// Texto del aviso: "• #0012 · ⏳ Pendiente · $ 15.000".
export const lineaDePedido = (p, fmt) => `• #${numero(p.id)} · ${textoEstadoPedido(p.estado)}${fmt ? ` · ${fmt(aNumero(p.precioVenta))}` : ''}${p.desc ? ` · ${p.desc}` : ''}`;

// Aviso al crear un pedido nuevo para alguien que ya tiene uno abierto. Devuelve true si hay que seguir creando.
export async function confirmarPedidoNuevoDeCliente({ pedidos, cliente, confirmar, fmt }) {
  const abiertos = pedidosAbiertosDelCliente(pedidos, cliente);
  if (!abiertos.length) return true;
  const lista = abiertos.slice(0, 5).map((p) => lineaDePedido(p, fmt)).join('\n');
  const mas = abiertos.length > 5 ? `\n…y ${abiertos.length - 5} más` : '';
  return confirmar(
    `${cliente} ya tiene ${abiertos.length === 1 ? 'un pedido abierto' : `${abiertos.length} pedidos abiertos`}:\n${lista}${mas}\n\nPodés crear el pedido nuevo igual y unirlos después desde el detalle del pedido ("Unir pedidos"), o cancelar y sumar lo nuevo al pedido que ya existe.`,
    { titulo: 'Ya hay un pedido abierto de este cliente', textoConfirmar: 'Crear pedido nuevo', textoCancelar: 'Cancelar' }
  );
}

const indiceEstado = (e) => ESTADOS_UNIBLES.indexOf(e);
const masTemprana = (a, b) => (a && b ? (a <= b ? a : b) : (a || b || ''));

// Por qué no se pueden unir (o null si sí).
export function motivoNoUnible(destino, origen) {
  if (!destino || !origen) return 'Falta uno de los pedidos.';
  if (destino.id === origen.id) return 'Son el mismo pedido.';
  if (!esUnible(destino)) return `El pedido #${numero(destino.id)} ya está ${textoEstadoPedido(destino.estado)}: sólo se unen pedidos abiertos.`;
  if (!esUnible(origen)) return `El pedido #${numero(origen.id)} ya está ${textoEstadoPedido(origen.estado)}: sólo se unen pedidos abiertos.`;
  return null;
}

const descuentoEnMonto = (p) => {
  const monto = aNumero(p.descuentoMonto);
  if (monto > 0) return monto;
  const pct = Math.max(0, Math.min(100, aNumero(p.descuentoPct)));
  return aNumero(p.precioVenta) * (pct / 100);
};

// Devuelve { destino, origen }: los dos pedidos como quedan después de la unión.
export function unirPedidos(destino, origen, { fecha = new Date().toLocaleDateString('es-AR') } = {}) {
  const motivo = motivoNoUnible(destino, origen);
  if (motivo) throw new Error(motivo);

  // Piezas de origen con ids que no choquen con las de destino.
  const usados = new Set((destino.piezas || []).map((x) => x.id));
  let siguiente = Math.max(0, ...[...usados].map((x) => Number(x) || 0)) + 1;
  const piezasOrigen = (origen.piezas || []).map((pz) => {
    let id = pz.id;
    if (usados.has(id)) { while (usados.has(siguiente)) siguiente += 1; id = siguiente; }
    usados.add(id);
    return { ...pz, id, unidaDe: origen.id };
  });

  const descuento = descuentoEnMonto(destino) + descuentoEnMonto(origen);
  const abonadoDestino = aNumero(destino.montoAbonado);
  const abonadoOrigen = aNumero(origen.montoAbonado);
  const fechaAbonado = abonadoDestino > 0 && abonadoOrigen > 0
    ? masTemprana(destino.fechaAbonado, origen.fechaAbonado)
    : (abonadoDestino > 0 ? destino.fechaAbonado : (abonadoOrigen > 0 ? origen.fechaAbonado : destino.fechaAbonado)) || '';

  const notas = [destino.notaGeneral, origen.notaGeneral].map((n) => String(n || '').trim()).filter(Boolean);
  if (notas.length === 2 && notas[0] === notas[1]) notas.pop();
  notas.push(`Se unió el pedido #${numero(origen.id)} el ${fecha}.`);

  const descD = String(destino.desc || '').trim();
  const descO = String(origen.desc || '').trim();
  const desc = descD && descO && descD !== descO ? `${descD} + ${descO}` : (descD || descO);

  const unido = {
    ...destino,
    desc,
    estado: indiceEstado(origen.estado) < indiceEstado(destino.estado) ? origen.estado : destino.estado,
    fechaPedido: masTemprana(destino.fechaPedido, origen.fechaPedido),
    fechaEntrega: masTemprana(destino.fechaEntrega, origen.fechaEntrega),
    notaGeneral: notas.join('\n'),
    piezas: [...(destino.piezas || []), ...piezasOrigen],
    precioVenta: aNumero(destino.precioVenta) + aNumero(origen.precioVenta),
    envio: aNumero(destino.envio) + aNumero(origen.envio),
    insumos: [...(destino.insumos || []), ...(origen.insumos || [])],
    montoAbonado: abonadoDestino + abonadoOrigen,
    fechaAbonado,
    descuentoMonto: descuento,
    descuentoPct: 0,
    unidos: [...(destino.unidos || []), origen.id]
  };
  if (!(descuento > 0)) { unido.descuentoMonto = 0; }

  const cancelado = {
    ...origen,
    estado: 'cancelado',
    fechaCompletado: null,
    unidoA: destino.id,
    notaGeneral: [String(origen.notaGeneral || '').trim(), `Se unió al pedido #${numero(destino.id)} el ${fecha}.`].filter(Boolean).join('\n')
  };

  return { destino: unido, origen: cancelado };
}
