import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { useCapaModal } from '../CapaModal';
import { normalizarStock } from '../../utils/stock';

// Edita el stock de UN producto: una línea por color (y color secundario, si el producto lo usa).
// Los colores salen de los de la cuenta (Configuración); "Sin color" es para productos que no se piden por color.
export default function ModalStockProducto({ producto, onClose }) {
  const { cfg, updateProducto, showToast } = useApp();
  const capaModal = useCapaModal({ onClose, activo: !!producto });
  const [lineas, setLineas] = useState(() => {
    const base = normalizarStock(producto?.stock);
    return base.length ? base : [{ color: '', colorSecundario: '', cantidad: 0 }];
  });
  const [guardando, setGuardando] = useState(false);
  if (!producto) return null;

  const colores = (cfg.colores || []).map((c) => c.nombre).filter(Boolean);
  const secundarios = (cfg.colores || []).filter((c) => c.secundario).map((c) => c.nombre);
  const combinaciones = cfg.combinacionesColores || [];
  const modo = producto.modoColorSecundario || (producto.permiteColorSecundario ? 'libre' : '');

  const cambiar = (i, campo, valor) => setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  const cambiarCombinacion = (i, idx) => {
    const c = combinaciones[Number(idx)];
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, color: c?.color || '', colorSecundario: c?.colorSecundario || '' } : l)));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await updateProducto(producto.id, (p) => ({ ...p, stock: normalizarStock(lineas) }));
      showToast('✓ Stock actualizado');
      onClose();
    } catch {
      // updateProducto ya avisó del error de guardado.
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="modal-overlay open centrado" {...capaModal}>
      <div className="modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Stock · {producto.nombre}</div>
        <div className="modal-sub" style={{ fontSize: '12px', color: 'var(--text3)' }}>
          Cuántas unidades terminadas tenés de cada color. Lo que está en stock se vende en la tienda del catálogo como
          "disponible"; lo que pidan de más se fabrica a pedido.
        </div>
        {lineas.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: modo === 'libre' ? '1fr 1fr 80px auto' : '1fr 80px auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
            {modo === 'combinaciones' ? (
              <select
                value={String(combinaciones.findIndex((c) => c.color === l.color && c.colorSecundario === l.colorSecundario))}
                onChange={(e) => cambiarCombinacion(i, e.target.value)}
              >
                <option value="-1">Sin color</option>
                {combinaciones.map((c, ci) => <option key={ci} value={ci}>{c.color} + {c.colorSecundario}</option>)}
              </select>
            ) : (
              <select value={l.color} onChange={(e) => cambiar(i, 'color', e.target.value)}>
                <option value="">Sin color</option>
                {colores.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {modo === 'libre' && (
              <select value={l.colorSecundario || ''} onChange={(e) => cambiar(i, 'colorSecundario', e.target.value)}>
                <option value="">Sin combinar</option>
                {secundarios.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <input type="number" min="0" value={l.cantidad} onChange={(e) => cambiar(i, 'cantidad', Math.max(0, parseInt(e.target.value, 10) || 0))} />
            <button className="btn btn-danger btn-sm" disabled={lineas.length === 1} onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => setLineas((prev) => [...prev, { color: '', colorSecundario: '', cantidad: 0 }])}>
          + Otro color
        </button>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
