import React from 'react';
import { useApp } from '../context/AppContext';
import { version } from '../../package.json';

// Versión visible: mayor.menor de package.json (ver "Versión" en CLAUDE.md).
const VERSION = version.split('.').slice(0, 2).join('.');

export default function Header({ onToggleMenu }) {
  const { user, logout, empresa, syncError } = useApp();

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
      <span className="header-version" style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: '10px' }}>v{VERSION}</span>
      
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
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                objectFit: 'cover',
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
