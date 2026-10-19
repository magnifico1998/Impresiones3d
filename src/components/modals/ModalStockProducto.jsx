import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { useCapaModal } from '../CapaModal';
import { normalizarStock } from '../../utils/stock';
import { fotoDeColor } from '../../utils/fotosColor';
import { colorPermitido, combinacionPermitida } from '../../utils/coloresProducto';

// Edita el stock de UN producto: una línea por color (y color secundario, si el producto lo usa).
// Los colores salen de los de la cuenta (Configuración). Cada línea de stock lleva su color: en el catálogo no hay productos sin color.
export default function ModalStockProducto({ producto, onClose }) {
  const { cfg, updateProducto, showToast } = useApp();
  const capaModal = useCapaModal({ onClose, activo: !!producto });
  const [lineas, setLineas] = useState(() => {
    const base = normalizarStock(producto?.stock);
    return base.length ? base : [{ color: '', colorSecundario: '', cantidad: 0 }];
  });
  const [guardando, setGuardando] = useState(false);
  const [filaActiva, setFilaActiva] = useState(0);
  if (!producto) return null;

  // Vista previa: la foto del color de la fila que se está cargando (si el producto tiene una asignada a ese color) o la principal.
  const fotoPrincipal = producto.imagenes?.[0] || producto.imagen || '';
  const fotoDe = (l) => fotoDeColor(producto.fotosColor, l?.color, l?.colorSecundario) || fotoPrincipal;
  const filaVista = lineas[Math.min(filaActiva, lineas.length - 1)];
  const fotoVista = fotoDe(filaVista);

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
    // Con colores cargados en la cuenta, no se guarda stock sin color (ni en las líneas viejas que lo tengan).
    const hayColores = (cfg.colores || []).length > 0 || (cfg.combinacionesColores || []).length > 0;
    if (hayColores && lineas.some((l) => (Number(l.cantidad) || 0) > 0 && !String(l.color || '').trim())) {
      showToast('Elegí el color de cada línea de stock: en el catálogo todos los productos llevan color.', 'error');
      return;
    }
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
        {fotoVista && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0 12px' }}>
            <img src={fotoVista} alt={producto.nombre} style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '12px', background: 'var(--bg3)', flexShrink: 0 }} />
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '13px' }}>{[filaVista?.color, filaVista?.colorSecundario].filter(Boolean).join(' + ') || 'Sin color'}</div>
              {fotoDeColor(producto.fotosColor, filaVista?.color, filaVista?.colorSecundario) ? 'Foto asignada a este color' : 'Foto principal del producto (este color no tiene una asignada)'}
            </div>
          </div>
        )}
        {lineas.map((l, i) => (
          <div key={i} onFocus={() => setFilaActiva(i)} onClick={() => setFilaActiva(i)} style={{ display: 'grid', gridTemplateColumns: modo === 'libre' ? '40px 1fr 1fr 80px auto' : '40px 1fr 80px auto', gap: '6px', marginBottom: '6px', alignItems: 'center', borderRadius: '8px', outline: i === filaActiva && lineas.length > 1 ? '1px solid var(--accent)' : 'none', outlineOffset: '3px' }}>
            {fotoDe(l) ? <img src={fotoDe(l)} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} /> : <span />}
            {modo === 'combinaciones' ? (
              <select
                value={String(combinaciones.findIndex((c) => c.color === l.color && c.colorSecundario === l.colorSecundario))}
                onChange={(e) => cambiarCombinacion(i, e.target.value)}
              >
                <option value="-1">Elegí una combinación…</option>
                {combinaciones.map((c, ci) => (combinacionPermitida(producto, c.color, c.colorSecundario) || (c.color === l.color && c.colorSecundario === l.colorSecundario)) && <option key={ci} value={ci}>{c.color} + {c.colorSecundario}</option>)}
              </select>
            ) : (
              <select value={l.color} onChange={(e) => cambiar(i, 'color', e.target.value)}>
                <option value="">Elegí un color…</option>
                {colores.map((c) => (colorPermitido(producto, c) || c === l.color) && <option key={c} value={c}>{c}</option>)}
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
        <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => { setFilaActiva(lineas.length); setLineas((prev) => [...prev, { color: '', colorSecundario: '', cantidad: 0 }]); }}>
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
