import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { precioNeto } from '../utils/precioNeto';
import { calcularFechaCompletado } from '../utils/fechaCompletado';

export default function PedidosPage({ onOpenNewOrder, onOpenOrderDetail }) {
  const { pedidos, updatePedido, showToast } = useApp();

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const esUrgente = (p) => {
    if (!p.fechaEntrega || p.estado === 'completado' || p.estado === 'listo' || p.estado === 'enviado' || p.estado === 'cancelado') return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const entr = new Date(p.fechaEntrega + 'T00:00:00');
    const diff = (entr - hoy) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  };

  const getTimestamp = (p) => {
    // creadoTs es un timestamp real (con hora/minuto/segundo) fijado una
    // sola vez al crear el pedido, y nunca se edita — es la única fuente
    // confiable de "cuándo se creó" este pedido. Antes se ordenaba por
    // fechaPedido, que es un campo que el usuario puede editar libremente
    // (no refleja creación), y como respaldo por 'creado', que sólo tiene
    // fecha sin hora — dos pedidos del mismo día quedaban en un orden
    // arbitrario. Pedidos creados antes de este cambio no tienen
    // creadoTs, así que caen al respaldo de siempre.
    if (p.creadoTs) return p.creadoTs;
    if (p.fechaPedido) return new Date(p.fechaPedido + 'T12:00:00').getTime();
    if (p.creado) {
      let pts = p.creado.split('/');
      if (pts.length === 3) return new Date(pts[2], pts[1] - 1, pts[0]).getTime();
    }
    return 0;
  };

  const stats = useMemo(() => {
    const total = pedidos.length;
    const prog = pedidos.filter(p => p.estado === 'progreso' || p.estado === 'listo').length;
    const done = pedidos.filter(p => p.estado === 'completado').length;

    const fact = pedidos
      .filter(p => (p.estado === 'completado' || p.estado === 'listo' || p.estado === 'enviado') && (p.precioVenta || 0) > 0)
      .reduce((s, p) => s + precioNeto(p), 0);

    const pendGlobal = pedidos
      .filter(p => p.estado !== 'completado' && p.estado !== 'cancelado' && (p.precioVenta || 0) > 0)
      .reduce((s, p) => s + precioNeto(p), 0);

    return { total, prog, done, fact, pendGlobal };
  }, [pedidos]);

  const sortedPedidos = useMemo(() => {
    return [...pedidos].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  }, [pedidos]);

  const handleStatusChange = (e, id, newStatus) => {
    e.stopPropagation();
    updatePedido(id, (p) => {
      const fechaCompletado = calcularFechaCompletado(p.estado, p.fechaCompletado, newStatus);
      return { ...p, estado: newStatus, fechaCompletado };
    });

    const badgeText = {
      en_verificacion: 'En verificación',
      pendiente: 'Pendiente',
      progreso: 'En progreso',
      listo: 'Listo p/ entregar',
      enviado: 'Enviado',
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
          <div className="page-sub" style={{ marginBottom: 0 }}>
            Cada pedido agrupa múltiples piezas con sus G-codes.
          </div>
        </div>

        <button className="btn btn-primary" onClick={onOpenNewOrder}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4v12M4 10h12" />
          </svg>
          Nuevo pedido
        </button>
      </div>

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
          <div className="metric-value" style={{ color: 'var(--warn)' }}>
            {fmt(stats.pendGlobal)}
          </div>
        </div>
      </div>

      <div id="lista-pedidos">
        {!sortedPedidos.length ? (
          <div className="empty">Todavía no hay pedidos.</div>
        ) : (
          sortedPedidos.map(p => {
            const urgente = esUrgente(p);

            const costoPiezas = p.piezas.reduce(
              (s, pz) => s + ((pz.costoUnitario || pz.total || 0) * pz.cantidad),
              0
            );
            const costoIns = (p.insumos || []).reduce(
              (s, i) => s + i.precio * i.qty,
              0
            );
            const costoTotal = costoPiezas + costoIns;

            const ganancia = (p.precioVenta || 0) ? precioNeto(p) - costoTotal : null;

            const totalUnidades = p.piezas.reduce((t, pz) => t + pz.cantidad, 0);
            const totalElaboradas = p.piezas.reduce(
              (t, pz) => t + (pz.elaborados || 0),
              0
            );
            const unidadesTexto = String(totalUnidades);
            const avanceColor = totalUnidades === 0
              ? 'var(--danger)'
              : (totalElaboradas === 0 ? 'var(--danger)' : (totalElaboradas < totalUnidades ? 'var(--warn)' : 'var(--accent)'));

            return (
              <div
                key={p.id}
                className={`pedido-card ${urgente ? 'urgente' : ''}`}
                onClick={() => onOpenOrderDetail(p.id)}
              >
                <div style={{ flex: '0 0 30%', minWidth: 0, maxWidth: '30%' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.cliente}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.desc || 'Sin descripción'}
                  </div>
                </div>

                {/* ✅ CONTENEDOR DERECHO FIX */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flex: 1,
                    flexWrap: 'nowrap',
                    justifyContent: 'flex-end'
                  }}
                >
                  <div style={{ textAlign: 'center', minWidth: '70px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '3px' }}>
                      Unidades
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700 }}>
                      {unidadesTexto}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: '60px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '3px' }}>
                      Avance
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', color: avanceColor }}>
                      {totalElaboradas}/{totalUnidades}
                    </div>
                    <div style={{ fontSize: '10px', color: avanceColor, marginTop: '2px' }}>
                      listas
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', minWidth: '200px', textAlign: 'right', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: '64px' }}>
                      <div style={{ fontSize: '8px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '2px' }}>
                        Costos
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                        {fmt(costoTotal)}
                      </div>
                    </div>
                    <div style={{ minWidth: '64px' }}>
                      <div style={{ fontSize: '8px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '2px' }}>
                        Ganancia
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)', color: ganancia >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                        {ganancia !== null ? fmt(ganancia) : '-'}
                      </div>
                    </div>
                    <div style={{ minWidth: '64px' }}>
                      <div style={{ fontSize: '8px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '2px' }}>
                        Venta
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                        {p.precioVenta ? fmt(precioNeto(p)) : '-'}
                      </div>
                    </div>
                  </div>

                  {/* ✅ STATUS AL LADO */}
                  <select
                      className={`status-select ${p.estado}`}
                      value={p.estado}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        handleStatusChange(e, p.id, e.target.value)
                      }
                      style={{
                        height: '28px',
                        width: '110px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        minWidth: 'auto'
                      }}
                    >
                      <option value="en_verificacion">En verificación</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="progreso">En progreso</option>
                      <option value="listo">Listo p/ entregar</option>
                      <option value="enviado">Enviado</option>
                      <option value="completado">Completado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                </div>
             );
          })
        )}
      </div>
    </div>
  );
}