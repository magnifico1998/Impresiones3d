import React from 'react';
import { useApp } from '../context/AppContext';

export default function Toasts() {
  const { toasts } = useApp();

  if (!toasts.length) return null;

  const colors = {
    success: {
      background: 'var(--accentDim)',
      color: 'var(--accent)',
      border: '1px solid var(--accent)'
    },
    error: {
      background: 'var(--dangerDim)',
      color: 'var(--danger)',
      border: '1px solid var(--danger)'
    },
    info: {
      background: 'var(--infoDim)',
      color: 'var(--info)',
      border: '1px solid var(--info)'
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 9999,
      pointerEvents: 'none'
    }}>
      {toasts.map(t => {
        const style = colors[t.type] || colors.success;
        return (
          <div
            key={t.id}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'var(--mono)',
              whiteSpace: 'nowrap',
              boxShadow: 'var(--shadow)', backdropFilter: 'blur(6px)',
              transition: 'opacity 0.3s',
              ...style
            }}
          >
            {t.message}
            {/* Abre un ticket con el log de lo que pasó justo antes (CentroSoporte). */}
            {t.type === 'error' && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('abrir-ticket', { detail: { errorOrigen: t.message } }))}
                style={{
                  pointerEvents: 'auto', marginLeft: '12px', background: 'transparent', border: '1px solid currentColor',
                  color: 'inherit', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'
                }}
              >
                Reportar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
