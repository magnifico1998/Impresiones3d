import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Desplegable que se filtra escribiendo: reemplaza a un <select> cuando la
// lista es larga (ej. los rollos del inventario al descontar un pedido).
// A diferencia de SelectorConAlta, sólo deja elegir opciones existentes.
//
// opciones: [{ valor, texto, muestra? (color de la bolita), detalle? }]
// Se busca por todas las palabras escritas, en cualquier orden y sin
// distinguir mayúsculas ni acentos ("blanco pla" encuentra "PLA · Grilon3 · Blanco").
// El desplegable va por portal al body: el campo suele estar en tablas con
// desplazamiento lateral, que recortarían una lista posicionada adentro.

const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const Muestra = ({ color }) => (
  <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, border: '1px solid var(--border2)', background: color || 'transparent' }} />
);

export default function SelectorBuscable({ value, onChange, opciones, textoVacio = '— Ninguno —', placeholder = 'Escribí para buscar…' }) {
  const inputRef = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resaltada, setResaltada] = useState(0);
  const [pos, setPos] = useState(null);

  const elegida = opciones.find((o) => o.valor === value);
  const palabras = normal(busqueda).split(/\s+/).filter(Boolean);
  const items = [
    { valor: '', texto: textoVacio },
    ...opciones.filter((o) => palabras.every((p) => normal(`${o.texto} ${o.detalle || ''}`).includes(p)))
  ];

  useLayoutEffect(() => {
    if (!abierto || !inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    // Si no entra abajo, se abre hacia arriba.
    const arriba = window.innerHeight - r.bottom < 240 && r.top > 240;
    setPos({ top: arriba ? undefined : r.bottom + 4, bottom: arriba ? window.innerHeight - r.top + 4 : undefined, left: r.left, width: Math.max(r.width, 220) });
  }, [abierto, busqueda]);

  const abrir = () => {
    setBusqueda('');
    setResaltada(Math.max(0, items.findIndex((i) => i.valor === value)));
    setAbierto(true);
  };

  const elegir = (item) => {
    onChange(item.valor);
    setAbierto(false);
    inputRef.current?.blur();
  };

  const teclado = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setResaltada((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltada((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && abierto && items[resaltada]) {
      e.preventDefault();
      elegir(items[resaltada]);
    } else if (e.key === 'Escape') {
      if (abierto) e.preventDefault(); // cierra la lista, no el modal que la contiene
      setAbierto(false);
      inputRef.current?.blur();
    }
  };

  return (
    <>
      <div style={{ position: 'relative' }}>
        {/* Cerrado muestra lo elegido; abierto, lo que se escribe para buscar. */}
        {!abierto && elegida?.muestra && (
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
            <Muestra color={elegida.muestra} />
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={abierto ? busqueda : (elegida ? elegida.texto : textoVacio)}
          placeholder={elegida ? elegida.texto : placeholder}
          onChange={(e) => { setBusqueda(e.target.value); setResaltada(e.target.value ? 1 : 0); setAbierto(true); }}
          onFocus={abrir}
          // Demora para que el clic en una opción llegue antes de cerrar.
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={teclado}
          autoComplete="off"
          style={{ paddingRight: '28px', ...(!abierto && elegida?.muestra ? { paddingLeft: '30px' } : {}) }}
        />
        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '10px', pointerEvents: 'none' }}>▼</span>
      </div>
      {abierto && pos && createPortal(
        <div
          style={{
            position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, zIndex: 200,
            maxHeight: '240px', overflowY: 'auto', background: 'var(--bg2)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '4px'
          }}
        >
          {items.length === 1 && busqueda && (
            <div style={{ padding: '7px 10px', fontSize: '12px', color: 'var(--text3)' }}>Sin coincidencias para «{busqueda}»</div>
          )}
          {items.map((item, i) => (
            <div
              key={item.valor || '__vacio__'}
              onMouseDown={(e) => { e.preventDefault(); elegir(item); }}
              onMouseEnter={() => setResaltada(i)}
              style={{
                padding: '7px 10px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px',
                background: i === resaltada ? 'var(--bg3)' : 'transparent',
                color: item.valor ? 'var(--text)' : 'var(--text3)',
                fontWeight: item.valor === value ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              {item.valor && <Muestra color={item.muestra} />}
              <span style={{ flex: 1 }}>{item.texto}</span>
              {item.detalle && <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{item.detalle}</span>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
