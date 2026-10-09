import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { estadoDelAviso } from '../utils/avisoActualizacion';

// Cartel de actualización programada, debajo del encabezado (ver utils/avisoActualizacion.js).
// Se puede cerrar: queda cerrado hasta que el admin lo cambie o hasta la próxima sesión.
export default function AvisoActualizacion() {
  const [aviso, setAviso] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [cerrado, setCerrado] = useState(() => {
    try { return sessionStorage.getItem('aviso-actualizacion-cerrado') || ''; } catch { return ''; }
  });

  useEffect(() => onSnapshot(
    doc(db, 'avisoSistema', 'actualizacion'),
    (snap) => setAviso(snap.exists() ? snap.data() : null),
    // Sin permiso o sin red: sin cartel, no es un error de la app.
    () => setAviso(null)
  ), []);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const estado = estadoDelAviso(aviso, ahora);
  // Una versión nueva del aviso (otra fecha o texto) vuelve a mostrarse aunque se haya cerrado el anterior.
  const firma = aviso ? `${aviso.fechaHora}|${aviso.mensaje || ''}|${estado?.tipo}` : '';
  if (!estado || cerrado === firma) return null;

  const cerrar = () => {
    setCerrado(firma);
    try { sessionStorage.setItem('aviso-actualizacion-cerrado', firma); } catch { /* sin almacenamiento */ }
  };

  const durante = estado.tipo === 'durante';
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center',
        padding: '8px 14px', fontSize: '13px', fontFamily: 'var(--sans)',
        background: durante ? 'var(--accentDim)' : 'var(--warnDim, rgba(251,191,36,.12))',
        color: durante ? 'var(--accent)' : 'var(--warn, #fbbf24)',
        borderBottom: `1px solid ${durante ? 'var(--accent)' : 'rgba(251,191,36,.35)'}`
      }}
    >
      <span>{durante ? '🔄' : '⏰'} {estado.texto}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar} aria-label="Cerrar el aviso">✕</button>
    </div>
  );
}
