import React, { useEffect, useMemo, useState } from 'react';
import { db, functions } from '../firebase';
import { collection, doc, onSnapshot, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { obtenerPais, validarTelefono, formatearMoneda } from '../utils/paises';

const newLocalId = () => Date.now() + Math.random();

// Los campos de redes sociales se cargan en "Mi emprendimiento" como texto
// libre (ej. "facebook.com/mitienda" o "@mitienda"), no como URL completa
// -- estas funciones arman el link clickeable a partir de eso, aceptando
// tanto el formato sugerido como que alguien ya haya pegado la URL entera.
function urlFacebook(valor) {
  const v = (valor || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^@/, '')}`;
}

function urlInstagram(valor) {
  const v = (valor || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://instagram.com/${v.replace(/^@/, '')}`;
}

// La paleta del catálogo (elegida en CatalogoAdminPage, independiente de la
// paleta de la app) se guarda como 5 colores en catalogoConfig.paletaCatalogo.
// Como React sí deja poner variables CSS custom en un style inline, alcanza
// con setearlas en el div raíz de la página -- todo lo demás ya usa
// var(--bg)/var(--accent)/etc, así que las toman solas por herencia. Si
// todavía no se eligió ninguna, no se pisa nada y quedan los defaults de
// :root en index.css.
function estiloPaleta(config) {
  const p = config?.paletaCatalogo;
  if (!p) return {};
  const estilo = {};
  if (p.bg) { estilo['--bg'] = p.bg; estilo['--bg2'] = p.bg; }
  if (p.bg3) estilo['--bg3'] = p.bg3;
  if (p.accent) estilo['--accent'] = p.accent;
  if (p.accent2) estilo['--accent2'] = p.accent2;
  if (p.text) estilo['--text'] = p.text;
  return estilo;
}

// Mobile-first por defecto (así se comparte por WhatsApp y se abre en el
// celular la mayoría de las veces), con un breakpoint de escritorio: el
// contenido se ensancha, los productos de cada categoría pasan a 2
// columnas, y el carrito deja de ser una hoja que sube desde abajo para
// convertirse en un panel fijo a la derecha (más cómodo con mouse).
// Uso !important en los overrides porque los elementos ya tienen estilos
// inline (que si no, ganan siempre por especificidad sobre esta hoja).
const ESTILOS_RESPONSIVE = `
  @media (min-width: 860px) {
    .catalogo-header-inner { max-width: 900px !important; margin: 0 auto !important; padding: 18px 24px !important; }
    .catalogo-content { max-width: 900px !important; padding: 20px 24px !important; }
    .catalogo-productos-grid { display: grid !important; grid-template-columns: 1fr 1fr; column-gap: 20px; }
    .catalogo-producto-item { border-top: none !important; border-bottom: 1px solid var(--border); padding: 14px 4px !important; }
    .catalogo-producto-item:nth-last-child(-n+2) { border-bottom: none; }
    .catalogo-cart-bar { max-width: 900px !important; left: 50% !important; right: auto !important; transform: translateX(-50%); border-radius: 12px 12px 0 0; bottom: 0 !important; }
    .catalogo-cart-overlay { align-items: stretch !important; justify-content: flex-end !important; }
    .catalogo-cart-panel { max-width: 420px !important; width: 420px !important; height: 100vh !important; max-height: 100vh !important; border-radius: 0 !important; }
  }
`;

export default function CatalogoPublico() {
  // El catálogo es por tienda: la URL es /catalogo/{uid}, y todo lo que
  // se lee/escribe acá cuelga de catalogoTiendas/{uid}/... — así el
  // catálogo de una tienda nunca se mezcla con el de otra (antes vivía en
  // colecciones compartidas y cualquier cuenta logueada podía pisarlas).
  const uidTienda = useMemo(() => {
    const partes = window.location.pathname.split('/').filter(Boolean); // ['catalogo', '{uid}']
    return partes[1] || null;
  }, []);

  const [config, setConfig] = useState(undefined); // undefined = cargando, null = no existe

  // País de la tienda (moneda + formato de teléfono): se espeja en
  // catalogoTiendas/{uid} cuando el dueño lo elige en EmpresaPage (ver
  // AppContext), con fallback a Argentina si la tienda nunca lo seteó.
  const pais = obtenerPais(config?.pais);
  const fmt = (n) => formatearMoneda(n, pais.id);
  const [productos, setProductos] = useState([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [catAbierta, setCatAbierta] = useState(null);
  const [carrito, setCarrito] = useState([]); // { localId, prodId, nombre, precio, versiones:[{localId,cantidad,color,comentario}] }
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(null); // { docId, payload } una vez enviado
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [comentarioGeneral, setComentarioGeneral] = useState('');

  // Imagen ampliada (lightbox). Guarda { src, nombre } o null si está cerrado.
  const [imagenAmpliada, setImagenAmpliada] = useState(null);

  // Panel de detalle por producto: se abre al tocar "Agregar"/"Editar" y
  // recién agrega/actualiza el carrito cuando el cliente toca "Confirmar".
  // Tocar Agregar ya NO suma nada solo; hasta ahí es sólo un borrador.
  const [detalleAbierto, setDetalleAbierto] = useState(null); // prodId o null
  const [draftVersiones, setDraftVersiones] = useState([]);

  // Config pública (colores, nombre, activo/inactivo) de esta tienda -- en
  // vivo (no getDoc de una sola vez), así un cambio de paleta/nombre/logo
  // que haga el dueño se ve solo, sin que el visitante tenga que recargar
  // la página que ya tiene abierta.
  useEffect(() => {
    if (!uidTienda) { setConfig(null); return; }
    const unsub = onSnapshot(
      doc(db, 'catalogoTiendas', uidTienda),
      (snap) => setConfig(snap.exists() ? snap.data() : null),
      () => setConfig(null)
    );
    return () => unsub();
  }, [uidTienda]);

  // Cuenta esta visita para el límite de "aperturas de catálogo" del plan
  // de la tienda dueña. Va por una Cloud Function porque un visitante sin
  // login no tiene permiso de escritura sobre los contadores de otra
  // cuenta (ver firestore.rules). No afecta la carga del catálogo si
  // falla: sólo se registra silenciosamente en la consola.
  useEffect(() => {
    if (!uidTienda) return;
    const registrarApertura = httpsCallable(functions, 'registrarAperturaCatalogo');
    registrarApertura({ uidTienda }).catch((err) => {
      console.warn('No se pudo registrar la apertura del catálogo:', err);
    });
  }, [uidTienda]);

  // El <title> que ve un bot de preview (WhatsApp, etc.) lo arma
  // api/catalogo-meta.js del lado del servidor; esto es sólo para que la
  // pestaña del navegador también muestre el nombre real mientras se
  // navega la SPA, en vez de quedarse con "Manager3D · Catálogo".
  useEffect(() => {
    if (config?.empresaNombre) {
      document.title = `${config.empresaNombre} · Catálogo`;
    }
  }, [config]);

  // Productos publicados de esta tienda, en vivo (si el dueño agrega/saca
  // algo mientras el cliente está mirando el catálogo, se actualiza solo).
  useEffect(() => {
    if (!uidTienda) { setCargandoProductos(false); return; }
    const unsub = onSnapshot(
      collection(db, 'catalogoTiendas', uidTienda, 'productos'),
      (snap) => {
        setProductos(snap.docs.map(d => d.data()));
        setCargandoProductos(false);
      },
      () => setCargandoProductos(false)
    );
    return () => unsub();
  }, [uidTienda]);

  const categorias = useMemo(() => {
    const set = new Set(productos.map(p => p.cat || 'Otros'));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [productos]);

  // Abre la primera categoría automáticamente la primera vez que llegan
  // los productos, para que el cliente no tenga que tocar nada para ver algo.
  useEffect(() => {
    if (catAbierta === null && categorias.length > 0) {
      setCatAbierta(categorias[0]);
    }
  }, [categorias, catAbierta]);

  const colores = config?.colores || [];

  const totalCarrito = carrito.reduce((s, it) => s + it.precio * it.versiones.reduce((a, v) => a + (v.cantidad || 0), 0), 0);
  const cantidadCarrito = carrito.reduce((s, it) => s + it.versiones.reduce((a, v) => a + (v.cantidad || 0), 0), 0);

  // ---- Panel de detalle (borrador previo a confirmar) ----

  const abrirDetalle = (p) => {
    const enCarrito = carrito.find(it => it.prodId === p.id);
    setDraftVersiones(
      enCarrito
        ? enCarrito.versiones.map(v => ({ ...v }))
        : [{ localId: newLocalId(), cantidad: 1, color: '', comentario: '' }]
    );
    setDetalleAbierto(p.id);
  };

  const cerrarDetalle = () => {
    setDetalleAbierto(null);
    setDraftVersiones([]);
  };

  const actualizarDraftVersion = (versionLocalId, campo, valor) => {
    setDraftVersiones(prev => prev.map(v => v.localId === versionLocalId
      ? { ...v, [campo]: campo === 'cantidad' ? Math.max(0, parseInt(valor) || 0) : valor }
      : v));
  };

  const agregarDraftVersion = () => {
    setDraftVersiones(prev => [...prev, { localId: newLocalId(), cantidad: 1, color: '', comentario: '' }]);
  };

  const quitarDraftVersion = (versionLocalId) => {
    setDraftVersiones(prev => prev.filter(v => v.localId !== versionLocalId));
  };

  const confirmarAgregado = (p) => {
    const versionesValidas = draftVersiones.filter(v => v.cantidad > 0);
    if (!versionesValidas.length) {
      alert('Poné al menos una cantidad mayor a 0 antes de confirmar.');
      return;
    }

    setCarrito(prev => {
      const existe = prev.some(it => it.prodId === p.id);
      if (existe) {
        return prev.map(it => it.prodId === p.id ? { ...it, versiones: versionesValidas } : it);
      }
      return [...prev, {
        localId: newLocalId(),
        prodId: p.id,
        nombre: p.nombre,
        precio: p.precio || 0,
        versiones: versionesValidas
      }];
    });

    cerrarDetalle();
  };

  const quitarProducto = (prodId) => {
    setCarrito(prev => prev.filter(it => it.prodId !== prodId));
    if (detalleAbierto === prodId) cerrarDetalle();
  };

  const editarDesdeCarrito = (prodId) => {
    const p = productos.find(pr => pr.id === prodId);
    if (!p) return;
    setCarritoAbierto(false);
    setCatAbierta(p.cat || 'Otros');
    abrirDetalle(p);
  };

  const handleEnviar = async () => {
    if (!cliente.trim()) {
      alert('Contanos tu nombre para poder armar el pedido.');
      return;
    }
    if (!telefono.trim()) {
      alert('Dejanos un teléfono de contacto para poder coordinar el pedido.');
      return;
    }
    if (!validarTelefono(telefono, pais.id)) {
      alert(pais.mensajeTelefono);
      return;
    }
    if (!carrito.length || cantidadCarrito === 0) {
      alert('Agregá al menos un producto con cantidad mayor a 0.');
      return;
    }

    setEnviando(true);
    try {
      const items = carrito
        .map(it => ({
          prodId: it.prodId,
          nombre: it.nombre,
          precioUnit: it.precio,
          cantidad: it.versiones.reduce((a, v) => a + (v.cantidad || 0), 0),
          versiones: it.versiones.filter(v => v.cantidad > 0).map(v => ({
            cantidad: v.cantidad,
            color: v.color || '',
            comentario: v.comentario || ''
          }))
        }))
        .filter(it => it.cantidad > 0);

      const payload = {
        cliente: cliente.trim(),
        telefono: telefono.trim(),
        email: email.trim(),
        comentarioGeneral: comentarioGeneral.trim(),
        items,
        totalEstimado: totalCarrito,
        estado: 'pendiente',
        creado: new Date().toISOString()
      };

      const ref = await addDoc(collection(db, 'catalogoTiendas', uidTienda, 'solicitudes'), payload);
      setEnviado({ docId: ref.id, payload });
    } catch (e) {
      console.error('Error al enviar el pedido:', e);
      alert('No se pudo enviar el pedido. Probá de nuevo en un momento.');
    } finally {
      setEnviando(false);
    }
  };

  // ---- Pantallas de estado ----

  if (!uidTienda) {
    return (
      <EstadoCentrado>
        Este link de catálogo está incompleto.
        <br />Pedile al vendedor que te pase el link completo.
      </EstadoCentrado>
    );
  }

  if (config === undefined || cargandoProductos) {
    return <EstadoCentrado>Cargando catálogo…</EstadoCentrado>;
  }

  if (!config || !config.activo) {
    return (
      <EstadoCentrado paleta={estiloPaleta(config)}>
        Este catálogo no está disponible en este momento.
        <br />Volvé a intentar más tarde.
      </EstadoCentrado>
    );
  }

  if (enviado) {
    const { payload } = enviado;
    const waTexto = `Hola! Te acabo de mandar un pedido desde el catálogo (${payload.cliente}). Total estimado: ${fmt(payload.totalEstimado)}.`;
    const waLink = config.telefono
      ? `https://wa.me/${config.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(waTexto)}`
      : null;

    return (
      <EstadoCentrado paleta={estiloPaleta(config)}>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>✓</div>
        <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>¡Pedido enviado!</div>
        <div style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '18px' }}>
          {config.empresaNombre || 'Te'} va a revisar tu pedido y te contacta a la brevedad.
        </div>

        {waLink && (
          <a className="btn btn-primary" href={waLink} target="_blank" rel="noreferrer">
            Avisar por WhatsApp
          </a>
        )}
      </EstadoCentrado>
    );
  }

  return (
    <div style={{ ...estiloPaleta(config), minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: carrito.length ? '76px' : '0' }}>
      <style>{ESTILOS_RESPONSIVE}</style>

      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)',
        borderBottom: '1px solid var(--border)', padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: '10px'
      }} className="catalogo-header-inner">
        {config.logo && (
          <img src={config.logo} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '6px' }} />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{config.empresaNombre || 'Catálogo'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Elegí tus productos y armá tu pedido</div>
        </div>
        {(urlFacebook(config.facebook) || urlInstagram(config.instagram) || config.telefono) && (
          <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
            {config.telefono && (
              <a
                href={`https://wa.me/${config.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Te escribo desde el catálogo de ${config.empresaNombre || 'tu tienda'}.`)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                style={{ color: 'var(--text3)', display: 'flex' }}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '20px', height: '20px' }}>
                  <path d="M10 2.5a7.5 7.5 0 0 0-6.4 11.4L2.5 17.5l3.75-1.05A7.5 7.5 0 1 0 10 2.5z" strokeLinejoin="round" />
                  <path d="M7.2 6.8c.15-.35.3-.35.45-.35h.35c.15 0 .3 0 .45.35.2.45.6 1.5.65 1.6.05.1.1.25 0 .4-.1.15-.15.25-.3.4l-.35.4c-.1.1-.2.2-.1.4.15.3.6 1 1.3 1.6.9.8 1.6 1.05 1.85 1.15.2.1.3.05.4-.05l.5-.55c.15-.15.3-.2.5-.1.2.05 1.25.6 1.45.7.2.1.35.15.4.25.05.15.05.6-.15 1.15-.2.55-1.15 1.05-1.6 1.1-.45.05-.9.25-2.95-.65-2.5-1.1-4.05-3.7-4.15-3.9-.1-.15-.85-1.15-.85-2.15 0-1.05.55-1.5.75-1.7z" fill="currentColor" stroke="none" />
                </svg>
              </a>
            )}
            {urlFacebook(config.facebook) && (
              <a href={urlFacebook(config.facebook)} target="_blank" rel="noreferrer" aria-label="Facebook" style={{ color: 'var(--text3)', display: 'flex' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '20px', height: '20px' }}>
                  <path d="M12.5 6h-1.25A1.75 1.75 0 0 0 9.5 7.75V10H12l-.35 2.5H9.5V18h-2.5v-5.5H5V10h2v-2A3.5 3.5 0 0 1 10.5 4.5H12.5V6z" strokeLinejoin="round" />
                </svg>
              </a>
            )}
            {urlInstagram(config.instagram) && (
              <a href={urlInstagram(config.instagram)} target="_blank" rel="noreferrer" aria-label="Instagram" style={{ color: 'var(--text3)', display: 'flex' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '20px', height: '20px' }}>
                  <rect x="2.5" y="2.5" width="15" height="15" rx="4" />
                  <circle cx="10" cy="10" r="3.3" />
                  <circle cx="14.2" cy="5.8" r="0.7" fill="currentColor" stroke="none" />
                </svg>
              </a>
            )}
          </div>
        )}
      </header>

      <div className="catalogo-content" style={{ maxWidth: '640px', margin: '0 auto', padding: '12px' }}>
        {!productos.length && (
          <div className="empty" style={{ marginTop: '20px' }}>Todavía no hay productos publicados.</div>
        )}

        {categorias.map(cat => {
          const items = productos.filter(p => (p.cat || 'Otros') === cat);
          return (
            <div key={cat} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => setCatAbierta(catAbierta === cat ? null : cat)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--text)', fontSize: '13px', fontWeight: 600
                }}
              >
                {cat} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{items.length} · {catAbierta === cat ? '−' : '+'}</span>
              </button>

              {catAbierta === cat && (
                <div className="catalogo-productos-grid" style={{ padding: '0 12px 12px' }}>
                  {items.map(p => {
                    const enCarrito = carrito.find(it => it.prodId === p.id);
                    const cantEnCarrito = enCarrito ? enCarrito.versiones.reduce((s, v) => s + (v.cantidad || 0), 0) : 0;
                    const detalleEstaAbierto = detalleAbierto === p.id;

                    return (
                      <div key={p.id} className="catalogo-producto-item" style={{ padding: '10px 4px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          {p.imagen ? (
                            <img
                              src={p.imagen}
                              alt={p.nombre}
                              onClick={() => setImagenAmpliada({ src: p.imagen, nombre: p.nombre })}
                              style={{ width: '56px', height: '56px', objectFit: 'contain', background: 'var(--bg3)', borderRadius: '8px', flexShrink: 0, cursor: 'zoom-in' }}
                            />
                          ) : (
                            <div style={{ width: '56px', height: '56px', background: 'var(--bg3)', borderRadius: '8px', flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{p.nombre}</div>
                            {p.desc && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{p.desc}</div>}
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginTop: '4px', fontFamily: 'var(--mono)' }}>{fmt(p.precio)}</div>
                          </div>
                          <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                            {detalleEstaAbierto ? (
                              <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={cerrarDetalle}>Cerrar</button>
                            ) : enCarrito ? (
                              <button className="btn btn-sm" onClick={() => abrirDetalle(p)}>Editar ({cantEnCarrito})</button>
                            ) : (
                              <button className="btn btn-primary btn-sm" onClick={() => abrirDetalle(p)}>Agregar</button>
                            )}
                          </div>
                        </div>

                        {detalleEstaAbierto && (
                          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px dashed var(--border2)', borderRadius: '8px', padding: '10px', marginTop: '10px' }}>
                            {draftVersiones.map(v => (
                              <div key={v.localId} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                                <input
                                  type="number" min="0" value={v.cantidad}
                                  onChange={(e) => actualizarDraftVersion(v.localId, 'cantidad', e.target.value)}
                                />
                                <select value={v.color} onChange={(e) => actualizarDraftVersion(v.localId, 'color', e.target.value)}>
                                  <option value="">Sin color</option>
                                  {colores.map((c, ci) => <option key={ci} value={c.nombre}>{c.nombre}</option>)}
                                </select>
                                <input
                                  type="text" placeholder="Comentario (ej: talle, versión)"
                                  value={v.comentario}
                                  onChange={(e) => actualizarDraftVersion(v.localId, 'comentario', e.target.value)}
                                />
                                {draftVersiones.length > 1 && (
                                  <button className="btn btn-danger btn-sm" onClick={() => quitarDraftVersion(v.localId)}>✕</button>
                                )}
                              </div>
                            ))}
                            <button className="btn btn-sm" style={{ width: '100%', marginTop: '2px' }} onClick={agregarDraftVersion}>
                              + Otra variante (otro color / comentario)
                            </button>
                            <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: '8px' }} onClick={() => confirmarAgregado(p)}>
                              Confirmar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {carrito.length > 0 && !carritoAbierto && (
        <div
          onClick={() => setCarritoAbierto(true)}
          className="catalogo-cart-bar"
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--accent)', color: '#0a1a12',
            padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontWeight: 700, fontSize: '13px', cursor: 'pointer', zIndex: 20
          }}
        >
          <span>{cantidadCarrito} {cantidadCarrito === 1 ? 'producto' : 'productos'} en tu pedido</span>
          <span>{fmt(totalCarrito)} · Ver pedido →</span>
        </div>
      )}

      {carritoAbierto && (
        <div
          onClick={() => setCarritoAbierto(false)}
          className="catalogo-cart-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="catalogo-cart-panel"
            style={{
              background: 'var(--bg2)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
              width: '100%', maxWidth: '640px', maxHeight: '88vh', overflowY: 'auto', padding: '18px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>Tu pedido</div>
              <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setCarritoAbierto(false)}>✕</button>
            </div>

            {!carrito.length ? (
              <div className="empty">Todavía no agregaste productos.</div>
            ) : (
              carrito.map(it => {
                const asignado = it.versiones.reduce((s, v) => s + (v.cantidad || 0), 0);
                return (
                  <div key={it.prodId} className="card" style={{ marginBottom: '10px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{it.nombre}</div>
                        {it.versiones.map(v => (
                          <div key={v.localId} style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                            {v.cantidad}× {v.color || 'sin color'}{v.comentario ? ` — ${v.comentario}` : ''}
                          </div>
                        ))}
                        <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', marginTop: '6px', color: 'var(--text2)' }}>
                          {asignado} × {fmt(it.precio)} = <strong style={{ color: 'var(--text)' }}>{fmt(asignado * it.precio)}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                        <button className="btn btn-sm" onClick={() => editarDesdeCarrito(it.prodId)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => quitarProducto(it.prodId)}>Quitar</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {carrito.length > 0 && (
              <>
                <div className="sep"></div>
                <label className="fl" style={{ marginTop: 0 }}>Tu nombre *</label>
                <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre y apellido" />

                <label className="fl">Teléfono / WhatsApp *</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={pais.longitudTelefono}
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, pais.longitudTelefono))}
                  placeholder={pais.mensajeTelefono}
                />

                <label className="fl">Email (opcional)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />

                <label className="fl">Comentario general (opcional)</label>
                <input type="text" value={comentarioGeneral} onChange={(e) => setComentarioGeneral(e.target.value)} placeholder="Ej: lo necesito para el viernes" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text3)' }}>Total estimado</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(totalCarrito)}</span>
                </div>

                <button className="btn btn-primary" style={{ width: '100%' }} disabled={enviando} onClick={handleEnviar}>
                  {enviando ? 'Enviando…' : 'Enviar pedido'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {imagenAmpliada && (
        <div
          onClick={() => setImagenAmpliada(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', cursor: 'zoom-out'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <img
              src={imagenAmpliada.src}
              alt={imagenAmpliada.nombre}
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px', background: 'var(--bg2)' }}
            />
            <div style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '10px' }}>{imagenAmpliada.nombre}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function EstadoCentrado({ children, paleta }) {
  return (
    <div style={{ ...paleta, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px', color: 'var(--text2)', background: 'var(--bg)' }}>
      <div>{children}</div>
    </div>
  );
}
