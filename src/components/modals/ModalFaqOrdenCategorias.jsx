import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { ordenarCategorias } from '../../utils/categoriaOrden';

/**
 * Modal para definir el orden manual en el que las categorías de FAQ
 * aparecen en la columna izquierda. Mismo mecanismo de
 * ModalOrdenCategorias.jsx (Biblioteca), pero lee/escribe
 * faq/faqCategoriaOrden en vez de cfg.categoriaOrden.
 */
export default function ModalFaqOrdenCategorias({ isOpen, onClose }) {
  const { faq, faqCategoriaOrden, guardarFaqCategoriaOrden, showToast } = useApp();
  const [orden, setOrden] = useState([]);
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);

  const categoriasActuales = Array.from(
    new Set(faq.map((f) => f.categoria || 'General').filter(Boolean))
  );

  useEffect(() => {
    if (isOpen) {
      setOrden(ordenarCategorias(categoriasActuales, faqCategoriaOrden));
    }
    // Sólo se reinicializa al abrir el modal, mismo criterio que
    // ModalOrdenCategorias.jsx.
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

  const handleSave = async () => {
    try {
      await guardarFaqCategoriaOrden(orden);
      showToast('✓ Orden de categorías guardado.');
      onClose();
    } catch (err) {
      console.error('Error al guardar orden de categorías de FAQ:', err);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Ordenar categorías</div>
        <div className="modal-sub">
          Arrastrá las categorías para definir el orden en que aparecen en Preguntas frecuentes.
        </div>

        {orden.length === 0 ? (
          <div className="empty" style={{ marginTop: '12px' }}>
            No hay categorías cargadas todavía.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px', maxHeight: '50vh', overflowY: 'auto' }}>
            {orden.map((cat, i) => (
              <div
                key={cat}
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
                  {cat}
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
