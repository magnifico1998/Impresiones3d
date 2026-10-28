import React, { Suspense, lazy } from 'react';
import PuertaPlan from './PuertaPlan';

// Trae el visor 3D y el procesamiento de imágenes recién al entrar a la herramienta.
const HerramientaImagenLlavero = lazy(() => import('./HerramientaImagenLlavero'));

export default function ImagenLlaveroPage() {
  return (
    <div>
      <div className="page-sub">
        Subí una imagen simple y armá un llavero a color: se agrupan sus colores en hasta 4, 8 o 12, y cada uno es una pieza para imprimir. Exportá un 3MF a color, un STL o un ZIP por colores.
      </div>

      <PuertaPlan descripcion="Subís una imagen (un dibujo o un logo), elegís en cuántos colores agruparla (hasta 4, 8 o 12), y Manager3D arma un llavero con una pieza por color, la base que sigue la silueta y la argolla. Exportás un 3MF a color para Bambu Studio u Orca, un STL o un ZIP por colores.">
        <Suspense fallback={<div className="empty">Cargando la herramienta…</div>}>
          <HerramientaImagenLlavero />
        </Suspense>
      </PuertaPlan>
    </div>
  );
}
