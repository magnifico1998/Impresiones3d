import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function PedidosPage({ onOpenNewOrder, onOpenOrderDetail }) {
  const { pedidos, setPedidos, showToast } = useApp();

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const esUrgente = (p) => {
    if (!p.fechaEntrega || p.estado === 'completado' || p.estado === 'listo' || p.estado === 'cancelado') return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const entr = new Date(p.fechaEntrega + 'T00:00:00');
    const diff = (entr - hoy) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  };

  const getTimestamp = (p) => {
    if (p.fechaPedido) return new Date(p.fechaPedido + 'T12:00:00').getTime();
    if (p.creado) {
      let pts = p.creado.split('/');
      if (pts.length === 3) return new Date(pts[2], pts[1] - 1, pts[0]).getTime();
    }
    return 0;
  };

  // Metrics panel calculation
  const stats = useMemo(() => {
    const total = pedidos.length;
    const prog = pedidos.filter(p => p.estado === 'progreso' || p.estado === 'listo').length;
    const done = pedidos.filter(p => p.estado === 'completado').length;
    
    const fact = pedidos
      .filter(p => (p.estado === 'completado' || p.estado === 'listo') && p.precioVenta)
      .reduce((s, p) => s + (p.precioVenta || 0), 0);
      
    const pendGlobal = pedidos
      .filter(p => p.estado !== 'completado' && p.estado !== 'cancelado' && p.precioVenta)
      .reduce((s, p) => s + (p.precioVenta || 0), 0);

    return { total, prog, done, fact, pendGlobal };
  }, [pedidos]);

  // Sort orders by timestamp descending
  const sortedPedidos = useMemo(() => {
    return [...pedidos].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  }, [pedidos]);

  const handleStatusChange = (e, id, newStatus) => {
    e.stopPropagation();
    setPedidos(prev => prev.map(p => {
      if (p.id === id) {
        const eraCompletado = p.estado === 'completado';
        let fechaCompletado = p.fechaCompletado;
        if (newStatus === 'completado' && !eraCompletado) {
          fechaCompletado = new Date().toISOString().slice(0, 10);
        } else if (newStatus !== 'completado') {
          fechaCompletado = null;
        }
        return { ...p, estado: newStatus, fechaCompletado };
      }
      return p;
    }));
    
    const badgeText = {
      pendiente: 'Pendiente',
      progreso: 'En progreso',
      listo: 'Listo p/ entregar',
      completado: 'Completado',
      cancelado: 'Cancelado'
    }[newStatus] || newStatus;

    showToast('Estado actualizado a: ' + badgeText);
  };

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Panel de pedidos</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>Cada pedido agrupa múltiples piezas con sus G-codes.</div>
        </div>
        <button className="btn btn-primary" onClick={onOpenNewOrder}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4v12M4 10h12" />
          </svg>
          Nuevo pedido
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid5">
        <div className="metric">
          <div className="metric-label">Total</div>
          <div className="metric-value">{stats.total}</div>
        </div>
        <div className="metric">
          <div className="metric-label">En progreso</div>
          <div className="metric-value">{stats.prog}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Completados</div>
          <div className="metric-value accent">{stats.done}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Facturado</div>
          <div className="metric-value">{fmt(stats.fact)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Pendiente</div>
          <div className="metric-value" style={{ color: 'var(--warn)' }}>{fmt(stats.pendGlobal)}</div>
        </div>
      </div>

      {/* Orders List */}
      <div id="lista-pedidos">
        {!sortedPedidos.length ? (
          <div className="empty">Todavía no hay pedidos.</div>
        ) : (
          sortedPedidos.map(p => {
            const urgente = esUrgente(p);
            
            const costoPiezas = p.piezas.reduce((s, pz) => s + ((pz.costoUnitario || pz.total || 0) * pz.cantidad), 0);
            const costoIns = (p.insumos || []).reduce((s, i) => s + i.precio * i.qty, 0);
            const costoTotal = costoPiezas + costoIns;
            
            const ganancia = p.precioVenta ? p.precioVenta - costoTotal : null;
            
            const totalUnidades = p.piezas.reduce((t, pz) => t + pz.cantidad, 0);
            const totalElaboradas = p.piezas.reduce((t, pz) => t + (pz.elaborados || 0), 0);

            return (
              <div 
                key={p.id} 
                className={`pedido-card ${urgente ? 'urgente' : ''}`}
                onClick={() => onOpenOrderDetail(p.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{p.cliente}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.desc || 'Sin descripción'}
                  </div>
                  {p.notaGeneral && (
                    <div style={{ fontSize: '11px', color: 'var(--warn)', fontFamily: 'var(--mono)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📝 {p.notaGeneral}
                    </div>
                  )}
                  {p.fechaEntrega && (
                    <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', marginTop: '2px', color: urgente ? 'var(--danger)' : 'var(--text3)' }}>
                      {urgente ? '⚠ ' : ''}Entrega: {p.fechaEntrega}
                    </div>
                  )}
                  {p.fechaPedido && (
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      Pedido: {p.fechaPedido}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      Unidades
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--mono)' }}>{totalUnidades}</div>
                    {totalUnidades > 0 && (
                      <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--accent)', marginTop: '1px' }}>
                        {totalElaboradas}/{totalUnidades} listas
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      Costo
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'var(--mono)' }}>{fmt(costoTotal)}</div>
                  </div>

                  {p.precioVenta !== undefined && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        Venta
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                        {fmt(p.precioVenta)}
                      </div>
                    </div>
                  )}

                  {ganancia !== null && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        Ganancia
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', color: ganancia >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                        {fmt(ganancia)}
                      </div>
                    </div>
                  )}

                  {/* Quick status dropdown */}
                  <select 
                    className={`status-select ${p.estado}`} 
                    value={p.estado}
                    onClick={(e) => e.stopPropagation()} 
                    onChange={(e) => handleStatusChange(e, p.id, e.target.value)}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="progreso">En progreso</option>
                    <option value="listo">Listo p/ entregar</option>
                    <option value="completado">Completado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>

                  <svg style={{ width: '14px', height: '14px', color: 'var(--text3)' }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 5l5 5-5 5" />
                  </svg>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
