import React, { forwardRef, useState } from 'react';
import { completarVacio } from '../utils/campoNumerico';

// Reemplaza a <input type="number">: se puede borrar todo el número para escribir otro (con o sin flechitas del
// navegador) y, al salir con el campo vacío, se completa con el mínimo (si es mayor a 0) o con 0, para que nunca
// quede una cantidad o un monto vacío. `value` y `onChange` son los de siempre.
//   permitirVacio: para el campo donde vacío SIGNIFICA algo (ej. "sin límite"): no se completa al salir.
const CampoNumero = forwardRef(function CampoNumero({ value, onChange, onBlur, permitirVacio = false, ...resto }, ref) {
  // Texto que se está escribiendo; null = no se está editando y se muestra el valor que llega por `value`.
  const [borrador, setBorrador] = useState(null);
  const delPadre = value === null || value === undefined ? '' : value;

  return (
    <input
      {...resto}
      ref={ref}
      type="number"
      value={borrador ?? delPadre}
      onChange={(e) => { setBorrador(e.target.value); onChange?.(e); }}
      onBlur={(e) => {
        if (e.target.value === '' && !permitirVacio) completarVacio(e.target, resto.min);
        setBorrador(null);
        onBlur?.(e);
      }}
    />
  );
});

export default CampoNumero;
