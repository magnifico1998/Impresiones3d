import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

// Campo numérico de plata que se ve formateado cuando no se está editando
// ($ 15.000) y vuelve a ser un campo numérico común mientras se escribe en él.
// Reemplaza a <input type="number"> sin cambiar nada más: `value` es el número (o
// '' si está vacío) y `onChange` recibe el mismo evento de siempre.
//   sinSimbolo: sólo separador de miles (15.000), para campos que ya muestran el
//   "$" aparte (prefijo, título "($/kg)" o una columna angosta).
//   decimales: cuántos decimales se muestran como máximo (por defecto 2, y sólo los
//   que hagan falta: 1.500 y 1.500,5).
export default function CampoMoneda({ value, sinSimbolo = false, decimales = 2, onFocus, onBlur, ...resto }) {
  const { paisActual } = useApp();
  const [enfocado, setEnfocado] = useState(false);

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
      type={enfocado ? 'number' : 'text'}
      inputMode="decimal"
      value={enfocado ? (vacio ? '' : value) : texto}
      onFocus={(e) => { setEnfocado(true); onFocus?.(e); }}
      onBlur={(e) => { setEnfocado(false); onBlur?.(e); }}
    />
  );
}
