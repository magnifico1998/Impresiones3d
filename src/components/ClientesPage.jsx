import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { precioNeto } from '../utils/precioNeto';

const sortOptions = [
  { id: 'nombreAsc', label: 'Nombre A → Z' },
  { id: 'nombreDesc', label: 'Nombre Z → A' },
  { id: 'fechaAltaDesc', label: 'Más nuevos primero' },
  { id: 'fechaAltaAsc', label: 'Más antiguos primero' },
  { id: 'ultimoPedido', label: 'Último pedido' },
  { id: 'totalGastado', label: 'Monto de pedidos' }
];

export default function ClientesPage({ onOpenNewClient, onOpenClientDetail }) {
  const { clientes, pedidos } = useApp();
  const [sortMode, setSortMode] = useState('nombreAsc');
  const [busqueda, setBusqueda] = useState('');

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const formatDate = (timestamp) => {
    return timestamp ? new Date(timestamp).toLocaleDateString('es-AR') : '';
  };

  const parsePedidoTime = (pedido) => {
    const fecha = pedido.fechaPedido || pedido.fecha || pedido.creado || '';
    const parsed = new Date(fecha + 'T12:00:00').getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  // fechaAltaTs es un timestamp real fijado al crear el cliente; los
  // clientes creados antes de este cambio no lo tienen, así que caen a
  // parsear fechaAlta (sólo fecha, sin hora) como respaldo.
  const getFechaAltaTs = (c) => {
    if (c.fechaAltaTs) return c.fechaAltaTs;
    if (c.fechaAlta) {
      const pts = c.fechaAlta.split('/');
      if (pts.length === 3) return new Date(pts[2], pts[1] - 1, pts[0]).getTime();
    }
    return 0;
  };

  const buildCsv = (headers, rows) => {
    const escapeValue = (value) => {
      const str = value == null ? '' : String(value);
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const lines = [headers.map(escapeValue).join(',')];
    rows.forEach(row => lines.push(row.map(escapeValue).join(',')));
    return '\uFEFF' + lines.join('\r\n');
  };

  const downloadCsv = (filename, content) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportClientesConResumen = () => {
    const headers = [
      'Nombre',
      'Teléfono',
      'Email',
      'Provincia',
      'Localidad',
      'Código Postal',
      'Calle',
      'Altura',
      'Fecha de alta',
      'Pedidos',
      'Último pedido',
      'Total gastado'
    ];
    const rows = clientRows.map(c => [
      c.nombre,
      c.tel,
      c.email,
      c.prov,
      c.loc,
      c.cp,
      c.calle,
      c.altura,
      c.fechaAlta || '',
      c.pedidosCount,
      formatDate(c.lastPedido),
      fmt(c.totalGastado)
    ]);
    downloadCsv('clientes-resumen-completo.csv', buildCsv(headers, rows));
  };

  // Compute order details per client
  const clientRows = useMemo(() => {
    return clientes.map(c => {
      const misPedidos = pedidos.filter(
        p => p.cliente.trim().toLowerCase() === c.nombre.trim().toLowerCase()
      );
      const totalGastado = misPedidos.reduce((acc, p) => acc + precioNeto(p), 0);
      const lastPedido = misPedidos.reduce((latest, p) => {
        const time = parsePedidoTime(p);
        return Math.max(latest, time);
      }, 0);
      return {
        ...c,
        pedidosCount: misPedidos.length,
        totalGastado,
        lastPedido
      };
    });
  }, [clientes, pedidos]);

  const sortedClients = useMemo(() => {
    const rows = [...clientRows];
    switch (sortMode) {
      case 'nombreDesc':
        return rows.sort((a, b) => b.nombre.localeCompare(a.nombre, 'es', { sensitivity: 'base' }));
      case 'fechaAltaDesc':
        return rows.sort((a, b) => getFechaAltaTs(b) - getFechaAltaTs(a) || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
      case 'fechaAltaAsc':
        return rows.sort((a, b) => getFechaAltaTs(a) - getFechaAltaTs(b) || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
      case 'ultimoPedido':
        return rows.sort((a, b) => b.lastPedido - a.lastPedido || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
      case 'totalGastado':
        return rows.sort((a, b) => b.totalGastado - a.totalGastado || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
      case 'nombreAsc':
      default:
        return rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    }
  }, [clientRows, sortMode]);

  // Búsqueda rápida por nombre: filtra en vivo sobre la lista ya
  // ordenada, sin tocar el orden elegido.
  const busquedaNorm = busqueda.trim().toLowerCase();
  const filteredClients = busquedaNorm
    ? sortedClients.filter(c => c.nombre.toLowerCase().includes(busquedaNorm))
    : sortedClients;

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Clientes</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>Administrá tus clientes y su historial de pedidos.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', minWidth: '180px' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text2)', fontSize: '14px' }}>
            Ordenar por:
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', minWidth: '180px' }}
            >
              {sortOptions.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={exportClientesConResumen}>Exportar clientes</button>
          <button className="btn btn-primary" onClick={onOpenNewClient}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Nuevo cliente
          </button>
        </div>
      </div>

      <div id="lista-clientes">
        {!clientes.length ? (
          <div className="empty">Todavía no hay clientes registrados.</div>
        ) : !filteredClients.length ? (
          <div className="empty">No encontramos clientes que coincidan con "{busqueda}".</div>
        ) : (
          <div className="res-tabla-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Localidad</th>
                  <th style={{ textAlign: 'center' }}>Pedidos</th>
                  <th style={{ textAlign: 'right' }}>Último pedido</th>
                  <th style={{ textAlign: 'right' }}>Total gastado</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(c => (
                  <tr 
                    key={c.id} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => onOpenClientDetail(c.id)}
                  >
                    <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                    <td style={{ color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{c.tel || '—'}</td>
                    <td style={{ color: 'var(--text2)' }}>
                      {[c.loc, c.prov ? `(${c.prov})` : ''].filter(Boolean).join(' ')}
                      {!c.loc && !c.prov && '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'center' }}>{c.pedidosCount}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>
                      {c.lastPedido ? new Date(c.lastPedido).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--accent)', textAlign: 'right' }}>
                      {fmt(c.totalGastado)}
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
