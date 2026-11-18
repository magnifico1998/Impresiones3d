import React, { useEffect, useState } from 'react';
import { useCapaModal } from '../CapaModal';
import { usePreferenciasUi } from '../../context/preferenciasUi';
import { alternarOculta, combinarLayout, moverSeccion } from '../../utils/layoutPantalla';

// Ordenar y ocultar las secciones del menú lateral. Se guarda en la cuenta de la
// persona (context/preferenciasUi.js, pantalla "menu") y se ve igual en sus otros
// dispositivos. Ocultar un ítem del menú no quita nada: sólo deja de mostrarse acá,
// y se vuelve a mostrar desde este mismo cuadro. Configuración y Mi emprendimiento
// están en otro grupo del menú y no se tocan, así siempre queda un camino de vuelta.
//   links: [{ id, name }] los del menú, en su orden por defecto.
export default function ModalPersonalizarMenu({ isOpen, onClose, links }) {
  const capaModal = useCapaModal({ onClose, activo: isOpen });
  const { layoutDe, guardarLayout } = usePreferenciasUi();
  const ids = links.map((l) => l.id);
  const [layout, setLayout] = useState({ orden: ids, ocultas: [] });

  // Se arma desde lo guardado cada vez que se abre.
  useEffect(() => {
    if (isOpen) setLayout(combinarLayout(ids, layoutDe('menu'), []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const nombre = (id) => links.find((l) => l.id === id)?.name || id;
  const guardar = () => {
    guardarLayout('menu', layout);
    onClose();
  };

  return (
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Personalizar el menú</div>
        <div className="modal-sub">
          Subí, bajá o ocultá las secciones. Se guarda en tu cuenta y se ve igual en tus otros dispositivos.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
          {layout.orden.map((id, i) => {
            const oculta = layout.ocultas.includes(id);
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', opacity: oculta ? 0.55 : 1 }}>
                <input
                  type="checkbox"
                  id={`menu-ver-${id}`}
                  checked={!oculta}
                  onChange={() => setLayout((l) => ({ ...l, ocultas: alternarOculta(l.ocultas, id) }))}
                  style={{ width: 'auto' }}
                />
                <label htmlFor={`menu-ver-${id}`} style={{ flex: 1, cursor: 'pointer', fontSize: '13px' }}>{nombre(id)}</label>
                <button type="button" className="btn btn-sm" disabled={i === 0} aria-label={`Subir ${nombre(id)}`} onClick={() => setLayout((l) => ({ ...l, orden: moverSeccion(l.orden, [], id, -1) }))}>↑</button>
                <button type="button" className="btn btn-sm" disabled={i === layout.orden.length - 1} aria-label={`Bajar ${nombre(id)}`} onClick={() => setLayout((l) => ({ ...l, orden: moverSeccion(l.orden, [], id, 1) }))}>↓</button>
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={() => setLayout({ orden: ids, ocultas: [] })}>Restaurar orden original</button>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
