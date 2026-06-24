import React from 'react';
import { useApp } from '../context/AppContext';

export default function Toasts() {
  const { toasts } = useApp();

  if (!toasts.length) return null;

  const colors = {
    success: {
      background: '#1a2e20',
      color: 'var(--accent)',
      border: '1px solid rgba(110,231,183,.3)'
    },
    error: {
      background: '#2e1a1a',
      color: 'var(--danger)',
      border: '1px solid rgba(248,113,113,.3)'
    },
    info: {
      background: '#1a1e2e',
      color: 'var(--info)',
      border: '1px solid rgba(96,165,250,.3)'
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
              boxShadow: '0 4px 16px rgba(0,0,0,.4)',
              transition: 'opacity 0.3s',
              ...style
            }}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
