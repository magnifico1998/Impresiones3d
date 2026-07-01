import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Recalcula costos de un producto manteniendo estructura física pero actualizando precios
 * - Filamentos: busca por nombre en cfg.filamentos actual
 * - kWh: usa cfg.kwh actual
 * - Mantenimiento: usa cfg.impresoras[x].mant actual
 * - Mano de obra: usa cfg.mo actual
 */
function recalcularProducto(prod, cfg) {
  const despPct = (prod.desperdicio ?? 5) / 100;
  const horas = prod.horas || 0;
  const horasTrab = prod.horasTrab || 0;
  const extras = prod.extras || 0;
  const margen = prod.margen ?? 30;
  const watts = prod.watts || 0;

  // Electricidad con cfg.kwh actualizado
  const kwh = cfg.kwh || 0;
  const costeElec = (watts / 1000) * horas * kwh;

  // Mantenimiento impresora con cfg.impresoras[x].mant actualizado
  let mantH = 0;
  if (prod.impresoraNombre) {
    const imp = cfg.impresoras?.find(i => i.nombre === prod.impresoraNombre);
    if (imp) mantH = imp.mant || 0;
  }
  const costeMant = mantH * horas;

  // Mano de obra con cfg.mo actualizado
  const costeMO = (cfg.mo || 0) * horasTrab;

  // Filamentos - buscar precios actuales en cfg
  let costeFil = 0;
  let filInfo = [];
  let matDataActualizado = prod.matData ? [...prod.matData] : null;
  let precioRolloActualizado = prod.precioRollo || 0;

  if (prod.materiales?.length > 0 && prod.matData) {
    // Multi-material: matchear cada uno por tipo en cfg.filamentos
    matDataActualizado = prod.matData.map((md, i) => {
      const mat = prod.materiales[i];
      const tipo = mat?.type || '';
      
      // Buscar filamento en cfg por nombre
      const match = cfg.filamentos?.find(f =>
        f.nombre.toLowerCase().includes(tipo.toLowerCase()) ||
        tipo.toLowerCase().includes(f.nombre.toLowerCase().split(' ')[0])
      );
      
      const precioKg = match ? match.precio : (md.precioKg || 0);
      const g = md.totalG || 0;
      const costo = (g * (1 + despPct) / 1000) * precioKg;
      costeFil += costo;
      
      filInfo.push({
        tipo,
        g: g.toFixed(1),
        precioKg,
        matched: !!match,
        matchNombre: match?.nombre || 'no encontrado',
      });
      
      return { ...md, precioKg };
    });
  } else {
    // Material único
    const g = prod.gramos || 0;
    const label = prod.filDetalle?.[0]?.label || 'Filamento';
    
    // Intentar matchear por nombre en cfg
    const match = cfg.filamentos?.find(f =>
      f.nombre.toLowerCase().includes(label.toLowerCase()) ||
      label.toLowerCase().includes(f.nombre.toLowerCase().split(' ')[0])
    );
    
    precioRolloActualizado = match ? match.precio : (prod.precioRollo || 0);
    costeFil = (g * (1 + despPct) / 1000) * precioRolloActualizado;
    
    filInfo.push({
      tipo: label,
      g: g.toFixed(1),
      precioKg: precioRolloActualizado,
      matched: !!match,
      matchNombre: match?.nombre || 'no encontrado',
    });
  }

  const costePorUnidad = costeFil + costeElec + costeMant + costeMO + extras;
  const costoUnitario = costePorUnidad;
  const precioSugUnitario = costePorUnidad * (1 + margen / 100);

  // Margen efectivo con el nuevo costo pero manteniendo el precio de venta anterior
  const precioVentaAnterior = prod.precioSugUnitario * (prod.cantidad || 1);
  const margenEfectivo = costoUnitario > 0 
    ? ((precioVentaAnterior / (prod.cantidad || 1) - costoUnitario) / costoUnitario) * 100
    : 0;

  return {
    costoUnitario,
    precioSugUnitario: prod.precioSugUnitario, // NO se modifica el precio de venta
    margenNuevo: margenEfectivo, // Margen calculado con nuevo costo
    // Datos que se actualizan
    precioKwh: kwh,
    moHora: cfg.mo || 0,
    matData: matDataActualizado,
    precioRollo: matDataActualizado ? prod.precioRollo : precioRolloActualizado,
    // Desglose para UI
    _desglose: {
      costeFil,
      costeElec,
      costeMant,
      costeMO,
      extras,
      filInfo,
      allMatched: filInfo.every(f => f.matched),
      margenAnterior: prod.margen ?? 30,
    },
  };
}

/**
 * Modal de confirmación: muestra antes/después y permite seleccionar qué actualizar
 */
function ModalRecalcular({ items, onConfirm, onClose }) {
  const [selectedIds, setSelectedIds] = useState(new Set(items.map(it => it.prod.id)));
  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const handleToggleAll = (v) =>
    setSelectedIds(v ? new Set(items.map(it => it.prod.id)) : new Set());

  const handleToggle = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;
    onConfirm(selectedIds, items);
  };

  const someUnmatched = items.some(it => !it.nuevos._desglose.allMatched);

  return (
    <div
      className="modal open"
      style={{ zIndex: 200 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-box"
        style={{ maxWidth: '900px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">↺ Recalcular costos de productos</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Info banner */}
        <div style={{ padding: '10px 16px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text2)' }}>
          Se mantienen los datos físicos (gramos, horas, watts, etc.) y se actualizan los precios desde la configuración actual.
        </div>

        {someUnmatched && (
          <div style={{ padding: '10px 16px', background: 'rgba(234,179,8,.08)', borderBottom: '1px solid rgba(234,179,8,.2)', fontSize: '12px', color: 'var(--text2)' }}>
            ⚠ Algunos filamentos no se encontraron en la configuración — se mantiene el precio anterior.
          </div>
        )}

        {/* Tabla scrolleable */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 4px' }}>
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ width: '32px', padding: '8px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === items.length}
                    onChange={(e) => handleToggleAll(e.target.checked)}
                  />
                </th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Producto</th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600 }}>Costo actual</th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600 }}>Costo nuevo</th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600 }}>Diferencia</th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600 }}>Margen</th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Filamento</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ prod, nuevos }) => {
                const costoAntes = prod.costoUnitario * (prod.cantidad || 1);
                const costoNuevo = nuevos.costoUnitario * (prod.cantidad || 1);
                const diff = costoNuevo - costoAntes;
                const pctDiff = costoAntes > 0 ? (diff / costoAntes * 100) : 0;
                const checked = selectedIds.has(prod.id);
                const bg = nuevos._desglose.allMatched ? 'transparent' : 'rgba(234,179,8,.04)';

                const margenAnterior = nuevos._desglose.margenAnterior;
                const margenNuevo = nuevos.margenNuevo;
                const margenDiff = margenNuevo - margenAnterior;

                return (
                  <tr
                    key={prod.id}
                    onClick={() => handleToggle(prod.id)}
                    style={{
                      cursor: 'pointer',
                      background: bg,
                      borderBottom: '1px solid var(--border)',
                      opacity: checked ? 1 : 0.6,
                    }}
                  >
                    <td style={{ padding: '8px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggle(prod.id)}
                      />
                    </td>
                    <td style={{ padding: '8px', fontWeight: 500, maxWidth: '200px' }}>
                      <div>{prod.nombre}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                        {prod.cat || 'General'} · {prod.horas?.toFixed(1)}h
                      </div>
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--text2)' }}>
                      {fmt(costoAntes)}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 600 }}>
                      {fmt(costoNuevo)}
                    </td>
                    <td style={{
                      padding: '8px',
                      fontFamily: 'var(--mono)',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--accent)' : 'var(--text3)',
                    }}>
                      <div>{diff > 0 ? '+' : ''}{fmt(diff)}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text3)' }}>({pctDiff > 0 ? '+' : ''}{pctDiff.toFixed(1)}%)</div>
                    </td>
                    <td style={{
                      padding: '8px',
                      fontFamily: 'var(--mono)',
                      textAlign: 'right',
                      fontWeight: 600,
                    }}>
                      <div style={{ color: margenNuevo >= margenAnterior ? 'var(--accent)' : 'var(--danger)' }}>
                        {margenNuevo.toFixed(1)}%
                      </div>
                      <div style={{
                        fontSize: '9px',
                        color: margenDiff > 0 ? 'var(--accent)' : margenDiff < 0 ? 'var(--danger)' : 'var(--text3)',
                        fontWeight: 500,
                      }}>
                        {margenDiff > 0 ? '+' : ''}{margenDiff.toFixed(1)}pp
                      </div>
                    </td>
                    <td style={{ padding: '8px', fontSize: '9px' }}>
                      {nuevos._desglose.filInfo.map((f, i) => (
                        <div key={i} style={{ color: f.matched ? 'var(--accent)' : 'var(--warn)', fontFamily: 'var(--mono)' }}>
                          {f.matched ? '✓' : '⚠'} {f.matchNombre} @ ${Math.round(f.precioKg / 1000)}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={selectedIds.size === 0}
            onClick={handleConfirm}
          >
            ↺ Actualizar {selectedIds.size} producto{selectedIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Componente principal BibliotecaPage
 */
export default function BibliotecaPage({ onLoadInCalculator, onOpenEditCat, onOpenArmarPedido }) {
  const { biblioteca, setBiblioteca, cfg, showToast } = useApp();

  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid');
  const [sortMode, setSortMode] = useState('nombreAsc');
  const [recalcModal, setRecalcModal] = useState(null);

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const uniqueCats = useMemo(
    () => Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort(),
    [biblioteca]
  );

  const filteredList = useMemo(() => {
    const query = q.toLowerCase().trim();
    return biblioteca.filter(p => {
      const matchQ = !query || p.nombre.toLowerCase().includes(query) || (p.cat && p.cat.toLowerCase().includes(query)) || (p.desc && p.desc.toLowerCase().includes(query));
      const matchCat = !filterCat || p.cat === filterCat;
      return matchQ && matchCat;
    });
  }, [biblioteca, q, filterCat]);

  const sortedList = useMemo(() => {
    const rows = [...filteredList];
    rows.sort((a, b) => sortMode === 'nombreDesc'
      ? b.nombre.localeCompare(a.nombre, 'es', { sensitivity: 'base' })
      : a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    return rows;
  }, [filteredList, sortMode]);

  const handleSelectToggle = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleClearSelection = () => setSelectedIds(new Set());

  const handleDelete = (id, name) => {
    if (window.confirm(`¿Eliminar "${name}" de la biblioteca?`)) {
      setBiblioteca(prev => prev.filter(p => p.id !== id));
      setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      showToast('Producto eliminado de biblioteca.', 'info');
    }
  };

  // ── Recálculo ────────────────────────────────────────────────────────

  const abrirRecalcModal = useCallback((prods) => {
    if (!prods.length) return;
    const items = prods.map(prod => ({
      prod,
      nuevos: recalcularProducto(prod, cfg),
    }));
    setRecalcModal(items);
  }, [cfg]);

  const handleRecalcSingle = useCallback((prod) => {
    abrirRecalcModal([prod]);
  }, [abrirRecalcModal]);

  const handleRecalcAll = useCallback(() => {
    abrirRecalcModal(sortedList);
  }, [abrirRecalcModal, sortedList]);

  const handleConfirmRecalc = useCallback((selectedSet, items) => {
    const toUpdate = items.filter(it => selectedSet.has(it.prod.id));
    if (!toUpdate.length) return;

    setBiblioteca(prev =>
      prev.map(p => {
        const hit = toUpdate.find(it => it.prod.id === p.id);
        if (!hit) return p;
        const n = hit.nuevos;
        return {
          ...p,
          costoUnitario: n.costoUnitario,
          precioSugUnitario: n.precioSugUnitario,
          precioKwh: n.precioKwh,
          moHora: n.moHora,
          ...(n.matData ? { matData: n.matData } : {}),
          ...(n.precioRollo !== undefined ? { precioRollo: n.precioRollo } : {}),
          fechaRecalculo: new Date().toLocaleDateString('es-AR'),
        };
      })
    );

    setRecalcModal(null);
    showToast(`✓ ${toUpdate.length} producto${toUpdate.length !== 1 ? 's' : ''} actualizado${toUpdate.length !== 1 ? 's' : ''}.`);
  }, [setBiblioteca, showToast]);

  // ────────────────────────────────────────────────────────────────────

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

      {/* Toolbar con filtros */}
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
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ width: '160px', fontSize: '13px' }}>
            <option value="">Categorías</option>
            {uniqueCats.map((c, i) => <option key={i} value={c}>{c}</option>)}
          </select>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={{ width: '160px', fontSize: '13px' }}>
            <option value="nombreAsc">Nombre A → Z</option>
            <option value="nombreDesc">Nombre Z → A</option>
          </select>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} style={{ width: '130px', fontSize: '13px' }}>
            <option value="grid">Cuadrícula</option>
            <option value="list">Lista</option>
          </select>
          <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
            {sortedList.length} producto{sortedList.length !== 1 ? 's' : ''}
          </span>

          {/* Botón Recalcular todos */}
          {sortedList.length > 0 && (
            <button
              className="btn btn-sm"
              style={{ whiteSpace: 'nowrap', borderColor: 'var(--accent)', color: 'var(--accent)' }}
              onClick={handleRecalcAll}
              title="Recalcular costos con precios actuales de la configuración"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '13px', height: '13px' }}>
                <path d="M4 4v5h5M16 16v-5h-5M4.93 9A8 8 0 1 1 4 12" />
              </svg>
              Actualizar precios ({sortedList.length})
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
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
            boxShadow: 'var(--shadow)',
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

      {/* Grid/Lista de productos */}
      <div
        style={
          viewMode === 'grid'
            ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }
            : { display: 'flex', flexDirection: 'column', gap: '12px' }
        }
      >
        {!sortedList.length ? (
          <div className="empty" style={{ gridColumn: viewMode === 'grid' ? '1/-1' : 'auto' }}>
            No hay productos registrados en la Biblioteca.
          </div>
        ) : (
          sortedList.map(p => {
            const isChecked = selectedIds.has(p.id);
            return (
              <div
                key={p.id}
                className={`card ${isChecked ? 'bib-selected' : ''}`}
                style={{
                  marginBottom: 0,
                  display: 'flex',
                  flexDirection: viewMode === 'grid' ? 'column' : 'row',
                  gap: '10px',
                  borderColor: isChecked ? 'var(--accent)' : 'var(--border)',
                  transition: 'all 0.15s',
                  alignItems: viewMode === 'grid' ? 'stretch' : 'center',
                  padding: viewMode === 'list' ? '12px 14px' : undefined,
                }}
              >
                {/* Checkbox + nombre */}
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

                {/* Chips informativos */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', background: 'var(--bg3)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '20px', fontFamily: 'var(--mono)' }}>
                    {p.cat || 'General'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', paddingTop: '2px' }}>
                    ⏱ {p.horas ? p.horas.toFixed(1) + 'h' : '—'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', paddingTop: '2px' }}>
                    💲 {fmt(p.precioSugUnitario || p.costoUnitario || 0)}
                  </span>
                  {p.impresoraNombre && (
                    <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', paddingTop: '2px' }}>
                      🖨 {p.impresoraNombre}
                    </span>
                  )}
                  {p.fechaRecalculo && (
                    <span style={{ fontSize: '10px', color: 'var(--accent)', fontFamily: 'var(--mono)', paddingTop: '2px' }} title={`Actualizado ${p.fechaRecalculo}`}>
                      ↺ {p.fechaRecalculo}
                    </span>
                  )}
                </div>

                {/* Costo/Precio */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Costo: {fmt(p.costoUnitario * p.cantidad)}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                    Venta: {fmt(p.precioSugUnitario * p.cantidad)}
                  </span>
                </div>

                {/* Botones de acción */}
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
                    style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                    title="Recalcular este producto"
                    onClick={() => handleRecalcSingle(p)}
                  >
                    ↺
                  </button>
                  <button className="btn btn-sm" onClick={() => onOpenEditCat(p.id)}>
                    Editar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id, p.nombre)}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de recálculo */}
      {recalcModal && (
        <ModalRecalcular
          items={recalcModal}
          onConfirm={handleConfirmRecalc}
          onClose={() => setRecalcModal(null)}
        />
      )}
    </div>
  );
}
