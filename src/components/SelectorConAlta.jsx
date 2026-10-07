import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Campo de texto con desplegable de opciones que se filtra mientras se
// escribe, y que permite dar de alta un valor nuevo ("+ Agregar «X»").
// Se usa por ejemplo para la marca del filamento en una compra.
//
// El desplegable va por portal al body con posición fija: el campo suele
// estar dentro de tablas con desplazamiento lateral, que recortarían una
// lista posicionada adentro.

const normal = (t) => String(t || '').trim().toLowerCase();

// antesDeOpcion(valor): contenido opcional antes del texto de cada opción
// (ej. la muestra de un color).
export default function SelectorConAlta({ value, onChange, opciones, placeholder, style, antesDeOpcion }) {
  const inputRef = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const [pos, setPos] = useState(null);
  // Al entrar al campo se ven todas las opciones; se filtra recién al escribir.
  const [filtrando, setFiltrando] = useState(false);

  const texto = normal(value);
  const filtradas = filtrando && texto ? opciones.filter((o) => normal(o).includes(texto)) : opciones;
  const existe = opciones.some((o) => normal(o) === texto);
  // Lista final: coincidencias y, si lo escrito es nuevo, la opción de agregarlo.
  const items = [
    ...filtradas.map((o) => ({ valor: o, texto: o })),
    ...(filtrando && texto && !existe ? [{ valor: value.trim(), texto: `+ Agregar «${value.trim()}»`, nueva: true }] : [])
  ];

  // Posición del desplegable pegada al campo (se recalcula al abrir y al
  // cambiar lo escrito, que puede cambiar la cantidad de opciones).
  useLayoutEffect(() => {
    if (!abierto || !inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
  }, [abierto, value]);

  const elegir = (item) => {
    onChange(item.valor);
    setAbierto(false);
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
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        style={style}
        onChange={(e) => { onChange(e.target.value); setAbierto(true); setFiltrando(true); setResaltada(0); }}
        onFocus={() => { setAbierto(true); setFiltrando(false); setResaltada(0); }}
        // Demora para que el clic en una opción llegue antes de cerrar.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={teclado}
        autoComplete="off"
      />
      {abierto && pos && items.length > 0 && createPortal(
        <div
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 200,
            maxHeight: '220px', overflowY: 'auto', background: 'var(--bg2)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '4px'
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.texto}
              // onMouseDown (no onClick): se dispara antes del blur del campo.
              onMouseDown={(e) => { e.preventDefault(); elegir(item); }}
              onMouseEnter={() => setResaltada(i)}
              style={{
                padding: '7px 10px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px',
                background: i === resaltada ? 'var(--bg3)' : 'transparent',
                color: item.nueva ? 'var(--accent)' : 'var(--text)',
                fontWeight: item.nueva ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              {!item.nueva && antesDeOpcion?.(item.valor)}
              {item.texto}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
