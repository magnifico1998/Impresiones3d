import React, { useState, useMemo } from 'react';
import { confirmar } from './Dialogos';
import { useApp } from '../context/AppContext';
import { armarInventario } from '../utils/inventario';

// Pestañas de Compras. "Inventario" existe sólo si está habilitado en
// Configuración → Aplicación. La elegida se recuerda en el navegador.
const PESTANAS_COMPRAS = [
  { id: 'compras', nombre: 'Compras' },
  { id: 'inventario', nombre: 'Inventario' }
];
const CLAVE_PESTANA_COMPRAS = 'compras.pestana';

function pestanaComprasGuardada() {
  try {
    const guardada = localStorage.getItem(CLAVE_PESTANA_COMPRAS);
    return PESTANAS_COMPRAS.some((p) => p.id === guardada) ? guardada : PESTANAS_COMPRAS[0].id;
  } catch {
    return PESTANAS_COMPRAS[0].id;
  }
}

export default function ComprasPage({ onOpenNewCompra, onOpenEditCompra }) {
  const { compras, removeCompra, showToast, fmt, cfg } = useApp();
  const [pestana, setPestana] = useState(pestanaComprasGuardada);
  const pestanaVisible = cfg.inventarioHabilitado ? pestana : 'compras';
  const [busquedaInventario, setBusquedaInventario] = useState('');
  const inventario = useMemo(() => armarInventario(compras), [compras]);
  const elegirPestana = (id) => {
    setPestana(id);
    try {
      localStorage.setItem(CLAVE_PESTANA_COMPRAS, id);
    } catch {
      // Sin almacenamiento: la pestaña sólo dura mientras la página está abierta.
    }
  };
  const [filtroCat, setFiltroCat] = useState('todas');


  // Calculate statistics panel values
  const stats = useMemo(() => {
    let total = 0;
    let insumos = 0;
    let equipos = 0;
    let accesorios = 0;
    let impuestos = 0;

    compras.forEach(c => {
      const sum = c.total || (c.precio * c.qty) || 0;
      total += sum;
      if (c.cat === 'Insumos') insumos += sum;
      else if (c.cat === 'Equipos') equipos += sum;
      else if (c.cat === 'Accesorios') accesorios += sum;
      else if (c.cat === 'Impuestos') impuestos += sum;
    });

    return { total, insumos, equipos, accesorios, impuestos };
  }, [compras]);

  // Filter list by category
  const filteredList = useMemo(() => {
    const list = filtroCat === 'todas' ? compras : compras.filter(c => c.cat === filtroCat);
    // Sort by date descending
    return [...list].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [compras, filtroCat]);

  const handleDelete = async (id) => {
    if (await confirmar('Esta acción no se puede deshacer.', { titulo: '¿Eliminar esta compra?', textoConfirmar: 'Eliminar', peligro: true })) {
      removeCompra(id);
      showToast('Compra eliminada', 'info');
    }
  };

  const catBadgeClass = (cat) =>
    ({
      Insumos: 'badge-pending',
      Filamento: 'badge-progress',
      Equipos: 'badge-progress',
      Accesorios: 'badge-listo',
      Impuestos: 'badge-done',
      Otros: 'badge-cancelled'
    }[cat] || '');

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Compras</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>Registrá gastos en insumos, equipos, accesorios e impuestos.</div>
        </div>
        {pestanaVisible === 'compras' && <button className="btn btn-primary" onClick={onOpenNewCompra}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4v12M4 10h12" />
          </svg>
          Nueva compra
        </button>}
      </div>

      {/* Pestañas: aparecen cuando el inventario está habilitado en
          Configuración → Aplicación. */}
      {cfg.inventarioHabilitado && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {PESTANAS_COMPRAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn btn-sm periodo-btn ${pestanaVisible === p.id ? 'active' : ''}`}
              onClick={() => elegirPestana(p.id)}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      {pestanaVisible === 'compras' && (
        <>
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
          <div className="metric">
            <div className="metric-label">Impuestos</div>
            <div className="metric-value">{fmt(stats.impuestos)}</div>
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
                { id: 'Impuestos', name: 'Impuestos' },
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
        </>
      )}

      {pestanaVisible === 'inventario' && (() => {
        const texto = busquedaInventario.trim().toLowerCase();
        const visibles = inventario.filter((a) => !texto || a.nombre.toLowerCase().includes(texto));
        const valorTotal = visibles.reduce((s, a) => s + a.costoTotal, 0);
        return (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Inventario</div>
              <input
                type="text"
                value={busquedaInventario}
                onChange={(e) => setBusquedaInventario(e.target.value)}
                placeholder="Buscar artículo…"
                style={{ maxWidth: '260px' }}
              />
            </div>
            {inventario.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                Todavía no hay artículos. Las compras de Insumos y Accesorios marcadas "Sumar al inventario" aparecen acá.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
                  {visibles.length} artículo{visibles.length === 1 ? '' : 's'} · valor comprado {fmt(valorTotal)}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th>Categoría</th>
                        <th style={{ textAlign: 'right' }}>Cantidad</th>
                        <th style={{ textAlign: 'right' }}>Costo promedio</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                        <th>Última compra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((a) => (
                        <tr key={a.clave}>
                          <td>
                            {a.filamento && (
                              <span
                                title={a.nombre.split(' · ')[2]}
                                style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', marginRight: '6px', verticalAlign: '-1px', border: '1px solid var(--border2)', background: a.colorHex || 'transparent' }}
                              />
                            )}
                            {a.nombre}
                          </td>
                          <td><span className={`badge ${catBadgeClass(a.cat)}`}>{a.cat}</span></td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{a.cantidad}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(a.costoPromedio)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(a.costoTotal)}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>
                            {a.ultimaCompra ? a.ultimaCompra.split('-').reverse().join('/') : '—'}
                            <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>({a.compras} compra{a.compras === 1 ? '' : 's'})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
