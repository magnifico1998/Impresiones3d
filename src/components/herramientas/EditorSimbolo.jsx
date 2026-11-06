import React, { useMemo, useRef, useState } from 'react';
import {
  MAX_PUNTOS_EDITOR, SIMETRIAS, aplicarSimetria, contornosDeDibujo, limitarRepeticiones, suavizar
} from '../../utils/simbolosPropios';

// Editor de símbolos con simetrías: se marcan los puntos de UNA parte del dibujo y el resto sale solo.
//  - Espejo: se dibuja el lado derecho, de arriba hacia abajo (el primer y el último punto se pegan al eje).
//  - Giratoria: se dibuja una porción de 360/n grados (la franja celeste) que se repite n veces.
//  - Giratoria con espejo: se dibuja media porción y se refleja.
// Clic en un lugar vacío = punto nuevo (entre los dos más cercanos); arrastrar = mover; doble clic en un punto = borrarlo.
const LADO = 320; // píxeles del dibujo
const RANGO = 1.1; // el plano va de -RANGO a RANGO

const polar = (r, grados) => [r * Math.cos((grados * Math.PI) / 180), r * Math.sin((grados * Math.PI) / 180)];

// Puntos de ejemplo para cada simetría (sirven de punto de partida).
export function puntosIniciales(modo, n) {
  const paso = 360 / limitarRepeticiones(n);
  if (modo === 'espejo') return [[0, 0.9], [0.35, 0.55], [0.8, 0.5], [0.85, 0.05], [0.45, -0.45], [0, -0.9]];
  if (modo === 'radial') return [polar(0.9, 0), polar(0.4, paso / 2)];
  if (modo === 'radialEspejo') return [polar(0.3, 0), polar(0.9, paso * 0.18), polar(0.55, paso / 2)];
  return [[0, 0.9], [0.8, 0.2], [0.5, -0.8], [-0.5, -0.8], [-0.8, 0.2]];
}

const aPantalla = ([x, y]) => [((x + RANGO) / (2 * RANGO)) * LADO, ((RANGO - y) / (2 * RANGO)) * LADO];
const lista = (poli) => poli.map((q) => aPantalla(q).join(',')).join(' ');

function distSegmento(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// `puedeGuardar`: si hay biblioteca de la cuenta; `alGuardar(nombre, contornos)` devuelve una promesa con true si se guardó.
export default function EditorSimbolo({ alUsar, alGuardar, alCerrar }) {
  const [modo, setModo] = useState('espejo');
  const [n, setN] = useState(6);
  const [suave, setSuave] = useState(1);
  const [puntos, setPuntos] = useState(() => puntosIniciales('espejo', 6));
  const [editado, setEditado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const svgRef = useRef(null);
  const arrastrando = useRef(null);

  const cambiarModo = (m) => {
    setModo(m);
    if (!editado) setPuntos(puntosIniciales(m, n));
  };
  const cambiarN = (v) => {
    const k = limitarRepeticiones(v);
    setN(k);
    if (!editado) setPuntos(puntosIniciales(modo, k));
  };

  const paraPlano = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 * RANGO - RANGO;
    let y = RANGO - ((e.clientY - r.top) / r.height) * 2 * RANGO;
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    if (modo === 'espejo') x = Math.max(0, x);
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
  };

  const alPresionar = (e) => {
    if (e.target.dataset?.punto !== undefined) return;
    const q = paraPlano(e);
    setEditado(true);
    setPuntos((a) => {
      if (a.length >= MAX_PUNTOS_EDITOR) return a;
      // Se mete entre los dos puntos más cercanos (si cae cerca de un tramo); si no, al final.
      let mejor = -1, md = 0.12;
      for (let i = 0; i < a.length - 1; i++) { const d = distSegmento(q, a[i], a[i + 1]); if (d < md) { md = d; mejor = i; } }
      if (mejor < 0) return [...a, q];
      return [...a.slice(0, mejor + 1), q, ...a.slice(mejor + 1)];
    });
  };
  const alPresionarPunto = (i) => (e) => {
    e.stopPropagation();
    svgRef.current.setPointerCapture?.(e.pointerId);
    arrastrando.current = i;
    setEditado(true);
  };
  const alMover = (e) => {
    const i = arrastrando.current;
    if (i === null) return;
    const q = paraPlano(e);
    setPuntos((a) => a.map((p, k) => (k === i ? q : p)));
  };
  const alSoltar = () => { arrastrando.current = null; };
  const borrarPunto = (i) => (e) => { e.stopPropagation(); setEditado(true); setPuntos((a) => a.filter((_, k) => k !== i)); };

  const completo = useMemo(() => suavizar(aplicarSimetria(puntos, modo, n), suave), [puntos, modo, n, suave]);
  const contornos = useMemo(() => contornosDeDibujo(puntos, modo, n, suave), [puntos, modo, n, suave]);
  const k = limitarRepeticiones(n);
  const paso = (2 * Math.PI) / k;

  // Guías de la simetría: el eje del espejo o la franja que se repite.
  const guias = [];
  if (modo === 'espejo') guias.push(<line key="eje" x1={LADO / 2} y1="0" x2={LADO / 2} y2={LADO} stroke="#7aa6d6" strokeDasharray="4 4" />);
  if (modo === 'radial' || modo === 'radialEspejo') {
    const fin = modo === 'radial' ? paso : paso / 2;
    const c = aPantalla([0, 0]);
    const a = aPantalla([Math.cos(0), Math.sin(0)]);
    const b = aPantalla([Math.cos(fin), Math.sin(fin)]);
    const R = LADO / (2 * RANGO);
    guias.push(<path key="franja" d={`M ${c.join(' ')} L ${a.join(' ')} A ${R} ${R} 0 ${fin > Math.PI ? 1 : 0} 0 ${b.join(' ')} Z`} fill="#7aa6d6" opacity="0.18" />);
    guias.push(<line key="g0" x1={c[0]} y1={c[1]} x2={a[0]} y2={a[1]} stroke="#7aa6d6" strokeDasharray="4 4" />);
    guias.push(<line key="g1" x1={c[0]} y1={c[1]} x2={b[0]} y2={b[1]} stroke="#7aa6d6" strokeDasharray="4 4" />);
  }
  if (modo === 'ninguna') guias.push(<line key="eje" x1={LADO / 2} y1="0" x2={LADO / 2} y2={LADO} stroke="#bbb" strokeDasharray="2 6" />);

  const guardar = async () => {
    if (!contornos || !alGuardar) return;
    setGuardando(true);
    const ok = await alGuardar(nombre, contornos);
    setGuardando(false);
    if (ok) setNombre('');
  };

  return (
    <div style={{ border: '1px solid var(--border, #ccc)', borderRadius: '8px', padding: '10px', marginTop: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Dibujar un símbolo con simetría</div>
      <label className="fl">Simetría</label>
      <select value={modo} onChange={(e) => cambiarModo(e.target.value)}>
        {SIMETRIAS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
      </select>
      {(modo === 'radial' || modo === 'radialEspejo') && (
        <>
          <label className="fl">Repeticiones alrededor: {k}</label>
          <input type="range" min="2" max="16" step="1" value={k} onChange={(e) => cambiarN(e.target.value)} style={{ width: '100%' }} />
        </>
      )}
      <label className="fl">Suavizado de las esquinas: {suave === 0 ? 'ninguno' : suave}</label>
      <input type="range" min="0" max="3" step="1" value={suave} onChange={(e) => setSuave(Number(e.target.value))} style={{ width: '100%' }} />
      <div style={{ fontSize: '10px', color: 'var(--text3)', margin: '6px 0' }}>
        {modo === 'espejo' && 'Dibujá el lado derecho de arriba hacia abajo: el lado izquierdo sale solo.'}
        {modo === 'radial' && 'Dibujá lo que va dentro de la franja celeste: se repite alrededor del centro.'}
        {modo === 'radialEspejo' && 'Dibujá media franja (la celeste): se refleja contra su borde y se repite alrededor.'}
        {modo === 'ninguna' && 'Marcá los puntos del contorno en orden.'}
        {' '}Clic: punto nuevo · arrastrar: mover · doble clic en un punto: borrarlo.
      </div>
      <svg
        ref={svgRef} viewBox={`0 0 ${LADO} ${LADO}`} role="img" aria-label="Editor de símbolo"
        style={{ width: '100%', maxWidth: `${LADO}px`, background: 'var(--surface2, #f6f6f6)', borderRadius: '6px', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
        onPointerDown={alPresionar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}
      >
        <line x1="0" y1={LADO / 2} x2={LADO} y2={LADO / 2} stroke="#ddd" />
        {guias}
        {completo.length >= 3 && <polygon points={lista(completo)} fill="#8a6b3b" fillOpacity="0.45" stroke="#8a6b3b" strokeWidth="1.5" />}
        {puntos.length > 1 && <polyline points={lista(puntos)} fill="none" stroke="#c0392b" strokeWidth="1.5" />}
        {puntos.map((q, i) => {
          const [px, py] = aPantalla(q);
          return <circle key={i} data-punto={i} cx={px} cy={py} r="6" fill={i === 0 ? '#2f7d3a' : '#c0392b'} stroke="#fff" strokeWidth="1.5" style={{ cursor: 'grab' }} onPointerDown={alPresionarPunto(i)} onDoubleClick={borrarPunto(i)} />;
        })}
      </svg>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
        <button type="button" className="btn btn-sm" onClick={() => { setPuntos(puntosIniciales(modo, n)); setEditado(false); }}>Volver al ejemplo</button>
        <button type="button" className="btn btn-sm" onClick={() => { setPuntos([]); setEditado(true); }}>Borrar todo</button>
      </div>
      {!contornos && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>Marcá al menos {modo === 'ninguna' ? 3 : 2} puntos para ver el símbolo.</div>}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={!contornos} onClick={() => alUsar(contornos)}>Usar en el emblema</button>
        {alGuardar && (
          <>
            <input type="text" value={nombre} maxLength={40} placeholder="Nombre para guardarlo" onChange={(e) => setNombre(e.target.value)} style={{ flex: '1 1 120px', minWidth: 0 }} />
            <button type="button" className="btn btn-sm" disabled={!contornos || guardando || !nombre.trim()} onClick={guardar}>Guardar en mi biblioteca</button>
          </>
        )}
        {alCerrar && <button type="button" className="btn btn-sm" onClick={alCerrar}>Cerrar editor</button>}
      </div>
    </div>
  );
}
