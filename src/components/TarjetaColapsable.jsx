import React, { useState } from 'react';

// Tarjeta que se abre y cierra tocando el título, para las secciones largas
// (boletín, totalizador de monotributo, listados de comprobantes). Si tiene
// `clave`, recuerda en este navegador si quedó abierta; si no hay
// almacenamiento, arranca como dice `abiertaInicial`.
//   resumen: texto chico al lado del título, visible también cerrada.

const leer = (clave, porDefecto) => {
  if (!clave) return porDefecto;
  try {
    const v = localStorage.getItem(`tarjeta.${clave}`);
    return v === null ? porDefecto : v === '1';
  } catch {
    return porDefecto;
  }
};

export default function TarjetaColapsable({ titulo, resumen, clave, abiertaInicial = false, children }) {
  const [abierta, setAbierta] = useState(() => leer(clave, abiertaInicial));

  const alternar = () => {
    setAbierta((v) => {
      if (clave) {
        try {
          localStorage.setItem(`tarjeta.${clave}`, v ? '0' : '1');
        } catch {
          // Sin almacenamiento: sólo dura mientras la página está abierta.
        }
      }
      return !v;
    });
  };

  return (
    <div className="card">
      <div
        className="card-title"
        role="button"
        tabIndex={0}
        aria-expanded={abierta}
        onClick={alternar}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } }}
        style={{ cursor: 'pointer', userSelect: 'none', marginBottom: abierta ? undefined : 0 }}
      >
        {abierta ? '▾' : '▸'} {titulo}
        {resumen && <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text3)', marginLeft: '8px', textTransform: 'none', letterSpacing: 0 }}>{resumen}</span>}
      </div>
      {abierta && children}
    </div>
  );
}
