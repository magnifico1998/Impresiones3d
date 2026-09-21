import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';

// Mismo criterio de "antigüedad de un pedido" que PedidosPage.jsx
// (getTimestamp) y capacidadProduccion.js (timestampPedido).
function timestampPedido(p) {
  if (p.creadoTs) return p.creadoTs;
  if (p.fechaPedido) return new Date(p.fechaPedido + 'T12:00:00').getTime();
  if (p.creado) {
    const partes = p.creado.split('/');
    if (partes.length === 3) return new Date(partes[2], partes[1] - 1, partes[0]).getTime();
  }
  return 0;
}

function ordenInicial(pendientes) {
  return [...pendientes].sort((a, b) => {
    const oa = a.ordenProduccion ?? Infinity;
    const ob = b.ordenProduccion ?? Infinity;
    if (oa !== ob) return oa - ob;
    return timestampPedido(a) - timestampPedido(b);
  });
}

/**
 * Modal para definir el orden de prioridad manual de los pedidos
 * "pendiente", que alimenta la simulación de capacidad de producción (ver
 * useCapacidadProduccion) para estimar sus fechas de entrega en cola.
 *
 * Mismo patrón de drag&drop + botones subir/bajar que ModalOrdenCategorias.jsx.
 */
export default function ModalOrdenProduccion({ isOpen, onClose }) {
  const { pedidos, updatePedidosBulk, showToast } = useApp();
  const [orden, setOrden] = useState([]);
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setOrden(ordenInicial(pedidos.filter(p => p.estado === 'pendiente')));
    }
    // A propósito NO depende de `pedidos` -- mismo criterio que
    // ModalOrdenCategorias.jsx: evitar que una sincronización en tiempo
    // real reinicie un reordenamiento en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const mover = (from, to) => {
    if (to < 0 || to >= orden.length || from === to) return;
    setOrden((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleDragStart = (index) => (e) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index) => (e) => {
    e.preventDefault();
    if (overIndex !== index) setOverIndex(index);
  };

  const handleDrop = (index) => (e) => {
    e.preventDefault();
    if (dragIndex.current !== null) {
      mover(dragIndex.current, index);
    }
    dragIndex.current = null;
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setOverIndex(null);
  };

  const handleSave = () => {
    const nuevoOrden = new Map(orden.map((p, i) => [p.id, i]));
    updatePedidosBulk(
      (p) => nuevoOrden.has(p.id),
      (p) => ({ ...p, ordenProduccion: nuevoOrden.get(p.id) })
    );
    showToast('✓ Orden de prioridad guardado.');
    onClose();
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Ordenar prioridad de producción</div>
        <div className="modal-sub">
          Arrastrá los pedidos pendientes para definir en qué orden se van a fabricar. Ese orden se usa para estimar sus fechas de entrega.
        </div>

        {orden.length === 0 ? (
          <div className="empty" style={{ marginTop: '12px' }}>
            No hay pedidos pendientes para priorizar.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px', maxHeight: '50vh', overflowY: 'auto' }}>
            {orden.map((p, i) => (
              <div
                key={p.id}
                draggable
                onDragStart={handleDragStart(i)}
                onDragOver={handleDragOver(i)}
                onDrop={handleDrop(i)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: overIndex === i ? 'var(--bg3)' : 'var(--bg2)',
                  cursor: 'grab',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '13px', lineHeight: 1 }}
                >
                  ⠿
                </span>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{String(p.id).padStart(4, '0')} — {p.cliente} — {p.desc || 'Sin descripción'}
                </span>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ padding: '2px 8px' }}
                    disabled={i === 0}
                    onClick={() => mover(i, i - 1)}
                    title="Subir"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ padding: '2px 8px' }}
                    disabled={i === orden.length - 1}
                    onClick={() => mover(i, i + 1)}
                    title="Bajar"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={orden.length === 0}>
            Guardar orden
          </button>
        </div>
      </div>
    </div>
  );
}
