import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function ComprasPage({ onOpenNewCompra, onOpenEditCompra }) {
  const { compras, setCompras, showToast } = useApp();
  const [filtroCat, setFiltroCat] = useState('todas');

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  // Calculate statistics panel values
  const stats = useMemo(() => {
    let total = 0;
    let insumos = 0;
    let equipos = 0;
    let accesorios = 0;

    compras.forEach(c => {
      const sum = c.total || (c.precio * c.qty) || 0;
      total += sum;
      if (c.cat === 'Insumos') insumos += sum;
      else if (c.cat === 'Equipos') equipos += sum;
      else if (c.cat === 'Accesorios') accesorios += sum;
    });

    return { total, insumos, equipos, accesorios };
  }, [compras]);

  // Filter list by category
  const filteredList = useMemo(() => {
    const list = filtroCat === 'todas' ? compras : compras.filter(c => c.cat === filtroCat);
    // Sort by date descending
    return [...list].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [compras, filtroCat]);

  const handleDelete = (id) => {
    if (window.confirm('¿Eliminar esta compra?')) {
      setCompras(prev => prev.filter(c => c.id !== id));
      showToast('Compra eliminada', 'info');
    }
  };

  const catBadgeClass = (cat) =>
    ({
      Insumos: 'badge-pending',
      Equipos: 'badge-progress',
      Accesorios: 'badge-listo',
      Otros: 'badge-cancelled'
    }[cat] || '');

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Compras</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>Registrá gastos en insumos, equipos y accesorios.</div>
        </div>
        <button className="btn btn-primary" onClick={onOpenNewCompra}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4v12M4 10h12" />
          </svg>
          Nueva compra
        </button>
      </div>

      {/* Metrics panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div className="metric">
          <div className="metric-label">Total gastado</div>
          <div className="metric-value" style={{ color: 'var(--danger)' }}>{fmt(stats.total)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Insumos</div>
          <div className="metric-value">{fmt(stats.insumos)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Equipos</div>
          <div className="metric-value">{fmt(stats.equipos)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Accesorios</div>
          <div className="metric-value">{fmt(stats.accesorios)}</div>
        </div>
      </div>

      {/* Category selector filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Categoría
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'todas', name: 'Todas' },
              { id: 'Insumos', name: 'Insumos' },
              { id: 'Equipos', name: 'Equipos' },
              { id: 'Accesorios', name: 'Accesorios' },
              { id: 'Otros', name: 'Otros' }
            ].map(cat => (
              <button 
                key={cat.id} 
                className={`btn btn-sm periodo-btn ${filtroCat === cat.id ? 'active' : ''}`}
                onClick={() => setFiltroCat(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Purchases list table */}
      <div id="lista-compras">
        {!filteredList.length ? (
          <div className="empty">Todavía no hay compras registradas.</div>
        ) : (
          <div className="res-tabla-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Proveedor</th>
                  <th style={{ textAlign: 'center' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Precio unit.</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {c.fecha || '—'}
                    </td>
                    <td 
                      style={{ fontWeight: 500, cursor: 'pointer' }}
                      onClick={() => onOpenEditCompra(c.id)}
                    >
                      {c.desc}
                    </td>
                    <td>
                      <span className={`badge ${catBadgeClass(c.cat)}`}>
                        {c.cat || 'Otros'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{c.proveedor || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'center' }}>{c.qty || 1}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmt(c.precio || 0)}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>
                      {fmt(c.total || (c.precio * c.qty))}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => onOpenEditCompra(c.id)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
