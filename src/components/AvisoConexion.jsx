import React from 'react';
import { useApp } from '../context/AppContext';

// Cartel de conexión inestable, debajo del encabezado. No bloquea nada: avisa que
// se sigue trabajando con los datos de este equipo y que los cambios se mandan
// solos a la nube cuando vuelve la conexión (la copia local es de Firestore; ver
// utils/escrituraTolerante.js y el arranque en AppContext.jsx).
export default function AvisoConexion() {
  const { sinRed, usandoCopiaLocal, cambiosPendientes } = useApp();

  let texto = null;
  if (sinRed) {
    texto = 'Sin conexión a internet. Podés seguir trabajando: los cambios se guardan en este equipo y se sincronizan solos cuando vuelva la conexión.';
  } else if (usandoCopiaLocal) {
    texto = 'No se pudo conectar con la nube: estás viendo los datos guardados en este equipo. Los cambios se sincronizan solos cuando se recupere la conexión.';
  } else if (cambiosPendientes) {
    texto = 'La conexión está lenta: hay cambios guardados en este equipo esperando sincronizarse con la nube. No cierres la ventana todavía.';
  }
  if (!texto) return null;

  return (
    <div
      role="status"
      style={{
        padding: '6px 14px',
        fontSize: '12px',
        fontFamily: 'var(--sans)',
        background: 'var(--warnDim, rgba(251,191,36,.12))',
        color: 'var(--warn, #fbbf24)',
        borderBottom: '1px solid rgba(251,191,36,.3)',
        textAlign: 'center'
      }}
    >
      ⚠ {texto}
    </div>
  );
}
