import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, getDoc, onSnapshot, addDoc } from 'firebase/firestore';

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const newLocalId = () => Date.now() + Math.random();

export default function CatalogoPublico() {
  const [config, setConfig] = useState(undefined); // undefined = cargando, null = no existe
  const [productos, setProductos] = useState([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [catAbierta, setCatAbierta] = useState(null);
  const [carrito, setCarrito] = useState([]); // { localId, prodId, nombre, precio, versiones:[{localId,cantidad,color,comentario}] }
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(null); // { docId } una vez enviado
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [comentarioGeneral, setComentarioGeneral] = useState('');

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

  const agregarProducto = (p) => {
    setCarrito(prev => {
      if (prev.some(it => it.prodId === p.id)) return prev; // ya está, se edita desde el carrito
      return [...prev, {
        localId: newLocalId(),
        prodId: p.id,
        nombre: p.nombre,
        precio: p.precio || 0,
        versiones: [{ localId: newLocalId(), cantidad: 1, color: '', comentario: '' }]
      }];
    });
    setCarritoAbierto(true);
  };

  const quitarProducto = (prodId) => {
    setCarrito(prev => prev.filter(it => it.prodId !== prodId));
  };

  const actualizarVersion = (prodId, versionLocalId, campo, valor) => {
    setCarrito(prev => prev.map(it => {
      if (it.prodId !== prodId) return it;
      return {
        ...it,
        versiones: it.versiones.map(v => v.localId === versionLocalId
          ? { ...v, [campo]: campo === 'cantidad' ? Math.max(0, parseInt(valor) || 0) : valor }
          : v)
      };
    }));
  };

  const agregarVersion = (prodId) => {
    setCarrito(prev => prev.map(it => it.prodId === prodId
      ? { ...it, versiones: [...it.versiones, { localId: newLocalId(), cantidad: 1, color: '', comentario: '' }] }
      : it));
  };

  const quitarVersion = (prodId, versionLocalId) => {
    setCarrito(prev => prev.map(it => {
      if (it.prodId !== prodId) return it;
      const versiones = it.versiones.filter(v => v.localId !== versionLocalId);
      return { ...it, versiones };
    }).filter(it => it.versiones.length > 0));
  };

  const handleEnviar = async () => {
    if (!cliente.trim()) {
      alert('Contanos tu nombre para poder armar el pedido.');
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
    const waTexto = `Hola! Te acabo de mandar un pedido desde el catálogo (${cliente}). Total estimado: ${fmt(totalCarrito)}.`;
    const waLink = config.telefono
      ? `https://wa.me/${config.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(waTexto)}`
      : null;

    return (
      <EstadoCentrado>
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
    <div style={{ minHeight: '100vh', paddingBottom: carrito.length ? '76px' : '0' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)',
        borderBottom: '1px solid var(--border)', padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: '10px'
      }}>
        {config.logo && (
          <img src={config.logo} alt="" style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '6px' }} />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{config.empresaNombre || 'Catálogo'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Elegí tus productos y armá tu pedido</div>
        </div>
      </header>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '12px' }}>
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
                <div style={{ padding: '0 12px 12px' }}>
                  {items.map(p => {
                    const enCarrito = carrito.find(it => it.prodId === p.id);
                    return (
                      <div key={p.id} style={{ display: 'flex', gap: '10px', padding: '10px 4px', borderTop: '1px solid var(--border)' }}>
                        {p.imagen ? (
                          <img src={p.imagen} alt={p.nombre} style={{ width: '56px', height: '56px', objectFit: 'contain', background: 'var(--bg3)', borderRadius: '8px', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: '56px', height: '56px', background: 'var(--bg3)', borderRadius: '8px', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{p.nombre}</div>
                          {p.desc && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{p.desc}</div>}
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginTop: '4px', fontFamily: 'var(--mono)' }}>{fmt(p.precio)}</div>
                        </div>
                        <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                          {enCarrito ? (
                            <button className="btn btn-sm" onClick={() => setCarritoAbierto(true)}>Editar</button>
                          ) : (
                            <button className="btn btn-primary btn-sm" onClick={() => agregarProducto(p)}>Agregar</button>
                          )}
                        </div>
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg2)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
              width: '100%', maxWidth: '640px', maxHeight: '88vh', overflowY: 'auto', padding: '18px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>Tu pedido</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setCarritoAbierto(false)}>✕</button>
            </div>

            {!carrito.length ? (
              <div className="empty">Todavía no agregaste productos.</div>
            ) : (
              carrito.map(it => {
                const asignado = it.versiones.reduce((s, v) => s + (v.cantidad || 0), 0);
                return (
                  <div key={it.prodId} className="card" style={{ marginBottom: '10px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{it.nombre}</div>
                      <button className="btn btn-ghost btn-sm" onClick={() => quitarProducto(it.prodId)}>✕</button>
                    </div>

                    {it.versiones.map(v => (
                      <div key={v.localId} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                        <input
                          type="number" min="0" value={v.cantidad}
                          onChange={(e) => actualizarVersion(it.prodId, v.localId, 'cantidad', e.target.value)}
                        />
                        <select value={v.color} onChange={(e) => actualizarVersion(it.prodId, v.localId, 'color', e.target.value)}>
                          <option value="">Sin color</option>
                          {colores.map((c, ci) => <option key={ci} value={c.nombre}>{c.nombre}</option>)}
                        </select>
                        <input
                          type="text" placeholder="Comentario (ej: talle, versión)"
                          value={v.comentario}
                          onChange={(e) => actualizarVersion(it.prodId, v.localId, 'comentario', e.target.value)}
                        />
                        <button className="btn btn-danger btn-sm" onClick={() => quitarVersion(it.prodId, v.localId)}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-sm" style={{ width: '100%', marginTop: '2px' }} onClick={() => agregarVersion(it.prodId)}>
                      + Otra variante (otro color / comentario)
                    </button>
                    <div style={{ textAlign: 'right', marginTop: '6px', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text3)' }}>
                      {asignado} × {fmt(it.precio)} = <strong style={{ color: 'var(--text)' }}>{fmt(asignado * it.precio)}</strong>
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

                <label className="fl">Teléfono / WhatsApp (opcional)</label>
                <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Para coordinar el pedido" />

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
