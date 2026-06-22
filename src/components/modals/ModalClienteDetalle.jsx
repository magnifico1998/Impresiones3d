import React from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalClienteDetalle({ isOpen, onClose, clientId, onEdit, onViewOrder }) {
  const { clientes, setClientes, pedidos, showToast } = useApp();

  if (!isOpen || clientId === null) return null;

  const c = clientes.find(x => x.id === clientId);
  if (!c) return null;

  // Formatting contact info
  let info = [];
  if (c.tel) info.push(`📞 ${c.tel}`);
  if (c.email) info.push(`✉️ ${c.email}`);
  
  const addressParts = [c.calle, c.altura].filter(Boolean).join(' ');
  const locationParts = [addressParts, c.loc, c.prov].filter(Boolean).join(', ');
  if (locationParts) info.push(`📍 ${locationParts} ${c.cp ? `(CP: ${c.cp})` : ''}`);

  // Fetch client orders
  const misPedidos = pedidos.filter(
    p => p.cliente.trim().toLowerCase() === c.nombre.trim().toLowerCase()
  );

  const getTimestamp = (p) => {
    if (p.fechaPedido) return new Date(p.fechaPedido + 'T12:00:00').getTime();
    if (p.creado) {
      let pts = p.creado.split('/');
      if (pts.length === 3) return new Date(pts[2], pts[1] - 1, pts[0]).getTime();
    }
    return 0;
  };

  const misPedidosSort = [...misPedidos].sort((a, b) => getTimestamp(b) - getTimestamp(a));

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const badgeText = (e) =>
    ({
      pendiente: 'Pendiente',
      progreso: 'En progreso',
      listo: 'Listo p/ entregar',
      completado: 'Completado',
      cancelado: 'Cancelado'
    }[e] || e);

  const badgeClass = (e) =>
    ({
      pendiente: 'badge-pending',
      progreso: 'badge-progress',
      listo: 'badge-listo',
      completado: 'badge-done',
      cancelado: 'badge-cancelled'
    }[e] || '');

  const handleDelete = () => {
    if (
      window.confirm(
        '¿Eliminar este cliente? Sus pedidos NO se borrarán, pero quedarán sin vincular.'
      )
    ) {
      setClientes(prev => prev.filter(x => x.id !== clientId));
      showToast('Cliente eliminado', 'info');
      onClose();
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div className="modal-title">{c.nombre}</div>
            <div className="modal-sub" style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text2)' }}>
              {info.join(' | ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm" onClick={() => onEdit(c.id)}>Editar</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{
          fontSize: '10px',
          fontFamily: 'var(--mono)',
          color: 'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: '.5px',
          marginBottom: '10px'
        }}>
          Historial de pedidos
        </div>

        <div id="cli-det-pedidos">
          {!misPedidosSort.length ? (
            <div className="empty" style={{ padding: '20px' }}>No hay pedidos para este cliente.</div>
          ) : (
            <div className="res-tabla-wrap">
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción/Piezas</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {misPedidosSort.map(p => {
                    const nombrePiezas = p.piezas.map(pz => pz.nombre).join(', ');
                    return (
                      <tr 
                        key={p.id} 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => {
                          onClose();
                          onViewOrder(p.id);
                        }}
                      >
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                          {p.fechaPedido || p.creado || '—'}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: '12px' }}>{p.desc || '—'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{nombrePiezas}</div>
                        </td>
                        <td>
                          <span className={`badge ${badgeClass(p.estado)}`}>
                            {badgeText(p.estado)}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                          {fmt(p.precioVenta || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            Eliminar cliente
          </button>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
