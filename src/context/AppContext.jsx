import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, getDocs, writeBatch } from 'firebase/firestore';
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
  metodosEnvio: ['Correo Argentino', 'Andreani', 'Retiro en persona', 'Envío propio'],
  kwh: 120,
  mo: 500,
  margen: 100,
  desperdicio: 5
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
  
  const [user, setUser] = useState(null);
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

  const estimatePayloadSize = (payload) => {
    try {
      return new TextEncoder().encode(JSON.stringify(payload)).length;
    } catch {
      return JSON.stringify(payload).length;
    }
  };

  // Referencia usada por getNewId para evitar que dos IDs generados en la
  // misma pestaña dentro del mismo milisegundo colisionen (ver más abajo).
  const idSeqRef = useRef(0);

  // Guarda el timestamp exacto de nuestro último guardado propio en
  // Firestore (autosave o creación inicial del documento). El listener en
  // tiempo real (más abajo) lo usa para reconocer "esto es el eco de mi
  // propia escritura" y no reaplicarlo, evitando pisar ediciones más nuevas
  // que el usuario haya hecho localmente mientras ese guardado viajaba.
  const lastWrittenTimestampRef = useRef(null);
  
  // Para evitar falsos positivos de "datos actualizados desde otra sesión"
  // cuando hay múltiples guardados rápidos (ej: agregar imagen + editar nombre),
  // guardamos también un "pending write" que nos permite ignorar snapshots
  // intermedios hasta que llegue la confirmación del último guardado.
  const pendingWriteTimestampRef = useRef(null);

  // BUG encontrado tras el reporte de "se borra la imagen al agregarla":
  // cargarDatosDeFirestore hace setPedidos(cloud.pedidos ?? []) y similares.
  // Aunque el CONTENIDO sea idéntico al que ya había, JS crea arrays nuevos
  // en memoria, y React los ve como "cambiaron". Eso disparaba el efecto de
  // autosave solo, ~800ms después de cada login, guardando datos que en
  // realidad no habían cambiado ("guardado fantasma"). Ese guardado de más
  // pisaba lastWrittenTimestampRef con un timestamp nuevo, y si en esa
  // ventana el listener en tiempo real todavía estaba entregando la
  // confirmación de la carga original, dejaba de coincidir — se
  // malinterpretaba como "cambio de otra sesión" y pisaba el estado local
  // (por ejemplo, una imagen recién elegida en un modal abierto).
  //
  // Esta bandera le dice al efecto de autosave "el próximo cambio de estado
  // que veas viene de haber cargado datos de la nube, no de una edición real
  // del usuario — no guardes nada por eso".
  const skipNextAutosaveRef = useRef(false);

  // ---------------------------------------------------------------------
  // FASE 1 de la migración a Firestore por secciones: config + empresa +
  // counter pasan a vivir en su propio documento (users/{uid}/meta/config)
  // en vez de ser campos del documento monolítico users/{uid}. Es la
  // sección piloto elegida por ser la más chica y la que menos cambia.
  //
  // Usa el mismo patrón de detección de eco que ya existía para el
  // documento principal, pero con sus propias referencias — así un
  // guardado de config no interfiere con la detección de eco de
  // pedidos/biblioteca/clientes/compras (que siguen en el doc principal
  // por ahora), y viceversa.
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
  // FASE 0 de la migración a Firestore por secciones (ver plan): antes de
  // separar pedidos/biblioteca/clientes/compras en documentos propios,
  // centralizamos acá las mutaciones que hoy están repartidas en ~15
  // componentes vía setPedidos/setBiblioteca/etc. crudos.
  //
  // Por qué: mientras cada componente decida por su cuenta "hago un map",
  // "hago un filter", "hago un spread", cualquier cambio futuro de cómo se
  // persiste cada sección (ej. pasar a updateDoc puntual sobre un doc por
  // producto) obliga a tocar los 15 archivos de nuevo. Con estas funciones,
  // el día que cambie el backend de una sección, el cambio se hace en un
  // solo lugar.
  //
  // Por ahora estas funciones siguen escribiendo sobre los mismos arrays en
  // memoria (useState) que ya existían — el autosave global no cambia en
  // esta fase. Los setters crudos (setPedidos, setBiblioteca, etc.) se
  // mantienen expuestos por compatibilidad mientras dure la migración
  // componente por componente; se retirarán en una fase posterior.
  const makeCrud = (setter) => ({
    add: (item) => setter(prev => [...prev, item]),
    // updater puede ser un objeto parcial (se mergea con {...item, ...updater})
    // o una función (item) => nuevoItem (reemplazo completo, útil cuando el
    // caller ya arma el objeto final, ej. un "draft" de edición).
    update: (id, updater) => setter(prev => prev.map(item => {
      if (item.id !== id) return item;
      return typeof updater === 'function' ? updater(item) : { ...item, ...updater };
    })),
    remove: (id) => setter(prev => prev.filter(item => item.id !== id)),
  });

  const pedidosCrud = makeCrud(setPedidos);
  const comprasCrud = makeCrud(setCompras);

  const addPedido = pedidosCrud.add;
  const updatePedido = pedidosCrud.update;
  const removePedido = pedidosCrud.remove;

  const addCompra = comprasCrud.add;
  const updateCompra = comprasCrud.update;
  const removeCompra = comprasCrud.remove;

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
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const cloud = docSnap.data();
        // La limpieza de imágenes base64 legacy ahora sólo importa en el
        // momento de migrar biblioteca a su subcolección (Fase 3): una vez
        // migrada, el campo `biblioteca` del documento monolítico deja de
        // leerse y no hace falta seguir revisándolo en cada carga.
        const bibliotecaLimpia = limpiarImagenesBase64(cloud.biblioteca ?? []);
        
        setPedidos(cloud.pedidos ?? []);
        setCompras(cloud.compras ?? []);
        // Fase 3: biblioteca ya no vive en este documento — se migra (si
        // hace falta, usando la versión ya limpia de base64) y de ahí en
        // más el estado local se alimenta del listener en tiempo real de
        // la subcolección (ver más abajo).
        await migrarBibliotecaSiHaceFalta(uid, bibliotecaLimpia);
        // Fase 2: clientes ya no vive en este documento — se migra (si hace
        // falta) y de ahí en más el estado local se alimenta del listener
        // en tiempo real de la subcolección (ver más abajo).
        await migrarClientesSiHaceFalta(uid, cloud.clientes ?? []);
        await cargarConfigDeFirestore(uid, cloud);
        // BUG encontrado: esta rama (documento ya existente — el caso normal
        // en cada inicio de sesión) nunca registraba el timestamp acá. Como
        // resultado, apenas se conectaba el listener en tiempo real, recibía
        // la confirmación de "esto es lo que ya hay en la nube" pero no tenía
        // nada guardado contra qué compararlo — lo trataba como si viniera de
        // OTRA sesión, mostraba el aviso "Datos actualizados desde otra
        // sesión" y reemplazaba biblioteca/pedidos/etc. por arrays nuevos
        // (mismo contenido, pero referencia distinta), lo que a su vez
        // reiniciaba cualquier modal abierto que dependiera de esos arrays
        // (por ejemplo, borrando una imagen recién elegida antes de guardar).
        lastWrittenTimestampRef.current = cloud.ultimaActualizacion || null;
        // También inicializamos pendingWriteTimestampRef para evitar falsos
        // positivos durante la carga inicial.
        pendingWriteTimestampRef.current = null;
        
        console.log("Datos cargados desde Firebase exitosamente.");
      } else {
        console.log("Usuario nuevo. Inicializando datos en Firebase...");
        const dataPayload = {
          pedidos: [],
          compras: [],
          ultimaActualizacion: new Date().toISOString()
        };
        await setDoc(docRef, dataPayload);
        // Igual que en el autosave: registramos este timestamp como "propio"
        // para que, cuando el listener en tiempo real reciba la confirmación
        // de este mismo documento recién creado, lo reconozca como un eco y
        // no muestre el aviso de "datos actualizados desde otra sesión".
        lastWrittenTimestampRef.current = dataPayload.ultimaActualizacion;
        pendingWriteTimestampRef.current = null;
        setPedidos(dataPayload.pedidos);
        setCompras(dataPayload.compras);
        // Fase 2/3: usuario nuevo arranca sin clientes ni biblioteca; esas
        // subcolecciones se crean solas en el primer addCliente/addProducto.
        await cargarConfigDeFirestore(uid, null);
      }

      // CRÍTICO: sólo acá, tras confirmar que sabemos qué hay realmente en la
      // nube (documento existente cargado, o uno nuevo recién creado), es
      // seguro dejar que el autosave empiece a escribir. Si esto no se marca,
      // el efecto de autosave se mantiene bloqueado.
      //
      // skipNextAutosaveRef en true: los setPedidos/setCfg/etc de arriba van
      // a disparar el efecto de autosave apenas se habilite (datosCargadosOk
      // pasa a true en la misma tanda), aunque el usuario no haya cambiado
      // nada. Sin esto, ese guardado fantasma es lo que rompía la detección
      // de "eco propio" del listener en tiempo real (ver nota en la
      // declaración de skipNextAutosaveRef, más arriba).
      skipNextAutosaveRef.current = true;
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

  useEffect(() => {
    if (cfg?.palette) {
      const palette = paletas[cfg.palette] || paletas.mint;
      Object.entries(palette).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    }
  }, [cfg?.palette]);

  // Auto-save to Firebase
  // IMPORTANTE: antes, si setDoc fallaba (sin conexión, cuota, tamaño de
  // documento excedido, etc.) el error solo se logueaba en consola. La UI ya
  // había cambiado localmente, así que el usuario creía que todo estaba
  // guardado y podía perder ese trabajo al recargar o cambiar de dispositivo.
  // Ahora: se reintenta un par de veces con backoff, y si sigue fallando se
  // avisa de forma visible y persistente (toast largo + bandera syncError)
  // hasta que un guardado posterior tenga éxito.
  //
  // MEDIO (nuevo): antes se disparaba un guardado por cada cambio de estado,
  // incluyendo cada tecla escrita en un campo de texto (nota, descripción,
  // etc.). Eso multiplicaba las escrituras a Firestore y ampliaba la ventana
  // de una posible condición de carrera entre pestañas/dispositivos. Ahora
  // se espera un breve silencio (debounce de 800ms sin cambios) antes de
  // guardar.
  const debounceTimeoutRef = useRef(null);
  const saveRetryTimeoutRef = useRef(null);

  useEffect(() => {
    // Además de loading/user, exigimos datosCargadosOk: si la carga inicial
    // falló (o todavía no terminó), NO se debe guardar nada — guardar acá
    // significaría pisar la nube con el estado default vacío. Ver
    // cargarDatosDeFirestore para el detalle de por qué esto es crítico.
    if (loading || !user || !datosCargadosOk) return;

    // Este disparo del efecto viene de haber cargado datos de la nube (los
    // setPedidos/setCfg/etc de cargarDatosDeFirestore crean arrays nuevos
    // aunque el contenido sea igual), no de una edición real del usuario.
    // Lo saltamos para no generar un guardado fantasma — ver la nota en la
    // declaración de skipNextAutosaveRef más arriba para el detalle de por
    // qué ese guardado de más rompía la sincronización en tiempo real.
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    let cancelado = false;

    // Cualquier cambio nuevo cancela el debounce y los reintentos pendientes
    // de la ronda anterior: el próximo guardado ya va a mandar la versión
    // más actualizada de todo, no tiene sentido seguir reintentando la vieja.
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    if (saveRetryTimeoutRef.current) {
      clearTimeout(saveRetryTimeoutRef.current);
      saveRetryTimeoutRef.current = null;
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (cancelado) return;

      const timestamp = new Date().toISOString();
      const dataPayload = {
        pedidos,
        compras,
        ultimaActualizacion: timestamp
      };

      const payloadSizeBytes = estimatePayloadSize(dataPayload);
      const MAX_FIRESTORE_DOC_BYTES = 950 * 1024;

      if (payloadSizeBytes > MAX_FIRESTORE_DOC_BYTES) {
        console.error(`Documento demasiado grande para Firestore: ${Math.round(payloadSizeBytes / 1024)}KB`);
        console.log('Tamaño de cada sección:');
        console.log(`  - pedidos: ${Math.round(new TextEncoder().encode(JSON.stringify(dataPayload.pedidos)).length / 1024)}KB`);
        console.log(`  - compras: ${Math.round(new TextEncoder().encode(JSON.stringify(dataPayload.compras)).length / 1024)}KB`);
        setSyncError(true);
        showToast(
          '⚠ No se pudo guardar en la nube porque los datos son demasiado grandes.',
          'error',
          10000
        );
        return;
      }

      const intentarGuardar = (intento = 0) => {
        // Se guarda ANTES de escribir: así, en cuanto llegue la confirmación
        // por el listener en tiempo real, ya sabemos reconocer que es este
        // mismo guardado y no un cambio remoto genuino.
        lastWrittenTimestampRef.current = timestamp;
        // También marcamos como pending para ignorar snapshots intermedios
        // hasta que llegue la confirmación del servidor.
        pendingWriteTimestampRef.current = timestamp;

        setDoc(doc(db, "users", user.uid), dataPayload, { merge: true })
          .then(() => {
            if (cancelado) return;
            // Guardado exitoso: limpiamos pending y actualizamos confirmed
            pendingWriteTimestampRef.current = null;
            lastWrittenTimestampRef.current = timestamp;
            // Guardado exitoso: si veníamos de un error, lo limpiamos.
            setSyncError(prevError => {
              if (prevError) {
                showToast('✓ Conexión con la nube restablecida. Datos guardados.', 'success');
              }
              return false;
            });
          })
          .catch(e => {
            console.error("Error al guardar en Firebase:", e);
            if (cancelado) return;

            if (intento < 2) {
              // Reintenta hasta 2 veces antes de molestar al usuario (fallos transitorios de red)
              saveRetryTimeoutRef.current = setTimeout(() => {
                if (!cancelado) intentarGuardar(intento + 1);
              }, 1500 * (intento + 1));
              return;
            }

            // Se agotaron los reintentos: esto sí puede significar pérdida de datos.
            setSyncError(true);
            showToast(
              '⚠ No se pudo guardar en la nube. Tus últimos cambios podrían perderse si recargás la página o cerrás la app. Revisá tu conexión.',
              'error',
              10000
            );
          });
      };

      intentarGuardar();
    }, 800);

    // Si las dependencias cambian de nuevo (nuevo cambio del usuario) antes de
    // que se dispare el guardado debounced, o antes de que termine un
    // reintento pendiente, cancelamos ambos: el próximo efecto ya va a mandar
    // la versión más actualizada de los datos.
    return () => {
      cancelado = true;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      if (saveRetryTimeoutRef.current) {
        clearTimeout(saveRetryTimeoutRef.current);
        saveRetryTimeoutRef.current = null;
      }
    };
  }, [pedidos, compras, user, loading, datosCargadosOk]);

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

  // ALTO: sincronización en tiempo real entre pestañas/dispositivos.
  // Antes, cada pestaña sólo leía la nube UNA vez al iniciar sesión (getDoc).
  // Si el mismo usuario tenía dos pestañas o dispositivos abiertos, cada uno
  // trabajaba a ciegas sobre su propia copia local, y cada guardado
  // reemplazaba el documento entero — así que la última pestaña en escribir
  // ganaba y borraba silenciosamente los cambios de la otra, sin importar
  // cuál era realmente más reciente en el tiempo real.
  //
  // Ahora nos suscribimos con onSnapshot: en cuanto OTRA pestaña/dispositivo
  // guarda un cambio, esta pestaña lo recibe casi al instante y actualiza su
  // estado local para reflejarlo. Esto reduce mucho la ventana en la que una
  // pestaña desactualizada podría pisar con datos viejos el trabajo hecho en
  // otra (de "toda la sesión" pasa a ser, en el peor caso, la fracción de
  // segundo del debounce + latencia de red).
  //
  // OJO — esto NO elimina la condición de carrera por completo: si dos
  // pestañas guardan casi en el mismo instante, antes de que cualquiera vea
  // el cambio de la otra, seguimos con un único documento y "gana la última
  // escritura". La solución completa (sin ese residual) requiere pasar de
  // "un documento con arrays" a subcolecciones por tipo de dato en Firestore,
  // que es un cambio de arquitectura más grande, pendiente aparte.
  useEffect(() => {
    if (!user || !datosCargadosOk) return;

    const docRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        // Ignoramos los ecos de nuestras propias escrituras todavía no
        // confirmadas por el servidor: esos datos ya los tenemos aplicados
        // localmente, reaplicarlos no aporta nada.
        if (snapshot.metadata.hasPendingWrites) return;
        if (!snapshot.exists()) return;

        const cloud = snapshot.data();

        // Si este snapshot confirma nuestro propio último guardado, no hace
        // falta reaplicarlo — y evita pisar ediciones más nuevas que el
        // usuario haya hecho localmente mientras ese guardado viajaba.
        if (
          cloud.ultimaActualizacion &&
          cloud.ultimaActualizacion === lastWrittenTimestampRef.current
        ) {
          return;
        }
        
        // Si hay un guardado pendiente que aún no fue confirmado, ignoramos
        // este snapshot intermedio. Esto evita que se dispare el aviso de
        // "datos actualizados desde otra sesión" cuando estamos en medio de
        // una secuencia rápida de cambios locales (ej: agregar imagen + editar
        // nombre) que generan múltiples guardados consecutivos.
        if (
          cloud.ultimaActualizacion &&
          pendingWriteTimestampRef.current &&
          cloud.ultimaActualizacion <= pendingWriteTimestampRef.current
        ) {
          // Snapshot intermedio: no es ni el último confirmado ni el pending
          // actual, lo ignoramos para evitar falsos positivos.
          return;
        }

        // Cambio confirmado que no se originó en esta pestaña: viene de otra
        // pestaña o dispositivo del mismo usuario. Sincronizamos.
        setPedidos(cloud.pedidos ?? []);
        setCompras(cloud.compras ?? []);
        // Registramos este timestamp como "ya aplicado" para no procesar de
        // nuevo la misma entrega si Firestore la reenvía (ej. reconexión).
        lastWrittenTimestampRef.current = cloud.ultimaActualizacion || null;
        showToast('↺ Datos actualizados desde otra sesión.', 'info');
      },
      (error) => {
        // No bloqueamos la app por esto (ya tenemos datos cargados): sólo
        // informamos que dejamos de recibir actualizaciones en tiempo real.
        console.error("Error en la suscripción en tiempo real:", error);
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
      // Mismo motivo que en cargarDatosDeFirestore: los setPedidos/setCfg/etc
      // de abajo van a disparar el efecto de autosave solo, aunque ya
      // hagamos nuestro propio setDoc explícito unas líneas más abajo. Sin
      // esto, ese guardado fantasma podía hacer que el listener en tiempo
      // real confundiera la confirmación de ESTE restore con un cambio de
      // otra sesión.
      skipNextAutosaveRef.current = true;
      skipNextAutosaveRefMeta.current = true;

      if (data.pedidos) setPedidos(data.pedidos);
      if (data.cfg) setCfg(data.cfg);
      if (data.compras) setCompras(data.compras);
      // Fase 2/3: clientes y biblioteca ya no son arrays de estado que se
      // "restauran" en memoria — se escriben directo a sus subcolecciones
      // más abajo, y los listeners en tiempo real actualizan el estado
      // local solos.
      if (data.empresa) setEmpresa(data.empresa);
      
      const nextCounter = data._idCounter || data.idCounter || 1;
      setIdCounter(Number(nextCounter));
      
      // Upload to Firebase immediately if logged in
      if (user) {
        const restoreTimestamp = new Date().toISOString();
        await setDoc(doc(db, "users", user.uid), {
          pedidos: data.pedidos || [],
          compras: data.compras || [],
          ultimaActualizacion: restoreTimestamp
        }, { merge: true });
        // Igual que en el autosave: evita que el listener en tiempo real
        // confunda la confirmación de este mismo guardado con un cambio
        // hecho desde otra pestaña/dispositivo.
        lastWrittenTimestampRef.current = restoreTimestamp;
        pendingWriteTimestampRef.current = null;

        // Fase 1: config/empresa/counter van a su documento propio.
        await setDoc(doc(db, "users", user.uid, "meta", "config"), {
          config: data.cfg || defaultCfg,
          empresa: data.empresa || defaultEmpresa,
          counter: nextCounter,
          ultimaActualizacion: restoreTimestamp
        }, { merge: true });
        lastWrittenTimestampRefMeta.current = restoreTimestamp;
        pendingWriteTimestampRefMeta.current = null;

        // Fase 2: clientes del backup van directo a la subcolección, un
        // documento por cliente. Primero borramos los que ya existan en la
        // nube (si el backup tiene menos clientes que los actuales, no
        // deben quedar huérfanos), luego escribimos los del backup.
        const clientesColRef = collection(db, "users", user.uid, "clientes");
        const clientesActuales = await getDocs(clientesColRef);
        const batch = writeBatch(db);
        clientesActuales.forEach(d => batch.delete(d.ref));
        (data.clientes || []).forEach(c => {
          batch.set(doc(db, "users", user.uid, "clientes", String(c.id)), c);
        });
        await batch.commit();

        // Fase 3: mismo criterio para biblioteca — batch separado (los
        // batch de Firestore tienen un límite de 500 operaciones, así que
        // conviene no mezclar clientes y biblioteca en el mismo batch si
        // alguna de las dos listas es grande).
        const bibliotecaColRef = collection(db, "users", user.uid, "biblioteca");
        const bibliotecaActual = await getDocs(bibliotecaColRef);
        const batchBiblioteca = writeBatch(db);
        bibliotecaActual.forEach(d => batchBiblioteca.delete(d.ref));
        (data.biblioteca || []).forEach(p => {
          batchBiblioteca.set(doc(db, "users", user.uid, "biblioteca", String(p.id)), p);
        });
        await batchBiblioteca.commit();
      }
      
      showToast('✓ Backup restaurado correctamente.');
      return true;
    } catch (e) {
      console.error(e);
      showToast('Error al restaurar el backup.', 'error');
      return false;
    }
  };

  const value = {
    pedidos,
    setPedidos,
    addPedido,
    updatePedido,
    removePedido,
    compras,
    setCompras,
    addCompra,
    updateCompra,
    removeCompra,
    biblioteca,
    setBiblioteca,
    addProducto,
    updateProducto,
    removeProducto,
    updateProductosBulk,
    clientes,
    setClientes,
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
    restaurarBackupData
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);
