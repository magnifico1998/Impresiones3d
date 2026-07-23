import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ordenarCategorias } from '../utils/categoriaOrden';

const CATALOGO_PATH = '/catalogo';

export default function CatalogoAdminPage() {
  const {
    biblioteca,
    cfg,
    empresa,
    user,
    catalogoConfig,
    guardarCatalogoConfig,
    publicarProductosEnCatalogo,
    solicitudesWeb,
    importarSolicitudComoPedido,
    descartarSolicitud,
    pedidos,
    showToast
  } = useApp();

  // Selección de productos a publicar: arranca con lo que ya está marcado
  // como pub:true en biblioteca (fuente de verdad hasta que se guarde).
  const [seleccionados, setSeleccionados] = useState(
    () => new Set(biblioteca.filter(p => p.pub).map(p => p.id))
  );
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
    setSeleccionados(todosSeleccionados ? new Set() : new Set(biblioteca.map(p => p.id)));
  };

  const idsDeCategoria = (cat) => biblioteca.filter(p => p.cat === cat).map(p => p.id);
  const categoriaCompleta = (cat) => idsDeCategoria(cat).every(id => seleccionados.has(id));

  const toggleSeleccionarCategoria = (cat) => {
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
    await publicarProductosEnCatalogo(seleccionados);
    setGuardando(false);
  };

  const activo = catalogoConfig?.activo ?? false;

  const handleToggleActivo = () => {
    guardarCatalogoConfig({ activo: !activo });
  };

  const handleUsarDatosEmpresa = () => {
    guardarCatalogoConfig({
      empresaNombre: empresa?.nombre || '',
      telefono: empresa?.telefono || '',
      logo: empresa?.logo || '',
      colores: cfg?.colores || []
    });
    showToast('✓ Datos copiados a la configuración del catálogo.');
  };

  // El catálogo es por tienda: la URL lleva el uid del dueño, así cada
  // negocio tiene el suyo propio y no se mezclan entre distintas cuentas.
  const catalogoUrl = typeof window !== 'undefined' && user
    ? `${window.location.origin}${CATALOGO_PATH}/${user.uid}`
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

  const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

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
                        {v.cantidad}× {v.color || 'sin color'}{v.comentario ? ` — ${v.comentario}` : ''}
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
            Nombre: <strong style={{ color: 'var(--text)' }}>{catalogoConfig?.empresaNombre || '(sin definir)'}</strong>
            {' · '}Tel: <strong style={{ color: 'var(--text)' }}>{catalogoConfig?.telefono || '(sin definir)'}</strong>
            {' · '}Colores publicados: <strong style={{ color: 'var(--text)' }}>{(catalogoConfig?.colores || []).length}</strong>
          </div>
          <button className="btn btn-sm" onClick={handleUsarDatosEmpresa}>
            Usar datos de "Mi emprendimiento" y colores actuales
          </button>
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
