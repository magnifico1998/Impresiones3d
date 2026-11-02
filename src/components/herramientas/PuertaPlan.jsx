import React, { useState } from 'react';
import { useCuenta } from '../../context/contextos';
import { puedeUsarHerramientas } from '../../utils/accesoHerramientas';
import ModalSuscribirse from '../modals/ModalSuscribirse';

// Deja pasar a las herramientas de modelado sólo a las cuentas con un plan que
// las incluya; al resto le muestra qué hace la herramienta (`descripcion`) y
// el camino a los planes.
export default function PuertaPlan({ titulo = 'Herramientas de modelado', descripcion, children }) {
  const { suscripcion, planContratado, isAdmin } = useCuenta();
  const [modalPlanes, setModalPlanes] = useState(false);
  if (puedeUsarHerramientas({ suscripcion, planContratado, isAdmin })) return children;

  return (
    <>
      <div className="card" style={{ maxWidth: '640px' }}>
        <div className="card-title">{titulo}</div>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' }}>{descripcion}</p>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' }}>
          {['lectura', 'suspendida'].includes(suscripcion?.estado)
            ? 'Tu cuenta está en modo lectura: activá un plan que incluya las herramientas de modelado para usarla.'
            : 'Tu plan actual no incluye las herramientas de modelado. Pasate a un plan que las tenga para usarla.'}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setModalPlanes(true)}>Ver planes</button>
      </div>
      <ModalSuscribirse isOpen={modalPlanes} onClose={() => setModalPlanes(false)} />
    </>
  );
}
