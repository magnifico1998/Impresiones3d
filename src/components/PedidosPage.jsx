import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { precioNeto } from '../utils/precioNeto';
import { ventasDePedido, pendienteDePedido } from '../utils/finanzasPedido';
import { calcularFechaCompletado, fechaLocalHoy } from '../utils/fechaCompletado';
import { buildWaLink, findClientePedido } from '../utils/whatsapp';
import { useFiltroPeriodo } from '../hooks/useFiltroPeriodo';

export default function PedidosPage({ onOpenNewOrder, onOpenOrderDetail }) {
  const { pedidos, clientes, updatePedido, showToast, fmt } = useApp();

  // Los completados y cancelados quedan colapsados juntos por defecto: con
  // el tiempo se acumulan y ocupan espacio sin aportar nada al vistazo diario.
  const [completadosExpandido, setCompletadosExpandido] = useState(false);

  // Mismo esquema de filtro por período que Resumen: presets en días o un
  // rango de fechas manual (fechaDesde/fechaHasta pisan el preset). 0 =
  // "Todo", que es el valor por defecto la primera vez (antes de que el
  // usuario elija algo) para no cambiar el comportamiento previo de la
  // página. Se persiste en localStorage para que quede fijo al salir y
  // volver a "Pedidos", hasta que se elija otro período.
  const { diasPeriodo, setDiasPeriodo, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta } =
    useFiltroPeriodo('filtroPeriodo.pedidos', 0);

  // Fecha de referencia de un pedido para filtrarlo por período: la fecha
  // en que se cargó el pedido (no la de entrega ni la de completado).
  const getFechaPedido = (p) => p.fechaPedido || p.fecha || p.creado || null;

  // Acepta tanto 'YYYY-MM-DD' (inputs de fecha / fechaLocalHoy) como
  // 'dd/mm/aaaa' (campo legado `creado`).
  const parseFecha = (fechaStr) => {
    if (!fechaStr) return null;
    if (fechaStr.includes('-') && fechaStr.length === 10) return new Date(fechaStr + 'T12:00:00');
    const partes = fechaStr.split('/');
    if (partes.length === 3) return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    return null;
  };

  const periodDates = useMemo(() => {
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : new Date(fechaLocalHoy() + 'T23:59:59');
    let desde;
    if (fechaDesde) {
      desde = new Date(fechaDesde + 'T00:00:00');
    } else if (diasPeriodo === 0) {
      const fechas = pedidos.map(getFechaPedido).filter(Boolean).map(parseFecha).filter(d => d && !isNaN(d));
      desde = fechas.length ? new Date(Math.min(...fechas.map(d => d.getTime()))) : new Date(hasta);
      desde.setHours(0, 0, 0, 0);
    } else {
      desde = new Date(hasta);
      desde.setDate(desde.getDate() - diasPeriodo);
      desde.setHours(0, 0, 0, 0);
    }
    return { desde, hasta };
  }, [diasPeriodo, fechaDesde, fechaHasta, pedidos]);


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

  // Pedidos sin fecha de pedido cargada no se ocultan con ningún filtro
  // (mismo criterio que ResumenPage): es preferible que sigan a la vista a
  // que desaparezcan por no tener el dato.
  const pedidosDelPeriodo = useMemo(() => {
    const { desde, hasta } = periodDates;
    return pedidos.filter(p => {
      const d = parseFecha(getFechaPedido(p));
      if (!d || isNaN(d)) return true;
      return d >= desde && d <= hasta;
    });
  }, [pedidos, periodDates]);

  const stats = useMemo(() => {
    const total = pedidosDelPeriodo.length;
    const prog = pedidosDelPeriodo.filter(p => p.estado === 'progreso' || p.estado === 'listo').length;
    const done = pedidosDelPeriodo.filter(p => p.estado === 'completado').length;

    // "Facturado" y "Pendiente" siguen las reglas de finanzasPedido.js: lo
    // abonado cuenta como venta desde su fecha de abono (y sale de
    // pendiente), en_verificacion no aporta a ninguno de los dos, y un
    // pedido enviado/completado ya reconoce todo su precio neto como venta
    // (nada le queda pendiente).
    const fact = pedidosDelPeriodo.reduce((s, p) => s + ventasDePedido(p), 0);
    const pendGlobal = pedidosDelPeriodo.reduce((s, p) => s + pendienteDePedido(p), 0);

    return { total, prog, done, fact, pendGlobal };
  }, [pedidosDelPeriodo]);

  const sortedPedidos = useMemo(() => {
    return [...pedidosDelPeriodo].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  }, [pedidosDelPeriodo]);

  const pedidosActivos = useMemo(
    () => sortedPedidos.filter(p => p.estado !== 'completado' && p.estado !== 'cancelado'),
    [sortedPedidos]
  );
  const pedidosCompletados = useMemo(
    () => sortedPedidos.filter(p => p.estado === 'completado' || p.estado === 'cancelado'),
    [sortedPedidos]
  );

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

  const renderPedidoCard = (p) => {
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

    const clienteObj = findClientePedido(clientes, p.cliente);
    const waLink = buildWaLink(
      clienteObj?.tel,
      `Hola ${p.cliente}! Te escribo por tu pedido #${String(p.id).padStart(4, '0')}.`
    );
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

          {/* Botón para escribirle al cliente por WhatsApp sin copiar el
              teléfono a mano; se oculta si el cliente no tiene tel cargado. */}
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              title={`Enviar WhatsApp a ${p.cliente}`}
              onClick={(e) => e.stopPropagation()}
              className="btn btn-ghost btn-sm"
              style={{ padding: '5px 7px', flexShrink: 0, color: '#25D366' }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '16px', height: '16px', display: 'block' }}>
                <path d="M10 2.5a7.5 7.5 0 0 0-6.4 11.4L2.5 17.5l3.75-1.05A7.5 7.5 0 1 0 10 2.5z" strokeLinejoin="round" />
                <path d="M7.2 6.8c.15-.35.3-.35.45-.35h.35c.15 0 .3 0 .45.35.2.45.6 1.5.65 1.6.05.1.1.25 0 .4-.1.15-.15.25-.3.4l-.35.4c-.1.1-.2.2-.1.4.15.3.6 1 1.3 1.6.9.8 1.6 1.05 1.85 1.15.2.1.3.05.4-.05l.5-.55c.15-.15.3-.2.5-.1.2.05 1.25.6 1.45.7.2.1.35.15.4.25.05.15.05.6-.15 1.15-.2.55-1.15 1.05-1.6 1.1-.45.05-.9.25-2.95-.65-2.5-1.1-4.05-3.7-4.15-3.9-.1-.15-.85-1.15-.85-2.15 0-1.05.55-1.5.75-1.7z" fill="currentColor" stroke="none" />
              </svg>
            </a>
          )}

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

      {/* Filtro por período, mismo patrón que ResumenPage: presets en días
          o un rango de fechas manual (pisa el preset apenas se toca). */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: '4px' }}>
            Período
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { label: '7 días', val: 7 },
              { label: '30 días', val: 30 },
              { label: '90 días', val: 90 },
              { label: '1 año', val: 365 },
              { label: 'Todo', val: 0 }
            ].map(btn => (
              <button
                key={btn.val}
                className={`btn btn-sm periodo-btn ${diasPeriodo === btn.val && !fechaDesde && !fechaHasta ? 'active' : ''}`}
                onClick={() => {
                  setDiasPeriodo(btn.val);
                  setFechaDesde('');
                  setFechaHasta('');
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={fechaDesde}
              style={{ width: '140px', fontSize: '12px', padding: '5px 8px' }}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setDiasPeriodo(-1);
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>→</span>
            <input
              type="date"
              value={fechaHasta}
              style={{ width: '140px', fontSize: '12px', padding: '5px 8px' }}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setDiasPeriodo(-1);
              }}
            />
          </div>
        </div>
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
          <div className="empty">
            {pedidos.length ? 'No hay pedidos en el período seleccionado.' : 'Todavía no hay pedidos.'}
          </div>
        ) : (
          <>
            {pedidosActivos.map(p => renderPedidoCard(p))}

            {pedidosCompletados.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: pedidosActivos.length ? '12px' : 0 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }}
                  onClick={() => setCompletadosExpandido(v => !v)}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{completadosExpandido ? '−' : '+'}</span>
                    Completados y cancelados
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {pedidosCompletados.length} pedido{pedidosCompletados.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {completadosExpandido && (
                  <div style={{ padding: '0 12px 12px' }}>
                    {pedidosCompletados.map(p => renderPedidoCard(p))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}