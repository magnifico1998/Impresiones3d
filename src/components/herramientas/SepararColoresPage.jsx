import React, { Suspense, lazy, useState } from 'react';
import { useCuenta } from '../../context/contextos';
import { puedeUsarHerramientas } from '../../utils/accesoHerramientas';
import ModalSuscribirse from '../modals/ModalSuscribirse';

// El visor 3D (three.js) pesa: se baja recién al entrar a la herramienta,
// para no hacer más lenta la carga del resto de la app.
const HerramientaSepararColores = lazy(() => import('./HerramientaSepararColores'));

export default function SepararColoresPage() {
  const { suscripcion, planContratado, isAdmin } = useCuenta();
  const [modalPlanes, setModalPlanes] = useState(false);
  const habilitada = puedeUsarHerramientas({ suscripcion, planContratado, isAdmin });

  return (
    <div className="page active">
      <div className="page-title">Separar por colores</div>
      <div className="page-sub">
        Partí un STL o 3MF en piezas para imprimir cada color por separado y armarlas después con encastres, o para mandarlo armado a una impresora multicolor.
      </div>

      {habilitada ? (
        <Suspense fallback={<div className="empty">Cargando el visor 3D…</div>}>
          <HerramientaSepararColores />
        </Suspense>
      ) : (
        <div className="card" style={{ maxWidth: '640px' }}>
          <div className="card-title">Herramientas de modelado</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' }}>
            Con esta herramienta marcás la zona de cada color sobre el modelo (con una varita que sigue sus formas o con pincel), y Manager3D arma piezas cerradas con perno, doble perno o llave de alineación, con la holgura justa para PLA, PETG, ABS o TPU. Exportás un STL por pieza o un 3MF a color listo para tu slicer.
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' }}>
            {['lectura', 'suspendida'].includes(suscripcion?.estado)
              ? 'Tu cuenta está en modo lectura: activá un plan que incluya las herramientas de modelado para usarla.'
              : 'Tu plan actual no incluye las herramientas de modelado. Pasate a un plan que las tenga para usarla.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setModalPlanes(true)}>Ver planes</button>
        </div>
      )}

      <ModalSuscribirse isOpen={modalPlanes} onClose={() => setModalPlanes(false)} />
    </div>
  );
}
