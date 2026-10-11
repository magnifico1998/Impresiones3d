import React, { useState, useMemo } from 'react';
import { confirmar } from './Dialogos';
import { useApp } from '../context/AppContext';
import { categoriasDeCompra, lineasDeCompra, subtotalLinea, totalCompra } from '../utils/inventario';
import InventarioTab from './InventarioTab';
import { useMovimientosInventario } from '../hooks/useMovimientosInventario';
import { armarInventario, estaBajoMinimo } from '../utils/inventario';

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
  // Artículos bajo el mínimo, para mostrarlos en la solapa "Inventario (N)".
  const { movimientos } = useMovimientosInventario();
  const cantidadBajoMinimo = useMemo(() => {
    if (!cfg.inventarioHabilitado) return 0;
    return armarInventario(compras, movimientos).filter((a) => estaBajoMinimo(cfg, a)).length;
  }, [compras, movimientos, cfg]);
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

    // Por línea: una compra con filamentos y boquillas reparte su total
    // entre Insumos y Accesorios.
    compras.forEach(c => {
      total += totalCompra(c);
      lineasDeCompra(c).forEach((l) => {
        const sum = subtotalLinea(l);
        if (l.cat === 'Insumos') insumos += sum;
        else if (l.cat === 'Equipos') equipos += sum;
        else if (l.cat === 'Accesorios') accesorios += sum;
        else if (l.cat === 'Impuestos') impuestos += sum;
      });
    });

    return { total, insumos, equipos, accesorios, impuestos };
  }, [compras]);

  // Filter list by category
  const filteredList = useMemo(() => {
    // Una compra aparece en cada categoría que tenga alguna de sus líneas.
    const list = filtroCat === 'todas' ? compras : compras.filter(c => categoriasDeCompra(c).includes(filtroCat));
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>{cfg.inventarioHabilitado ? 'Compras / Inventario' : 'Control de Compras'}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: 'var(--accentDim)', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
              Gastos
            </span>
          </div>
          <div className="page-sub" style={{ marginBottom: 0, marginTop: '4px' }}>
            {cfg.inventarioHabilitado
              ? 'Registrá gastos en insumos, equipos, accesorios e impuestos, y controlá el stock de lo que tenés.'
              : 'Registrá gastos en insumos, equipos, accesorios e impuestos.'}
          </div>
        </div>
        {pestanaVisible === 'compras' && (
          <button className="btn btn-primary" onClick={onOpenNewCompra} style={{ boxShadow: '0 2px 8px var(--accentDim)' }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Nueva compra
          </button>
        )}
      </div>

      {/* Pestañas: aparecen cuando el inventario está habilitado en Configuración */}
      {cfg.inventarioHabilitado && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '999px', padding: '4px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {PESTANAS_COMPRAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`period-pill-btn ${pestanaVisible === p.id ? 'active' : ''}`}
              onClick={() => elegirPestana(p.id)}
            >
              {p.nombre}
              {p.id === 'inventario' && cantidadBajoMinimo > 0 && (
                <span style={{ marginLeft: '6px', color: 'var(--danger)', fontWeight: 700 }} title="Artículos bajo el stock mínimo">({cantidadBajoMinimo})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {pestanaVisible === 'compras' && (
        <>
        {/* KPI Cards de Compras */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          <div className="metric-card-modern danger-top">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Total Gastado
              </span>
              <div className="metric-icon-wrap" style={{ background: 'var(--dangerDim)', color: 'var(--danger)' }}>
                💳
              </div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--danger)', fontFamily: 'var(--display)', marginTop: '2px' }}>
              {fmt(stats.total)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Egresos totales
            </div>
          </div>

          <div className="metric-card-modern">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Insumos
              </span>
              <div className="metric-icon-wrap" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                🧵
              </div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--display)', marginTop: '2px' }}>
              {fmt(stats.insumos)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Filamento y resina
            </div>
          </div>

          <div className="metric-card-modern">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Equipos
              </span>
              <div className="metric-icon-wrap" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                🖨️
              </div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--display)', marginTop: '2px' }}>
              {fmt(stats.equipos)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Impresoras y máquinas
            </div>
          </div>

          <div className="metric-card-modern">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Accesorios
              </span>
              <div className="metric-icon-wrap" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                🔧
              </div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--display)', marginTop: '2px' }}>
              {fmt(stats.accesorios)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Repuestos y partes
            </div>
          </div>

          <div className="metric-card-modern">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Impuestos
              </span>
              <div className="metric-icon-wrap" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                🏛️
              </div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--display)', marginTop: '2px' }}>
              {fmt(stats.impuestos)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Tasas y servicios
            </div>
          </div>
        </div>

        {/* Barra de Filtros de Categoría */}
        <div className="filter-bar-modern" style={{ padding: '10px 16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: '4px' }}>
              Categoría:
            </span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
                  className={`period-pill-btn ${filtroCat === cat.id ? 'active' : ''}`}
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
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(categoriasDeCompra(c).length ? categoriasDeCompra(c) : ['Otros']).map((cat) => (
                            <span key={cat} className={`badge ${catBadgeClass(cat)}`}>{cat}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{c.proveedor || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'center' }}>{c.qty || 1}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmt(c.precio || 0)}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>
                        {fmt(totalCompra(c))}
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

      {pestanaVisible === 'inventario' && <InventarioTab />}
    </div>
  );
}
