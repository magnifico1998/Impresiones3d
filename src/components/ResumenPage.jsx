import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function ResumenPage() {
  const { pedidos, compras } = useApp();

  const [diasPeriodo, setDiasPeriodo] = useState(7);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const canvasRef = useRef(null);

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const parseFechaCreado = (str) => {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    return null;
  };

  const getFechaVenta = (p) => {
    if (p.fechaCompletado) return p.fechaCompletado;
    if (p.fechaPedido) return p.fechaPedido;
    if (p.creado) return parseFechaCreado(p.creado);
    return null;
  };

  // Helper: compute net sale price after discount for an order (available component-wide)
  const precioNetoFor = (p) => {
    const descuentoMonto = parseFloat(p.descuentoMonto) || 0;
    const descuentoPct = Math.max(0, Math.min(100, parseFloat(p.descuentoPct) || 0));
    const descuentoTotal = descuentoMonto > 0
      ? descuentoMonto
      : ((p.precioVenta || 0) * (descuentoPct / 100));
    return Math.max(0, (p.precioVenta || 0) - descuentoTotal);
  };

  // Calculate Date Boundaries
  const periodDates = useMemo(() => {
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : new Date();
    let desde;
    if (fechaDesde) {
      desde = new Date(fechaDesde + 'T00:00:00');
    } else {
      if (diasPeriodo === 0) {
        desde = new Date(0);
      } else {
        desde = new Date(hasta);
        desde.setDate(desde.getDate() - diasPeriodo);
        desde.setHours(0, 0, 0, 0);
      }
    }
    return { desde, hasta };
  }, [diasPeriodo, fechaDesde, fechaHasta]);

  // Filter orders and expenses by period
  const { filteredPedidos, completados, comprasPeriodo, totalVentas, totalCostos, gastos, ganancia, rentab, totalPendienteGlobal } = useMemo(() => {
    const { desde, hasta } = periodDates;

    const getIsOrderInPeriod = (p) => {
      const fechaRef = (p.state === 'completado' || p.estado === 'completado') && p.fechaCompletado
        ? p.fechaCompletado
        : (p.fechaPedido || p.fecha || p.creado);
      if (!fechaRef) return true;

      let d;
      if (fechaRef.includes('-') && fechaRef.length === 10) {
        d = new Date(fechaRef + 'T12:00:00');
      } else {
        const parts = fechaRef.split('/');
        if (parts.length === 3) d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        else return true;
      }
      return d >= desde && d <= hasta;
    };

    const fp = pedidos.filter(getIsOrderInPeriod);

    // Completados with sales price (neto: descuento aplicado)
    const comp = fp.filter(p => (p.estado === 'completado' || p.estado === 'listo') && (p.precioVenta || 0) > 0);

    const v = comp.reduce((s, p) => s + precioNetoFor(p), 0);
    
    // Cost calculation (electricity + labor)
    const c = comp.reduce((s, p) => {
      const cp = p.piezas.reduce((a, pz) => a + (((pz.costeElec || 0) + (pz.costeMO || 0)) * pz.cantidad), 0);
      return s + cp;
    }, 0);

    // Expenses/purchases filtering
    const compPer = compras.filter(c => {
      if (!c.fecha) return true;
      const d = new Date(c.fecha + 'T12:00:00');
      return d >= desde && d <= hasta;
    });
    
    const g = compPer.reduce((s, c) => s + (c.total || c.precio || 0), 0);

    const gan = v - c - g;
    const rent = v > 0 ? (gan / v * 100) : 0;

    const pendientesGlobal = pedidos.filter(p => p.estado !== 'completado' && p.estado !== 'cancelado' && (p.precioVenta || 0) > 0);
    const totalPend = pendientesGlobal.reduce((s, p) => s + precioNetoFor(p), 0);

    return {
      filteredPedidos: fp,
      completados: comp,
      comprasPeriodo: compPer,
      totalVentas: v,
      totalCostos: c,
      gastos: g,
      ganancia: gan,
      rentab: rent,
      totalPendienteGlobal: totalPend
    };
  }, [pedidos, compras, periodDates]);

  // Aggregate helpers for graph
  const agruparPorDia = (pedidosList, desde, hasta) => {
    const map = {};
    const cur = new Date(desde);
    while (cur <= hasta) {
      const k = cur.toISOString().slice(0, 10);
      map[k] = 0;
      cur.setDate(cur.getDate() + 1);
    }
    pedidosList.forEach(p => {
      const f = getFechaVenta(p);
      if (f && map[f] !== undefined) map[f] += precioNetoFor(p);
    });
    return Object.entries(map).map(([k, val]) => ({ label: k.slice(5), ventas: val }));
  };

  const agruparPorSemana = (pedidosList, desde, hasta) => {
    const semanas = [];
    const cur = new Date(desde);
    while (cur <= hasta) {
      const fin = new Date(cur);
      fin.setDate(fin.getDate() + 6);
      semanas.push({ label: cur.toISOString().slice(5, 10), desde: new Date(cur), hasta: fin <= hasta ? fin : hasta, ventas: 0 });
      cur.setDate(cur.getDate() + 7);
    }
    pedidosList.forEach(p => {
      const fStr = getFechaVenta(p);
      const f = fStr ? new Date(fStr + 'T12:00:00') : null;
      if (!f) return;
      const sem = semanas.find(s => f >= s.desde && f <= s.hasta);
      if (sem) sem.ventas += precioNetoFor(p);
    });
    return semanas;
  };

  const agruparPorMes = (pedidosList, desde, hasta) => {
    const map = {};
    const cur = new Date(desde.getFullYear(), desde.getMonth(), 1);
    while (cur <= hasta) {
      const k = cur.toISOString().slice(0, 7);
      map[k] = 0;
      cur.setMonth(cur.getMonth() + 1);
    }
    pedidosList.forEach(p => {
      const f = getFechaVenta(p);
      const mes = f ? f.slice(0, 7) : null;
      if (mes && map[mes] !== undefined) map[mes] += precioNetoFor(p);
    });
    return Object.entries(map).map(([k, val]) => ({ label: k.slice(5) + '/' + k.slice(2, 4), ventas: val }));
  };

  // Canvas Drawing Graph effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!completados.length) {
      return;
    }

    const { desde, hasta } = periodDates;
    const diffDias = (hasta - desde) / (1000 * 60 * 60 * 24);
    const puntos = diffDias <= 31 ? agruparPorDia(completados, desde, hasta)
                 : diffDias <= 180 ? agruparPorSemana(completados, desde, hasta)
                 : agruparPorMes(completados, desde, hasta);

    let acum = 0;
    const labels = puntos.map(p => p.label);
    const dataAcum = puntos.map(p => { acum += p.ventas; return Math.round(acum); });
    const dataBars = puntos.map(p => Math.round(p.ventas));

    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.offsetWidth || 500;
    const H = 200;

    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const PAD = { top: 20, right: 20, bottom: 40, left: 70 };
    const gW = W - PAD.left - PAD.right;
    const gH = H - PAD.top - PAD.bottom;
    const maxAcum = Math.max(...dataAcum, 1);
    const n = labels.length;
    const barW = Math.max(4, (gW / n) * 0.5);

    ctx.clearRect(0, 0, W, H);

    // Draw horizontal grid lines
    ctx.strokeStyle = '#2a2f3e'; 
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + gH - (gH / 4) * i;
      ctx.beginPath(); 
      ctx.moveTo(PAD.left, y); 
      ctx.lineTo(PAD.left + gW, y); 
      ctx.stroke();

      ctx.fillStyle = '#555d74'; 
      ctx.font = '10px DM Mono,monospace'; 
      ctx.textAlign = 'right';
      const val = Math.round(maxAcum / 4 * i);
      ctx.fillText(val >= 1000 ? '$' + (val / 1000).toFixed(0) + 'k' : '$' + val, PAD.left - 6, y + 3);
    }

    // Draw daily bars
    dataBars.forEach((v, i) => {
      const x = PAD.left + (gW / n) * (i + 0.5) - barW / 2;
      const bH = (v / maxAcum) * gH;
      const y = PAD.top + gH - bH;
      ctx.fillStyle = 'rgba(110,231,183,0.2)';
      ctx.beginPath(); 
      ctx.roundRect(x, y, barW, bH, 2); 
      ctx.fill();
    });

    // Draw cumulative line chart
    ctx.strokeStyle = '#6ee7b7'; 
    ctx.lineWidth = 2; 
    ctx.lineJoin = 'round';
    ctx.beginPath();
    dataAcum.forEach((v, i) => {
      const x = PAD.left + (gW / n) * (i + 0.5);
      const y = PAD.top + gH - (v / maxAcum) * gH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw cumulative line dots
    dataAcum.forEach((v, i) => {
      const x = PAD.left + (gW / n) * (i + 0.5);
      const y = PAD.top + gH - (v / maxAcum) * gH;
      ctx.fillStyle = '#6ee7b7'; 
      ctx.beginPath(); 
      ctx.arc(x, y, 3, 0, Math.PI * 2); 
      ctx.fill();
    });

    // Draw labels
    ctx.fillStyle = '#555d74'; 
    ctx.font = '10px DM Mono,monospace'; 
    ctx.textAlign = 'center';
    labels.forEach((lbl, i) => {
      if (n <= 12 || i % Math.ceil(n / 12) === 0) {
        const x = PAD.left + (gW / n) * (i + 0.5);
        ctx.fillText(lbl, x, H - 6);
      }
    });

    // Draw vertical title
    ctx.save(); 
    ctx.translate(12, PAD.top + gH / 2); 
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#555d74'; 
    ctx.font = '10px DM Mono,monospace'; 
    ctx.textAlign = 'center';
    ctx.fillText('Acumulado', 0, 0); 
    ctx.restore();
  }, [completados, periodDates]);

  // Printer utilization logic
  const printerHours = useMemo(() => {
    const mapa = {};
    filteredPedidos.forEach(p => {
      p.piezas.forEach(pz => {
        const nombre = pz.impresoraNombre || 'Sin asignar';
        const h = parseFloat(pz.horas * pz.cantidad) || 0;
        mapa[nombre] = (mapa[nombre] || 0) + h;
      });
    });

    const entries = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
    const maxH = entries.length > 0 ? entries[0][1] : 0;

    return entries.map(([nombre, horas]) => {
      const pct = maxH > 0 ? (horas / maxH * 100).toFixed(1) : 0;
      const hh = Math.floor(horas);
      const mm = Math.round((horas - hh) * 60);
      const label = hh > 0 ? (mm > 0 ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`;
      return { nombre, label, pct };
    });
  }, [filteredPedidos]);

  // Order sorted completed
  const sortedCompletados = useMemo(() => {
    return [...completados].sort((a, b) => {
      const fa = getFechaVenta(a) || '';
      const fb = getFechaVenta(b) || '';
      return fb.localeCompare(fa);
    });
  }, [completados]);

  // Sorted purchases
  const sortedCompras = useMemo(() => {
    return [...comprasPeriodo].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [comprasPeriodo]);

  const catBadgeClass = (cat) =>
    ({
      Insumos: 'badge-pending',
      Equipos: 'badge-progress',
      Accesorios: 'badge-listo',
      Otros: 'badge-cancelled'
    }[cat] || '');

  return (
    <div className="page active">
      <div className="page-title">Resumen</div>
      <div className="page-sub">Análisis de ventas, rentabilidad y uso de impresoras por período.</div>
      
      {/* Date period selector card */}
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

      {/* Statistics dashboard */}
      <div className="grid6">
        <div className="metric">
          <div className="metric-label">Ventas</div>
          <div className="metric-value accent">{fmt(totalVentas)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Gastos compras</div>
          <div className="metric-value" style={{ color: 'var(--danger)' }}>{fmt(gastos)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Rentabilidad</div>
          <div className="metric-value" style={{ color: rentab >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {rentab.toFixed(1)}%
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Pendiente (Global)</div>
          <div className="metric-value" style={{ color: 'var(--warn)' }}>{fmt(totalPendienteGlobal)}</div>
        </div>
      </div>

      {/* Graph and Printer Usage */}
      <div className="grid2">
        <div className="card">
          <div className="card-title">Ventas acumuladas</div>
          {!completados.length ? (
            <div style={{ textAlignment: 'center', padding: '40px', color: 'var(--text3)', fontSize: '13px', fontFamily: 'var(--mono)', textAlign: 'center' }}>
              Sin datos en el período
            </div>
          ) : (
            <canvas ref={canvasRef} height="200"></canvas>
          )}
        </div>
        
        <div className="card">
          <div className="card-title">Horas de uso por impresora</div>
          {!printerHours.length ? (
            <div className="empty">Sin datos.</div>
          ) : (
            printerHours.map((imp, i) => (
              <div key={i} className="imp-bar-wrap">
                <div className="imp-bar-label">
                  <span>{imp.nombre}</span>
                  <span>{imp.label}</span>
                </div>
                <div className="imp-bar-track">
                  <div className="imp-bar-fill" style={{ width: `${imp.pct}%` }}></div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Orders completed/list table */}
      <div className="card">
        <div className="card-title">Pedidos completados / listos para entregar</div>
        {!sortedCompletados.length ? (
          <div className="empty">Sin pedidos completados en el período.</div>
        ) : (
          <div className="res-tabla-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'center' }}>Piezas</th>
                  <th style={{ textAlign: 'right' }}>Precio final</th>
                  <th>Completado</th>
                  <th>Entrega</th>
                </tr>
              </thead>
              <tbody>
                {sortedCompletados.map(p => {
                  const costo = p.piezas.reduce((s, pz) => s + (((pz.costeElec || 0) + (pz.costeMO || 0)) * pz.cantidad), 0);
                  const precioFinal = precioNetoFor(p);
                  const gan = precioFinal - costo;
                  const margen = precioFinal > 0 ? (gan / precioFinal * 100).toFixed(1) : 0;
                  const fechaMostrar = p.fechaCompletado || p.fechaPedido || p.creado || '—';
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{p.cliente}</td>
                      <td style={{ color: 'var(--text2)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.desc || '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'center' }}>
                        {p.piezas.reduce((t, pz) => t + pz.cantidad, 0)}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>
                        {fmt(precioNetoFor(p))}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: p.fechaCompletado ? 'var(--accent)' : 'var(--text3)', whiteSpace: 'nowrap' }}>
                        {fechaMostrar}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{p.fechaEntrega || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expenses table */}
      <div className="card">
        <div className="card-title">Compras del período</div>
        {!sortedCompras.length ? (
          <div className="empty">Sin compras en el período.</div>
        ) : (
          <div className="res-tabla-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Proveedor</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedCompras.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{c.fecha || '—'}</td>
                    <td>{c.desc}</td>
                    <td>
                      <span className={`badge ${catBadgeClass(c.cat)}`}>
                        {c.cat || 'Otros'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{c.proveedor || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--danger)' }}>
                      {fmt(c.total || c.precio)}
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
