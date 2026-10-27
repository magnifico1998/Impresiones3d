import React, { useState } from 'react';
import SepararColoresPage from './SepararColoresPage';
import LlaverosPage from './LlaverosPage';

// Cada herramienta nueva se suma acá: una pestaña por herramienta.
const HERRAMIENTAS = [
  { id: 'separar-colores', nombre: 'Separar por colores', Componente: SepararColoresPage },
  { id: 'llaveros', nombre: 'Llaveros y nombres', Componente: LlaverosPage },
];

const CLAVE_PESTANA = 'herramientas.pestana';

function pestanaGuardada() {
  try {
    const id = localStorage.getItem(CLAVE_PESTANA);
    if (HERRAMIENTAS.some((h) => h.id === id)) return id;
  } catch { /* sin almacenamiento: arranca en la primera */ }
  return HERRAMIENTAS[0].id;
}

export default function HerramientasPage() {
  const [activa, setActiva] = useState(pestanaGuardada);
  const herramienta = HERRAMIENTAS.find((h) => h.id === activa) || HERRAMIENTAS[0];
  const { Componente } = herramienta;

  const elegir = (id) => {
    setActiva(id);
    try { localStorage.setItem(CLAVE_PESTANA, id); } catch { /* no es crítico */ }
  };

  return (
    <div className="page active">
      <div className="page-title">Herramientas</div>

      {HERRAMIENTAS.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {HERRAMIENTAS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`btn btn-sm periodo-btn ${herramienta.id === h.id ? 'active' : ''}`}
              onClick={() => elegir(h.id)}
            >
              {h.nombre}
            </button>
          ))}
        </div>
      )}

      <Componente />
    </div>
  );
}
