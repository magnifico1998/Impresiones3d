import React from 'react';
import { textoCombinacion, valorCombinacion } from '../utils/combinacionesColor';

// Grupo "Combinaciones" para el selector de color de una versión (ver utils/combinacionesColor.js).
// No muestra nada si la cuenta no tiene combinaciones cargadas.
export default function OpcionesCombinaciones({ combinaciones }) {
  if (!combinaciones?.length) return null;
  return (
    <optgroup label="Combinaciones (2 colores)">
      {combinaciones.map((c, i) => (
        <option key={i} value={valorCombinacion(i)}>{textoCombinacion(c)}</option>
      ))}
    </optgroup>
  );
}
