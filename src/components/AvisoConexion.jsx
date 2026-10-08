import React from 'react';
import { useApp } from '../context/AppContext';

// Cartel de conexión inestable, debajo del encabezado. No bloquea nada: avisa que no
// hay red o que es deficiente. Los guardados se confirman siempre en la nube (ver
// utils/escrituraConfirmada.js) y el arranque con la copia local es sólo para mirar
// (ver AppContext.jsx).
export default function AvisoConexion() {
  const { sinRed, usandoCopiaLocal, conexionDeficiente } = useApp();

  let texto = null;
  if (sinRed) {
    texto = 'Sin conexión a internet. Los cambios NO se guardan hasta que vuelva la conexión.';
  } else if (usandoCopiaLocal) {
    texto = 'No se pudo conectar con la nube: estás viendo los datos guardados en este equipo, que pueden no estar al día. Los cambios no se guardan hasta que se recupere la conexión.';
  } else if (conexionDeficiente) {
    texto = 'La conexión con la nube es deficiente: el último cambio no se pudo confirmar. Seguimos intentando; no se da nada por guardado hasta que la nube lo confirme.';
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
