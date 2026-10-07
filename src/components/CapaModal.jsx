import { useEffect, useRef } from 'react';
import { confirmar, hayDialogoAbierto } from './Dialogos';

// Protección contra cierres por error de los modales con formularios.
//
// Un clic afuera del modal no lo cierra (muchas veces se hace sin querer y se
// pierde lo cargado): se cierra con sus botones o con Esc. Si se tocó algún
// campo, Esc pide confirmación antes de cerrar.
//
// Uso (antes de cualquier `return null` del componente):
//
//   const capaModal = useCapaModal({ onClose, activo: isOpen, bloqueado: guardando });
//   ...
//   <div className="modal-overlay open" {...capaModal}>
//
// Cuando hay varios modales apilados, Esc sólo cierra el de arriba. Los
// desplegables que usan Esc para cerrarse (SelectorBuscable…) hacen
// preventDefault y entonces Esc no llega al modal.

const capas = [];

export function useCapaModal({ onClose, activo = true, bloqueado = false }) {
  const modificado = useRef(false);
  const ultimo = useRef({ onClose, bloqueado });

  useEffect(() => {
    ultimo.current = { onClose, bloqueado };
  });

  useEffect(() => {
    if (!activo) return undefined;
    modificado.current = false;
    const id = Symbol('capa-modal');
    capas.push(id);

    const alTeclear = async (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (capas[capas.length - 1] !== id || hayDialogoAbierto()) return;
      if (ultimo.current.bloqueado) return;
      e.preventDefault();
      if (modificado.current) {
        const cerrar = await confirmar('Hiciste cambios que todavía no guardaste. Si cerrás ahora, se pierden.', {
          titulo: '¿Cerrar sin guardar?',
          peligro: true,
          textoConfirmar: 'Cerrar sin guardar',
          textoCancelar: 'Seguir editando'
        });
        if (!cerrar) return;
      }
      ultimo.current.onClose?.();
    };

    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
      const i = capas.indexOf(id);
      if (i >= 0) capas.splice(i, 1);
    };
  }, [activo]);

  // Los eventos de los campos suben hasta el fondo del modal.
  const marcar = () => { modificado.current = true; };
  return { onInput: marcar, onChange: marcar };
}
