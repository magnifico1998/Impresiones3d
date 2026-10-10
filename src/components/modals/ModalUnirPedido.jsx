import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { useCapaModal } from '../CapaModal';
import { confirmar } from '../Dialogos';
import { ESTADOS_UNIBLES, esUnible, lineaDePedido, motivoNoUnible, normalizarCliente, unirPedidos } from '../../utils/unirPedidos';
import { textoEstadoPedido } from '../../utils/estadosPedido';

// Unir otro pedido abierto en este (ver utils/unirPedidos.js): se suman sus piezas, precio, envío y lo abonado, y el
// otro pedido queda cancelado como "unido". Va en un solo guardado (updatePedidosBulk): o se guardan los dos o ninguno.
//   pedido: el pedido que se conserva (el del detalle desde el que se abrió).
//   onUnido(): se llama cuando se unieron, para cerrar el detalle (queda desactualizado).
export default function ModalUnirPedido({ pedido, onClose, onUnido }) {
  const capaModal = useCapaModal({ onClose, activo: !!pedido });
  const { pedidos, updatePedidosBulk, showToast, fmt, cuentaId } = useApp();
  const [elegidoId, setElegidoId] = useState(null);
  const [facturado, setFacturado] = useState({}); // id -> true si ya tiene una factura emitida
  const [uniendo, setUniendo] = useState(false);

  // Candidatos: los demás pedidos abiertos; primero los del mismo cliente.
  const candidatos = useMemo(() => {
    if (!pedido) return [];
    const cliente = normalizarCliente(pedido.cliente);
    return pedidos
      .filter((p) => p.id !== pedido.id && esUnible(p))
      .sort((a, b) => {
        const mismoA = normalizarCliente(a.cliente) === cliente ? 0 : 1;
        const mismoB = normalizarCliente(b.cliente) === cliente ? 0 : 1;
        return mismoA - mismoB || ESTADOS_UNIBLES.indexOf(a.estado) - ESTADOS_UNIBLES.indexOf(b.estado) || b.id - a.id;
      });
  }, [pedidos, pedido]);

  const elegido = candidatos.find((p) => p.id === elegidoId) || null;

  // Un pedido con factura emitida no se une: la factura quedaría con otras piezas y otro total.
  useEffect(() => {
    if (!pedido || !cuentaId) return undefined;
    let cancelado = false;
    const ids = [pedido.id, ...candidatos.slice(0, 30).map((p) => p.id)];
    Promise.all(ids.map(async (id) => {
      try { return [id, (await getDoc(doc(db, 'users', cuentaId, 'facturasPorPedido', String(id)))).exists()]; } catch { return [id, false]; }
    })).then((pares) => { if (!cancelado) setFacturado(Object.fromEntries(pares)); });
    return () => { cancelado = true; };
  }, [pedido, candidatos, cuentaId]);

  if (!pedido) return null;

  const motivo = elegido
    ? (motivoNoUnible(pedido, elegido) || (facturado[pedido.id] ? `El pedido #${String(pedido.id).padStart(4, '0')} ya tiene una factura emitida: no se puede unir.` : null) || (facturado[elegido.id] ? `El pedido #${String(elegido.id).padStart(4, '0')} ya tiene una factura emitida: no se puede unir.` : null))
    : null;

  let resultado = null;
  if (elegido && !motivo) {
    try { resultado = unirPedidos(pedido, elegido); } catch { resultado = null; }
  }

  const unir = async () => {
    if (!elegido || motivo || !resultado || uniendo) return;
    const mismoCliente = normalizarCliente(elegido.cliente) === normalizarCliente(pedido.cliente);
    if (!mismoCliente && !(await confirmar(`"${elegido.cliente}" y "${pedido.cliente}" son clientes distintos: las piezas del pedido #${String(elegido.id).padStart(4, '0')} pasarían al cliente "${pedido.cliente}".`, { titulo: '¿Unir pedidos de clientes distintos?', textoConfirmar: 'Unir igual' }))) return;
    if (!(await confirmar(`El pedido #${String(elegido.id).padStart(4, '0')} se suma a este y queda cancelado como "unido". Esto no se deshace con un botón.`, { titulo: '¿Unir los pedidos?', textoConfirmar: 'Unir pedidos' }))) return;
    setUniendo(true);
    // Se recalcula con lo último guardado por si cambiaron mientras tanto.
    const destinoActual = pedidos.find((p) => p.id === pedido.id);
    const origenActual = pedidos.find((p) => p.id === elegido.id);
    try {
      const { destino, origen } = unirPedidos(destinoActual, origenActual);
      await updatePedidosBulk((p) => p.id === destino.id || p.id === origen.id, (p) => (p.id === destino.id ? destino : origen));
      // updatePedidosBulk avisa de sus errores pero no los devuelve: se comprueba que la unión haya quedado.
      const guardado = await getDoc(doc(db, 'users', cuentaId, 'pedidos', String(origen.id)));
      if (guardado.data()?.estado !== 'cancelado') throw new Error('No se pudo confirmar la unión: revisá los dos pedidos antes de repetirla.');
      showToast(`✓ Pedido #${String(origen.id).padStart(4, '0')} unido al #${String(destino.id).padStart(4, '0')}.`);
      onUnido?.();
    } catch (e) {
      console.error('No se pudieron unir los pedidos:', e);
      showToast(e.message || 'No se pudieron unir los pedidos.', 'error');
    } finally {
      setUniendo(false);
    }
  };

  const total = (p) => parseFloat(p.precioVenta) || 0;

  return (
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Unir pedidos</div>
        <div className="modal-sub" style={{ fontSize: '12px', color: 'var(--text2)' }}>
          Elegí el pedido que se suma a <b>#{String(pedido.id).padStart(4, '0')} · {pedido.cliente}</b>. Sus piezas, precio, envío y lo abonado pasan a este pedido, y ese pedido queda cancelado como "unido". Sólo se unen pedidos abiertos y sin factura.
        </div>

        {!candidatos.length ? (
          <div className="empty" style={{ padding: '18px' }}>No hay otros pedidos abiertos para unir.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '40vh', overflowY: 'auto', marginTop: '10px' }}>
            {candidatos.map((p) => {
              const mismo = normalizarCliente(p.cliente) === normalizarCliente(pedido.cliente);
              return (
                <label key={p.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${elegidoId === p.id ? 'var(--accent)' : 'var(--border2)'}`, background: 'var(--bg3)' }}>
                  <input type="radio" name="pedido-a-unir" checked={elegidoId === p.id} onChange={() => setElegidoId(p.id)} style={{ marginTop: '3px' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>#{String(p.id).padStart(4, '0')} · {p.cliente}</span>
                    {mismo && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--accent)' }}>mismo cliente</span>}
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text2)' }}>
                      {textoEstadoPedido(p.estado)} · {(p.piezas || []).length} pieza{(p.piezas || []).length === 1 ? '' : 's'} · {fmt(total(p))}{p.desc ? ` · ${p.desc}` : ''}
                    </span>
                    {facturado[p.id] && <span style={{ display: 'block', fontSize: '11px', color: 'var(--warn)' }}>Tiene una factura emitida: no se puede unir.</span>}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {elegido && motivo && <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--danger)' }}>{motivo}</div>}
        {resultado && (
          <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg3)', fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6 }}>
            <b style={{ color: 'var(--text)' }}>Así queda el pedido #{String(pedido.id).padStart(4, '0')}:</b><br />
            {resultado.destino.piezas.length} piezas · {fmt(total(resultado.destino))} · envío {fmt(parseFloat(resultado.destino.envio) || 0)} · abonado {fmt(parseFloat(resultado.destino.montoAbonado) || 0)}<br />
            Estado: {textoEstadoPedido(resultado.destino.estado)}
            {resultado.destino.descuentoMonto > 0 && <> · descuento {fmt(resultado.destino.descuentoMonto)}</>}
            <div style={{ marginTop: '6px', whiteSpace: 'pre-line' }}>{lineaDePedido(elegido, fmt)} <b>→ queda cancelado (unido)</b></div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!elegido || !!motivo || uniendo} onClick={unir}>{uniendo ? 'Uniendo…' : 'Unir pedidos'}</button>
        </div>
      </div>
    </div>
  );
}
