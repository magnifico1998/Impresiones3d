import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBiblioteca, useConfig, useCuenta, useCatalogo, usePedidos, useClientes, useUi } from '../context/contextos';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { motivoNombreInvalido, normalizarNombre } from '../utils/nombreCatalogo';
import { ordenarCategorias } from '../utils/categoriaOrden';
import { paletas, paletasList } from '../utils/paletas';
import { textosSecundariosDe, LOGO_MAX_ENCABEZADO_FIJO, MAX_CARACTERES_LINEA, MAX_LINEAS_ESLOGAN, TAMANOS_ESLOGAN, TAMANOS_LOGO, TEXTO_ENCABEZADO_POR_DEFECTO, esloganDe, esloganTamanoDe, recortarBorradorEslogan, tamanoLogoDe } from '../utils/catalogoMarca';
import { confirmar } from './Dialogos';
import { clienteDeSolicitud, confirmarPedidoNuevoDeCliente } from '../utils/unirPedidos';

// Los mismos 7 roles editables que "Paleta personalizada" en Configuración
// (ver ConfiguracionPage.jsx), pero acá para el catálogo web público -- se
// guardan aparte (catalogoConfig.paletaCatalogo) porque el catálogo NO
// tiene por qué compartir la paleta de la app: son públicos que ni
// siquiera tienen cuenta acá, el criterio de marca puede ser otro.
const ROLES_PALETA_CATALOGO = ['bg', 'accent', 'accent2', 'text', 'text2', 'text3', 'bg3'];

const CATALOGO_PATH = '/catalogo';

export default function CatalogoAdminPage() {
  const { biblioteca } = useBiblioteca();
  const { cfg, setCfg, fmt } = useConfig();
  const { cuentaId, planContratado, consumoActual } = useCuenta();
  const { catalogoConfig, guardarCatalogoConfig, publicarProductosEnCatalogo, solicitudesWeb, importarSolicitudComoPedido, descartarSolicitud } = useCatalogo();
  const { pedidos } = usePedidos();
  const { clientes } = useClientes();
  const { showToast } = useUi();

  // Pasado el límite de aperturas del plan, el catálogo se sigue viendo pero
  // no acepta pedidos hasta el próximo ciclo (ver registrarAperturaCatalogo.js
  // y dentroDelLimiteDeAperturas en firestore.rules).
  const limiteAperturas = planContratado?.limites?.aperturasCatalogoMes;
  const catalogoSinPedidos = limiteAperturas != null && (consumoActual?.aperturasCatalogo || 0) > limiteAperturas;

  // Total de una solicitud con los precios actuales de la biblioteca (el
  // totalEstimado/precioUnit que trae la solicitud lo escribe el visitante
  // anónimo del catálogo y se puede falsear). Si un producto ya no existe
  // se usa el precio de la solicitud como referencia.
  const totalConfiable = (s) => (s.items || []).reduce((acc, it) => {
    const prod = biblioteca.find(p => p.id === it.prodId);
    const precio = prod ? (prod.precioSugUnitario || prod.costoUnitario || 0) : (Number(it.precioUnit) || 0);
    return acc + (Number(it.cantidad) || 0) * precio;
  }, 0);

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

  // Marca: tamaño del logo y texto destacado. El texto se escribe en un
  // borrador y se guarda con el botón (no una escritura por cada tecla).
  const tamanoLogo = tamanoLogoDe(catalogoConfig);
  const esloganGuardado = esloganDe(catalogoConfig);
  const tamanoEslogan = esloganTamanoDe(catalogoConfig);
  const [esloganBorrador, setEsloganBorrador] = useState(null);
  const esloganValor = esloganBorrador ?? esloganGuardado;
  const guardarEslogan = async (texto) => {
    await guardarCatalogoConfig({ eslogan: esloganDe({ eslogan: texto }) });
    setEsloganBorrador(null);
    showToast(texto.trim() ? 'Texto destacado guardado.' : 'Texto destacado quitado.');
  };

  const handleToggleActivo = () => {
    guardarCatalogoConfig({ activo: !activo });
  };

  // Paleta del catálogo: arranca (si nunca se tocó) desde 'lagoon', el
  // mismo default de la app -- pero es completamente independiente de la
  // paleta que use el dueño en su propia app.
  // Los dos textos secundarios de una paleta guardada antes de poder elegirlos se calculan igual que en el catálogo público.
  const paletaCatalogoActual = (key) => {
    const guardada = catalogoConfig?.paletaCatalogo;
    if (guardada && (key === 'text2' || key === 'text3')) return textosSecundariosDe(guardada)[key] ?? paletas.lagoon[key];
    return guardada?.[key] ?? paletas.lagoon[key];
  };

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
  const catalogoUrlPorUid = typeof window !== 'undefined' && cuentaId
    ? `${window.location.origin}${CATALOGO_PATH}/${cuentaId}`
    : CATALOGO_PATH;
  // Con un nombre elegido, ese es el link para compartir (el de uid sigue funcionando).
  const nombreActual = catalogoConfig?.nombreUrl || '';
  const catalogoUrl = nombreActual && typeof window !== 'undefined' ? `${window.location.origin}/${nombreActual}` : catalogoUrlPorUid;

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const nombreNormalizado = normalizarNombre(nombreNuevo);
  const motivoNombre = nombreNuevo.trim() ? motivoNombreInvalido(nombreNormalizado) : null;
  const guardarNombre = async () => {
    setGuardandoNombre(true);
    try {
      await httpsCallable(functions, 'reservarNombreCatalogo')({ nombre: nombreNormalizado });
      showToast(`✓ Tu catálogo ahora está en /${nombreNormalizado}`);
      setNombreNuevo('');
    } catch (e) {
      showToast(e?.message || 'No se pudo guardar la dirección.', 'error');
    } finally {
      setGuardandoNombre(false);
    }
  };

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
    // Pedido nuevo para alguien que ya tiene uno abierto: se avisa. Para sumarlo al existente se elige en "Agregar a un pedido"; si no, se pueden unir después.
    if (destino === 'nuevo' && !(await confirmarPedidoNuevoDeCliente({ pedidos, cliente: clienteDeSolicitud(clientes, solicitud), confirmar, fmt }))) return;
    setImportandoId(solicitud._docId);
    await importarSolicitudComoPedido(solicitud, destino);
    setImportandoId(null);
  };


  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Catálogo Web & Tienda Online</span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: 'var(--accentDim)', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
              E-Commerce
            </span>
          </div>
          <div className="page-sub" style={{ marginBottom: 0, marginTop: '4px' }}>
            Tu tienda pública: solicitudes de clientes, link para compartir, personalización visual y productos publicados.
          </div>
        </div>
      </div>

      {catalogoSinPedidos && (
        <div className="card" role="status" style={{ borderColor: 'var(--warn)', background: 'var(--warnDim)', marginBottom: '16px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Tu catálogo no está recibiendo pedidos</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            Llegaste al límite de {limiteAperturas} aperturas por mes de tu plan. Tus clientes siguen viendo los productos,
            pero no pueden enviar pedidos hasta el próximo ciclo, o antes si pasás a un plan superior desde "Mi emprendimiento".
          </div>
        </div>
      )}

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
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(totalConfiable(s))}</div>
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
                        {v.deStock !== undefined && <strong style={{ marginLeft: '6px', color: 'var(--accent)' }}>· {v.deStock >= v.cantidad ? 'de stock' : v.deStock > 0 ? `${v.deStock} de stock, ${v.cantidad - v.deStock} a pedido` : 'a pedido'}</strong>}
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

        {/* Dirección con el nombre del emprendimiento (manager3d.com.ar/mi-tienda). */}
        <div style={{ margin: '12px 0' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>Dirección de tu catálogo</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', margin: '2px 0 6px' }}>
            {nombreActual
              ? <>Hoy: <strong style={{ color: 'var(--text)' }}>{typeof window !== 'undefined' ? window.location.host : ''}/{nombreActual}</strong>. Si la cambiás, la anterior sigue funcionando 30 días.</>
              : 'Elegí un nombre corto para tu catálogo, en lugar del link largo. Ej: mi-emprendimiento.'}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text3)' }}>{typeof window !== 'undefined' ? window.location.host : ''}/</span>
            <input
              type="text"
              value={nombreNuevo}
              maxLength={60}
              placeholder={nombreActual || 'mi-emprendimiento'}
              onChange={(e) => setNombreNuevo(e.target.value)}
              style={{ flex: 1, minWidth: '160px', fontFamily: 'var(--mono)', fontSize: '12px' }}
            />
            <button className="btn btn-primary btn-sm" disabled={guardandoNombre || !nombreNormalizado || !!motivoNombre || nombreNormalizado === nombreActual} onClick={guardarNombre}>
              {guardandoNombre ? 'Guardando…' : 'Guardar dirección'}
            </button>
          </div>
          {nombreNuevo.trim() && (
            <div style={{ fontSize: '12px', marginTop: '4px', color: motivoNombre ? 'var(--danger)' : 'var(--text3)' }}>
              {motivoNombre || `Quedaría: /${nombreNormalizado}`}
            </div>
          )}
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

      {/* Formato: catálogo (pedidos a medida) o tienda (stock + a pedido) */}
      <div className="card">
        <div className="card-title">Formato del catálogo</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
          {[['catalogo', 'Catálogo', 'Lista por categorías para armar pedidos a medida. Es el formato de siempre.'],
            ['tienda', 'Tienda', 'Categorías arriba como menú, productos con foto grande y botón Comprar. Muestra primero lo que tenés en stock y deja pedir el resto a pedido.']].map(([id, nombre, texto]) => {
            const elegido = (catalogoConfig?.modo || 'catalogo') === id;
            return (
              <button
                key={id}
                className="btn"
                onClick={() => {
                  guardarCatalogoConfig({ modo: id });
                  // La tienda vende desde el stock: se prende la sección para poder cargarlo.
                  if (id === 'tienda' && !cfg.stockHabilitado) setCfg(prev => ({ ...prev, stockHabilitado: true }));
                }}
                style={{ flex: '1 1 260px', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', textAlign: 'left', padding: '12px 14px', height: 'auto', borderColor: elegido ? 'var(--accent)' : undefined, background: elegido ? 'var(--accentDim)' : undefined }}
              >
                <span style={{ fontWeight: 700 }}>{elegido ? '✓ ' : ''}{nombre}</span>
                <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 400, whiteSpace: 'normal' }}>{texto}</span>
              </button>
            );
          })}
        </div>
        {(catalogoConfig?.modo === 'tienda') && (
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '10px' }}>
            Cargá las unidades que tenés en la sección <strong>Productos en stock</strong> (menú de la izquierda). Los pedidos de la tienda llegan
            acá, igual que ahora: al importarlos, lo que salió de stock queda completado y descuenta el stock, y lo que falta fabricar queda pendiente.
          </p>
        )}
      </div>

      {/* Marca del catálogo: tamaño del logo y texto destacado */}
      <div className="card">
        <div className="card-title">Marca del catálogo</div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
          Cómo se ve tu marca arriba del catálogo público. La vista previa es el encabezado, con los colores de la paleta del catálogo.
        </div>

        <label className="fl" style={{ marginTop: 0 }}>Tamaño del logo</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {TAMANOS_LOGO.map((t) => (
            <button
              key={t.px}
              className={`btn btn-sm ${tamanoLogo === t.px ? 'btn-primary' : ''}`}
              onClick={() => guardarCatalogoConfig({ logoTamano: t.px })}
            >
              {t.nombre}
            </button>
          ))}
        </div>
        {tamanoLogo > LOGO_MAX_ENCABEZADO_FIJO && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
            Con este tamaño el encabezado se va con la página al desplazar (no queda fijo), para no tapar la pantalla del celular.
          </div>
        )}

        <div className="sep" style={{ marginTop: '16px' }}></div>

        <label className="fl">Texto destacado (eslogan o gancho comercial)</label>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' }}>
          Va debajo del nombre, en el encabezado. Hasta {MAX_LINEAS_ESLOGAN} líneas de {MAX_CARACTERES_LINEA} caracteres; cada Enter es una línea nueva.
        </div>
        <textarea
          rows={MAX_LINEAS_ESLOGAN}
          value={esloganValor}
          onChange={(e) => setEsloganBorrador(recortarBorradorEslogan(e.target.value))}
          placeholder={'Ej: Impresiones 3D a medida\nEnvíos a todo el país'}
          style={{ width: '100%', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            {esloganValor.split('\n').length} de {MAX_LINEAS_ESLOGAN} líneas
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {esloganValor && <button className="btn btn-sm" onClick={() => guardarEslogan('')}>Quitar</button>}
            <button className="btn btn-sm btn-primary" disabled={esloganBorrador === null || esloganDe({ eslogan: esloganBorrador }) === esloganGuardado} onClick={() => guardarEslogan(esloganValor)}>
              Guardar texto
            </button>
          </div>
        </div>

        <label className="fl">Tamaño del texto</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {TAMANOS_ESLOGAN.map((t) => (
            <button
              key={t.px}
              className={`btn btn-sm ${tamanoEslogan === t.px ? 'btn-primary' : ''}`}
              onClick={() => guardarCatalogoConfig({ esloganTamano: t.px })}
            >
              {t.nombre}
            </button>
          ))}
        </div>

        {/* Vista previa: el encabezado y, debajo de la línea divisoria, la frase de siempre. */}
        <div style={{ marginTop: '14px', borderRadius: '8px', border: '1px solid var(--border)', background: paletaCatalogoActual('bg'), overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)' }}>
            {catalogoConfig?.logo ? (
              <img src={catalogoConfig.logo} alt="" style={{ height: `${tamanoLogo}px`, width: 'auto', maxWidth: `min(${tamanoLogo * 3}px, 70vw)`, objectFit: 'contain', borderRadius: `${Math.min(14, Math.round(tamanoLogo / 4))}px`, flexShrink: 0 }} />
            ) : (
              <div style={{ fontSize: '12px', color: paletaCatalogoActual('text3') }}>
                Todavía no cargaste un logo: subilo en Mi emprendimiento.
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '-.2px', color: paletaCatalogoActual('text') }}>
                {catalogoConfig?.empresaNombre || 'Tu emprendimiento'}
              </div>
              {esloganDe({ eslogan: esloganValor }) && (
                <div style={{ fontSize: `${tamanoEslogan}px`, fontWeight: 500, marginTop: '3px', lineHeight: 1.3, whiteSpace: 'pre-line', overflowWrap: 'anywhere', color: paletaCatalogoActual('text2') }}>
                  {esloganDe({ eslogan: esloganValor })}
                </div>
              )}
            </div>
          </div>
          <div style={{ padding: '10px 16px', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 600, color: paletaCatalogoActual('text3') }}>
            {TEXTO_ENCABEZADO_POR_DEFECTO}
          </div>
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

        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px', fontFamily: 'var(--mono)' }}>
          Texto: nombre del emprendimiento y títulos. Texto de apoyo: eslogan y descripciones. Etiquetas y frase: la frase de arriba de los productos y los textos más suaves.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: '10px' }}>
          {[
            { key: 'bg', label: 'Fondo' },
            { key: 'bg3', label: 'Tarjetas' },
            { key: 'accent', label: 'Acento 1' },
            { key: 'accent2', label: 'Acento 2' },
            { key: 'text', label: 'Texto' },
            { key: 'text2', label: 'Texto de apoyo' },
            { key: 'text3', label: 'Etiquetas y frase' }
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
