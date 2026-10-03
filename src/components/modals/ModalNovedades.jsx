import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { version } from '../../../package.json';
import { novedadesDesde } from '../../utils/novedades';
import { useEstadoRecorrido } from '../../utils/estadoRecorrido';

// Aviso "Novedades", montado una vez en App:
//   - al entrar, si este usuario todavía no vio la versión mayor actual,
//     muestra lo nuevo desde la última que vio (la primera vez en este
//     navegador, las últimas VERSIONES_PRIMERA_VEZ);
//   - se vuelve a abrir tocando la versión del encabezado (evento
//     'abrir-novedades'), con las últimas versiones.
// La última versión vista se guarda en este navegador, por usuario.

const MAYOR = Number(version.split('.')[0]);
const MAX_VERSIONES = 4;
const VERSIONES_PRIMERA_VEZ = 3;

const claveVista = (uid) => `novedades.vista.${uid}`;
const leerVista = (uid) => {
  try {
    const v = localStorage.getItem(claveVista(uid));
    return v === null ? null : Number(v);
  } catch {
    return MAYOR; // sin almacenamiento no se insiste en cada ingreso
  }
};
const guardarVista = (uid) => {
  try {
    localStorage.setItem(claveVista(uid), String(MAYOR));
  } catch {
    // Sin almacenamiento: no hay dónde recordarlo.
  }
};

const fechaCorta = (f) => f.split('-').reverse().join('/');

export default function ModalNovedades() {
  const { user, datosCargadosOk } = useApp();
  const [entradas, setEntradas] = useState(null);
  const recorrido = useEstadoRecorrido();

  // Al entrar, una vez cargados los datos (así no se superpone con la carga).
  useEffect(() => {
    if (!user?.uid || !datosCargadosOk || recorrido === 'cargando') return;
    // A quien le toca el recorrido guiado no se le muestran novedades: el
    // recorrido ya le cuenta todo. Quedan como vistas.
    if (recorrido === 'pendiente') {
      guardarVista(user.uid);
      return;
    }
    const vista = leerVista(user.uid);
    if (vista !== null && vista >= MAYOR) return;
    const nuevas = novedadesDesde(vista ?? MAYOR - VERSIONES_PRIMERA_VEZ).slice(0, MAX_VERSIONES);
    if (nuevas.length) setEntradas(nuevas);
    else guardarVista(user.uid);
  }, [user?.uid, datosCargadosOk, recorrido]);

  useEffect(() => {
    const abrir = () => setEntradas(novedadesDesde().slice(0, MAX_VERSIONES));
    window.addEventListener('abrir-novedades', abrir);
    return () => window.removeEventListener('abrir-novedades', abrir);
  }, []);

  if (!entradas) return null;

  const cerrar = () => {
    if (user?.uid) guardarVista(user.uid);
    setEntradas(null);
  };

  return createPortal(
    <div className="modal-overlay open" onClick={cerrar} style={{ zIndex: 125, padding: '20px 16px' }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto', maxWidth: '560px' }}>
        <div className="modal-title">✨ Novedades en Manager3D</div>
        <div className="modal-sub">Lo nuevo desde tu último ingreso.</div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {entradas.map((n) => (
            <div key={n.version}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Versión {n.version}.0</span>
                <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fechaCorta(n.fecha)}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: 1.55, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {n.items.map((i) => (
                  <li key={i.texto}>
                    {i.texto}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <span style={{ fontSize: '11px', color: 'var(--text3)', marginRight: 'auto', alignSelf: 'center' }}>Volvé a verlas tocando la versión, arriba.</span>
          <button className="btn btn-primary" onClick={cerrar}>Entendido</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
