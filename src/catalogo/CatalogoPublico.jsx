import React, { useEffect, useMemo, useState } from 'react';
import Dialogos, { avisar } from '../components/Dialogos';
import { db, functions } from '../firebaseBase';
import { collection, doc, getDoc, onSnapshot, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { obtenerPais, motivoTelefonoInvalido, formatearMoneda } from '../utils/paises';
import { ordenarCategorias } from '../utils/categoriaOrden';
import VistaTienda, { ESTILOS_TIENDA } from './VistaTienda';
import { nombreDeRuta } from '../utils/nombreCatalogo';
import { repartirConStock } from '../utils/stock';
import { colorPermitido, combinacionPermitida, versionesSinColor } from '../utils/coloresProducto';
import { LOGO_MAX_ENCABEZADO_FIJO, TEXTO_ENCABEZADO_POR_DEFECTO, esloganDe, esloganTamanoDe, tamanoLogoDe, textosSecundariosDe } from '../utils/catalogoMarca';

import CampoNumero from '../components/CampoNumero';
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

// Detecta URLs sueltas dentro de un texto libre (ej. la descripción extendida
// de un producto) y las convierte en <a> clickeables, dejando el resto del
// texto tal cual. No cambia lo que el dueño escribió, sólo envuelve las
// partes que matchean con un link.
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/gi;
const ES_URL_REGEX = /^(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)$/i;
function linkificar(texto) {
  if (!texto) return texto;
  const partes = texto.split(URL_REGEX);
  return partes.map((parte, i) => {
    if (!ES_URL_REGEX.test(parte)) return parte;
    const href = /^https?:\/\//i.test(parte) ? parte : `https://${parte}`;
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
        {parte}
      </a>
    );
  });
}

// La paleta del catálogo (elegida en CatalogoAdminPage, independiente de la
// paleta de la app) se guarda como 7 colores en catalogoConfig.paletaCatalogo.
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
  const { text2, text3 } = textosSecundariosDe(p);
  if (text2) estilo['--text2'] = text2;
  if (text3) estilo['--text3'] = text3;
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
  .catalogo-producto-item img { transition: transform .15s ease; }
  .catalogo-producto-item img:hover { transform: scale(1.03); }
  .catalogo-agregar-btn:hover { filter: brightness(1.05); }
  .catalogo-cat-header:hover { opacity: .7; }

  .catalogo-producto-item { padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
  .catalogo-productos-grid > .catalogo-producto-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

  /* Celular: el logo y los íconos van en la primera fila; el nombre y el texto destacado debajo, a todo el ancho
     (al lado del logo quedaban en una columna angosta, una palabra por renglón). */
  @media (max-width: 599px) {
    .catalogo-header-inner { flex-wrap: wrap; row-gap: 10px !important; }
    .catalogo-header-texto { order: 3; flex: 1 1 100%; }
  }

  @media (min-width: 480px) {
    .catalogo-productos-grid { display: grid !important; grid-template-columns: 1fr 1fr; column-gap: 16px; row-gap: 22px; }
    .catalogo-producto-item { margin-bottom: 0 !important; padding-bottom: 0 !important; border-bottom: none !important; }
  }

  @media (min-width: 860px) {
    .catalogo-header-inner { max-width: 960px !important; margin: 0 auto !important; padding: 20px 28px !important; }
    .catalogo-content { max-width: 960px !important; padding: 24px 28px !important; }
    .catalogo-productos-grid { column-gap: 24px; }
    .catalogo-cart-bar { max-width: 960px !important; left: 50% !important; right: auto !important; transform: translateX(-50%); border-radius: 14px 14px 0 0; bottom: 0 !important; }
    .catalogo-cart-overlay { align-items: stretch !important; justify-content: flex-end !important; }
    .catalogo-cart-panel { max-width: 420px !important; width: 420px !important; height: 100vh !important; max-height: 100vh !important; border-radius: 0 !important; }
  }
`;

export default function CatalogoPublico() {
  // El catálogo es por tienda: la URL es /catalogo/{uid}, y todo lo que
  // se lee/escribe acá cuelga de catalogoTiendas/{uid}/... — así el
  // catálogo de una tienda nunca se mezcla con el de otra (antes vivía en
  // colecciones compartidas y cualquier cuenta logueada podía pisarlas).
  //
  // Dos formas de llegar: /catalogo/{uid} (el link de siempre) o /{nombre} (la dirección con el nombre del
  // emprendimiento, que se traduce a la cuenta con catalogoNombres/{nombre}; ver reservarNombreCatalogo).
  const nombreEnRuta = useMemo(() => nombreDeRuta(window.location.pathname), []);
  const [uidTienda, setUidTienda] = useState(() => {
    const partes = window.location.pathname.split('/').filter(Boolean); // ['catalogo', '{uid}']
    return partes[0] === 'catalogo' ? (partes[1] || null) : null;
  });
  const [resolviendoNombre, setResolviendoNombre] = useState(!!nombreEnRuta);
  useEffect(() => {
    if (!nombreEnRuta) return undefined;
    let vivo = true;
    getDoc(doc(db, 'catalogoNombres', nombreEnRuta))
      .then((snap) => {
        const d = snap.exists() ? snap.data() : null;
        // Un alias (nombre anterior de la cuenta) vale hasta su vencimiento.
        const vigente = d && (!d.alias || (d.hasta?.toMillis?.() || 0) > Date.now());
        if (vivo) setUidTienda(vigente ? d.uid : null);
      })
      .catch(() => { if (vivo) setUidTienda(null); })
      .finally(() => { if (vivo) setResolviendoNombre(false); });
    return () => { vivo = false; };
  }, [nombreEnRuta]);

  const [config, setConfig] = useState(undefined); // undefined = cargando, null = no existe

  // País de la tienda (moneda + formato de teléfono): se espeja en
  // catalogoTiendas/{uid} cuando el dueño lo elige en EmpresaPage (ver
  // AppContext), con fallback a Argentina si la tienda nunca lo seteó.
  const pais = obtenerPais(config?.pais);
  const fmt = (n) => formatearMoneda(n, pais.id);
  const [productos, setProductos] = useState([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [catAbierta, setCatAbierta] = useState(null);
  // Subcategorías abiertas dentro de la categoría desplegada, clave
  // "cat::subcat" (puede repetirse el nombre de subcategoría entre
  // categorías distintas). Igual que catAbierta pero de a varias a la vez.
  const [subcatsAbiertas, setSubcatsAbiertas] = useState(() => new Set());
  const toggleSubcatAbierta = (key) => {
    setSubcatsAbiertas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const [carrito, setCarrito] = useState([]); // { localId, prodId, nombre, precio, versiones:[{localId,cantidad,color,comentario}] }
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [fichaPedida, setFichaPedida] = useState(null); // formato tienda: producto a reabrir desde el carrito
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(null); // { docId, payload } una vez enviado
  // false cuando la tienda pasó el límite de aperturas de su plan en el
  // ciclo (lo informa registrarAperturaCatalogo): el catálogo se sigue
  // viendo, pero no se pueden enviar pedidos.
  const [aceptaPedidos, setAceptaPedidos] = useState(true);
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
  // Descripciones extendidas colapsadas por defecto (pueden ser largas y
  // rompen el diseño de la tarjeta si se muestran enteras) -- se expanden
  // a demanda con "Ver descripción".
  const [descsExpandidas, setDescsExpandidas] = useState(() => new Set());
  const toggleDescExpandida = (id) => {
    setDescsExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
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
  // cuenta (ver firestore.rules). La respuesta dice si la tienda todavía
  // acepta pedidos este ciclo. No afecta la carga del catálogo si falla:
  // sólo se registra silenciosamente en la consola.
  useEffect(() => {
    if (!uidTienda) return;
    const registrarApertura = httpsCallable(functions, 'registrarAperturaCatalogo');
    registrarApertura({ uidTienda })
      .then((res) => setAceptaPedidos(res.data?.aceptaPedidos !== false))
      .catch((err) => {
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
    return ordenarCategorias(Array.from(set), config?.categoriaOrden);
  }, [productos, config?.categoriaOrden]);


  const colores = config?.colores || [];
  const coloresSecundarios = colores.filter(c => c.secundario);
  const combinaciones = config?.combinacionesColores || [];

  const totalCarrito = carrito.reduce((s, it) => s + it.precio * it.versiones.reduce((a, v) => a + (v.cantidad || 0), 0), 0);
  const cantidadCarrito = carrito.reduce((s, it) => s + it.versiones.reduce((a, v) => a + (v.cantidad || 0), 0), 0);

  // ---- Panel de detalle (borrador previo a confirmar) ----

  const abrirDetalle = (p) => {
    const enCarrito = carrito.find(it => it.prodId === p.id);
    setDraftVersiones(
      enCarrito
        ? enCarrito.versiones.map(v => ({ ...v }))
        : [{ localId: newLocalId(), cantidad: 1, color: '', colorSecundario: '', comentario: '' }]
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

  // Elegir una combinación predefinida pisa color + colorSecundario a la
  // vez (a diferencia del modo libre, que los edita por separado) -- así
  // el resto del sistema (payload, Solicitudes, detalle de pedido) sigue
  // leyendo esos mismos dos campos sin ningún cambio.
  const actualizarDraftCombinacion = (versionLocalId, combo) => {
    setDraftVersiones(prev => prev.map(v => v.localId === versionLocalId
      ? { ...v, color: combo?.color || '', colorSecundario: combo?.colorSecundario || '' }
      : v));
  };

  const agregarDraftVersion = () => {
    setDraftVersiones(prev => [...prev, { localId: newLocalId(), cantidad: 1, color: '', colorSecundario: '', comentario: '' }]);
  };

  const quitarDraftVersion = (versionLocalId) => {
    setDraftVersiones(prev => prev.filter(v => v.localId !== versionLocalId));
  };

  const confirmarAgregado = (p) => {
    const versionesValidas = draftVersiones.filter(v => v.cantidad > 0);
    if (!versionesValidas.length) {
      avisar('Poné al menos una cantidad mayor a 0 antes de confirmar.');
      return;
    }
    if (versionesSinColor(p, versionesValidas, colores, combinaciones) > 0) {
      avisar('Elegí el color de cada unidad antes de confirmar.');
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

  // Formato tienda: la ficha del producto arma sus versiones y las agrega acá directo.
  const agregarAlCarrito = (p, versiones) => {
    setCarrito(prev => {
      const nuevo = { localId: newLocalId(), prodId: p.id, nombre: p.nombre, precio: p.precio || 0, versiones };
      return prev.some(it => it.prodId === p.id) ? prev.map(it => it.prodId === p.id ? { ...it, versiones } : it) : [...prev, nuevo];
    });
  };

  // Cuánto de cada versión sale de stock (formato tienda). Con otro formato no hay stock: todo es a pedido.
  const repartoDe = (prodId, versiones) => {
    if (config?.modo !== 'tienda') return versiones.map(v => ({ ...v, deStock: 0 }));
    return repartirConStock(productos.find(pr => pr.id === prodId)?.stock, versiones);
  };

  const quitarProducto = (prodId) => {
    setCarrito(prev => prev.filter(it => it.prodId !== prodId));
    if (detalleAbierto === prodId) cerrarDetalle();
  };

  const editarDesdeCarrito = (prodId) => {
    const p = productos.find(pr => pr.id === prodId);
    if (!p) return;
    setCarritoAbierto(false);
    if (config?.modo === 'tienda') { setFichaPedida(prodId); return; }
    setCatAbierta(p.cat || 'Otros');
    abrirDetalle(p);
  };

  const handleEnviar = async () => {
    if (!aceptaPedidos) return;
    if (!cliente.trim()) {
      avisar('Contanos tu nombre para poder armar el pedido.');
      return;
    }
    if (!telefono.trim()) {
      avisar('Dejanos un teléfono de contacto para poder coordinar el pedido.');
      return;
    }
    const motivoTel = motivoTelefonoInvalido(telefono, pais.id);
    if (motivoTel) {
      avisar(motivoTel);
      return;
    }
    if (!carrito.length || cantidadCarrito === 0) {
      avisar('Agregá al menos un producto con cantidad mayor a 0.');
      return;
    }
    // Antes de mandar el pedido, todos los productos tienen que tener su color elegido (si ofrecen colores).
    const sinColor = carrito.filter(it => versionesSinColor(productos.find(pr => pr.id === it.prodId), repartoDe(it.prodId, it.versiones), colores, combinaciones) > 0);
    if (sinColor.length) {
      avisar(`Falta elegir el color de: ${sinColor.map(it => it.nombre).join(', ')}. Tocá "Editar" en cada uno para elegirlo.`);
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
          versiones: repartoDe(it.prodId, it.versiones.filter(v => v.cantidad > 0)).map(v => ({
            cantidad: v.cantidad,
            color: v.color || '',
            colorSecundario: v.colorSecundario || '',
            comentario: v.comentario || '',
            // Cuántas de estas unidades salen del stock (el resto se fabrica a pedido). Al importar la solicitud el
            // dueño lo vuelve a validar contra su stock real: lo que manda el visitante no es de fiar.
            ...(config?.modo === 'tienda' ? { deStock: v.deStock } : {})
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
      // Rechazo de firestore.rules: el catálogo está inactivo o la tienda
      // pasó su límite de aperturas mientras el visitante armaba el pedido.
      if (e?.code === 'permission-denied') {
        setAceptaPedidos(false);
        avisar('En este momento la tienda no está recibiendo pedidos por el catálogo. Escribile directamente para hacer tu pedido.');
      } else {
        avisar('No se pudo enviar el pedido. Probá de nuevo en un momento.');
      }
    } finally {
      setEnviando(false);
    }
  };

  // ---- Pantallas de estado ----

  if (resolviendoNombre) {
    return <EstadoCentrado>Cargando catálogo…</EstadoCentrado>;
  }

  if (!uidTienda && nombreEnRuta) {
    return (
      <EstadoCentrado>
        No encontramos este catálogo.
        <br />Revisá que la dirección esté bien escrita o pedile el link al vendedor.
      </EstadoCentrado>
    );
  }

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

  if (!config) {
    return (
      <EstadoCentrado>
        Este catálogo no está disponible en este momento.
        <br />Volvé a intentar más tarde.
      </EstadoCentrado>
    );
  }

  // Catálogo desactivado por la tienda: se ve su marca y un aviso de mantenimiento.
  if (!config.activo) {
    return <CatalogoEnMantenimiento config={config} paleta={estiloPaleta(config)} />;
  }

  // Marca elegida por la tienda (Catálogo web → "Marca del catálogo").
  const tamanoLogo = tamanoLogoDe(config);
  const eslogan = esloganDe(config);
  const tamanoEslogan = esloganTamanoDe(config);

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
        {/* Seguir mirando el catálogo. El pedido ya se mandó: se vacía el carrito para que
            no se repita por error (el nombre y el contacto quedan por si arma otro). */}
        <div style={{ marginTop: waLink ? '10px' : 0 }}>
          <button
            className="btn"
            onClick={() => {
              setCarrito([]);
              setCarritoAbierto(false);
              setComentarioGeneral('');
              setEnviado(null);
              window.scrollTo?.({ top: 0 });
            }}
          >
            ← Volver al catálogo
          </button>
        </div>
      </EstadoCentrado>
    );
  }

  return (
    <div style={{ ...estiloPaleta(config), minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: carrito.length ? '76px' : '0' }}>
      <style>{ESTILOS_RESPONSIVE}</style>
      {config.modo === 'tienda' && <style>{ESTILOS_TIENDA}{`@media (min-width: 860px) { .catalogo-header-inner { max-width: 1180px !important; } .catalogo-cart-bar { max-width: 1180px !important; } }`}</style>}
      {/* Adentro del contenedor con la paleta de la tienda, así los avisos
          toman sus colores en vez de los de la app. */}
      <Dialogos />

      <header style={{
        // Con un logo grande el encabezado se va con la página: fijo taparía la pantalla del celular.
        position: tamanoLogo <= LOGO_MAX_ENCABEZADO_FIJO ? 'sticky' : 'static', top: 0, zIndex: 10, background: 'var(--bg)',
        borderBottom: '1px solid var(--border)', padding: '16px 18px',
        display: 'flex', alignItems: 'center', gap: '12px'
      }} className="catalogo-header-inner">
        {config.logo ? (
          <img src={config.logo} alt="" style={{ height: `${tamanoLogo}px`, width: 'auto', maxWidth: `min(${tamanoLogo * 3}px, 70vw)`, objectFit: 'contain', borderRadius: `${Math.min(14, Math.round(tamanoLogo / 4))}px`, flexShrink: 0 }} />
        ) : (
          <div style={{
            width: `${tamanoLogo}px`, height: `${tamanoLogo}px`, borderRadius: `${Math.min(14, Math.round(tamanoLogo / 4))}px`, flexShrink: 0, background: 'var(--text)', color: 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: `${Math.round(tamanoLogo * 0.4)}px`
          }}>
            {(config.empresaNombre || 'C')[0].toUpperCase()}
          </div>
        )}
        <div className="catalogo-header-texto" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '-.2px' }}>{config.empresaNombre || 'Catálogo'}</div>
          {/* Debajo del nombre: el texto destacado de la tienda (eslogan o gancho comercial), en
              hasta 3 líneas y con el tamaño que eligió. Sin texto, no se muestra nada. */}
          {eslogan && (
            <div style={{ fontSize: `${tamanoEslogan}px`, color: 'var(--text2)', fontWeight: 500, marginTop: '3px', lineHeight: 1.3, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {eslogan}
            </div>
          )}
        </div>
        {(urlFacebook(config.facebook) || urlInstagram(config.instagram) || config.telefono) && (
          <div style={{ display: 'flex', gap: '14px', marginLeft: 'auto', flexShrink: 0 }}>
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

      {!aceptaPedidos && (
        <div role="status" style={{
          maxWidth: '640px', margin: '12px auto 0', padding: '10px 14px', borderRadius: 'var(--radius)',
          border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: '13px', color: 'var(--text2)'
        }}>
          Por ahora esta tienda no está recibiendo pedidos por el catálogo. Podés ver los productos
          {config.telefono ? ' y escribirle por WhatsApp para pedir.' : ' y contactarla directamente para pedir.'}
        </div>
      )}

      {config.modo === 'tienda' ? (
        <VistaTienda
          productos={productos}
          config={config}
          fmt={fmt}
          carrito={carrito}
          colores={colores}
          coloresSecundarios={coloresSecundarios}
          combinaciones={combinaciones}
          aceptaPedidos={aceptaPedidos}
          onAgregar={agregarAlCarrito}
          abrirProdId={fichaPedida}
          onAbierto={() => setFichaPedida(null)}
          onAmpliar={setImagenAmpliada}
        />
      ) : (
      <div className="catalogo-content" style={{ maxWidth: '640px', margin: '0 auto', padding: '8px 16px 16px' }}>
        {/* La frase de siempre, debajo de la línea divisoria del encabezado. */}
        {aceptaPedidos && (
          <div className="catalogo-instruccion" style={{ padding: '10px 0 2px', fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 600 }}>
            {TEXTO_ENCABEZADO_POR_DEFECTO}
          </div>
        )}
        {!productos.length && (
          <div className="empty" style={{ marginTop: '20px' }}>Todavía no hay productos publicados.</div>
        )}

        {categorias.map(cat => {
          const items = productos.filter(p => (p.cat || 'Otros') === cat);
          const abierta = catAbierta === cat;
          return (
            <div key={cat}>
              <button
                className="catalogo-cat-header"
                onClick={() => setCatAbierta(abierta ? null : cat)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--text)', fontSize: '13.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px',
                  borderBottom: abierta ? 'none' : '1px solid var(--border)', transition: 'opacity .15s'
                }}
              >
                {cat}
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text3)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: '12px' }}>
                  {items.length}
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '13px', height: '13px', transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                    <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              {abierta && (() => {
                // Sub-agrupa por subcategoría dentro de esta categoría; los
                // productos sin subcategoría van sueltos y sólo se muestra
                // el subheader cuando hay variedad (mismo criterio que en
                // la Biblioteca del admin). Todo va en UNA sola grilla (con
                // los headers ocupando el ancho completo vía gridColumn)
                // en vez de una grilla por subgrupo — así un subgrupo de
                // un solo producto no deja una columna vacía al lado.
                const bySubcat = new Map();
                items.forEach(p => {
                  const sc = p.subcat || '';
                  if (!bySubcat.has(sc)) bySubcat.set(sc, []);
                  bySubcat.get(sc).push(p);
                });
                const subcatKeys = Array.from(bySubcat.keys()).sort((a, b) => {
                  if (!a) return -1;
                  if (!b) return 1;
                  return a.localeCompare(b, 'es', { sensitivity: 'base' });
                });
                const hayVariedad = bySubcat.size > 1;

                const renderProducto = (p) => {
                  const enCarrito = carrito.find(it => it.prodId === p.id);
                  const cantEnCarrito = enCarrito ? enCarrito.versiones.reduce((s, v) => s + (v.cantidad || 0), 0) : 0;
                  const detalleEstaAbierto = detalleAbierto === p.id;

                  return (
                    <div key={p.id} className="catalogo-producto-item">
                      <div style={{ display: 'flex', gap: '14px' }}>
                        {p.imagen ? (
                          <img
                            src={p.imagen}
                            alt={p.nombre}
                            onClick={() => setImagenAmpliada({
                              imagenes: p.imagenes?.length ? p.imagenes : [p.imagen],
                              nombre: p.nombre,
                              index: 0
                            })}
                            style={{ width: '84px', height: '84px', objectFit: 'contain', background: 'var(--bg3)', borderRadius: '14px', flexShrink: 0, cursor: 'zoom-in' }}
                          />
                        ) : (
                          <div style={{
                            width: '84px', height: '84px', background: 'var(--bg3)', borderRadius: '14px', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '22px', fontWeight: 700
                          }}>
                            {p.nombre?.[0]?.toUpperCase() || '·'}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: '18px', fontWeight: 700 }}>{p.nombre}</div>
                          {p.desc && <div style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '2px' }}>{p.desc}</div>}
                          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--accent)', marginTop: 'auto', paddingTop: '6px', fontFamily: 'var(--mono)' }}>{fmt(p.precio)}</div>
                        </div>
                        <div style={{ flexShrink: 0, alignSelf: 'flex-end' }}>
                          {detalleEstaAbierto ? (
                            <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', borderRadius: '999px', padding: '8px 16px' }} onClick={cerrarDetalle}>Cerrar</button>
                          ) : enCarrito ? (
                            <button className="btn btn-sm" style={{ borderRadius: '999px', padding: '8px 16px' }} onClick={() => abrirDetalle(p)}>Editar ({cantEnCarrito})</button>
                          ) : (
                            <button className="btn btn-primary btn-sm catalogo-agregar-btn" style={{ borderRadius: '999px', padding: '8px 18px' }} onClick={() => abrirDetalle(p)}>Agregar</button>
                          )}
                        </div>
                      </div>

                      {p.descLarga && (() => {
                        const descAbierta = descsExpandidas.has(p.id);
                        return (
                          <div style={{ marginTop: '10px' }}>
                            <div style={{
                              fontSize: '12px', color: 'var(--text2)', lineHeight: '1.45', whiteSpace: 'pre-wrap',
                              ...(descAbierta ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' })
                            }}>
                              {linkificar(p.descLarga)}
                            </div>
                            <button
                              onClick={() => toggleDescExpandida(p.id)}
                              style={{ background: 'none', border: 'none', padding: 0, marginTop: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}
                            >
                              {descAbierta ? 'Ver menos' : 'Ver descripción'}
                            </button>
                          </div>
                        );
                      })()}

                      {detalleEstaAbierto && (
                        <div style={{ background: 'var(--bg3)', border: '1px dashed var(--border2)', borderRadius: '12px', padding: '12px', marginTop: '12px' }}>
                          {draftVersiones.map(v => (
                            <div key={v.localId} style={{ display: 'grid', gridTemplateColumns: p.modoColorSecundario === 'libre' ? '56px 1fr 1fr 1fr auto' : '56px 1fr 1fr auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                              <CampoNumero min="0" value={v.cantidad}
                                onChange={(e) => actualizarDraftVersion(v.localId, 'cantidad', e.target.value)}
                              />
                              {p.modoColorSecundario === 'combinaciones' ? (
                                <select
                                  value={(() => {
                                    const idx = combinaciones.findIndex(c => c.color === v.color && c.colorSecundario === v.colorSecundario);
                                    return idx >= 0 ? String(idx) : '';
                                  })()}
                                  onChange={(e) => actualizarDraftCombinacion(v.localId, combinaciones[parseInt(e.target.value, 10)])}
                                >
                                  <option value="">Elegí una combinación…</option>
                                  {combinaciones.map((comb, ci) => (
                                    combinacionPermitida(p, comb.color, comb.colorSecundario) && <option key={ci} value={ci}>{comb.color} + {comb.colorSecundario}</option>
                                  ))}
                                </select>
                              ) : (
                                <select value={v.color} onChange={(e) => actualizarDraftVersion(v.localId, 'color', e.target.value)}>
                                  <option value="">{colores.length ? 'Elegí un color…' : 'Sin color'}</option>
                                  {colores.map((c, ci) => colorPermitido(p, c.nombre) && <option key={ci} value={c.nombre}>{c.nombre}</option>)}
                                </select>
                              )}
                              {p.modoColorSecundario === 'libre' && (
                                <select value={v.colorSecundario || ''} onChange={(e) => actualizarDraftVersion(v.localId, 'colorSecundario', e.target.value)}>
                                  <option value="">Sin combinar</option>
                                  {coloresSecundarios.map((c, ci) => <option key={ci} value={c.nombre}>{c.nombre}</option>)}
                                </select>
                              )}
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
                };

                return (
                  <div className="catalogo-productos-grid" style={{ padding: '4px 0 22px', borderBottom: '1px solid var(--border)', rowGap: '22px' }}>
                    {subcatKeys.flatMap(sc => {
                      if (sc === '' || !hayVariedad) {
                        return bySubcat.get(sc).map(renderProducto);
                      }
                      const key = `${cat}::${sc}`;
                      const subAbierta = subcatsAbiertas.has(key);
                      const subItems = bySubcat.get(sc);
                      return [
                        <button
                          key={`h-${sc}`}
                          onClick={() => toggleSubcatAbierta(key)}
                          style={{
                            gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                            padding: '10px 4px', borderBottom: subAbierta ? 'none' : '1px solid var(--border)'
                          }}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {sc}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {subItems.length}
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '11px', height: '11px', transform: subAbierta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                              <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>,
                        ...(subAbierta ? subItems.map(renderProducto) : [])
                      ];
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
      )}

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
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Tu pedido</div>
              <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', borderRadius: '999px', width: '30px', height: '30px', padding: 0, justifyContent: 'center' }} onClick={() => setCarritoAbierto(false)}>✕</button>
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
                        {repartoDe(it.prodId, it.versiones).map(v => (
                          <div key={v.localId} style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                            {v.cantidad}× {v.color || 'sin color'}{v.colorSecundario ? ` + ${v.colorSecundario}` : ''}{v.comentario ? ` — ${v.comentario}` : ''}
                            {config.modo === 'tienda' && (
                              <strong style={{ marginLeft: '6px', color: v.deStock >= v.cantidad ? 'var(--accent)' : 'var(--text2)' }}>
                                {v.deStock >= v.cantidad ? '· en stock' : v.deStock > 0 ? `· ${v.deStock} en stock, ${v.cantidad - v.deStock} a pedido` : '· a pedido'}
                              </strong>
                            )}
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
                <input type="text" maxLength={150} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre y apellido" />

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
                <input type="email" maxLength={150} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />

                <label className="fl">Comentario general (opcional)</label>
                <input type="text" maxLength={1500} value={comentarioGeneral} onChange={(e) => setComentarioGeneral(e.target.value)} placeholder="Ej: lo necesito para el viernes" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text3)' }}>Total estimado</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(totalCarrito)}</span>
                </div>

                {!aceptaPedidos && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
                    La tienda no está recibiendo pedidos por el catálogo en este momento. Contactala directamente.
                  </div>
                )}
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={enviando || !aceptaPedidos} onClick={handleEnviar}>
                  {enviando ? 'Enviando…' : 'Enviar pedido'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {imagenAmpliada && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
          }}
        >
          {/* Solo se cierra con este botón: tocar fuera de la imagen no la cierra, para evitar cierres sin querer. */}
          <button
            onClick={() => setImagenAmpliada(null)}
            style={{ position: 'absolute', top: '14px', right: '14px', width: '38px', height: '38px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '20px', lineHeight: 1, cursor: 'pointer' }}
            aria-label="Cerrar"
          >
            ✕
          </button>
          <div style={{ textAlign: 'center', maxWidth: '100%' }}>
            <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
              <img
                src={imagenAmpliada.imagenes[imagenAmpliada.index]}
                alt={imagenAmpliada.nombre}
                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px', background: 'var(--bg2)' }}
              />
              {imagenAmpliada.imagenes.length > 1 && (
                <>
                  <button
                    onClick={() => setImagenAmpliada(a => ({ ...a, index: (a.index - 1 + a.imagenes.length) % a.imagenes.length }))}
                    style={{ position: 'absolute', top: '50%', left: '8px', transform: 'translateY(-50%)', width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '16px', cursor: 'pointer' }}
                    aria-label="Anterior"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setImagenAmpliada(a => ({ ...a, index: (a.index + 1) % a.imagenes.length }))}
                    style={{ position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)', width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '16px', cursor: 'pointer' }}
                    aria-label="Siguiente"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {imagenAmpliada.imagenes.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' }}>
                {imagenAmpliada.imagenes.map((_, i) => (
                  <span
                    key={i}
                    onClick={() => setImagenAmpliada(a => ({ ...a, index: i }))}
                    style={{
                      width: '7px', height: '7px', borderRadius: '50%', cursor: 'pointer',
                      background: i === imagenAmpliada.index ? 'var(--accent)' : 'rgba(255,255,255,.4)'
                    }}
                  />
                ))}
              </div>
            )}
            <div style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '10px' }}>{imagenAmpliada.nombre}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Pantalla del catálogo desactivado: el logo y el nombre de la tienda (con su paleta) y un mensaje de mantenimiento.
// Si la tienda tiene WhatsApp cargado, ofrece escribirle (es el mismo número que muestra el catálogo activo).
function CatalogoEnMantenimiento({ config, paleta }) {
  const tamano = Math.min(tamanoLogoDe(config), 140);
  const nombre = config.empresaNombre || '';
  const waLink = config.telefono ? `https://wa.me/${config.telefono.replace(/\D/g, '')}` : null;
  return (
    <div style={{ ...paleta, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px', color: 'var(--text2)', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '440px' }}>
        {config.logo ? (
          <img src={config.logo} alt={nombre} style={{ height: `${tamano}px`, width: 'auto', maxWidth: '80vw', objectFit: 'contain', borderRadius: `${Math.min(14, Math.round(tamano / 4))}px`, marginBottom: '18px' }} />
        ) : nombre ? (
          <div style={{
            width: `${tamano}px`, height: `${tamano}px`, borderRadius: `${Math.min(14, Math.round(tamano / 4))}px`, margin: '0 auto 18px', background: 'var(--text)', color: 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: `${Math.round(tamano * 0.4)}px`
          }}>
            {nombre[0].toUpperCase()}
          </div>
        ) : null}
        {nombre && <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '14px' }}>{nombre}</div>}
        <div style={{ fontSize: '40px', marginBottom: '6px' }}>🛠️</div>
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Estamos en mantenimiento</div>
        <div style={{ fontSize: '15px', lineHeight: 1.6 }}>
          Estamos preparando novedades para vos.<br />Volvé a visitarnos pronto, ¡te vamos a sorprender!
        </div>
        {waLink && (
          <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 18px', borderRadius: '999px', border: '1px solid var(--border2)', color: 'var(--text)', textDecoration: 'none', fontSize: '14px' }}>
            Escribinos por WhatsApp
          </a>
        )}
      </div>
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
