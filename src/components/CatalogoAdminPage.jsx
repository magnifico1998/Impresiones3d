import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ordenarCategorias } from '../utils/categoriaOrden';
import { paletas, paletasList } from '../utils/paletas';

// Los mismos 5 roles editables que "Paleta personalizada" en Configuración
// (ver ConfiguracionPage.jsx), pero acá para el catálogo web público -- se
// guardan aparte (catalogoConfig.paletaCatalogo) porque el catálogo NO
// tiene por qué compartir la paleta de la app: son públicos que ni
// siquiera tienen cuenta acá, el criterio de marca puede ser otro.
const ROLES_PALETA_CATALOGO = ['bg', 'accent', 'accent2', 'text', 'bg3'];

const CATALOGO_PATH = '/catalogo';

export default function CatalogoAdminPage() {
  const {
    biblioteca,
    cfg,
    cuentaId,
    catalogoConfig,
    guardarCatalogoConfig,
    publicarProductosEnCatalogo,
    solicitudesWeb,
    importarSolicitudComoPedido,
    descartarSolicitud,
    pedidos,
    showToast,
    fmt
  } = useApp();

  // Selección de productos a publicar: arranca con lo que ya está marcado
  // como pub:true en biblioteca (fuente de verdad hasta que se guarde).
  const [seleccionados, setSeleccionados] = useState(
    () => new Set(biblioteca.filter(p => p.pub).map(p => p.id))
  );
  // La selección se re-sincroniza con biblioteca mientras el usuario no
  // haya tocado ningún checkbox. Sin esto, si esta pestaña se montaba
  // antes de que el listener de biblioteca terminara de cargar, la
  // selección quedaba congelada en vacío — y un clic en "Guardar cambios"
  // despublicaba el catálogo entero sin que el usuario hubiera desmarcado
  // nada. Una vez que el usuario empieza a marcar/desmarcar, dejamos de
  // pisar su selección; al publicar con éxito se vuelve a seguir el
  // estado real de la nube.
  const seleccionTocadaRef = useRef(false);
  useEffect(() => {
    if (seleccionTocadaRef.current) return;
    setSeleccionados(new Set(biblioteca.filter(p => p.pub).map(p => p.id)));
  }, [biblioteca]);
  const [guardando, setGuardando] = useState(false);
  const [importandoId, setImportandoId] = useState(null);

  // Categorías colapsadas por defecto: con muchos productos, mostrar todo
  // expandido de entrada hace una lista interminable. Se abren a demanda.
  const [catsExpandidas, setCatsExpandidas] = useState(() => new Set());

  const uniqueCats = useMemo(
    () => ordenarCategorias(
      Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))),
      cfg?.categoriaOrden
    ),
    [biblioteca, cfg?.categoriaOrden]
  );

  const toggleProducto = (id) => {
    seleccionTocadaRef.current = true;
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCategoriaExpandida = (cat) => {
    setCatsExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Selección masiva: todo el catálogo de un saque, o sólo una categoría.
  const todosSeleccionados = biblioteca.length > 0 && seleccionados.size === biblioteca.length;

  const toggleSeleccionarTodoCatalogo = () => {
    seleccionTocadaRef.current = true;
    setSeleccionados(todosSeleccionados ? new Set() : new Set(biblioteca.map(p => p.id)));
  };

  const idsDeCategoria = (cat) => biblioteca.filter(p => p.cat === cat).map(p => p.id);
  const categoriaCompleta = (cat) => idsDeCategoria(cat).every(id => seleccionados.has(id));

  const toggleSeleccionarCategoria = (cat) => {
    seleccionTocadaRef.current = true;
    const ids = idsDeCategoria(cat);
    const completa = ids.every(id => seleccionados.has(id));
    setSeleccionados(prev => {
      const next = new Set(prev);
      ids.forEach(id => completa ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const handlePublicar = async () => {
    setGuardando(true);
    const ok = await publicarProductosEnCatalogo(seleccionados);
    // Publicado con éxito: la selección vuelve a seguir el estado real de
    // los flags pub (que el listener de biblioteca va a reflejar enseguida).
    // Si falló, se mantiene lo elegido para que el usuario pueda reintentar.
    if (ok) seleccionTocadaRef.current = false;
    setGuardando(false);
  };

  const activo = catalogoConfig?.activo ?? false;

  const handleToggleActivo = () => {
    guardarCatalogoConfig({ activo: !activo });
  };

  // Paleta del catálogo: arranca (si nunca se tocó) desde 'lagoon', el
  // mismo default de la app -- pero es completamente independiente de la
  // paleta que use el dueño en su propia app.
  const paletaCatalogoActual = (key) => catalogoConfig?.paletaCatalogo?.[key] ?? paletas.lagoon[key];

  const handleElegirPaletaCatalogo = (paletteId) => {
    const base = paletas[paletteId];
    guardarCatalogoConfig({
      paletaCatalogo: Object.fromEntries(ROLES_PALETA_CATALOGO.map(k => [k, base[k]]))
    });
  };

  const handleColorCatalogoChange = (role, hex) => {
    const actual = Object.fromEntries(ROLES_PALETA_CATALOGO.map(k => [k, paletaCatalogoActual(k)]));
    guardarCatalogoConfig({ paletaCatalogo: { ...actual, [role]: hex } });
  };

  // El catálogo es por cuenta: la URL lleva el uid del dueño (cuentaId,
  // no user.uid -- así un usuario agregado ve/comparte el mismo link que
  // el dueño), así cada negocio tiene el suyo propio y no se mezclan entre
  // distintas cuentas.
  const catalogoUrl = typeof window !== 'undefined' && cuentaId
    ? `${window.location.origin}${CATALOGO_PATH}/${cuentaId}`
    : CATALOGO_PATH;

  const handleCopiarLink = () => {
    navigator.clipboard.writeText(catalogoUrl).then(() => {
      showToast('✓ Link copiado.');
    }).catch(() => {
      showToast('No se pudo copiar el link.', 'error');
    });
  };

  const waLink = `https://wa.me/?text=${encodeURIComponent(`Mirá nuestro catálogo y armá tu pedido acá: ${catalogoUrl}`)}`;

  const pendientes = solicitudesWeb.filter(s => s.estado === 'pendiente');
  const procesadas = solicitudesWeb.filter(s => s.estado !== 'pendiente');

  const activePedidos = pedidos.filter(p => p.estado !== 'cancelado' && p.estado !== 'completado');

  const handleImportar = async (solicitud, destino) => {
    setImportandoId(solicitud._docId);
    await importarSolicitudComoPedido(solicitud, destino);
    setImportandoId(null);
  };


  return (
    <div>
      {/* Solicitudes pendientes arriba de todo: es lo que hay que revisar
          primero cada vez que se entra a esta pantalla. */}
      <div className="card">
        <div className="card-title">Solicitudes pendientes ({pendientes.length})</div>
        {!pendientes.length ? (
          <div className="empty">No hay solicitudes nuevas desde el catálogo web.</div>
        ) : (
          pendientes.map(s => (
            <div key={s._docId} className="card" style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{s.cliente || 'Sin nombre'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {s.telefono || 'sin teléfono'} · {s.creado ? new Date(s.creado).toLocaleString('es-AR') : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(s.totalEstimado)}</div>
              </div>

              {s.comentarioGeneral && (
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px', fontStyle: 'italic' }}>"{s.comentarioGeneral}"</div>
              )}

              <div style={{ borderTop: '1px dashed var(--border2)', paddingTop: '8px' }}>
                {(s.items || []).map((it, i) => (
                  <div key={i} style={{ fontSize: '12px', marginBottom: '6px' }}>
                    <strong>{it.cantidad}×</strong> {it.nombre}
                    {(it.versiones || []).map((v, vi) => (
                      <div key={vi} style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '16px' }}>
                        {v.cantidad}× {v.color || 'sin color'}{v.colorSecundario ? ` + ${v.colorSecundario}` : ''}{v.comentario ? ` — ${v.comentario}` : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={importandoId === s._docId}
                  onClick={() => handleImportar(s, 'nuevo')}
                >
                  + Crear pedido nuevo
                </button>
                {activePedidos.length > 0 && (
                  <select
                    className="btn-sm"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text2)' }}
                    disabled={importandoId === s._docId}
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) handleImportar(s, e.target.value); }}
                  >
                    <option value="">Agregar a pedido existente…</option>
                    {activePedidos.map(p => (
                      <option key={p.id} value={p.id}>{p.cliente} — {p.desc || 'Sin descripción'}</option>
                    ))}
                  </select>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => descartarSolicitud(s._docId)}>Descartar</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Config general del catálogo */}
      <div className="card">
        <div className="card-title">Catálogo web</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>
              Estado: <span style={{ color: activo ? 'var(--accent)' : 'var(--danger)' }}>{activo ? 'Activo' : 'Inactivo'}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
              Mientras está inactivo, tu link de catálogo muestra un aviso y no deja hacer pedidos.
            </div>
          </div>
          <button className={`btn ${activo ? '' : 'btn-primary'}`} onClick={handleToggleActivo}>
            {activo ? 'Desactivar' : 'Activar catálogo'}
          </button>
        </div>

        <div className="sep"></div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <input readOnly value={catalogoUrl} style={{ flex: 1, minWidth: '220px', fontFamily: 'var(--mono)', fontSize: '12px' }} />
          <button className="btn btn-sm" onClick={handleCopiarLink}>Copiar link</button>
          <a className="btn btn-sm btn-primary" href={waLink} target="_blank" rel="noreferrer">Compartir por WhatsApp</a>
        </div>

        <div className="sep"></div>

        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text3)' }}>
          Nombre: <strong style={{ color: 'var(--text)' }}>{catalogoConfig?.empresaNombre || '(sin definir)'}</strong>
          {' · '}Tel: <strong style={{ color: 'var(--text)' }}>{catalogoConfig?.telefono || '(sin definir)'}</strong>
          {' · '}Colores publicados: <strong style={{ color: 'var(--text)' }}>{(catalogoConfig?.colores || []).length}</strong>
          <div style={{ marginTop: '4px' }}>Se toma siempre en vivo de "Mi emprendimiento" — no hace falta actualizarlo a mano.</div>
        </div>
      </div>

      {/* Paleta de colores del catálogo — independiente de la de la app */}
      <div className="card">
        <div className="card-title">Paleta del catálogo</div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
          El color de tu catálogo web no tiene por qué ser el mismo que usás en la app. Elegí un punto de partida y después retocá cada color a mano.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginBottom: '16px' }}>
          {paletasList.map((paleta) => {
            const paletaColores = paletas[paleta.id];
            const previewColors = [paletaColores.bg, paletaColores.accent, paletaColores.accent2, paletaColores.text, paletaColores.bg3];
            return (
              <button
                key={paleta.id}
                type="button"
                onClick={() => handleElegirPaletaCatalogo(paleta.id)}
                style={{
                  border: '1px solid var(--border)', borderRadius: '12px', padding: '8px',
                  background: 'var(--bg3)', display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '5px', minHeight: '64px', cursor: 'pointer'
                }}
                title={`Empezar desde ${paleta.label}`}
              >
                {previewColors.map((color, i) => (
                  <div key={i} style={{ background: color, borderRadius: '999px', minHeight: '11px' }} />
                ))}
                <span style={{ gridColumn: '1 / -1', fontSize: '10px', fontWeight: 600, color: 'var(--text2)', marginTop: '2px', textAlign: 'center' }}>
                  {paleta.label}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: '10px' }}>
          {[
            { key: 'bg', label: 'Fondo' },
            { key: 'bg3', label: 'Tarjetas' },
            { key: 'accent', label: 'Acento 1' },
            { key: 'accent2', label: 'Acento 2' },
            { key: 'text', label: 'Texto' }
          ].map(({ key, label }) => (
            <label
              key={key}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              title={`Editar ${label.toLowerCase()}`}
            >
              <span
                style={{
                  display: 'block', width: '100%', maxHeight: '38px', aspectRatio: '1', borderRadius: '10px',
                  border: '1px solid var(--border)', background: paletaCatalogoActual(key)
                }}
              />
              <input
                type="color"
                value={paletaCatalogoActual(key)}
                onChange={(e) => handleColorCatalogoChange(key, e.target.value)}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
                tabIndex={-1}
              />
              <span style={{ fontSize: '11px', color: 'var(--text2)', textAlign: 'center' }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Selección de productos a publicar */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Productos publicados ({seleccionados.size} / {biblioteca.length})
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm" onClick={toggleSeleccionarTodoCatalogo} disabled={!biblioteca.length}>
              {todosSeleccionados ? 'Deseleccionar todo' : 'Seleccionar todo el catálogo'}
            </button>
            <button className="btn btn-primary btn-sm" disabled={guardando} onClick={handlePublicar}>
              {guardando ? 'Publicando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>

        {!biblioteca.length ? (
          <div className="empty">Todavía no hay productos en tu Biblioteca.</div>
        ) : (
          uniqueCats.map(cat => {
            const idsCat = idsDeCategoria(cat);
            const seleccionadosEnCat = idsCat.filter(id => seleccionados.has(id)).length;
            const expandida = catsExpandidas.has(cat);
            return (
              <div key={cat} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '8px' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', cursor: 'pointer'
                  }}
                  onClick={() => toggleCategoriaExpandida(cat)}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{expandida ? '−' : '+'}</span>
                    {cat}
                    <span style={{ color: 'var(--text3)', fontWeight: 400, fontFamily: 'var(--mono)' }}>
                      {seleccionadosEnCat}/{idsCat.length} publicados
                    </span>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => { e.stopPropagation(); toggleSeleccionarCategoria(cat); }}
                  >
                    {categoriaCompleta(cat) ? 'Deseleccionar categoría' : 'Seleccionar categoría'}
                  </button>
                </div>

                {expandida && (
                  <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                    {biblioteca.filter(p => p.cat === cat).map(p => (
                      <label
                        key={p.id}
                        className="card"
                        style={{
                          margin: 0,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          borderColor: seleccionados.has(p.id) ? 'var(--accent)' : 'var(--border)'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionados.has(p.id)}
                          onChange={() => toggleProducto(p.id)}
                          style={{ width: 'auto', accentColor: 'var(--accent)', cursor: 'pointer' }}
                        />
                        {p.imagen ? (
                          <img src={p.imagen} alt={p.nombre} style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px', background: 'var(--bg3)' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'var(--bg3)', flexShrink: 0 }} />
                        )}
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmt(p.precioSugUnitario || p.costoUnitario)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {procesadas.length > 0 && (
        <div className="card">
          <div className="card-title">Historial ({procesadas.length})</div>
          {procesadas.map(s => (
            <div key={s._docId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{s.cliente || 'Sin nombre'}</span>
              <span style={{ color: s.estado === 'importado' ? 'var(--accent)' : 'var(--text3)' }}>{s.estado}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
