import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalBibUsar({ isOpen, onClose, onSelectProduct }) {
  const { biblioteca } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  if (!isOpen) return null;

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const uniqueCats = Array.from(new Set(biblioteca.map(p => p.cat).filter(Boolean))).sort();

  const filteredList = biblioteca.filter(p => {
    const matchQ = !q || 
      p.nombre.toLowerCase().includes(q.toLowerCase()) || 
      (p.cat && p.cat.toLowerCase().includes(q.toLowerCase())) || 
      (p.desc && p.desc.toLowerCase().includes(q.toLowerCase()));
    const matchCat = !cat || p.cat === cat;
    return matchQ && matchCat;
  });

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Seleccionar producto de biblioteca</div>
        <div className="modal-sub">Cargá un producto guardado en la calculadora.</div>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <div className="bib-search" style={{ flex: 1 }}>
            <svg className="bib-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '14px', height: '14px' }}>
              <circle cx="9" cy="9" r="5" />
              <path d="M15 15l-3-3" />
            </svg>
            <input 
              type="text" 
              value={q} 
              onChange={(e) => setQ(e.target.value)} 
              placeholder="Buscar..." 
              style={{ fontSize: '13px' }} 
            />
          </div>
          <select 
            value={cat} 
            onChange={(e) => setCat(e.target.value)} 
            style={{ width: '140px', fontSize: '12px' }}
          >
            <option value="">Todas las categorías</option>
            {uniqueCats.map((category, idx) => (
              <option key={idx} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="bib-grid">
          {!filteredList.length ? (
            <div className="bib-empty">Sin resultados.</div>
          ) : (
            filteredList.map(p => (
              <div 
                key={p.id} 
                className="bib-card" 
                onClick={() => {
                  onSelectProduct(p.id);
                  onClose();
                }}
              >
                <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '4px' }}>
                  {p.nombre}
                </div>
                {p.desc && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
                    {p.desc}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: '20px', fontFamily: 'var(--mono)' }}>
                    {p.cat || 'General'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {p.horas?.toFixed(1) || '?'}h impresión
                  </span>
                  {p.impresoraNombre && (
                    <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      🖨 {p.impresoraNombre}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                    Costo: {fmt(p.costoUnitario * p.cantidad)}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                    {fmt(p.precioSugUnitario * p.cantidad)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
