import React, { useState } from 'react';
import SepararColoresPage from './SepararColoresPage';
import LlaverosPage from './LlaverosPage';
import ToppersPage from './ToppersPage';
import ImagenLlaveroPage from './ImagenLlaveroPage';

// Cada herramienta nueva se suma acá: una pestaña por herramienta.
const HERRAMIENTAS = [
  { id: 'separar-colores', nombre: 'Separar por colores', Componente: SepararColoresPage },
  { id: 'llaveros', nombre: 'Llaveros', Componente: LlaverosPage },
  { id: 'toppers', nombre: 'Toppers de nombres para lápices', Componente: ToppersPage },
  { id: 'imagen', nombre: 'Imagen a llavero', Componente: ImagenLlaveroPage },
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
  // Las pestañas que ya se abrieron quedan montadas (ocultas), para no perder
  // lo escrito ni el modelo cargado al cambiar de una a otra.
  const [abiertas, setAbiertas] = useState(() => new Set([activa]));

  const elegir = (id) => {
    setActiva(id);
    setAbiertas((a) => new Set(a).add(id));
    try { localStorage.setItem(CLAVE_PESTANA, id); } catch { /* no es crítico */ }
  };

  return (
    <div className="page active">
      <div className="page-title">Herramientas</div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {HERRAMIENTAS.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`btn btn-sm periodo-btn ${activa === h.id ? 'active' : ''}`}
            onClick={() => elegir(h.id)}
          >
            {h.nombre}
          </button>
        ))}
      </div>

      {HERRAMIENTAS.filter((h) => abiertas.has(h.id)).map(({ id, Componente }) => (
        <div key={id} style={{ display: activa === id ? 'block' : 'none' }}>
          <Componente />
        </div>
      ))}
    </div>
  );
}
