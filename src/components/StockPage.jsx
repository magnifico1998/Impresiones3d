import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import ModalStockProducto from './modals/ModalStockProducto';
import { stockTotal, textoStock } from '../utils/stock';

// Productos en stock: las unidades terminadas de cada producto de la Biblioteca. Son las que la tienda del
// catálogo web muestra por defecto y vende al instante; lo que se pida de más queda a pedido.
export default function StockPage() {
  const { biblioteca, catalogoConfig } = useApp();
  const [busqueda, setBusqueda] = useState('');
  const [soloConStock, setSoloConStock] = useState(false);
  const [editando, setEditando] = useState(null);

  const filas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return biblioteca
      .map((p) => ({ p, total: stockTotal(p.stock) }))
      .filter(({ p, total }) => (!t || `${p.nombre} ${p.cat || ''} ${p.subcat || ''} ${p.subsubcat || ''}`.toLowerCase().includes(t)) && (!soloConStock || total > 0))
      .sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es', { sensitivity: 'base' }));
  }, [biblioteca, busqueda, soloConStock]);
  const unidades = useMemo(() => biblioteca.reduce((s, p) => s + stockTotal(p.stock), 0), [biblioteca]);
  const conStock = useMemo(() => biblioteca.filter((p) => stockTotal(p.stock) > 0).length, [biblioteca]);

  return (
    <div className="page active">
      <div className="page-title">Productos en stock</div>
      <div className="page-sub">
        Unidades terminadas de cada producto, por color. {conStock} producto{conStock !== 1 ? 's' : ''} con stock · {unidades} unidad{unidades !== 1 ? 'es' : ''} en total.
        {catalogoConfig?.modo !== 'tienda' && ' Para venderlas, elegí el formato "Tienda" en Catálogo web.'}
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
        <input type="text" placeholder="Buscar producto o categoría…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ maxWidth: '320px' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
          Sólo con stock
        </label>
      </div>

      {!biblioteca.length ? (
        <div className="empty">Todavía no tenés productos en la Biblioteca.</div>
      ) : !filas.length ? (
        <div className="empty">No hay productos que coincidan.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Stock por color</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ p, total }) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text3)' }}>{[p.cat, p.subcat, p.subsubcat].filter(Boolean).join(' › ') || '—'}</td>
                  <td style={{ fontSize: '12px' }}>{total ? textoStock(p.stock) : <span style={{ color: 'var(--text3)' }}>Sin stock · a pedido</span>}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{total}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-sm" onClick={() => setEditando(p)}>Editar stock</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && <ModalStockProducto producto={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}
