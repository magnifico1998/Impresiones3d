import React, { forwardRef, useState } from 'react';
import { useConfig } from '../context/contextos';
import { completarVacio } from '../utils/campoNumerico';

// Campo numérico de plata que se ve formateado cuando no se está editando
// ($ 15.000) y vuelve a ser un campo numérico común mientras se escribe en él.
// Reemplaza a <input type="number"> sin cambiar nada más: `value` es el número (o
// '' si está vacío) y `onChange` recibe el mismo evento de siempre.
//   sinSimbolo: sólo separador de miles (15.000), para campos que ya muestran el
//   "$" aparte (prefijo, título "($/kg)" o una columna angosta).
//   decimales: cuántos decimales se muestran como máximo (por defecto 2, y sólo los
//   que hagan falta: 1.500 y 1.500,5).
//   permitirVacio: para el campo donde vacío SIGNIFICA algo: no se completa con 0 al salir.
// Mientras se edita se puede borrar todo el número para escribir otro; al salir con el
// campo vacío se completa con 0 (o el mínimo, si es mayor a 0): ver utils/campoNumerico.js.
const CampoMoneda = forwardRef(function CampoMoneda({ value, sinSimbolo = false, decimales = 2, permitirVacio = false, onChange, onFocus, onBlur, ...resto }, ref) {
  const { paisActual } = useConfig();
  const [enfocado, setEnfocado] = useState(false);
  // Texto que se está escribiendo; null = se muestra el valor que llega por `value`.
  const [borrador, setBorrador] = useState(null);

  const vacio = value === '' || value === null || value === undefined;
  let texto = '';
  if (!vacio) {
    const n = Number(value);
    const opciones = sinSimbolo
      ? { minimumFractionDigits: 0, maximumFractionDigits: decimales }
      : { style: 'currency', currency: paisActual.moneda, minimumFractionDigits: 0, maximumFractionDigits: decimales };
    texto = Number.isFinite(n) ? new Intl.NumberFormat(paisActual.localeMoneda, opciones).format(n) : String(value);
  }

  return (
    <input
      {...resto}
      ref={ref}
      type={enfocado ? 'number' : 'text'}
      inputMode="decimal"
      value={enfocado ? (borrador ?? (vacio ? '' : value)) : texto}
      onChange={(e) => { setBorrador(e.target.value); onChange?.(e); }}
      onFocus={(e) => { setEnfocado(true); onFocus?.(e); }}
      onBlur={(e) => {
        if (e.target.value === '' && !permitirVacio) completarVacio(e.target, resto.min);
        setBorrador(null);
        setEnfocado(false);
        onBlur?.(e);
      }}
    />
  );
});

export default CampoMoneda;
