import React, { Suspense, lazy } from 'react';
import PuertaPlan from './PuertaPlan';

// El visor 3D (three.js) pesa: se baja recién al entrar a la herramienta,
// para no hacer más lenta la carga del resto de la app.
const HerramientaSepararColores = lazy(() => import('./HerramientaSepararColores'));

export default function SepararColoresPage() {
  return (
    <div>
      <div className="page-sub">
        Partí un STL o 3MF en piezas para imprimir cada color por separado y armarlas después con encastres, o para mandarlo armado a una impresora multicolor.
      </div>

      <PuertaPlan descripcion="Con esta herramienta marcás la zona de cada color sobre el modelo (con una varita que sigue sus formas o con pincel), y Manager3D arma piezas cerradas con perno, doble perno o llave de alineación, con la holgura justa para PLA, PETG, ABS o TPU. Exportás un STL por pieza o un 3MF a color listo para tu slicer.">
        <Suspense fallback={<div className="empty">Cargando el visor 3D…</div>}>
          <HerramientaSepararColores />
        </Suspense>
      </PuertaPlan>
    </div>
  );
}
