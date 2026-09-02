import { useState } from 'react';

// Filtro de período (preset en días o rango de fechas manual) que se
// persiste en localStorage bajo `key`, para que quede fijo al salir y
// volver a entrar a la sección -- hasta que el usuario elija otro. `key`
// debe ser distinta por sección (Resumen, Pedidos...) para que no
// compartan la misma selección.
export function useFiltroPeriodo(key, diasPorDefecto = 0) {
  const leer = (campo, fallback) => {
    try {
      const raw = window.localStorage.getItem(`${key}.${campo}`);
      return raw !== null ? raw : fallback;
    } catch {
      return fallback;
    }
  };

  const guardar = (campo, valor) => {
    try {
      window.localStorage.setItem(`${key}.${campo}`, String(valor));
    } catch {
      // Modo privado u otro bloqueo de localStorage: el filtro sigue
      // funcionando para esta sesión, sólo no queda guardado.
    }
  };

  const [diasPeriodo, setDiasPeriodoState] = useState(() => {
    const n = parseInt(leer('diasPeriodo', String(diasPorDefecto)), 10);
    return isNaN(n) ? diasPorDefecto : n;
  });
  const [fechaDesde, setFechaDesdeState] = useState(() => leer('fechaDesde', ''));
  const [fechaHasta, setFechaHastaState] = useState(() => leer('fechaHasta', ''));

  const setDiasPeriodo = (v) => { setDiasPeriodoState(v); guardar('diasPeriodo', v); };
  const setFechaDesde = (v) => { setFechaDesdeState(v); guardar('fechaDesde', v); };
  const setFechaHasta = (v) => { setFechaHastaState(v); guardar('fechaHasta', v); };

  return { diasPeriodo, setDiasPeriodo, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta };
}
