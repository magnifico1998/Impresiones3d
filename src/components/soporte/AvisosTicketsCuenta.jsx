import { useEffect, useSyncExternalStore } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

// Novedades de los tickets de la cuenta, para quien los creó (montado una
// vez en App): cuántos tickets tienen un cambio de estado o una respuesta
// que todavía no vio. El menú lateral lo muestra en "Soporte" y la lista de
// Soporte marca cada uno hasta que se abre (marcarTicketVisto).
//   - Un ticket sólo cambia después de creado cuando el admin le cambia el
//     estado o le responde (actualizarTicket), así que "hay novedad" es
//     actualizadoEl posterior a creadoEl y a lo que ya se vio.
//   - Lo visto se guarda por persona en este navegador:
//     localStorage `tickets.vistos.{uid}` = { [ticketId]: ms del cambio visto }.

const ms = (ts) => ts?.toMillis?.() || 0;

let tickets = [];
let vistos = {};
let clave = null;
let estado = { sinVer: 0, ids: new Set() };
const oyentes = new Set();

const tieneNovedad = (t) => ms(t.actualizadoEl) > ms(t.creadoEl) && ms(t.actualizadoEl) > (vistos[t.id] || 0);

function recalcular() {
  const ids = new Set(tickets.filter(tieneNovedad).map((t) => t.id));
  estado = { sinVer: ids.size, ids };
  oyentes.forEach((fn) => fn());
}

export function marcarTicketVisto(ticket) {
  if (!ticket || !tieneNovedad(ticket)) return;
  vistos = { ...vistos, [ticket.id]: ms(ticket.actualizadoEl) };
  try {
    if (clave) localStorage.setItem(clave, JSON.stringify(vistos));
  } catch {
    // Sin almacenamiento: queda visto hasta recargar.
  }
  recalcular();
}

// { sinVer, ids }: cantidad y tickets con novedades sin ver.
export const useTicketsSinVer = () => useSyncExternalStore(
  (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  () => estado
);

export default function AvisosTicketsCuenta() {
  const { user, cuentaId } = useApp();

  useEffect(() => {
    if (!user?.uid || !cuentaId) return undefined;
    clave = `tickets.vistos.${user.uid}`;
    try {
      vistos = JSON.parse(localStorage.getItem(clave) || '{}') || {};
    } catch {
      vistos = {};
    }
    const unsub = onSnapshot(
      query(collection(db, 'tickets'), where('cuentaId', '==', cuentaId)),
      (snap) => {
        tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        recalcular();
      },
      (err) => console.error('Error al escuchar los tickets de la cuenta:', err)
    );
    return () => {
      unsub();
      tickets = [];
      recalcular();
    };
  }, [user?.uid, cuentaId]);

  return null;
}
