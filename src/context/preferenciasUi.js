import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Preferencias de pantalla de CADA PERSONA (orden y secciones ocultas, ver
// utils/layoutPantalla.js). Se guardan en preferenciasUi/{uid de la persona},
// no en la cuenta: el dueño y cada miembro del equipo arman la suya.
//
//   { pantallas: { calculadora: { orden: [...], ocultas: [...], ts }, ... } }
//
// Funcionamiento:
// - El servidor es la fuente de verdad y llega en tiempo real (onSnapshot): lo que
//   se acomoda en una computadora aparece solo en el celular.
// - El navegador guarda una copia (localStorage) sólo para dibujar algo al instante
//   mientras llega la respuesta. Nunca pisa lo del servidor: lo local se sube
//   una única vez, si todavía no existe nada guardado en la cuenta.
// - Cada pantalla se guarda por separado (merge): acomodar la Calculadora en un
//   dispositivo y el Resumen en otro no se pisan.
// - Es un almacén fuera de React (useSyncExternalStore) para no tocar AppContext
//   más que con una línea que lo enciende al iniciar sesión.

const claveCache = (uid) => `prefsUi.${uid}`;

let uidActual = null;
let desuscribir = null;
let alAvisar = null;
let estado = { pantallas: {} };
const oyentes = new Set();

const emitir = () => { oyentes.forEach((f) => f()); };

const leerCache = (uid) => {
  try {
    const t = localStorage.getItem(claveCache(uid));
    const v = t ? JSON.parse(t) : null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

const escribirCache = (uid, pantallas) => {
  try {
    localStorage.setItem(claveCache(uid), JSON.stringify(pantallas));
  } catch {
    // Sin almacenamiento: sólo se pierde el primer vistazo instantáneo.
  }
};

// Lo llama AppProvider al iniciar o cerrar sesión (uid null). Es idempotente.
export function iniciarPreferenciasUi(uid, avisar) {
  alAvisar = avisar || null;
  if (uid === uidActual) return;
  if (desuscribir) { desuscribir(); desuscribir = null; }
  uidActual = uid || null;
  estado = { pantallas: uid ? leerCache(uid) : {} };
  emitir();
  if (!uid) return;

  const ref = doc(db, 'preferenciasUi', uid);
  let primera = true;
  desuscribir = onSnapshot(
    ref,
    (snap) => {
      // Un guardado propio todavía sin confirmar: ya está reflejado acá, no hace falta volver a leerlo.
      if (snap.metadata.hasPendingWrites) return;

      if (!snap.exists()) {
        // Nada guardado en la cuenta: si había algo en este navegador, se sube una vez.
        if (Object.keys(estado.pantallas).length) {
          setDoc(ref, { pantallas: estado.pantallas, actualizado: serverTimestamp() }).catch((e) => console.error('No se pudieron subir las preferencias de pantalla:', e));
        }
        primera = false;
        return;
      }

      const remotas = snap.data().pantallas || {};
      const cambio = JSON.stringify(remotas) !== JSON.stringify(estado.pantallas);
      estado = { pantallas: remotas };
      escribirCache(uid, remotas);
      emitir();
      if (cambio && !primera && alAvisar) alAvisar('↺ Pantallas acomodadas desde otro dispositivo.');
      primera = false;
    },
    (e) => console.error('Error en la suscripción de preferencias de pantalla:', e)
  );
}

// Guarda el orden y lo oculto de UNA pantalla. Se refleja enseguida (optimista) y
// después viaja al servidor. { orden: [], ocultas: [] } equivale a "el de siempre".
export function guardarLayout(pantalla, { orden, ocultas }) {
  if (!uidActual) return;
  const entrada = { orden, ocultas, ts: Date.now() };
  estado = { pantallas: { ...estado.pantallas, [pantalla]: entrada } };
  escribirCache(uidActual, estado.pantallas);
  emitir();
  setDoc(doc(db, 'preferenciasUi', uidActual), { pantallas: { [pantalla]: entrada }, actualizado: serverTimestamp() }, { merge: true })
    .catch((e) => console.error('No se pudo guardar el orden de la pantalla:', e));
}

const suscribir = (f) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const instantanea = () => estado;

export function usePreferenciasUi() {
  const e = useSyncExternalStore(suscribir, instantanea);
  return { layoutDe: (pantalla) => e.pantallas[pantalla] || null, guardarLayout };
}
