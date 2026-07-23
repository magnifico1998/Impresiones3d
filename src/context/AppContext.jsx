import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, getDocs, writeBatch, query, orderBy } from 'firebase/firestore';
import { paletas } from '../utils/paletas';

const AppContext = createContext();

const defaultCfg = {
  palette: 'mint',
  filamentos: [
    { nombre: 'PLA Blanco', precio: 17000 },
    { nombre: 'PLA Negro', precio: 18000 },
    { nombre: 'PLA Rojo', precio: 18500 },
    { nombre: 'PLA Azul', precio: 18500 },
    { nombre: 'PETG Transparente', precio: 22000 },
    { nombre: 'ABS Gris', precio: 19000 },
    { nombre: 'TPU', precio: 28000 }
  ],
  impresoras: [
    { nombre: 'Bambu X1', watts: 350, mant: 200 },
    { nombre: 'Prusa MK4', watts: 200, mant: 150 },
    { nombre: 'Ender 3', watts: 120, mant: 80 }
  ],
  insumos: [
    { nombre: 'Soporte/raft', precio: 500 },
    { nombre: 'Adhesivo de cama', precio: 300 },
    { nombre: 'Lijado', precio: 800 },
    { nombre: 'Pintado', precio: 1500 },
    { nombre: 'Empaque / envío', precio: 700 }
  ],
  colores: [
    { nombre: 'Blanco', hex: '#f5f5f5' },
    { nombre: 'Negro', hex: '#1a1a1a' },
    { nombre: 'Rojo', hex: '#e53935' },
    { nombre: 'Azul', hex: '#1e88e5' },
    { nombre: 'Verde', hex: '#43a047' },
    { nombre: 'Gris', hex: '#9e9e9e' },
    { nombre: 'Amarillo', hex: '#fdd835' }
  ],
  metodosEnvio: [
    { nombre: 'Correo Argentino', urlSeguimiento: 'https://www.correoargentino.com.ar/seguimiento?codigo={codigo}' },
    { nombre: 'Andreani', urlSeguimiento: 'https://www.andreani.com/#!/informacionEnvio/{codigo}' },
    { nombre: 'Retiro en persona', urlSeguimiento: '' },
    { nombre: 'Envío propio', urlSeguimiento: '' }
  ],
  kwh: 120,
  mo: 500,
  margen: 100,
  desperdicio: 5,
  // Orden manual de categorías (arrastrar para reordenar en Biblioteca).
  // Lista de nombres de categoría; las que no aparecen acá se agregan al
  // final ordenadas alfabéticamente. Se persiste igual que el resto de cfg.
  categoriaOrden: []
};

const defaultEmpresa = {
  nombre: '',
  cuit: '',
  direccion: '',
  cp: '',
  email: '',
  telefono: '',
  facebook: '',
  instagram: '',
  logo: ''
};

export const AppProvider = ({ children }) => {
  const [pedidos, setPedidos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [biblioteca, setBiblioteca] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [empresa, setEmpresa] = useState(defaultEmpresa);
  const [cfg, setCfg] = useState(defaultCfg);
  const [idCounter, setIdCounter] = useState(1);

  // Catálogo web público (colecciones raíz, fuera de users/{uid}, porque
  // las lee gente sin login desde /catalogo). catalogoConfig/meta guarda la
  // config visible del catálogo (colores, nombre, activo/inactivo).
  // catalogoSolicitudes son los "carritos" que arma un cliente y se leen
  // acá para poder importarlos como Pedido con un clic.
  const [catalogoConfig, setCatalogoConfig] = useState(null);
  const [solicitudesWeb, setSolicitudesWeb] = useState([]);
  
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [suscripcion, setSuscripcion] = useState(null);
  const [planContratado, setPlanContratado] = useState(null);
  const [consumoActual, setConsumoActual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('resumen');

  // datosCargadosOk: sólo pasa a true cuando cargarDatosDeFirestore terminó
  // con éxito (sea porque encontró el documento del usuario, o porque creó
  // uno nuevo). Es el guardián que evita que el autosave escriba en la nube
  // antes de tener la certeza de qué había ahí realmente.
  const [datosCargadosOk, setDatosCargadosOk] = useState(false);
  // loadError: la carga inicial (o un reintento) falló. Mientras esté en
  // true, la app no debe permitir edición normal, porque cualquier cambio
  // dispararía un guardado que pisaría la nube con el estado default vacío.
  const [loadError, setLoadError] = useState(false);
  
  // Toasts
  const [toasts, setToasts] = useState([]);

  // Indica si el último intento de guardado en la nube falló después de agotar
  // los reintentos. Se usa para mostrar un aviso persistente (no solo un toast
  // que desaparece) mientras el problema no se resuelva.
  const [syncError, setSyncError] = useState(false);

  const showToast = (message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  // Referencia usada por getNewId para evitar que dos IDs generados en la
  // misma pestaña dentro del mismo milisegundo colisionen (ver más abajo).
  const idSeqRef = useRef(0);

  // ---------------------------------------------------------------------
  // FASE 1 de la migración a Firestore por secciones: config + empresa +
  // counter pasan a vivir en su propio documento (users/{uid}/meta/config)
  // en vez de ser campos del documento monolítico users/{uid}. Es la
  // sección piloto elegida por ser la más chica y la que menos cambia.
  //
  // Usa el mismo patrón de detección de eco que en su momento tuvo el
  // documento principal — así un guardado de config no interfiere con las
  // demás subcolecciones (pedidos/biblioteca/clientes/compras), y viceversa.
  // (El documento principal users/{uid} ya no existe como tal desde la
  // limpieza de Fase 5 — ver cargarDatosDeFirestore.)
  const lastWrittenTimestampRefMeta = useRef(null);
  const pendingWriteTimestampRefMeta = useRef(null);
  const skipNextAutosaveRefMeta = useRef(false);

  const getNewId = () => {
    // ALTO (antes): getNewId devolvía un contador secuencial local
    // (idCounter: 1, 2, 3...). Si el mismo usuario tenía dos pestañas o
    // dispositivos abiertos, cada uno partía del mismo valor y podía generar
    // el mismo ID para dos pedidos/compras/productos distintos. Al guardar,
    // sólo sobrevivía uno de los dos (el otro quedaba "fantasma": referenciado
    // en un lado pero pisado en la nube).
    //
    // Ahora: combinamos el timestamp actual (ms) con un contador local que
    // rota en cada llamada, para lograr un ID prácticamente único por
    // pestaña/dispositivo sin necesitar coordinación con el servidor. Se
    // mantiene como number (no string) porque el resto del código hace
    // parseInt(id, 10) en varios lugares (ej. selects de "pedido destino").
    idSeqRef.current = (idSeqRef.current + 1) % 1000;
    return Date.now() * 1000 + idSeqRef.current;
  };

  // ---------------------------------------------------------------------
  // FASE 5 (limpieza final): compras era la última sección que seguía con
  // el patrón "array + autosave debounced" de Fase 0 sobre el documento
  // monolítico users/{uid}. Con esto, las 5 secciones (meta/config,
  // clientes, biblioteca, pedidos, compras) ya viven cada una en su propio
  // lugar en Firestore, y el documento users/{uid} deja de usarse para
  // guardar datos — sólo se lee una vez, al migrar, por si un usuario
  // viejo todavía tiene algo ahí (ver cargarDatosDeFirestore).
  const compraDocRef = (id) => doc(db, "users", user.uid, "compras", String(id));

  const addCompra = async (item) => {
    try {
      await setDoc(compraDocRef(item.id), item);
    } catch (e) {
      console.error("Error al guardar compra:", e);
      showToast('⚠ No se pudo guardar la compra en la nube.', 'error');
    }
  };

  const updateCompra = async (id, updater) => {
    try {
      const actual = compras.find(c => c.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      await setDoc(compraDocRef(id), nuevo);
    } catch (e) {
      console.error("Error al actualizar compra:", e);
      showToast('⚠ No se pudo actualizar la compra en la nube.', 'error');
    }
  };

  const removeCompra = async (id) => {
    try {
      await deleteDoc(compraDocRef(id));
    } catch (e) {
      console.error("Error al eliminar compra:", e);
      showToast('⚠ No se pudo eliminar la compra en la nube.', 'error');
    }
  };

  const migrarComprasSiHaceFalta = async (uid, legacyCompras) => {
    const colRef = collection(db, "users", uid, "compras");
    const snap = await getDocs(colRef);
    if (!snap.empty) return;
    if (!legacyCompras || legacyCompras.length === 0) return;

    const batch = writeBatch(db);
    legacyCompras.forEach(c => {
      batch.set(doc(db, "users", uid, "compras", String(c.id)), c);
    });
    await batch.commit();
    console.log(`Fase 5: ${legacyCompras.length} compra(s) migrada(s) a users/{uid}/compras.`);
  };

  // ---------------------------------------------------------------------
  // FASE 2 de la migración a Firestore por secciones: clientes pasa de ser
  // un array dentro del documento monolítico a una subcolección propia
  // (users/{uid}/clientes/{clienteId}), un documento por cliente.
  //
  // A diferencia de pedidos/biblioteca/compras (que en esta fase siguen
  // con el patrón "array + autosave debounced" de Fase 0), clientes ahora
  // escribe directo a Firestore en cada add/update/remove — sin debounce,
  // porque estas funciones ya se llaman solo en acciones explícitas
  // (guardar/eliminar en un modal), no en cada tecla. El estado local
  // `clientes` deja de ser la fuente de verdad: pasa a ser un reflejo del
  // listener en tiempo real de la subcolección (más abajo), igual que ya
  // pasaba con config/empresa en Fase 1.
  //
  // Mantenemos los mismos nombres (addCliente/updateCliente/removeCliente)
  // que ya exportaba Fase 0, así ningún componente necesita cambios: sólo
  // cambió qué hacen estas funciones por dentro.
  const clienteDocRef = (id) => doc(db, "users", user.uid, "clientes", String(id));

  const addCliente = async (item) => {
    try {
      await setDoc(clienteDocRef(item.id), item);
    } catch (e) {
      console.error("Error al guardar cliente:", e);
      showToast('⚠ No se pudo guardar el cliente en la nube.', 'error');
    }
  };

  const updateCliente = async (id, updater) => {
    try {
      const actual = clientes.find(c => c.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      await setDoc(clienteDocRef(id), nuevo);
    } catch (e) {
      console.error("Error al actualizar cliente:", e);
      showToast('⚠ No se pudo actualizar el cliente en la nube.', 'error');
    }
  };

  const removeCliente = async (id) => {
    try {
      await deleteDoc(clienteDocRef(id));
    } catch (e) {
      console.error("Error al eliminar cliente:", e);
      showToast('⚠ No se pudo eliminar el cliente en la nube.', 'error');
    }
  };

  // Migra los clientes del documento monolítico legacy (si existían) a la
  // subcolección nueva, sólo la primera vez: si la subcolección ya tiene
  // documentos, no hace nada.
  const migrarClientesSiHaceFalta = async (uid, legacyClientes) => {
    const colRef = collection(db, "users", uid, "clientes");
    const snap = await getDocs(colRef);
    if (!snap.empty) return;
    if (!legacyClientes || legacyClientes.length === 0) return;

    const batch = writeBatch(db);
    legacyClientes.forEach(c => {
      batch.set(doc(db, "users", uid, "clientes", String(c.id)), c);
    });
    await batch.commit();
    console.log(`Fase 2: ${legacyClientes.length} cliente(s) migrados a users/{uid}/clientes.`);
  };

  // ---------------------------------------------------------------------
  // FASE 3 de la migración a Firestore por secciones: biblioteca pasa de
  // ser un array dentro del documento monolítico a una subcolección propia
  // (users/{uid}/biblioteca/{productoId}), un documento por producto. Es la
  // sección que más pesaba del documento viejo (por las imágenes, aunque
  // ahora sólo se guarda la URL de Storage, no el base64) y la principal
  // candidata a acercarse al límite de 1 MiB de Firestore — separarla es el
  // beneficio más directo de esta migración.
  //
  // Mismo patrón que clientes en Fase 2: escritura directa por documento,
  // sin debounce, estado local alimentado por un listener en tiempo real
  // sobre la subcolección. La diferencia acá es que varias pantallas
  // (recalcular precios, ajuste masivo, actualización masiva) necesitan
  // actualizar VARIOS productos a la vez — para eso se agrega
  // updateProductosBulk, que hace un solo writeBatch en vez de N escrituras
  // sueltas.
  const productoDocRef = (id) => doc(db, "users", user.uid, "biblioteca", String(id));

  const addProducto = async (item) => {
    try {
      await setDoc(productoDocRef(item.id), item);
    } catch (e) {
      console.error("Error al guardar producto:", e);
      showToast('⚠ No se pudo guardar el producto en la nube.', 'error');
    }
  };

  const updateProducto = async (id, updater) => {
    try {
      const actual = biblioteca.find(p => p.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      await setDoc(productoDocRef(id), nuevo);
    } catch (e) {
      console.error("Error al actualizar producto:", e);
      showToast('⚠ No se pudo actualizar el producto en la nube.', 'error');
      // Antes este error se atrapaba acá y nunca se volvía a lanzar, así que
      // quien llamaba a updateProducto no tenía forma de saber que la
      // escritura había fallado — por eso el modal de edición mostraba
      // igual el toast de "✓ actualizado" aunque el guardado real hubiera
      // fracasado. Relanzamos para que el caller pueda reaccionar (ver
      // ModalBibEditarCat.jsx).
      throw e;
    }
  };

  const removeProducto = async (id) => {
    try {
      await deleteDoc(productoDocRef(id));
    } catch (e) {
      console.error("Error al eliminar producto:", e);
      showToast('⚠ No se pudo eliminar el producto en la nube.', 'error');
    }
  };

  // ids: array o Set de ids a actualizar. updater: (item) => nuevoItem,
  // recibe el producto ACTUAL (de `biblioteca`) y devuelve la versión
  // completa a guardar. Los productos cuyo id no esté en `biblioteca` se
  // omiten silenciosamente (por si se armó la selección con datos viejos).
  const updateProductosBulk = async (ids, updater) => {
    try {
      const idSet = ids instanceof Set ? ids : new Set(ids);
      const afectados = biblioteca.filter(p => idSet.has(p.id));
      if (!afectados.length) return;

      const batch = writeBatch(db);
      afectados.forEach(p => {
        const nuevo = updater(p);
        batch.set(productoDocRef(p.id), nuevo);
      });
      await batch.commit();
    } catch (e) {
      console.error("Error al actualizar productos en lote:", e);
      showToast('⚠ No se pudo aplicar la actualización masiva en la nube.', 'error');
    }
  };

  const migrarBibliotecaSiHaceFalta = async (uid, legacyBiblioteca) => {
    const colRef = collection(db, "users", uid, "biblioteca");
    const snap = await getDocs(colRef);
    if (!snap.empty) return;
    if (!legacyBiblioteca || legacyBiblioteca.length === 0) return;

    const batch = writeBatch(db);
    legacyBiblioteca.forEach(p => {
      batch.set(doc(db, "users", uid, "biblioteca", String(p.id)), p);
    });
    await batch.commit();
    console.log(`Fase 3: ${legacyBiblioteca.length} producto(s) migrados a users/{uid}/biblioteca.`);
  };

  // ---------------------------------------------------------------------
  // FASE 4 de la migración a Firestore por secciones: pedidos pasa de ser
  // un array dentro del documento monolítico a una subcolección propia
  // (users/{uid}/pedidos/{pedidoId}), un documento por pedido. Es la
  // última sección y la más delicada: la de mayor volumen de escritura y
  // la que originalmente disparaba el bug de la race condition (un único
  // timestamp de eco compartido para todo el documento monolítico no
  // alcanzaba cuando había múltiples guardados en vuelo). Con cada pedido
  // como documento independiente, ese problema desaparece de raíz: ya no
  // hay un timestamp global que comparar, cada escritura confirma sólo su
  // propio documento.
  //
  // Mismo patrón que clientes/biblioteca: escritura directa por documento,
  // estado local alimentado por listener en tiempo real. Se agrega además
  // updatePedidosDondeCoincida, para el único caso de actualización masiva
  // que existe hoy (renombrar el cliente en todos sus pedidos cuando se
  // edita el nombre del cliente) — a diferencia de updateProductosBulk
  // (Fase 3), acá no se conoce el conjunto de ids de antemano, se filtra
  // por una condición.
  const pedidoDocRef = (id) => doc(db, "users", user.uid, "pedidos", String(id));

  const addPedido = async (item) => {
    try {
      await setDoc(pedidoDocRef(item.id), item);
    } catch (e) {
      console.error("Error al guardar pedido:", e);
      showToast('⚠ No se pudo guardar el pedido en la nube.', 'error');
    }
  };

  const updatePedido = async (id, updater) => {
    try {
      const actual = pedidos.find(p => p.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      await setDoc(pedidoDocRef(id), nuevo);
    } catch (e) {
      console.error("Error al actualizar pedido:", e);
      showToast('⚠ No se pudo actualizar el pedido en la nube.', 'error');
    }
  };

  const removePedido = async (id) => {
    try {
      await deleteDoc(pedidoDocRef(id));
    } catch (e) {
      console.error("Error al eliminar pedido:", e);
      showToast('⚠ No se pudo eliminar el pedido en la nube.', 'error');
    }
  };

  // predicate: (pedido) => boolean. updater: (pedido) => nuevoPedido.
  const updatePedidosBulk = async (predicate, updater) => {
    try {
      const afectados = pedidos.filter(predicate);
      if (!afectados.length) return;

      const batch = writeBatch(db);
      afectados.forEach(p => {
        batch.set(pedidoDocRef(p.id), updater(p));
      });
      await batch.commit();
    } catch (e) {
      console.error("Error al actualizar pedidos en lote:", e);
      showToast('⚠ No se pudo aplicar la actualización masiva en la nube.', 'error');
    }
  };

  const migrarPedidosSiHaceFalta = async (uid, legacyPedidos) => {
    const colRef = collection(db, "users", uid, "pedidos");
    const snap = await getDocs(colRef);
    if (!snap.empty) return;
    if (!legacyPedidos || legacyPedidos.length === 0) return;

    const batch = writeBatch(db);
    legacyPedidos.forEach(p => {
      batch.set(doc(db, "users", uid, "pedidos", String(p.id)), p);
    });
    await batch.commit();
    console.log(`Fase 4: ${legacyPedidos.length} pedido(s) migrados a users/{uid}/pedidos.`);
  };

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Sesión iniciada con Google');
    } catch (error) {
      console.error("Error en autenticación:", error);
      showToast('Error al conectar con Google', 'error');
    }
  };

  const logout = async () => {
    if (window.confirm("¿Cerrar sesión en Manager3D?")) {
      await signOut(auth);
      window.location.reload();
    }
  };

  // Limpia imágenes base64 antiguas de la biblioteca (migración automática)
  const limpiarImagenesBase64 = (biblioteca) => {
    return biblioteca.map(prod => {
      if (prod.imagen && prod.imagen.startsWith('data:')) {
        console.log(`Migrando producto: ${prod.nombre} - removiendo imagen base64`);
        return { ...prod, imagen: null };
      }
      return prod;
    });
  };

  // Carga config + empresa + counter desde su documento propio
  // (users/{uid}/meta/config). Si todavía no existe (usuario no migrado a
  // Fase 1 todavía), cae de nuevo al documento monolítico legacy y, en el
  // mismo momento, escribe ya la versión separada — así la próxima carga
  // de esta sección no necesita el fallback.
  const cargarConfigDeFirestore = async (uid, legacyCloud) => {
    const metaRef = doc(db, "users", uid, "meta", "config");
    const metaSnap = await getDoc(metaRef);

    if (metaSnap.exists()) {
      const meta = metaSnap.data();
      setCfg(meta.config ?? defaultCfg);
      setEmpresa(meta.empresa ?? defaultEmpresa);
      setIdCounter(Number(meta.counter ?? 1));
      lastWrittenTimestampRefMeta.current = meta.ultimaActualizacion || null;
      pendingWriteTimestampRefMeta.current = null;
      return;
    }

    // Fallback: usuario todavía no migrado a Fase 1. legacyCloud puede
    // venir de un documento users/{uid} ya existente (usuario viejo) o ser
    // null (usuario nuevo, sin nada todavía en ningún lado).
    const cfgFallback = legacyCloud?.config ?? defaultCfg;
    const empresaFallback = legacyCloud?.empresa ?? defaultEmpresa;
    const counterFallback = Number(legacyCloud?.counter ?? 1);

    setCfg(cfgFallback);
    setEmpresa(empresaFallback);
    setIdCounter(counterFallback);

    const migrationTimestamp = new Date().toISOString();
    const metaPayload = {
      config: cfgFallback,
      empresa: empresaFallback,
      counter: counterFallback,
      ultimaActualizacion: migrationTimestamp
    };
    await setDoc(metaRef, metaPayload);
    lastWrittenTimestampRefMeta.current = migrationTimestamp;
    pendingWriteTimestampRefMeta.current = null;
    console.log("Fase 1: config/empresa/counter migrados a users/{uid}/meta/config.");
  };

  // Load data from Firestore
  const cargarDatosDeFirestore = async (uid) => {
    try {
      console.log("Cargando datos desde Firebase...");
      // FASE 5 (limpieza final): el documento users/{uid} ya no es la fuente
      // de verdad de nada — cada sección vive en su propia subcolección
      // (meta/config, clientes, biblioteca, pedidos, compras). Este doc
      // sólo se lee acá, una vez, por si un usuario todavía tiene datos
      // legacy sin migrar (por ejemplo, alguien que no abrió la app desde
      // antes de la Fase 1). Si existe, migramos lo que haga falta y
      // borramos el documento — no vuelve a usarse nunca más.
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const cloud = docSnap.data();
        const bibliotecaLimpia = limpiarImagenesBase64(cloud.biblioteca ?? []);

        await migrarPedidosSiHaceFalta(uid, cloud.pedidos ?? []);
        await migrarBibliotecaSiHaceFalta(uid, bibliotecaLimpia);
        await migrarClientesSiHaceFalta(uid, cloud.clientes ?? []);
        await migrarComprasSiHaceFalta(uid, cloud.compras ?? []);
        await cargarConfigDeFirestore(uid, cloud);

        // Ya migramos todo lo que pudiera haber legacy acá — el documento
        // monolítico no se vuelve a leer ni escribir. Lo borramos para no
        // dejar datos duplicados y desactualizados dando vueltas en la nube.
        await deleteDoc(docRef);
        console.log("Fase 5: documento legacy users/{uid} migrado y eliminado.");
      } else {
        // Usuario ya migrado (o nuevo): no hay nada que leer del doc
        // principal. Cada subcolección se crea sola en el primer
        // addCliente/addProducto/addPedido/addCompra, y meta/config se
        // inicializa con sus valores default en cargarConfigDeFirestore.
        await cargarConfigDeFirestore(uid, null);
      }

      // El próximo cambio de cfg/empresa/idCounter que dispare el efecto de
      // autosave de meta/config va a ser el "eco" de haber cargado datos de
      // la nube recién, no una edición real del usuario — no hace falta
      // volver a guardar lo que ya está guardado.
      skipNextAutosaveRefMeta.current = true;
      setLoadError(false);
      setDatosCargadosOk(true);
    } catch (e) {
      console.error("Error al cargar datos de Firestore:", e);

      // CRÍTICO: a propósito NO marcamos datosCargadosOk como true acá.
      // pedidos/compras/biblioteca/etc. siguen en sus valores default
      // (arrays vacíos) porque la carga falló. Si el autosave corriera
      // igual, el próximo guardado pisaría el documento completo en la nube
      // con ese estado vacío, borrando todo el historial real del usuario
      // por lo que puede ser un simple corte de red momentáneo.
      setLoadError(true);
      showToast(
        '⚠ No se pudieron cargar tus datos desde la nube. No seguimos para evitar sobrescribir tu información — probá reintentar.',
        'error',
        10000
      );
    }
  };

  // Permite reintentar la carga manualmente (botón "Reintentar" en la
  // pantalla de error) sin tener que recargar toda la página.
  const reintentarCargaDatos = async () => {
    if (!user) return;
    setLoading(true);
    await cargarDatosDeFirestore(user.uid);
    setLoading(false);
  };

  // Initial load from Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await cargarDatosDeFirestore(currentUser.uid);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Chequeo de permisos de administrador: escuchamos en tiempo real el doc
  // admins/{email} (ID = email en minúsculas). Si existe, el usuario es
  // admin; si no, o si cambia (se lo quitan mientras tiene la app abierta),
  // se refleja al toque sin necesidad de recargar. Ver firestore.rules:
  // sólo puede leer su propio doc (o el listado completo si ya es admin),
  // y nadie puede escribir esta colección desde el cliente.
  useEffect(() => {
    if (!user || !user.email) {
      setIsAdmin(false);
      return;
    }
    const adminRef = doc(db, 'admins', user.email.toLowerCase());
    const unsubscribeAdmin = onSnapshot(
      adminRef,
      (snap) => setIsAdmin(snap.exists()),
      (err) => {
        console.error('Error verificando permisos de administrador:', err);
        setIsAdmin(false);
      }
    );
    return unsubscribeAdmin;
  }, [user]);

  // Estado de la suscripción propia: trial/activa/lectura/suspendida. Lo
  // escuchamos en tiempo real para que el cartel de Resumen (y cualquier
  // bloqueo de UI) reaccione al toque si un admin activa la cuenta o si
  // la función programada la pasa a modo lectura mientras la app está
  // abierta, sin necesidad de recargar.
  useEffect(() => {
    if (!user) {
      setSuscripcion(null);
      return;
    }
    const subRef = doc(db, 'users', user.uid, 'suscripcion', 'actual');
    const unsubscribeSub = onSnapshot(
      subRef,
      (snap) => setSuscripcion(snap.exists() ? snap.data() : null),
      (err) => {
        console.error('Error al escuchar la suscripción:', err);
        setSuscripcion(null);
      }
    );
    return unsubscribeSub;
  }, [user]);

  // Plan contratado (para mostrar nombre/precio/límites en Resumen y en
  // "Mi emprendimiento"). Depende de suscripcion.planId, así que se
  // re-suscribe solo cuando cambia el plan asignado, no en cada cambio de
  // otra cosa dentro de suscripcion.
  useEffect(() => {
    if (!suscripcion?.planId) {
      setPlanContratado(null);
      return;
    }
    const planRef = doc(db, 'planes', suscripcion.planId);
    const unsubscribePlan = onSnapshot(
      planRef,
      (snap) => setPlanContratado(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => {
        console.error('Error al escuchar el plan contratado:', err);
        setPlanContratado(null);
      }
    );
    return unsubscribePlan;
  }, [suscripcion?.planId]);

  // Consumo del ciclo de facturación vigente (pedidos, aperturas de
  // catálogo, monto facturado) -- lo incrementan las Cloud Functions, acá
  // sólo lo leemos para mostrarlo. Depende de suscripcion.cicloId, así que
  // al arrancar un ciclo nuevo se cambia solo de documento.
  useEffect(() => {
    if (!user || !suscripcion?.cicloId) {
      setConsumoActual(null);
      return;
    }
    const contadorRef = doc(db, 'users', user.uid, 'suscripcion', 'actual', 'contadores', suscripcion.cicloId);
    const unsubscribeContador = onSnapshot(
      contadorRef,
      (snap) => setConsumoActual(snap.exists() ? snap.data() : { pedidosCreados: 0, aperturasCatalogo: 0, montoFacturado: 0 }),
      (err) => {
        console.error('Error al escuchar el consumo del ciclo:', err);
        setConsumoActual(null);
      }
    );
    return unsubscribeContador;
  }, [user, suscripcion?.cicloId]);

  useEffect(() => {
    if (cfg?.palette) {
      const palette = paletas[cfg.palette] || paletas.mint;
      Object.entries(palette).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    }
  }, [cfg?.palette]);

  // Auto-save de config + empresa + counter a su documento propio
  // (users/{uid}/meta/config). Mismo patrón de debounce + reintentos que el
  // autosave principal, pero completamente independiente: un cambio acá no
  // dispara ni cancela el guardado de pedidos/biblioteca/clientes/compras,
  // y viceversa.
  const debounceTimeoutRefMeta = useRef(null);
  const saveRetryTimeoutRefMeta = useRef(null);

  useEffect(() => {
    if (loading || !user || !datosCargadosOk) return;

    if (skipNextAutosaveRefMeta.current) {
      skipNextAutosaveRefMeta.current = false;
      return;
    }

    let cancelado = false;

    if (debounceTimeoutRefMeta.current) {
      clearTimeout(debounceTimeoutRefMeta.current);
      debounceTimeoutRefMeta.current = null;
    }
    if (saveRetryTimeoutRefMeta.current) {
      clearTimeout(saveRetryTimeoutRefMeta.current);
      saveRetryTimeoutRefMeta.current = null;
    }

    debounceTimeoutRefMeta.current = setTimeout(() => {
      if (cancelado) return;

      const timestamp = new Date().toISOString();
      const metaPayload = {
        config: cfg,
        empresa,
        counter: idCounter,
        ultimaActualizacion: timestamp
      };

      const metaRef = doc(db, "users", user.uid, "meta", "config");

      const intentarGuardar = (intento = 0) => {
        lastWrittenTimestampRefMeta.current = timestamp;
        pendingWriteTimestampRefMeta.current = timestamp;

        setDoc(metaRef, metaPayload, { merge: true })
          .then(() => {
            if (cancelado) return;
            pendingWriteTimestampRefMeta.current = null;
            lastWrittenTimestampRefMeta.current = timestamp;
            setSyncError(prevError => {
              if (prevError) {
                showToast('✓ Conexión con la nube restablecida. Datos guardados.', 'success');
              }
              return false;
            });
          })
          .catch(e => {
            console.error("Error al guardar config/empresa en Firebase:", e);
            if (cancelado) return;

            if (intento < 2) {
              saveRetryTimeoutRefMeta.current = setTimeout(() => {
                if (!cancelado) intentarGuardar(intento + 1);
              }, 1500 * (intento + 1));
              return;
            }

            setSyncError(true);
            showToast(
              '⚠ No se pudo guardar la configuración en la nube. Revisá tu conexión.',
              'error',
              10000
            );
          });
      };

      intentarGuardar();
    }, 800);

    return () => {
      cancelado = true;
      if (debounceTimeoutRefMeta.current) {
        clearTimeout(debounceTimeoutRefMeta.current);
        debounceTimeoutRefMeta.current = null;
      }
      if (saveRetryTimeoutRefMeta.current) {
        clearTimeout(saveRetryTimeoutRefMeta.current);
        saveRetryTimeoutRefMeta.current = null;
      }
    };
  }, [cfg, empresa, idCounter, user, loading, datosCargadosOk]);

  // Listener en tiempo real para la subcolección de compras (Fase 5, la
  // última sección en migrar). Mismo criterio que clientes/biblioteca/
  // pedidos: sin detección de eco por timestamp global — cada documento de
  // compra es independiente, no hay riesgo de que se pisen entre sí.
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const colRef = collection(db, "users", user.uid, "compras");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setCompras(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de compras:", error);
      }
    );

    return () => unsubscribe();
  }, [user, datosCargadosOk]);

  // Listener en tiempo real para config + empresa + counter, ahora en su
  // propio documento (users/{uid}/meta/config). Independiente del listener
  // principal de arriba: usa sus propias referencias de eco
  // (lastWrittenTimestampRefMeta / pendingWriteTimestampRefMeta), así un
  // cambio remoto en config no se confunde con uno en pedidos/biblioteca/etc.
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const metaRef = doc(db, "users", user.uid, "meta", "config");

    const unsubscribe = onSnapshot(
      metaRef,
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        if (!snapshot.exists()) return;

        const meta = snapshot.data();

        if (
          meta.ultimaActualizacion &&
          meta.ultimaActualizacion === lastWrittenTimestampRefMeta.current
        ) {
          return;
        }

        if (
          meta.ultimaActualizacion &&
          pendingWriteTimestampRefMeta.current &&
          meta.ultimaActualizacion <= pendingWriteTimestampRefMeta.current
        ) {
          return;
        }

        setCfg(meta.config ?? defaultCfg);
        setEmpresa(meta.empresa ?? defaultEmpresa);
        setIdCounter(Number(meta.counter ?? 1));
        lastWrittenTimestampRefMeta.current = meta.ultimaActualizacion || null;
        showToast('↺ Configuración actualizada desde otra sesión.', 'info');
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de config:", error);
      }
    );

    return () => unsubscribe();
  }, [user, datosCargadosOk]);

  // Listener en tiempo real para la subcolección de clientes (Fase 2).
  // A diferencia de los otros listeners, acá no hace falta el mecanismo de
  // "timestamp propio vs ajeno": cada documento de cliente se escribe y
  // sincroniza de forma independiente, así que no hay riesgo de que un
  // guardado pise el trabajo de otro cliente en simultáneo (el problema que
  // sí existía con el array monolítico). Simplificación a propósito: no
  // mostramos el toast de "actualizado desde otra sesión" acá porque con
  // documentos independientes sería ruidoso (se dispararía en cada
  // add/update/remove propio también); el estado local simplemente refleja
  // lo que hay en Firestore en todo momento, incluida la escritura local
  // optimista antes de la confirmación del servidor.
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const colRef = collection(db, "users", user.uid, "clientes");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setClientes(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de clientes:", error);
      }
    );

    return () => unsubscribe();
  }, [user, datosCargadosOk]);

  // Listener en tiempo real para la subcolección de biblioteca (Fase 3).
  // Mismo criterio que clientes en Fase 2: sin detección de eco por
  // timestamp (cada producto es independiente), sin toast de "otra sesión"
  // por ser potencialmente ruidoso con muchos productos.
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const colRef = collection(db, "users", user.uid, "biblioteca");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setBiblioteca(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de biblioteca:", error);
      }
    );

    return () => unsubscribe();
  }, [user, datosCargadosOk]);

  // Listener en tiempo real para la subcolección de pedidos (Fase 4).
  // Mismo criterio que clientes/biblioteca: sin detección de eco por
  // timestamp global — acá es justamente donde más valía la pena, porque
  // era la sección que disparaba el bug de la race condition original.
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const colRef = collection(db, "users", user.uid, "pedidos");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setPedidos(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de pedidos:", error);
      }
    );

    return () => unsubscribe();
  }, [user, datosCargadosOk]);

  // Listener de la config pública del catálogo web de ESTA tienda (colores,
  // nombre, si está activo). Sólo se suscribe con sesión iniciada porque es
  // la pantalla de administración la que la necesita en vivo; el catálogo
  // público (/catalogo/{uid}, sin login) la lee por su cuenta con
  // getDoc/onSnapshot propio, sin pasar por este Context.
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const ref = doc(db, "catalogoTiendas", user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setCatalogoConfig(snap.exists() ? snap.data() : null);
      },
      (error) => {
        console.error("Error en la suscripción de catalogoConfig:", error);
      }
    );

    return () => unsubscribe();
  }, [user, datosCargadosOk]);

  // Listener de las solicitudes que llegan desde el catálogo web de ESTA
  // tienda. Subcolección bajo catalogoTiendas/{uid} (no bajo users/{uid})
  // porque la escribe gente sin login; acá sólo leemos (requiere estar
  // autenticado como el dueño de esa tienda, ver reglas de Firestore).
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const colRef = query(collection(db, "catalogoTiendas", user.uid, "solicitudes"), orderBy("creado", "desc"));
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setSolicitudesWeb(snapshot.docs.map(d => ({ ...d.data(), _docId: d.id })));
      },
      (error) => {
        console.error("Error en la suscripción de catalogoSolicitudes:", error);
      }
    );

    return () => unsubscribe();
  }, [user, datosCargadosOk]);

  useEffect(() => {
    try {
      const logo = empresa && empresa.logo ? empresa.logo : null;
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      if (logo) {
        link.href = logo;
      } else {
        // fallback to default favicon in public
        link.href = '/favicon.svg';
      }
    } catch (e) {
      console.error('Error setting favicon:', e);
    }
  }, [empresa && empresa.logo]);

  const exportarBackupData = () => {
    try {
      const data = {
        pedidos,
        compras,
        biblioteca,
        clientes,
        cfg,
        empresa,
        _idCounter: idCounter,
        exportado: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `manager3d-backup-${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.json`;
      a.click();
      showToast('✓ Backup descargado correctamente.');
    } catch (e) {
      console.error(e);
      showToast('Error al exportar backup.', 'error');
    }
  };

  const restaurarBackupData = async (data) => {
    try {
      // Mismo motivo que en cargarDatosDeFirestore: el próximo cambio de
      // cfg/empresa/idCounter que dispare el autosave de meta/config va a
      // ser el eco de este restore, no una edición real — no hace falta
      // volver a guardarlo.
      skipNextAutosaveRefMeta.current = true;

      if (data.cfg) setCfg(data.cfg);
      // Fase 2/3/4/5: clientes, biblioteca, pedidos y compras ya no son
      // arrays de estado que se "restauran" en memoria — se escriben
      // directo a sus subcolecciones más abajo, y los listeners en tiempo
      // real actualizan el estado local solos.
      if (data.empresa) setEmpresa(data.empresa);
      
      const nextCounter = data._idCounter || data.idCounter || 1;
      setIdCounter(Number(nextCounter));
      
      // Upload to Firebase immediately if logged in
      if (user) {
        const restoreTimestamp = new Date().toISOString();

        // Fase 1: config/empresa/counter van a su documento propio.
        await setDoc(doc(db, "users", user.uid, "meta", "config"), {
          config: data.cfg || defaultCfg,
          empresa: data.empresa || defaultEmpresa,
          counter: nextCounter,
          ultimaActualizacion: restoreTimestamp
        }, { merge: true });
        lastWrittenTimestampRefMeta.current = restoreTimestamp;
        pendingWriteTimestampRefMeta.current = null;

        // Fase 2/3/4/5: cada sección del backup va directo a su
        // subcolección, un documento por ítem, en su propio batch (los
        // batch de Firestore tienen un límite de 500 operaciones, así que
        // conviene no mezclar secciones grandes en el mismo batch). Primero
        // borramos lo que ya exista en la nube (si el backup tiene menos
        // ítems que los actuales, no deben quedar huérfanos), luego
        // escribimos los del backup.
        const restaurarSeccion = async (nombreColeccion, items) => {
          const colRef = collection(db, "users", user.uid, nombreColeccion);
          const actuales = await getDocs(colRef);
          const batch = writeBatch(db);
          actuales.forEach(d => batch.delete(d.ref));
          (items || []).forEach(item => {
            batch.set(doc(db, "users", user.uid, nombreColeccion, String(item.id)), item);
          });
          await batch.commit();
        };

        await restaurarSeccion("clientes", data.clientes);
        await restaurarSeccion("biblioteca", data.biblioteca);
        await restaurarSeccion("pedidos", data.pedidos);
        await restaurarSeccion("compras", data.compras);
      }
      
      showToast('✓ Backup restaurado correctamente.');
      return true;
    } catch (e) {
      console.error(e);
      showToast('Error al restaurar el backup.', 'error');
      return false;
    }
  };

  // ---- Catálogo web público ----
  // catalogoTiendas/{uid}/... — separadas de users/{uid}/* a propósito: el
  // catálogo lo navega gente sin login, y sólo debe poder LEER estas
  // cosas (y CREAR solicitudes), nunca tocar biblioteca/pedidos/etc.
  // reales. Está scopeado por uid (no en colecciones raíz compartidas)
  // para que cada tienda tenga su propio catálogo — cualquier cuenta de
  // Google puede loguearse en esta app, así que si esto viviera en una
  // colección global, un usuario podría pisar/mezclar el catálogo de
  // otro. Ver firestore.rules.

  const catalogoProductoDocRef = (id) => doc(db, "catalogoTiendas", user.uid, "productos", String(id));

  const guardarCatalogoConfig = async (parcial) => {
    try {
      const actual = catalogoConfig || {};
      const nuevo = { ...actual, ...parcial, actualizado: new Date().toISOString() };
      await setDoc(doc(db, "catalogoTiendas", user.uid), nuevo);
    } catch (e) {
      console.error("Error al guardar la configuración del catálogo:", e);
      showToast('⚠ No se pudo guardar la configuración del catálogo.', 'error');
    }
  };

  // ids: Set o array de ids de biblioteca que deben quedar PUBLICADOS en
  // /catalogo. Sólo se copian campos "públicos" (nombre, cat, desc, imagen,
  // precio de venta) a catalogoProductos — nunca costoUnitario, filDetalle,
  // impresora, etc. Cualquier producto que estaba publicado y se
  // desmarcó acá se borra de catalogoProductos.
  const publicarProductosEnCatalogo = async (ids) => {
    try {
      const idSet = ids instanceof Set ? ids : new Set(ids);
      const batch = writeBatch(db);

      biblioteca.forEach(p => {
        const debePublicarse = idSet.has(p.id);
        const estabaPublicado = !!p.pub;

        if (debePublicarse) {
          batch.set(catalogoProductoDocRef(p.id), {
            id: p.id,
            nombre: p.nombre,
            cat: p.cat || 'Sin categoría',
            desc: p.desc || '',
            imagen: p.imagen || '',
            precio: p.precioSugUnitario || p.costoUnitario || 0,
            actualizado: new Date().toISOString()
          });
          if (!estabaPublicado) {
            batch.set(productoDocRef(p.id), { ...p, pub: true });
          }
        } else if (estabaPublicado) {
          batch.delete(catalogoProductoDocRef(p.id));
          batch.set(productoDocRef(p.id), { ...p, pub: false });
        }
      });

      await batch.commit();
      showToast('✓ Catálogo publicado.');
    } catch (e) {
      console.error("Error al publicar el catálogo:", e);
      showToast('⚠ No se pudo publicar el catálogo.', 'error');
    }
  };

  // Arma una "pieza" de pedido a partir de un ítem de solicitud web,
  // heredando datos de costo del producto original en biblioteca. Mismo
  // criterio que construirPiezaDesdeBibParaPedido (ModalArmarPedido.jsx),
  // pero vive acá porque el origen es una solicitud ya armada por el
  // cliente y no una selección manual del admin.
  const construirPiezaDesdeSolicitud = (item) => {
    const prod = biblioteca.find(p => p.id === item.prodId) || {};
    const horas = prod.horas || 0;
    const watts = prod.watts || 0;
    const precioKwh = prod.precioKwh || cfg.kwh || 0;
    const moHora = prod.moHora || 0;
    const horasTrab = prod.horasTrab || 0;
    const costeElec = (watts / 1000) * horas * precioKwh;
    const costeMO = moHora * horasTrab;

    let mant = 0;
    if (prod.impresoraNombre) {
      const imp = cfg.impresoras.find(i => i.nombre === prod.impresoraNombre);
      if (imp) mant = imp.mant || 0;
    }
    const costeMant = mant * horas;

    return {
      id: getNewId(),
      nombre: item.nombre,
      archivoNombre: prod.gcodeNombre || null,
      gcodeArchivos: prod.gcodeArchivos || null,
      filDetalle: prod.filDetalle || [],
      costeElec,
      costeMant,
      costeMO,
      horas,
      impresoraNombre: prod.impresoraNombre || null,
      costoUnitario: prod.costoUnitario || 0,
      precioEstimado: item.precioUnit || prod.precioSugUnitario || 0,
      precioVenta: item.precioUnit || prod.precioSugUnitario || 0,
      cantidad: item.cantidad,
      elaborados: 0,
      notas: 'Pedido vía catálogo web',
      versiones: (item.versiones || []).map(v => ({
        id: Date.now() + Math.random(),
        cantidad: v.cantidad,
        color: v.color || '',
        comentario: v.comentario || '',
        realizados: 0
      }))
    };
  };

  // Convierte una solicitud del catálogo web en un Pedido real (nuevo o
  // agregado a uno existente) y marca la solicitud como "importado" para
  // que no vuelva a aparecer como pendiente.
  const importarSolicitudComoPedido = async (solicitud, destino = 'nuevo') => {
    try {
      const nuevasPiezas = (solicitud.items || []).map(construirPiezaDesdeSolicitud);
      let pedidoDestinoId = null;

      // El teléfono es el único dato realmente único acá: el nombre lo
      // escribe el cliente a mano en el catálogo y puede variar de un
      // pedido a otro (mayúsculas, apellido, apodo), pero el teléfono no
      // cambia. Por eso el teléfono manda: si ya existe un cliente con
      // ese teléfono, es esa persona sin importar cómo escribió el
      // nombre esta vez — y usamos el nombre que YA tenía guardado (no
      // el nuevo) para que el pedido quede bien enlazado a él en las
      // estadísticas de Clientes. Sólo si no hay teléfono cargado caemos
      // a comparar por nombre.
      const nombreSolicitud = (solicitud.cliente || '').trim();
      const telSolicitud = (solicitud.telefono || '').replace(/\D/g, '');

      let clienteExistente = null;
      if (telSolicitud) {
        clienteExistente = clientes.find(c => (c.tel || '').replace(/\D/g, '') === telSolicitud) || null;
      }
      if (!clienteExistente && nombreSolicitud) {
        clienteExistente = clientes.find(
          c => (c.nombre || '').trim().toLowerCase() === nombreSolicitud.toLowerCase()
        ) || null;
      }

      // Nombre que va a llevar el pedido: el del cliente ya existente
      // (si lo encontramos), o si no el que escribió recién.
      const nombreParaPedido = clienteExistente?.nombre || nombreSolicitud || 'Sin nombre';

      if (nombreSolicitud && !clienteExistente) {
        await addCliente({
          id: getNewId(),
          nombre: nombreSolicitud,
          tel: solicitud.telefono || '',
          email: solicitud.email || '',
          prov: '',
          loc: '',
          cp: '',
          calle: '',
          altura: '',
          fechaAlta: new Date().toLocaleDateString('es-AR'),
          fechaAltaTs: Date.now()
        });
      }

      if (destino === 'nuevo') {
        const newIdVal = getNewId();
        const nuevo = {
          id: newIdVal,
          cliente: nombreParaPedido,
          desc: solicitud.comentarioGeneral || 'Pedido desde catálogo web',
          estado: 'en_verificacion',
          fechaPedido: new Date().toISOString().slice(0, 10),
          fechaEntrega: '',
          notaGeneral: solicitud.telefono ? `Tel: ${solicitud.telefono}` : '',
          piezas: nuevasPiezas,
          precioVenta: solicitud.totalEstimado || nuevasPiezas.reduce((s, p) => s + p.cantidad * p.precioVenta, 0),
          envio: 0,
          insumos: [],
          creado: new Date().toLocaleDateString('es-AR'),
          creadoTs: Date.now()
        };
        await addPedido(nuevo);
        pedidoDestinoId = newIdVal;
      } else {
        const targetId = parseInt(destino, 10);
        await updatePedido(targetId, (p) => ({
          ...p,
          piezas: [...p.piezas, ...nuevasPiezas]
        }));
        pedidoDestinoId = targetId;
      }

      const { _docId, ...datosSolicitud } = solicitud;
      await setDoc(doc(db, "catalogoTiendas", user.uid, "solicitudes", _docId), { ...datosSolicitud, estado: 'importado' }, { merge: true });

      showToast('✓ Solicitud importada como pedido.');
      return pedidoDestinoId;
    } catch (e) {
      console.error("Error al importar la solicitud como pedido:", e);
      showToast('⚠ No se pudo importar la solicitud.', 'error');
      return null;
    }
  };

  const descartarSolicitud = async (docId) => {
    try {
      await deleteDoc(doc(db, "catalogoTiendas", user.uid, "solicitudes", docId));
    } catch (e) {
      console.error("Error al descartar la solicitud:", e);
      showToast('⚠ No se pudo descartar la solicitud.', 'error');
    }
  };

  const value = {
    pedidos,
    addPedido,
    updatePedido,
    removePedido,
    updatePedidosBulk,
    compras,
    addCompra,
    updateCompra,
    removeCompra,
    biblioteca,
    addProducto,
    updateProducto,
    removeProducto,
    updateProductosBulk,
    clientes,
    addCliente,
    updateCliente,
    removeCliente,
    empresa,
    setEmpresa,
    cfg,
    setCfg,
    idCounter,
    getNewId,
    user,
    isAdmin,
    suscripcion,
    planContratado,
    consumoActual,
    loading,
    loadError,
    datosCargadosOk,
    reintentarCargaDatos,
    loginWithGoogle,
    logout,
    activePage,
    setActivePage,
    toasts,
    showToast,
    syncError,
    exportarBackupData,
    restaurarBackupData,
    catalogoConfig,
    guardarCatalogoConfig,
    publicarProductosEnCatalogo,
    solicitudesWeb,
    importarSolicitudComoPedido,
    descartarSolicitud
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);
