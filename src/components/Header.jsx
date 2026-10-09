import React from 'react';
import { useApp } from '../context/AppContext';
import { version } from '../../package.json';
import { ES_PRUEBA } from '../entornoFirebase';
import useInstalarApp from '../hooks/useInstalarApp';

// Versión visible: mayor.menor de package.json (ver "Versión" en CLAUDE.md).
const VERSION = version.split('.').slice(0, 2).join('.');

export default function Header({ onToggleMenu }) {
  const { user, logout, empresa, syncError } = useApp();
  const { puedeInstalar, instalar } = useInstalarApp();

  return (
    <header className="header">
      <button
        type="button"
        className="hamburger-btn"
        onClick={onToggleMenu}
        aria-label="Abrir menú de navegación"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>
      <div className="header-logo">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="10,2 18,6 18,14 10,18 2,14 2,6" />
          <polygon points="10,6 14,8 14,12 10,14 6,12 6,8" />
        </svg>
      </div>
      <span className="header-title">Manager3D</span>
      {/* Tocando la versión se vuelven a ver las novedades (ModalNovedades). */}
      <button
        type="button"
        className="header-version"
        onClick={() => window.dispatchEvent(new CustomEvent('abrir-novedades'))}
        title="Ver las novedades"
        style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: '10px', background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline dotted' }}
      >
        v{VERSION}
      </button>
      {puedeInstalar && (
        <button type="button" className="btn btn-sm" onClick={instalar} title="Instalá Manager3D como app con acceso directo en tu equipo" style={{ marginLeft: '10px' }}>⬇ Instalar app</button>
      )}
      {ES_PRUEBA && (
        <span title="Estás en el entorno de prueba: los datos no son los reales" style={{ marginLeft: '10px', padding: '2px 8px', borderRadius: '10px', background: 'var(--amber, #d97706)', color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '.5px' }}>PRUEBA</span>
      )}
      
      {(empresa.nombre || empresa.logo) && (
        <div id="header-empresa" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginLeft: '14px',
          paddingLeft: '14px',
          borderLeft: '1px solid var(--border)'
        }}>
          {empresa.logo && (
            <img 
              src={empresa.logo} 
              alt="Logo empresa" 
              style={{
                height: '26px',
                width: 'auto',
                maxWidth: '64px',
                borderRadius: '6px',
                objectFit: 'contain',
                border: '1px solid var(--border)',
                flexShrink: 0
              }} 
            />
          )}
          {empresa.nombre && (
            <span style={{
              fontSize: '13px',
              color: 'var(--text2)',
              fontFamily: 'var(--sans)',
              whiteSpace: 'nowrap'
            }}>
              {empresa.nombre}
            </span>
          )}
        </div>
      )}

      {syncError && (
        <div
          title="No se pudo guardar en la nube. Tus últimos cambios podrían perderse si recargás o cerrás la app."
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginLeft: '14px',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'var(--mono)',
            background: 'var(--dangerDim)',
            color: 'var(--danger)',
            border: '1px solid rgba(248,113,113,.3)',
            whiteSpace: 'nowrap'
          }}
        >
          ⚠ Sin guardar en la nube
        </div>
      )}

      <div className="header-actions" style={{ display: 'flex', gap: '6px', marginLeft: 'auto', alignItems: 'center' }}>
        {/* Recorrido guiado por la app (components/Recorrido.jsx), siempre a mano. */}
        {user && (
          <button
            type="button"
            data-tour="boton-recorrido"
            onClick={() => window.dispatchEvent(new CustomEvent('iniciar-recorrido'))}
            className="btn btn-sm"
            title="Recorrido por la app: dónde está cada cosa y cómo se usa"
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border2)',
              background: 'none',
              color: 'var(--text2)',
              cursor: 'pointer'
            }}
          >
            🧭 Recorrido
          </button>
        )}
        {user && (
          <button
            onClick={logout}
            className="btn btn-sm"
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border2)',
              background: 'none',
              color: 'var(--text2)',
              cursor: 'pointer'
            }}
          >
            Salir ➔
          </button>
        )}
      </div>
    </header>
  );
}
