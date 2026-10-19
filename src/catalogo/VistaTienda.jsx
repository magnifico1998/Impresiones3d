import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ordenarCategorias } from '../utils/categoriaOrden';
import { fotoDeColor } from '../utils/fotosColor';
import { colorPermitido, combinacionPermitida } from '../utils/coloresProducto';
import { normalizarStock, repartirConStock, stockDeVariante, stockTotal } from '../utils/stock';

// Formato "tienda" del catálogo web (catalogoConfig.modo === 'tienda'): categorías arriba como desplegables con sus
// subcategorías, grilla de productos con imagen grande y botón Comprar. Por defecto muestra lo que hay en stock
// (se entrega al instante); "Todo el catálogo" suma los productos a pedido. Una compra puede mezclar las dos cosas:
// lo que hay en stock sale de stock y el resto se fabrica (ver repartirConStock).
// El carrito, el envío y la paleta siguen en CatalogoPublico: esta vista sólo arma la navegación y la ficha.

const nuevoId = () => Date.now() + Math.random();
const MENU_MAS = '__mas__';
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const ESTILOS_TIENDA = `
  .tienda-nav { display: flex; gap: 2px; align-items: stretch; overflow: hidden; border-bottom: 1px solid var(--border); }
  .tienda-nav::-webkit-scrollbar { display: none; }
  .tienda-nav-item { position: relative; flex-shrink: 0; }
  .tienda-nav-btn { background: none; border: none; cursor: pointer; padding: 14px 14px; color: var(--text); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; display: flex; align-items: center; gap: 6px; white-space: nowrap; border-bottom: 2px solid transparent; }
  .tienda-nav-btn:hover, .tienda-nav-btn.activo { border-bottom-color: var(--accent); color: var(--accent); }
  /* fixed (no absolute): la barra tiene overflow-x:auto y recortaría el menú */
  .tienda-menu { position: fixed; min-width: 220px; max-height: 70vh; overflow-y: auto; background: var(--bg2); border: 1px solid var(--border2); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.25); padding: 6px; z-index: 25; }
  .tienda-menu button { display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: 9px 12px; border-radius: 8px; color: var(--text); font-size: 13px; }
  .tienda-menu button:hover { background: var(--bg3); color: var(--accent); }
  .tienda-menu button.todo { font-weight: 700; }
  .tienda-submenu { animation: tiendaSub .15s ease; }
  @keyframes tiendaSub { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .tienda-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  @media (min-width: 640px) { .tienda-grid { grid-template-columns: repeat(3, 1fr); gap: 18px; } }
  @media (min-width: 1000px) { .tienda-grid { grid-template-columns: repeat(4, 1fr); gap: 22px; } }
  .tienda-card { display: flex; flex-direction: column; }
  .tienda-card .tienda-img { position: relative; width: 100%; aspect-ratio: 1 / 1; background: var(--bg3); border-radius: 14px; overflow: hidden; cursor: zoom-in; }
  .tienda-card .tienda-img img { width: 100%; height: 100%; object-fit: cover; transition: transform .2s ease; display: block; }
  .tienda-card .tienda-img:hover img { transform: scale(1.04); }
  .tienda-etiqueta { position: absolute; top: 10px; left: 10px; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: var(--accent); color: #0a1a12; }
  .tienda-etiqueta.pedido { background: var(--bg2); color: var(--text2); border: 1px solid var(--border2); }
  .tienda-comprar:hover { filter: brightness(1.06); }
`;

export default function VistaTienda({ productos, config, fmt, carrito, colores, coloresSecundarios, combinaciones, aceptaPedidos, onAgregar, onAmpliar, abrirProdId, onAbierto }) {
  const hayStock = productos.some((p) => stockTotal(p.stock) > 0);
  const [vista, setVista] = useState(hayStock ? 'stock' : 'todo'); // 'stock' | 'todo'
  const [filtro, setFiltro] = useState({ cat: null, subcat: null, subsub: null });
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [posMenu, setPosMenu] = useState({ left: 0, top: 0 });
  const abrirMenu = (cat, el) => {
    const r = el.getBoundingClientRect();
    setPosMenu({ left: Math.max(8, Math.min(r.left, window.innerWidth - 236)), top: r.bottom });
    setMenuAbierto(cat);
  };
  // El menú es fixed: si la página o la barra se desplazan, se cierra para no quedar flotando afuera de su botón.
  useEffect(() => {
    if (menuAbierto === null) return undefined;
    const cerrar = () => setMenuAbierto(null);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => { window.removeEventListener('scroll', cerrar, true); window.removeEventListener('resize', cerrar); };
  }, [menuAbierto]);
  const [busqueda, setBusqueda] = useState('');
  const [comprando, setComprando] = useState(null);
  const navRef = useRef(null);
  const medidaRef = useRef(null);
  const inicioRef = useRef(null);
  const [anchoNav, setAnchoNav] = useState(0);
  // Cuántas categorías entran en la barra; el resto va al desplegable "Más".
  const [entran, setEntran] = useState(Infinity);

  // "Editar" desde el carrito: reabre la ficha de ese producto.
  useEffect(() => {
    if (abrirProdId == null) return;
    const p = productos.find((x) => x.id === abrirProdId);
    if (p) setComprando(p);
    onAbierto?.();
  }, [abrirProdId, productos, onAbierto]);

  // Sin nada en stock no tiene sentido arrancar en "En stock": si el dueño recién cargó stock, el cambio es en vivo.
  useEffect(() => { if (!hayStock) setVista('todo'); }, [hayStock]);

  // Categorías y subcategorías que tienen productos en la vista actual (una categoría vacía no se muestra).
  const visiblesPorVista = useMemo(
    () => productos.filter((p) => vista === 'todo' || stockTotal(p.stock) > 0),
    [productos, vista]
  );
  const categorias = useMemo(() => {
    const set = new Set(visiblesPorVista.map((p) => p.cat || 'Otros'));
    return ordenarCategorias(Array.from(set), config?.categoriaOrden);
  }, [visiblesPorVista, config?.categoriaOrden]);
  const subcatsDe = (cat) => Array.from(new Set(
    visiblesPorVista.filter((p) => (p.cat || 'Otros') === cat).map((p) => p.subcat).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  // Tercer nivel: las sub-subcategorías que cuelgan de una subcategoría (se abren como desplegable de ella).
  const subsubsDe = (cat, subcat) => Array.from(new Set(
    visiblesPorVista.filter((p) => (p.cat || 'Otros') === cat && p.subcat === subcat).map((p) => p.subsubcat).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const [subAbierta, setSubAbierta] = useState(null); // "cat::subcat" con sus sub-subcategorías desplegadas dentro del menú

  // Un filtro que quedó sin productos al cambiar de vista se descarta.
  useEffect(() => {
    if (filtro.cat && !categorias.includes(filtro.cat)) setFiltro({ cat: null, subcat: null, subsub: null });
  }, [categorias, filtro.cat]);

  // Un clic afuera del menú lo cierra.
  useEffect(() => {
    if (menuAbierto === null) return undefined;
    const cerrar = (e) => { if (!navRef.current?.contains(e.target)) setMenuAbierto(null); };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('touchstart', cerrar);
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('touchstart', cerrar); };
  }, [menuAbierto]);

  const lista = useMemo(() => {
    const t = sinAcentos(busqueda.trim());
    return visiblesPorVista
      .filter((p) => !filtro.cat || (p.cat || 'Otros') === filtro.cat)
      .filter((p) => !filtro.subcat || p.subcat === filtro.subcat)
      .filter((p) => !filtro.subsub || p.subsubcat === filtro.subsub)
      .filter((p) => !t || sinAcentos(`${p.nombre} ${p.desc || ''} ${p.cat || ''} ${p.subcat || ''}`).includes(t))
      .sort((a, b) => (stockTotal(b.stock) > 0) - (stockTotal(a.stock) > 0) || String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
  }, [visiblesPorVista, filtro, busqueda]);

  useEffect(() => {
    if (!navRef.current) return undefined;
    const ro = new ResizeObserver(() => setAnchoNav(navRef.current?.clientWidth || 0));
    ro.observe(navRef.current);
    setAnchoNav(navRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const anchos = [...(medidaRef.current?.children || [])].map((el) => el.offsetWidth);
    const disponible = anchoNav - (inicioRef.current?.offsetWidth || 0);
    if (!anchoNav || !anchos.length || anchos.reduce((s, a) => s + a, 0) <= disponible) { setEntran(Infinity); return; }
    const reservaMas = 84; // ancho del botón "Más"
    let usado = 0;
    let n = 0;
    while (n < anchos.length && usado + anchos[n] <= disponible - reservaMas) { usado += anchos[n]; n++; }
    setEntran(Math.max(1, n));
  }, [categorias, anchoNav]);
  const enBarra = categorias.slice(0, entran);
  const enMas = categorias.slice(entran);

  // Una subcategoría dentro del menú; si tiene sub-subcategorías, lleva una flecha que las despliega debajo.
  const itemSubcategoria = (cat, s, sangria) => {
    const hijos = subsubsDe(cat, s);
    const clave = `${cat}::${s}`;
    const abierta = subAbierta === clave;
    const pad = sangria ? '26px' : '12px';
    // Con mouse, las sub-subcategorías se abren solas al pasar por encima de la subcategoría (sin clic) y se cierran al
    // salir; en pantallas táctiles queda la flecha.
    const conMouse = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
    return (
      <div key={s} onMouseEnter={() => hijos.length && conMouse() && setSubAbierta(clave)} onMouseLeave={() => conMouse() && setSubAbierta((a) => (a === clave ? null : a))}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button style={{ flex: 1, paddingLeft: pad, fontSize: sangria ? '12.5px' : undefined }} onClick={() => elegir(cat, s)}>{s}</button>
          {hijos.length > 0 && (
            <button
              style={{ width: 'auto', padding: '9px 12px' }}
              aria-label={`Ver sub-subcategorías de ${s}`}
              aria-expanded={abierta}
              onClick={(e) => { e.stopPropagation(); setSubAbierta(abierta ? null : clave); }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '11px', height: '11px', transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        {abierta && hijos.length > 0 && <div className="tienda-submenu">{hijos.map((h) => (
          <button key={h} style={{ paddingLeft: sangria ? '44px' : '30px', fontSize: '12.5px', color: 'var(--text2)' }} onClick={() => elegir(cat, s, h)}>{h}</button>
        ))}</div>}
      </div>
    );
  };

  const elegir = (cat, subcat = null, subsub = null) => { setFiltro({ cat, subcat, subsub }); setMenuAbierto(null); setSubAbierta(null); };
  const titulo = filtro.subcat ? [filtro.cat, filtro.subcat, filtro.subsub].filter(Boolean).join(' › ') : (filtro.cat || (vista === 'stock' ? 'Disponible ahora' : 'Todo el catálogo'));

  return (
    <div className="catalogo-content" style={{ maxWidth: '1180px', margin: '0 auto', padding: '0 16px 24px' }}>
      {/* Fila oculta con todas las categorías, sólo para medir cuántas entran en la barra. */}
      <div style={{ position: 'relative' }}>
        <div ref={medidaRef} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 0, overflow: 'hidden', display: 'flex' }}>
          {categorias.map((cat) => <div key={cat} className="tienda-nav-item"><button className="tienda-nav-btn" tabIndex={-1}>{cat}{subcatsDe(cat).length > 0 && <span style={{ width: '11px' }} />}</button></div>)}
        </div>
      </div>
      <div className="tienda-nav" ref={navRef}>
        <div className="tienda-nav-item" ref={inicioRef}>
          <button className={`tienda-nav-btn ${!filtro.cat ? 'activo' : ''}`} onClick={() => elegir(null)}>Inicio</button>
        </div>
        {enBarra.map((cat) => {
          const subs = subcatsDe(cat);
          const abierto = menuAbierto === cat;
          return (
            <div key={cat} className="tienda-nav-item" onMouseEnter={(e) => subs.length && window.matchMedia?.('(hover: hover)').matches && abrirMenu(cat, e.currentTarget)} onMouseLeave={() => setMenuAbierto((m) => (m === cat ? null : m))}>
              <button
                className={`tienda-nav-btn ${filtro.cat === cat ? 'activo' : ''}`}
                onClick={(e) => (subs.length ? (abierto ? setMenuAbierto(null) : abrirMenu(cat, e.currentTarget.parentElement)) : elegir(cat))}
                aria-expanded={subs.length ? abierto : undefined}
              >
                {cat}
                {subs.length > 0 && (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '11px', height: '11px', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                    <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              {abierto && subs.length > 0 && (
                <div className="tienda-menu" style={{ left: posMenu.left, top: posMenu.top }}>
                  <button className="todo" onClick={() => elegir(cat)}>Ver todo en {cat}</button>
                  {subs.map((s) => itemSubcategoria(cat, s, false))}
                </div>
              )}
            </div>
          );
        })}
        {/* Las categorías que no entran en la barra van en este desplegable. */}
        {enMas.length > 0 && (
          <div className="tienda-nav-item" onMouseEnter={(e) => window.matchMedia?.('(hover: hover)').matches && abrirMenu(MENU_MAS, e.currentTarget)} onMouseLeave={() => setMenuAbierto((m) => (m === MENU_MAS ? null : m))}>
            <button
              className={`tienda-nav-btn ${enMas.includes(filtro.cat) ? 'activo' : ''}`}
              onClick={(e) => (menuAbierto === MENU_MAS ? setMenuAbierto(null) : abrirMenu(MENU_MAS, e.currentTarget.parentElement))}
              aria-expanded={menuAbierto === MENU_MAS}
            >
              Más
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '11px', height: '11px', transform: menuAbierto === MENU_MAS ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {menuAbierto === MENU_MAS && (
              <div className="tienda-menu" style={{ left: posMenu.left, top: posMenu.top }}>
                {enMas.map((cat) => (
                  <div key={cat}>
                    <button className="todo" onClick={() => elegir(cat)}>{cat}</button>
                    {subcatsDe(cat).map((s) => itemSubcategoria(cat, s, true))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '18px 0 14px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{titulo}</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
            {lista.length} producto{lista.length !== 1 ? 's' : ''}
            {vista === 'stock' ? ' · listos para entregar' : ' · los que no están en stock se fabrican a pedido'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="search" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ width: '180px' }} />
          <div style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: '999px', overflow: 'hidden' }}>
            {[['stock', 'En stock'], ['todo', 'Todo el catálogo']].map(([id, texto]) => (
              <button
                key={id}
                onClick={() => setVista(id)}
                style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', fontSize: '12px', fontWeight: 700, background: vista === id ? 'var(--accent)' : 'transparent', color: vista === id ? '#0a1a12' : 'var(--text2)' }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!productos.length && <div className="empty">Todavía no hay productos publicados.</div>}
      {productos.length > 0 && !lista.length && (
        <div className="empty">
          No hay productos para mostrar{vista === 'stock' ? ' en stock' : ''}.
          {vista === 'stock' && <> <button className="btn btn-sm" onClick={() => setVista('todo')}>Ver todo el catálogo</button></>}
        </div>
      )}

      <div className="tienda-grid">
        {lista.map((p) => {
          const total = stockTotal(p.stock);
          const enCarrito = carrito.find((it) => it.prodId === p.id);
          const cant = enCarrito ? enCarrito.versiones.reduce((s, v) => s + (v.cantidad || 0), 0) : 0;
          const imagenes = p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []);
          return (
            <div key={p.id} className="tienda-card">
              <div className="tienda-img" onClick={() => imagenes.length && onAmpliar({ imagenes, nombre: p.nombre, index: 0 })}>
                {p.imagen ? (
                  <img src={p.imagen} alt={p.nombre} loading="lazy" />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '40px', fontWeight: 700 }}>
                    {p.nombre?.[0]?.toUpperCase() || '·'}
                  </div>
                )}
                <span className={`tienda-etiqueta ${total > 0 ? '' : 'pedido'}`}>{total > 0 ? 'En stock' : 'A pedido'}</span>
              </div>
              <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 600, lineHeight: 1.3 }}>{p.nombre}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: '3px' }}>{fmt(p.precio)}</div>
              <button
                className="btn btn-primary tienda-comprar"
                style={{ marginTop: '10px', width: '100%', justifyContent: 'center', borderRadius: '999px' }}
                disabled={!aceptaPedidos}
                onClick={() => setComprando(p)}
              >
                {cant ? `En tu pedido (${cant}) · Editar` : (total > 0 ? 'Comprar' : 'Pedir')}
              </button>
            </div>
          );
        })}
      </div>

      {comprando && (
        <FichaProducto
          producto={comprando}
          soloStock={vista === 'stock'}
          inicial={carrito.find((it) => it.prodId === comprando.id)?.versiones}
          fmt={fmt}
          colores={colores}
          coloresSecundarios={coloresSecundarios}
          combinaciones={combinaciones}
          onCerrar={() => setComprando(null)}
          onConfirmar={(versiones) => { onAgregar(comprando, versiones); setComprando(null); }}
          onAmpliar={onAmpliar}
        />
      )}
    </div>
  );
}

function FichaProducto({ producto: p, inicial, soloStock, fmt, colores, coloresSecundarios, combinaciones, onCerrar, onConfirmar, onAmpliar }) {
  const total = stockTotal(p.stock);
  const variantes = normalizarStock(p.stock);
  const mismaVariante = (a, b) => (a.color || '') === (b.color || '') && (a.colorSecundario || '') === (b.colorSecundario || '');
  const textoVariante = (l) => `${l.color ? l.color + (l.colorSecundario ? ` + ${l.colorSecundario}` : '') : 'Sin color'} · ${l.cantidad} en stock`;

  // Lo que se ofrece al abrir: en la vista "En stock" (o si el producto tiene stock) arranca en una variante que tiene
  // stock, para que lo más fácil sea comprar lo que hay.
  const filaNueva = (excluidas = []) => {
    const libre = variantes.find((l) => !excluidas.some((v) => mismaVariante(v, l)) || l.cantidad > excluidas.filter((v) => mismaVariante(v, l)).reduce((s, v) => s + v.cantidad, 0));
    return { localId: nuevoId(), cantidad: 1, color: libre?.color || '', colorSecundario: libre?.colorSecundario || '', comentario: '' };
  };
  const [versiones, setVersiones] = useState(() => (inicial?.length ? inicial.map((v) => ({ ...v })) : [filaNueva()]));
  const [error, setError] = useState('');
  const imagenes = p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []);
  const [imagenActual, setImagenActual] = useState(0);
  // Última fila de color tocada: su foto (si el producto tiene una asignada a ese color) pasa a ser la principal de la ficha.
  const [filaTocada, setFilaTocada] = useState(null);

  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  // Stock que queda de una variante para una fila: lo que hay menos lo que ya piden las otras filas.
  const disponiblePara = (fila, vs = versiones) => {
    const hay = stockDeVariante(p.stock, fila.color, fila.colorSecundario);
    const otras = vs.filter((v) => v.localId !== fila.localId && mismaVariante(v, fila)).reduce((s, v) => s + (v.cantidad || 0), 0);
    return Math.max(0, hay - otras);
  };
  // En la vista "En stock" no se puede pedir más de lo que hay.
  const acotar = (vs) => (soloStock ? vs.map((v) => ({ ...v, cantidad: Math.min(v.cantidad, disponiblePara(v, vs)) })) : vs);

  const cambiar = (id, campo, valor) => { if (campo === 'color' || campo === 'colorSecundario') setFilaTocada(id); return setVersiones((prev) => acotar(prev.map((v) => (v.localId === id
    ? { ...v, [campo]: campo === 'cantidad' ? Math.max(0, parseInt(valor, 10) || 0) : valor }
    : v)))); };
  const cambiarVariante = (id, variante) => { setFilaTocada(id); return setVersiones((prev) => acotar(prev.map((v) => (v.localId === id
    ? { ...v, color: variante?.color || '', colorSecundario: variante?.colorSecundario || '' }
    : v)))); };
  const filaFoto = versiones.find((v) => v.localId === filaTocada) || versiones[0];
  const claveFoto = `${filaFoto?.color || ''}|${filaFoto?.colorSecundario || ''}`;
  useEffect(() => {
    const url = fotoDeColor(p.fotosColor, filaFoto?.color, filaFoto?.colorSecundario);
    const i = url ? imagenes.indexOf(url) : -1;
    if (i >= 0) setImagenActual(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFoto]);

  const reparto = repartirConStock(p.stock, versiones);
  const deStock = reparto.reduce((s, v) => s + v.deStock, 0);
  const cantidad = reparto.reduce((s, v) => s + v.cantidad, 0);
  const aPedido = cantidad - deStock;
  const quedaStock = variantes.some((l) => l.cantidad > versiones.filter((v) => mismaVariante(v, l)).reduce((s, v) => s + v.cantidad, 0));

  const etiquetaColor = (nombre, sec) => {
    const hay = stockDeVariante(p.stock, nombre, sec);
    return `${nombre}${sec ? ` + ${sec}` : ''} · ${hay > 0 ? `${hay} en stock` : 'a pedido'}`;
  };

  const confirmar = () => {
    const validas = versiones.filter((v) => v.cantidad > 0);
    if (!validas.length) { setError('Poné al menos una unidad.'); return; }
    onConfirmar(validas);
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg2)', color: 'var(--text)', borderRadius: '16px', width: '100%', maxWidth: '860px', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0, padding: '16px' }}>
          <div
            onClick={() => imagenes.length && onAmpliar({ imagenes, nombre: p.nombre, index: imagenActual })}
            style={{ width: '100%', aspectRatio: '1 / 1', background: 'var(--bg3)', borderRadius: '12px', overflow: 'hidden', cursor: imagenes.length ? 'zoom-in' : 'default' }}
          >
            {imagenes[imagenActual] ? <img src={imagenes[imagenActual]} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          </div>
          {imagenes.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              {imagenes.map((src, i) => (
                <img key={i} src={src} alt="" onClick={() => setImagenActual(i)} style={{ width: '54px', height: '54px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', outline: i === imagenActual ? '2px solid var(--accent)' : 'none' }} />
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 0, padding: '16px 18px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.25 }}>{p.nombre}</div>
            <button className="btn btn-sm" style={{ borderRadius: '999px', width: '30px', height: '30px', padding: 0, justifyContent: 'center', flexShrink: 0 }} onClick={onCerrar} aria-label="Cerrar">✕</button>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)', margin: '6px 0' }}>{fmt(p.precio)}</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: total > 0 ? 'var(--accent)' : 'var(--text3)' }}>
            {total > 0 ? `${total} en stock · entrega inmediata` : 'A pedido: lo fabricamos para vos'}
          </div>
          {p.desc && <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '8px' }}>{p.desc}</div>}
          {p.descLarga && <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{p.descLarga}</div>}

          <div style={{ background: 'var(--bg3)', border: '1px dashed var(--border2)', borderRadius: '12px', padding: '12px', marginTop: '14px' }}>
            {versiones.map((v) => (
              <div key={v.localId} style={{ marginBottom: '8px' }}>
              {soloStock ? (
                // Vista "En stock": sólo se ofrecen las variantes que tienen stock.
                <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <input type="number" min="1" max={disponiblePara(v)} value={v.cantidad} onChange={(e) => cambiar(v.localId, 'cantidad', e.target.value)} />
                  <select
                    value={String(variantes.findIndex((l) => mismaVariante(l, v)))}
                    onChange={(e) => cambiarVariante(v.localId, variantes[parseInt(e.target.value, 10)])}
                  >
                    {variantes.map((l, i) => <option key={i} value={i}>{textoVariante(l)}</option>)}
                  </select>
                  {versiones.length > 1 && <button className="btn btn-danger btn-sm" onClick={() => setVersiones((prev) => prev.filter((x) => x.localId !== v.localId))}>✕</button>}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: p.modoColorSecundario === 'libre' ? '56px 1fr 1fr auto' : '56px 1fr auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <input type="number" min="0" value={v.cantidad} onChange={(e) => cambiar(v.localId, 'cantidad', e.target.value)} />
                  {p.modoColorSecundario === 'combinaciones' ? (
                    <select
                      value={(() => { const i = combinaciones.findIndex((c) => c.color === v.color && c.colorSecundario === v.colorSecundario); return i >= 0 ? String(i) : ''; })()}
                      onChange={(e) => cambiarVariante(v.localId, combinaciones[parseInt(e.target.value, 10)])}
                    >
                      <option value="">{stockDeVariante(p.stock, '', '') > 0 ? `Sin color · ${stockDeVariante(p.stock, '', '')} en stock` : 'Sin color'}</option>
                      {combinaciones.map((c, i) => combinacionPermitida(p, c.color, c.colorSecundario) && <option key={i} value={i}>{etiquetaColor(c.color, c.colorSecundario)}</option>)}
                    </select>
                  ) : (
                    <select value={v.color} onChange={(e) => cambiar(v.localId, 'color', e.target.value)}>
                      <option value="">{stockDeVariante(p.stock, '', v.colorSecundario) > 0 ? `Sin color · ${stockDeVariante(p.stock, '', v.colorSecundario)} en stock` : 'Sin color'}</option>
                      {colores.map((c, i) => colorPermitido(p, c.nombre) && <option key={i} value={c.nombre}>{etiquetaColor(c.nombre, '')}</option>)}
                    </select>
                  )}
                  {p.modoColorSecundario === 'libre' && (
                    <select value={v.colorSecundario || ''} onChange={(e) => cambiar(v.localId, 'colorSecundario', e.target.value)}>
                      <option value="">Sin combinar</option>
                      {coloresSecundarios.map((c, i) => <option key={i} value={c.nombre}>{c.nombre}</option>)}
                    </select>
                  )}
                  {versiones.length > 1 && <button className="btn btn-danger btn-sm" onClick={() => setVersiones((prev) => prev.filter((x) => x.localId !== v.localId))}>✕</button>}
                </div>
              )}
              {/* Comentario de cada variante (talle, versión, detalle): llega al pedido igual que en el catálogo común. */}
              <input
                type="text"
                maxLength={200}
                placeholder="Comentario (ej: talle, versión)"
                value={v.comentario || ''}
                onChange={(e) => cambiar(v.localId, 'comentario', e.target.value)}
                style={{ marginTop: '4px' }}
              />
              </div>
            ))}
            <button
              className="btn btn-sm"
              style={{ width: '100%' }}
              disabled={soloStock && !quedaStock}
              onClick={() => setVersiones((prev) => [...prev, soloStock ? filaNueva(prev) : { localId: nuevoId(), cantidad: 1, color: '', colorSecundario: '', comentario: '' }])}
            >
              + Otro color
            </button>
          </div>

          {cantidad > 0 && (
            <div style={{ fontSize: '12.5px', marginTop: '10px', color: 'var(--text2)' }}>
              {deStock > 0 && <div>✓ <strong>{deStock}</strong> en stock: se entregan al instante</div>}
              {aPedido > 0 && <div>🛠 <strong>{aPedido}</strong> a pedido: los fabricamos y te avisamos cuando estén</div>}
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '8px' }}>{error}</div>}
          <button className="btn btn-primary tienda-comprar" style={{ width: '100%', marginTop: '12px', justifyContent: 'center', borderRadius: '999px', padding: '11px 18px' }} onClick={confirmar}>
            {inicial?.length ? 'Actualizar mi pedido' : 'Agregar a mi pedido'} · {fmt(p.precio * cantidad)}
          </button>
        </div>
      </div>
    </div>
  );
}
