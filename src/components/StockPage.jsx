import React, { useMemo, useState } from 'react';
import { useBiblioteca, useCatalogo, useConfig } from '../context/contextos';
import ModalStockProducto from './modals/ModalStockProducto';
import { normalizarStock, stockTotal, textoStock } from '../utils/stock';

// Productos en stock: las unidades terminadas de cada producto de la Biblioteca. Son las que la tienda del
// catálogo web muestra por defecto y vende al instante; lo que se pida de más queda a pedido.
const SIN_CAT = '__sin_categoria__';
const porNombre = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });

export default function StockPage() {
  const { biblioteca } = useBiblioteca();
  const { catalogoConfig } = useCatalogo();
  const { cfg } = useConfig();
  const hayColores = (cfg?.colores || []).length > 0 || (cfg?.combinacionesColores || []).length > 0;
  const [busqueda, setBusqueda] = useState('');
  const [soloConStock, setSoloConStock] = useState(false);
  // '' = todas; SIN_CAT = productos sin categoría. La subcategoría sólo se ofrece al elegir una categoría.
  const [catFiltro, setCatFiltro] = useState('');
  const [subFiltro, setSubFiltro] = useState('');
  const [editando, setEditando] = useState(null);

  const categorias = useMemo(() => [...new Set(biblioteca.map((p) => p.cat).filter(Boolean))].sort(porNombre), [biblioteca]);
  const haySinCat = useMemo(() => biblioteca.some((p) => !p.cat), [biblioteca]);
  const subcategorias = useMemo(() => (catFiltro && catFiltro !== SIN_CAT
    ? [...new Set(biblioteca.filter((p) => p.cat === catFiltro).map((p) => p.subcat).filter(Boolean))].sort(porNombre)
    : []), [biblioteca, catFiltro]);

  const cambiarCategoria = (v) => { setCatFiltro(v); setSubFiltro(''); };

  const filas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return biblioteca
      .map((p) => ({ p, total: stockTotal(p.stock) }))
      .filter(({ p }) => !catFiltro || (catFiltro === SIN_CAT ? !p.cat : p.cat === catFiltro))
      .filter(({ p }) => !subFiltro || p.subcat === subFiltro)
      .filter(({ p, total }) => (!t || `${p.nombre} ${p.cat || ''} ${p.subcat || ''} ${p.subsubcat || ''}`.toLowerCase().includes(t)) && (!soloConStock || total > 0))
      .sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es', { sensitivity: 'base' }));
  }, [biblioteca, busqueda, soloConStock, catFiltro, subFiltro]);
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
        <select value={catFiltro} onChange={(e) => cambiarCategoria(e.target.value)} aria-label="Filtrar por categoría" style={{ width: 'auto', maxWidth: '220px' }}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          {haySinCat && <option value={SIN_CAT}>Sin categoría</option>}
        </select>
        {subcategorias.length > 0 && (
          <select value={subFiltro} onChange={(e) => setSubFiltro(e.target.value)} aria-label="Filtrar por subcategoría" style={{ width: 'auto', maxWidth: '220px' }}>
            <option value="">Todas las subcategorías</option>
            {subcategorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
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
                  <td style={{ fontSize: '12px' }}>{total ? textoStock(p.stock) : <span style={{ color: 'var(--text3)' }}>Sin stock · a pedido</span>}
                    {hayColores && normalizarStock(p.stock).some((l) => !l.color) && <div style={{ color: 'var(--warn)', fontWeight: 600 }}>⚠ Hay stock sin color: asignale uno (Editar stock) para que se pueda vender</div>}</td>
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
