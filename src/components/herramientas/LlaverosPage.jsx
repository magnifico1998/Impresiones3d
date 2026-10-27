import React, { Suspense, lazy } from 'react';
import PuertaPlan from './PuertaPlan';

// Trae el visor 3D y las tipografías recién al entrar a la herramienta.
const HerramientaLlaveros = lazy(() => import('./HerramientaLlaveros'));

export default function LlaverosPage() {
  return (
    <div>
      <div className="page-sub">
        Escribí uno o varios nombres y armá llaveros o nombres para lápiz listos para imprimir: elegí tipografía, borde y colores, y exportá un 3MF a color, un STL o un ZIP por colores.
      </div>

      <PuertaPlan descripcion="Escribís los nombres, elegís la tipografía, el borde y los colores, y Manager3D arma la placa con el agujero para la argolla (o el tubo para el lápiz) con las letras en relieve, una pieza por color. Exportás un 3MF a color para Bambu Studio u Orca, un STL o un ZIP por colores.">
        <Suspense fallback={<div className="empty">Cargando el generador…</div>}>
          <HerramientaLlaveros />
        </Suspense>
      </PuertaPlan>
    </div>
  );
}
