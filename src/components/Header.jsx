import React from 'react';
import { useApp } from '../context/AppContext';

export default function Header() {
  const { user, logout, empresa } = useApp();

  return (
    <header className="header">
      <div className="header-logo">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="10,2 18,6 18,14 10,18 2,14 2,6" />
          <polygon points="10,6 14,8 14,12 10,14 6,12 6,8" />
        </svg>
      </div>
      <span className="header-title">Manager3D</span>
      
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

      {user && (
        <button 
          onClick={logout} 
          className="btn btn-sm"
          style={{
            marginLeft: 'auto',
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
    </header>
  );
}
