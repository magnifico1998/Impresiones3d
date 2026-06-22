import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function ClientesPage({ onOpenNewClient, onOpenClientDetail }) {
  const { clientes, pedidos } = useApp();

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  // Compute order details per client
  const clientRows = useMemo(() => {
    return clientes.map(c => {
      const misPedidos = pedidos.filter(
        p => p.cliente.trim().toLowerCase() === c.nombre.trim().toLowerCase()
      );
      const totalGastado = misPedidos.reduce((acc, p) => acc + (p.precioVenta || 0), 0);
      return {
        ...c,
        pedidosCount: misPedidos.length,
        totalGastado
      };
    });
  }, [clientes, pedidos]);

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Clientes</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>Administrá tus clientes y su historial de pedidos.</div>
        </div>
        <button className="btn btn-primary" onClick={onOpenNewClient}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4v12M4 10h12" />
          </svg>
          Nuevo cliente
        </button>
      </div>

      <div id="lista-clientes">
        {!clientes.length ? (
          <div className="empty">Todavía no hay clientes registrados.</div>
        ) : (
          <div className="res-tabla-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Localidad</th>
                  <th style={{ textAlign: 'center' }}>Pedidos</th>
                  <th style={{ textAlign: 'right' }}>Total gastado</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map(c => (
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
