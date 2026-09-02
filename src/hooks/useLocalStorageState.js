import { useState } from 'react';

// Estado que se persiste en localStorage bajo `key`, para que la elección
// del usuario (orden, filtro, etc.) quede fija al salir y volver a entrar
// a la sección -- hasta que la cambie por otra. Mismo criterio que
// useFiltroPeriodo, pero para un único valor simple (string/number/bool).
export function useLocalStorageState(key, defaultValue) {
  const [value, setValueState] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? raw : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setValue = (v) => {
    setValueState(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // Modo privado u otro bloqueo de localStorage: el valor sigue
      // funcionando para esta sesión, sólo no queda guardado.
    }
  };

  return [value, setValue];
}
