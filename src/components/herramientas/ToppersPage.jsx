import React, { Suspense, lazy } from 'react';
import PuertaPlan from './PuertaPlan';

// Comparte el generador con Llaveros, en modo lápiz.
const HerramientaLlaveros = lazy(() => import('./HerramientaLlaveros'));

export default function ToppersPage() {
  return (
    <div>
      <div className="page-sub">
        Armá toppers con el nombre para poner en un lápiz: el lápiz atraviesa las letras por el medio. Elegí la forma (tubo recto, que sigue las letras o letras unidas), la tipografía y el color, y exportá un STL o un 3MF.
      </div>

      <PuertaPlan descripcion="Escribís los nombres, elegís el tipo de lápiz, la forma y la tipografía, y Manager3D arma el topper con el agujero del lápiz a lo largo. Exportás un 3MF a color para Bambu Studio u Orca, un STL o un ZIP por colores.">
        <Suspense fallback={<div className="empty">Cargando el generador…</div>}>
          <HerramientaLlaveros modo="lapiz" />
        </Suspense>
      </PuertaPlan>
    </div>
  );
}
