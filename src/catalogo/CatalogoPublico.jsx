import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, getDoc, onSnapshot, addDoc } from 'firebase/firestore';

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const newLocalId = () => Date.now() + Math.random();

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
  const [config, setConfig] = useState(undefined); // undefined = cargando, null = no existe
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

  // Config pública (colores, nombre, activo/inactivo)
  useEffect(() => {
    getDoc(doc(db, 'catalogoConfig', 'meta'))
      .then(snap => setConfig(snap.exists() ? snap.data() : null))
      .catch(() => setConfig(null));
  }, []);

  // Productos publicados, en vivo (si el dueño agrega/saca algo mientras
  // el cliente está mirando el catálogo, se actualiza solo).
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'catalogoProductos'),
      (snap) => {
        setProductos(snap.docs.map(d => d.data()));
        setCargandoProductos(false);
      },
      () => setCargandoProductos(false)
    );
    return () => unsub();
  }, []);

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

      const ref = await addDoc(collection(db, 'catalogoSolicitudes'), payload);
      setEnviado({ docId: ref.id, payload });
    } catch (e) {
      console.error('Error al enviar el pedido:', e);
      alert('No se pudo enviar el pedido. Probá de nuevo en un momento.');
    } finally {
      setEnviando(false);
    }
  };

  // ---- Pantallas de estado ----

  if (config === undefined || cargandoProductos) {
    return <EstadoCentrado>Cargando catálogo…</EstadoCentrado>;
  }

  if (!config || !config.activo) {
    return (
      <EstadoCentrado>
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

    // Constancia por mail: arma un mailto: con el detalle del pedido para
    // que el cliente se lo mande a sí mismo (o a quien quiera) y le quede
    // guardado. No hay backend de envío de mails, así que esto abre el
    // cliente de correo del cliente con todo precargado — mismo criterio
    // que ya se usa acá con los links de wa.me.
    const cuerpoMail = [
      `Pedido a ${config.empresaNombre || ''}`,
      `Cliente: ${payload.cliente}`,
      payload.telefono ? `Teléfono: ${payload.telefono}` : null,
      '',
      ...payload.items.map(it => {
        const lineas = [`${it.cantidad}x ${it.nombre} — ${fmt(it.precioUnit)} c/u`];
        (it.versiones || []).forEach(v => {
          lineas.push(`   - ${v.cantidad}x ${v.color || 'sin color'}${v.comentario ? ` (${v.comentario})` : ''}`);
        });
        return lineas.join('\n');
      }),
      '',
      payload.comentarioGeneral ? `Comentario: ${payload.comentarioGeneral}` : null,
      `Total estimado: ${fmt(payload.totalEstimado)}`
    ].filter(Boolean).join('\n');

    const mailLink = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Constancia de tu pedido${config.empresaNombre ? ' - ' + config.empresaNombre : ''}`)}&body=${encodeURIComponent(cuerpoMail)}`;

    return (
      <EstadoCentrado>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>✓</div>
        <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>¡Pedido enviado!</div>
        <div style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '18px' }}>
          {config.empresaNombre || 'Te'} va a revisar tu pedido y te contacta a la brevedad.
        </div>

        {waLink && (
          <a className="btn btn-primary" href={waLink} target="_blank" rel="noreferrer" style={{ marginBottom: '18px' }}>
            Avisar por WhatsApp
          </a>
        )}

        <div className="card" style={{ textAlign: 'left', maxWidth: '320px', margin: '0 auto' }}>
          <label className="fl" style={{ marginTop: 0 }}>Mandarme una constancia por mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
          />
          <a
            className="btn btn-sm"
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px', opacity: email.trim() ? 1 : 0.5, pointerEvents: email.trim() ? 'auto' : 'none' }}
            href={mailLink}
          >
            Abrir mail con el detalle
          </a>
        </div>
      </EstadoCentrado>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: carrito.length ? '76px' : '0' }}>
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
                <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Tu número de teléfono" />

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

function EstadoCentrado({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px', color: 'var(--text2)' }}>
      <div>{children}</div>
    </div>
  );
}
