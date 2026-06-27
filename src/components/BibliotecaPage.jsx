import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function BibliotecaPage({ onLoadInCalculator, onOpenEditCat, onOpenArmarPedido }) {
  const { biblioteca, setBiblioteca, showToast } = useApp();

  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const uniqueCats = useMemo(() => {
    return Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort();
  }, [biblioteca]);

  // Filter products list
  const filteredList = useMemo(() => {
    const query = q.toLowerCase().trim();
    return biblioteca.filter(p => {
      const matchQ = !query || 
        p.nombre.toLowerCase().includes(query) || 
        (p.cat && p.cat.toLowerCase().includes(query)) ||
        (p.desc && p.desc.toLowerCase().includes(query));
      const matchCat = !filterCat || p.cat === filterCat;
      return matchQ && matchCat;
    });
  }, [biblioteca, q, filterCat]);

  const handleSelectToggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleDelete = (id, name) => {
    if (window.confirm(`¿Eliminar "${name}" de la biblioteca?`)) {
      setBiblioteca(prev => prev.filter(p => p.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast('Producto eliminado de biblioteca.', 'info');
    }
  };

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Biblioteca de productos</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            Productos guardados para presupuestar sin importar el G-code cada vez.
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="bib-search" style={{ flex: 1, minWidth: '180px' }}>
            <svg className="bib-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '14px', height: '14px' }}>
              <circle cx="9" cy="9" r="5" />
              <path d="M15 15l-3-3" />
            </svg>
            <input 
              type="text" 
              value={q} 
              onChange={(e) => setQ(e.target.value)} 
              placeholder="Buscar por nombre, material..." 
              style={{ fontSize: '13px' }} 
            />
          </div>
          <select 
            value={filterCat} 
            onChange={(e) => setFilterCat(e.target.value)} 
            style={{ width: '160px', fontSize: '13px' }}
          >
            <option value="">Todos los materiales</option>
            {uniqueCats.map((category, idx) => (
              <option key={idx} value={category}>{category}</option>
            ))}
          </select>
          <span id="bib-count" style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            Total: {filteredList.length}
          </span>
        </div>
      </div>

      {/* Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div 
          className="card bib-selected" 
          style={{
            padding: '10px 16px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            position: 'sticky',
            bottom: '12px',
            zIndex: 30,
            borderColor: 'var(--accent)',
            background: 'var(--bg2)',
            boxShadow: 'var(--shadow)'
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, color: 'var(--accent)' }}>
            🛒 {selectedIds.size} producto{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button className="btn btn-sm" onClick={handleClearSelection}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={() => onOpenArmarPedido(selectedIds)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '13px', height: '13px' }}>
              <path d="M10 4v12M4 10h12" />
            </svg>
            Crear pedido
          </button>
        </div>
      )}

      {/* Library list layout */}
      <div id="bib-page-lista" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {!filteredList.length ? (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            No hay productos registrados en la Biblioteca.
          </div>
        ) : (
          filteredList.map(p => {
            const isChecked = selectedIds.has(p.id);
            return (
              <div 
                key={p.id} 
                className={`card ${isChecked ? 'bib-selected' : ''}`}
                style={{
                  marginBottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  borderColor: isChecked ? 'var(--accent)' : 'var(--border)',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <input 
                    type="checkbox" 
                    checked={isChecked} 
                    style={{ marginTop: '3px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                    onChange={() => handleSelectToggle(p.id)} 
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.nombre}
                    </div>
                    {p.desc && (
                      <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.desc}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', background: 'var(--bg3)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '20px', fontFamily: 'var(--mono)' }}>
                    {p.cat || 'General'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', paddingTop: '2px' }}>
                    ⏱ {p.horas ? p.horas.toFixed(1) + 'h' : '—'}
                  </span>
                  {p.impresoraNombre && (
                    <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', paddingTop: '2px' }}>
                      🖨 {p.impresoraNombre}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Costo: {fmt(p.costoUnitario * p.cantidad)}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                    Venta: {fmt(p.precioSugUnitario * p.cantidad)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '4px' }}>
                  <button 
                    className="btn btn-sm" 
                    style={{ flex: 1, justifyContent: 'center' }} 
                    onClick={() => onLoadInCalculator(p.id)}
                  >
                    Calcular u.
                  </button>
                  <button 
                    className="btn btn-sm" 
                    onClick={() => onOpenEditCat(p.id)}
                  >
                    Editar
                  </button>
                  <button 
                    className="btn btn-danger btn-sm" 
                    onClick={() => handleDelete(p.id, p.nombre)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
