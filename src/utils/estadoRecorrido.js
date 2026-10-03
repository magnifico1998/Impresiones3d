import { useSyncExternalStore } from 'react';

// Si al usuario le toca el recorrido guiado (components/Recorrido.jsx), para
// que el aviso de Novedades no se le superponga: a quien todavía no hizo el
// recorrido no se le muestran novedades (el recorrido ya le cuenta todo).
//   'cargando' | 'pendiente' | 'listo'

let estado = 'cargando';
const oyentes = new Set();

export const fijarEstadoRecorrido = (nuevo) => {
  estado = nuevo;
  oyentes.forEach((fn) => fn());
};

export const useEstadoRecorrido = () => useSyncExternalStore(
  (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  () => estado
);
