import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { numeroTicket } from '../../utils/formatoTicket';

// Avisos de tickets para la cuenta admin, montado una vez en App:
//   - la cantidad de tickets pendientes (abiertos o en análisis), que el
//     menú lateral muestra en "Administrador" (useTicketsPendientes);
//   - un aviso emergente por cada ticket nuevo que entra mientras la app
//     está abierta (los que ya estaban al abrirla los cubre el contador).
// Las reglas de Firestore sólo dejan leer todos los tickets al admin; para
// el resto de las cuentas no se escucha nada.

const PENDIENTES = ['abierto', 'analisis'];
const SEGUNDOS_AVISO = 20;

// Cantidad de pendientes, compartida con el menú lateral.
let pendientes = 0;
const oyentes = new Set();
const fijarPendientes = (n) => {
  pendientes = n;
  oyentes.forEach((fn) => fn());
};
export const useTicketsPendientes = () => useSyncExternalStore(
  (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  () => pendientes
);

// Va a Administrador → Tickets (AdminPage escucha el evento si ya está abierta).
export function irATickets(setActivePage) {
  try {
    localStorage.setItem('admin.pestana', 'tickets');
  } catch {
    // Sin almacenamiento: abre en la última pestaña usada.
  }
  setActivePage('admin');
  window.dispatchEvent(new CustomEvent('abrir-pestana-admin', { detail: 'tickets' }));
}

export default function AvisosTicketsAdmin() {
  const { isAdmin, setActivePage } = useApp();
  const [avisos, setAvisos] = useState([]);
  const primeraCarga = useRef(true);

  useEffect(() => {
    if (!isAdmin) {
      fijarPendientes(0);
      return undefined;
    }
    primeraCarga.current = true;
    const unsub = onSnapshot(
      query(collection(db, 'tickets'), where('estado', 'in', PENDIENTES)),
      (snap) => {
        fijarPendientes(snap.size);
        // En la primera carga vienen todos como "added": no son nuevos.
        if (primeraCarga.current) {
          primeraCarga.current = false;
          return;
        }
        const nuevos = snap.docChanges()
          // Recién creados (no uno que volvió a "abierto" desde otro estado).
          .filter((c) => c.type === 'added' && !c.doc.data().respuestas?.length && c.doc.data().creadoEl?.toMillis?.() > Date.now() - 5 * 60 * 1000)
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }));
        if (nuevos.length) setAvisos((prev) => [...prev, ...nuevos]);
      },
      (err) => console.error('Error al escuchar los tickets pendientes:', err)
    );
    return () => {
      unsub();
      fijarPendientes(0);
    };
  }, [isAdmin]);

  // Cada aviso se va solo después de un rato.
  useEffect(() => {
    if (!avisos.length) return undefined;
    const t = setTimeout(() => setAvisos((prev) => prev.slice(1)), SEGUNDOS_AVISO * 1000);
    return () => clearTimeout(t);
  }, [avisos]);

  if (!avisos.length) return null;
  const cerrar = (id) => setAvisos((prev) => prev.filter((a) => a.id !== id));

  return createPortal(
    <div className="avisos-tickets">
      {avisos.slice(-3).map((t) => (
        <div key={t.id} className="aviso-ticket" role="alert">
          <div style={{ fontSize: '18px', lineHeight: 1 }}>🛟</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>Nuevo ticket {numeroTicket(t.numero)}</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.asunto}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.email || t.cuentaId}{t.resumen?.errores ? ` · ${t.resumen.errores} error${t.resumen.errores === 1 ? '' : 'es'}` : ''}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { irATickets(setActivePage); cerrar(t.id); }}>Ver</button>
          <button className="btn btn-ghost btn-sm" onClick={() => cerrar(t.id)} title="Cerrar" aria-label="Cerrar">✕</button>
        </div>
      ))}
    </div>,
    document.body
  );
}
