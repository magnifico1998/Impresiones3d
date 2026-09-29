import React, { useState } from 'react';
import { createPortal } from 'react-dom';

// Selector de rango de fechas en un solo calendario: el primer clic marca
// el inicio y el segundo el fin (si el segundo es anterior, se invierten).
// Trabaja con fechas "YYYY-MM-DD" (mismo formato que un input type="date"),
// en hora local. desde/hasta vacíos = sin filtro.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = (s) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const corta = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

function atajos() {
  const hoy = new Date();
  const menosDias = (n) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  return [
    { nombre: 'Hoy', desde: iso(hoy), hasta: iso(hoy) },
    { nombre: 'Últimos 7 días', desde: menosDias(6), hasta: iso(hoy) },
    { nombre: 'Últimos 30 días', desde: menosDias(29), hasta: iso(hoy) },
    { nombre: 'Este mes', desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) },
    {
      nombre: 'Mes pasado',
      desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0))
    }
  ];
}

// Texto del botón: el rango elegido o el placeholder.
export function textoRango(desde, hasta) {
  if (!desde && !hasta) return 'Todas las fechas';
  if (desde === hasta) return corta(desde);
  return `${corta(desde) || '…'} – ${corta(hasta) || '…'}`;
}

function ModalRango({ desde, hasta, onAplicar, onCerrar }) {
  const [inicio, setInicio] = useState(desde || '');
  const [fin, setFin] = useState(hasta || '');
  const [hover, setHover] = useState('');
  const base = deIso(desde || iso(new Date()));
  const [mes, setMes] = useState(new Date(base.getFullYear(), base.getMonth(), 1));

  const elegirDia = (dia) => {
    // Sin inicio, o con el rango ya completo: se empieza uno nuevo.
    if (!inicio || fin) {
      setInicio(dia);
      setFin('');
    } else if (dia < inicio) {
      setFin(inicio);
      setInicio(dia);
    } else {
      setFin(dia);
    }
  };

  // Mientras se elige el fin, el rango se previsualiza hasta el día bajo el mouse.
  const finVisible = fin || (inicio && hover && hover >= inicio ? hover : '');

  // Grilla del mes empezando en lunes.
  const primerDia = (mes.getDay() + 6) % 7;
  const diasDelMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas = [
    ...Array(primerDia).fill(null),
    ...Array.from({ length: diasDelMes }, (_, i) => iso(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))
  ];
  const hoy = iso(new Date());

  const moverMes = (n) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  const estiloDia = (dia) => {
    const extremo = dia === inicio || dia === finVisible;
    const dentro = inicio && finVisible && dia > inicio && dia < finVisible;
    return {
      padding: '7px 0',
      fontSize: '13px',
      borderRadius: extremo ? '8px' : '0',
      border: dia === hoy && !extremo ? '1px solid var(--border2)' : '1px solid transparent',
      background: extremo ? 'var(--accent)' : dentro ? 'var(--accentDim)' : 'transparent',
      color: extremo ? '#0a1a12' : 'var(--text)',
      fontWeight: extremo ? 600 : 400,
      cursor: 'pointer'
    };
  };

  return createPortal(
    <div className="modal-overlay open" onClick={onCerrar} style={{ zIndex: 130, padding: '20px 16px' }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto', maxWidth: '360px' }}>
        <div className="modal-title">Rango de fechas</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
          {atajos().map((a) => (
            <button
              key={a.nombre}
              type="button"
              className={`btn btn-sm periodo-btn ${inicio === a.desde && fin === a.hasta ? 'active' : ''}`}
              onClick={() => { setInicio(a.desde); setFin(a.hasta); setMes(new Date(deIso(a.desde).getFullYear(), deIso(a.desde).getMonth(), 1)); }}
            >
              {a.nombre}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => moverMes(-1)} aria-label="Mes anterior">‹</button>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{MESES[mes.getMonth()]} {mes.getFullYear()}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => moverMes(1)} aria-label="Mes siguiente">›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', rowGap: '2px' }} onMouseLeave={() => setHover('')}>
          {DIAS.map((d, i) => (
            <div key={i} style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', paddingBottom: '4px' }}>{d}</div>
          ))}
          {celdas.map((dia, i) => (dia
            ? (
              <button
                key={dia}
                type="button"
                style={estiloDia(dia)}
                onClick={() => elegirDia(dia)}
                onMouseEnter={() => setHover(dia)}
              >
                {Number(dia.slice(8, 10))}
              </button>
            )
            : <div key={`v${i}`} />
          ))}
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '12px', minHeight: '18px' }}>
          {!inicio && 'Elegí el día de inicio.'}
          {inicio && !fin && `Desde ${corta(inicio)}: elegí el día de fin.`}
          {inicio && fin && `Del ${corta(inicio)} al ${corta(fin)}.`}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => { onAplicar('', ''); onCerrar(); }}>Todas las fechas</button>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!inicio}
            // Con un solo día elegido, el rango es ese día.
            onClick={() => { onAplicar(inicio, fin || inicio); onCerrar(); }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function SelectorRangoFechas({ desde, hasta, onChange, style }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn"
        style={{ justifyContent: 'flex-start', gap: '8px', minWidth: 0, ...style }}
        title={textoRango(desde, hasta)}
        onClick={() => setAbierto(true)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '14px', height: '14px', flexShrink: 0 }}>
          <rect x="3" y="4" width="14" height="13" rx="1.5" />
          <path d="M3 8h14M7 2.5v3M13 2.5v3" />
        </svg>
        {/* Si igual no entra, se corta con "…" en vez de salirse del botón. */}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{textoRango(desde, hasta)}</span>
      </button>
      {abierto && (
        <ModalRango desde={desde} hasta={hasta} onAplicar={onChange} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}
