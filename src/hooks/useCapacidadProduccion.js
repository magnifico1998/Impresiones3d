import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { simularCapacidadProduccion } from '../utils/capacidadProduccion';

// Devuelve { [pedidoId]: { etaEstimada, piezasDetalle } } recalculado cada
// vez que cambian los pedidos o la config de capacidad. No se persiste: es
// derivable y depende de datos que cambian todo el tiempo.
export function useCapacidadProduccion() {
  const { pedidos, cfg } = useApp();
  return useMemo(
    () => simularCapacidadProduccion(pedidos, cfg.capacidadProduccion),
    [pedidos, cfg.capacidadProduccion]
  );
}
