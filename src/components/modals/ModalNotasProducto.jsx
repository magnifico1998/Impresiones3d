import React from 'react';
import { useCapaModal } from '../CapaModal';

// Notas internas de un producto de la Biblioteca (tipo de filamento, detalles de la impresión…),
// en sólo lectura. Se abre desde el botón "📝 Notas" de una pieza del detalle de un pedido; se
// editan en la Biblioteca (editar producto). Son privadas: nunca van al catálogo público.
export default function ModalNotasProducto({ producto, onClose }) {
  const capaModal = useCapaModal({ onClose, activo: !!producto });
  if (!producto) return null;

  // Este modal va dentro del del pedido: el stopPropagation evita que un clic
  // afuera cierre a los dos (y el clic afuera no cierra, ver CapaModal).
  return (
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Notas · {producto.nombre}</div>
        <div className="modal-sub" style={{ fontSize: '12px', color: 'var(--text3)' }}>
          Notas internas del producto: sólo las ves vos y tu equipo. Se editan en la Biblioteca.
        </div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.55, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: '8px', padding: '12px 14px', maxHeight: '55vh', overflowY: 'auto' }}>
          {String(producto.notasInternas || '').trim()}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
