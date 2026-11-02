import React, { Suspense, lazy } from 'react';
import PuertaPlan from './PuertaPlan';

// Trae el visor 3D y el procesamiento de mallas recién al entrar a la herramienta.
const HerramientaSuperficie = lazy(() => import('./HerramientaSuperficie'));

export default function SuperficiePage() {
  return (
    <div>
      <div className="page-sub">
        Cargá un modelo y dale una textura de relieve: madera, fibra de carbono o figuras geométricas. Elegís cómo se proyecta, qué tan profundo es y en qué zonas va, y exportás un STL o 3MF listo para imprimir.
      </div>

      <PuertaPlan descripcion="Cargás un modelo (STL, OBJ o 3MF) y le aplicás una textura de relieve: vetas de madera, tejidos de fibra de carbono, hexágonos, ladrillos y más. Manager3D mueve la superficie del modelo según la textura, con la profundidad y el tamaño que elijas, y te deja pintar las zonas que no querés texturar. Exportás un STL o 3MF.">
        <Suspense fallback={<div className="empty">Cargando la herramienta…</div>}>
          <HerramientaSuperficie />
        </Suspense>
      </PuertaPlan>
    </div>
  );
}
