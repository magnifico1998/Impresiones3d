import React, { Suspense, lazy } from 'react';
import PuertaPlan from './PuertaPlan';

// Trae el visor 3D y el generador recién al entrar a la herramienta.
const HerramientaJarros = lazy(() => import('./HerramientaJarros'));

export default function JarrosPage() {
  return (
    <div>
      <div className="page-sub">
        Diseñá un jarro porta-lata a tu medida: elegí la lata (o escribí el diámetro y el alto del hueco), el asa y los colores, y exportá un 3MF a color, un STL o las piezas sueltas listas para imprimir.
      </div>

      <PuertaPlan descripcion="Elegís la lata o la medida del hueco, el grosor del cuerpo y el asa (pegada o desmontable con encastre), y Manager3D arma el jarro en 3D con el hueco para la lata. Exportás un 3MF a color para Bambu Studio u Orca, un STL, un ZIP con cada pieza suelta o una placa de impresión con las piezas desmontables acomodadas en tu cama.">
        <Suspense fallback={<div className="empty">Cargando el generador…</div>}>
          <HerramientaJarros />
        </Suspense>
      </PuertaPlan>
    </div>
  );
}
