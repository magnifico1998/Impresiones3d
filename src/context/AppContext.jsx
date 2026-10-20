import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  CuentaCtx, UiCtx, ConfigCtx, PedidosCtx, ComprasCtx, PresupuestosCtx, BibliotecaCtx, ClientesCtx, FaqCtx, CatalogoCtx,
  useCuenta, useUi, useConfig, usePedidos, useCompras, usePresupuestos, useBiblioteca, useClientes, useFaq, useCatalogo
} from './contextos';
import { confirmar, pedirTexto } from '../components/Dialogos';
import { auth, db, googleProvider, functions } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { paletas } from '../utils/paletas';
import { obtenerPais, formatearMoneda, PAIS_DEFAULT } from '../utils/paises';
import { registrarEvento } from '../utils/registroSoporte';
import { defaultCfg, defaultEmpresa } from './valoresPorDefecto';
import { numeroSiguientePresupuesto } from './documentos';
import { crearAccionesDatos } from './accionesDatos';
import { crearAccionesCatalogo } from './accionesCatalogo';
import { crearAccionesBackup } from './accionesBackup';
import { crearAccionesEquipo } from './accionesEquipo';
import { useDatosEnVivo } from './useDatosEnVivo';

// Acciones que el proveedor expone con identidad estable (ver más abajo).
const nuevoIdAviso = () => Date.now() + Math.random();

const NOMBRES_ACCIONES = [
  'addPedido', 'updatePedido', 'updatePedidosBulk',
  'addCompra', 'updateCompra', 'removeCompra',
  'addPresupuesto', 'updatePresupuesto', 'removePresupuesto',
  'addProducto', 'updateProducto', 'removeProducto', 'updateProductosBulk',
  'addFaq', 'updateFaq', 'removeFaq',
  'addCliente', 'updateCliente', 'removeCliente',
  'getNewId', 'showToast',
  'agregarMiembro', 'quitarMiembro', 'salirDeCuentaCompartida',
  'reintentarCargaDatos', 'loginWithGoogle', 'loginWithEmailLink', 'logout',
  'exportarBackupData', 'restaurarBackupData',
  'guardarCatalogoConfig', 'publicarProductosEnCatalogo', 'importarSolicitudComoPedido', 'descartarSolicitud'
];

export const AppProvider = ({ children }) => {
  const [empresa, setEmpresa] = useState(defaultEmpresa);
  const [cfg, setCfg] = useState(defaultCfg);
  const [idCounter, setIdCounter] = useState(1);

  // Derivados del país del emprendimiento (moneda/teléfono) -- ver
  // src/utils/paises.js. paisActual siempre devuelve un país válido
  // (cae a Argentina si empresa.pais está vacío o es un id desconocido),
  // así que fmt nunca rompe aunque la cuenta nunca haya elegido país.
  const paisActual = obtenerPais(empresa.pais || PAIS_DEFAULT);

  // Catálogo web público (colecciones raíz, fuera de users/{uid}, porque
  // las lee gente sin login desde /catalogo). catalogoConfig/meta guarda la
  // config visible del catálogo (colores, nombre, activo/inactivo).
  // catalogoSolicitudes son los "carritos" que arma un cliente y se leen
  // acá para poder importarlos como Pedido con un clic.

  // Preguntas frecuentes: colección raíz "faq" (no bajo users/{uid}),
  // porque es contenido global compartido por todas las cuentas -- lo
  // arma/edita un admin general y lo ve cualquier usuario logueado (ver
  // firestore.rules).

  const [user, setUser] = useState(null);
  // cuentaId: la raíz real de todas las rutas de datos (users/{cuentaId}/...,
  // catalogoTiendas/{cuentaId}/...). Para el dueño es igual a user.uid; para
  // alguien agregado como usuario de otra cuenta (ver invitacionesMiembro /
  // EmpresaPage "Usuarios con acceso") es el uid del DUEÑO de esa cuenta, no
  // el propio. Se resuelve una vez al loguearse (ver el useEffect de
  // onAuthStateChanged) y de ahí en más se usa en vez de user.uid en TODO
  // lo que sea dato de la cuenta -- user.uid/user.email siguen usándose tal
  // cual sólo para lo que es de la persona real logueada (ej. isAdmin).
  const [cuentaId, setCuentaId] = useState(null);
  const [esMiembro, setEsMiembro] = useState(false);
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
  // Motivo técnico de la falla ("unavailable", "permission-denied"…): se muestra en
  // la pantalla de error para saber si fue la red, un permiso u otra cosa.
  const [loadErrorDetalle, setLoadErrorDetalle] = useState('');
  
  // Datos que llegan en vivo de Firestore (colecciones de la cuenta, suscripción, plan, equipo, catálogo).
  const {
    pedidos, compras, presupuestos, biblioteca, clientes, faq,
    catalogoConfig, solicitudesWeb, miembros, isAdmin, suscripcion, planContratado, consumoActual
  } = useDatosEnVivo({ user, cuentaId, esMiembro, datosCargadosOk });

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Indica si el último intento de guardado en la nube falló después de agotar
  // los reintentos. Se usa para mostrar un aviso persistente (no solo un toast
  // que desaparece) mientras el problema no se resuelva.
  const [syncError, setSyncError] = useState(false);

  // Los avisos de error quedan en el registro de soporte y duran más: traen
  // el botón "Reportar" (ver Toasts.jsx), y hay que darle tiempo a tocarlo.
  const showToast = (message, type = 'success', duration = type === 'error' ? 7000 : 3000) => {
    if (type === 'error') registrarEvento('aviso', message);
    const id = nuevoIdAviso();
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

  // Mensaje de error homogéneo para cualquier escritura que Firestore
  // rechace por estar la cuenta en modo lectura (ver cuentaPuedeEscribir
  // en firestore.rules) -- en vez del genérico "no se pudo guardar", le
  // explica por qué y le ofrece el plan gratuito Boceto para seguir
  // cargando datos sin costo. Cualquier otro error (ej. de red) sigue
  // mostrando el mensaje original.
  const mostrarErrorGuardado = (mensajeDefault) => {
    if (suscripcion?.estado === 'lectura') {
      showToast('⚠ Tu cuenta está en modo lectura por falta de pago. Pedinos el plan gratuito Boceto desde "Contactate con el área comercial" (en Resumen) para seguir cargando datos sin costo.', 'error');
    } else {
      showToast(mensajeDefault, 'error');
    }
  };

  const {
    productoDocRef,
    addCompra, updateCompra, removeCompra,
    addPresupuesto, updatePresupuesto, removePresupuesto,
    addCliente, updateCliente, removeCliente,
    addProducto, updateProducto, removeProducto, updateProductosBulk,
    addFaq, updateFaq, removeFaq,
    addPedido, updatePedido, updatePedidosBulk
  } = crearAccionesDatos({
    cuentaId, compras, presupuestos, clientes, biblioteca, faq, pedidos,
    planContratado, consumoActual, mostrarErrorGuardado, showToast
  });

  // Estas se arman recién al usarlas (no al dibujar), con lo que hay cargado en ese momento.
  const catalogo = () => crearAccionesCatalogo({
    cuentaId, biblioteca, clientes, cfg, showToast, getNewId, productoDocRef,
    addCliente, addPedido, updatePedido, updateProducto
  });
  const guardarCatalogoConfig = (...args) => catalogo().guardarCatalogoConfig(...args);
  const publicarProductosEnCatalogo = (...args) => catalogo().publicarProductosEnCatalogo(...args);
  const importarSolicitudComoPedido = (...args) => catalogo().importarSolicitudComoPedido(...args);
  const descartarSolicitud = (...args) => catalogo().descartarSolicitud(...args);

  const backup = () => crearAccionesBackup({
    cuentaId, pedidos, compras, presupuestos, biblioteca, clientes, cfg, empresa, idCounter,
    setCfg, setEmpresa, setIdCounter, showToast,
    omitirProximoGuardadoConfig: () => { skipNextAutosaveRefMeta.current = true; },
    registrarGuardadoConfig: (timestamp) => {
      lastWrittenTimestampRefMeta.current = timestamp;
      pendingWriteTimestampRefMeta.current = null;
    }
  });
  const exportarBackupData = () => backup().exportarBackupData();
  const restaurarBackupData = (data) => backup().restaurarBackupData(data);

  const { agregarMiembro, quitarMiembro, salirDeCuentaCompartida } = crearAccionesEquipo({ showToast });

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Sesión iniciada con Google');
    } catch (error) {
      console.error("Error en autenticación:", error);
      showToast('Error al conectar con Google', 'error');
    }
  };

  // Login sin contraseña: le mandamos un link mágico al mail. Guardamos el
  // email en localStorage para poder completar el ingreso automáticamente
  // cuando vuelva a abrir la app en ESTE mismo dispositivo/navegador (ver
  // useEffect de completado más abajo). Si lo abre en otro dispositivo,
  // ese localStorage no va a estar y se le pide el mail de nuevo.
  const loginWithEmailLink = async (email) => {
    try {
      const actionCodeSettings = {
        url: window.location.href.split('?')[0],
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailParaLink', email);
      showToast('Te enviamos un link a tu correo. Abrilo desde este mismo dispositivo.');
    } catch (error) {
      console.error("Error al enviar el link de acceso:", error);
      showToast('No se pudo enviar el link. Revisá el email e intentá de nuevo.', 'error');
      throw error;
    }
  };

  const logout = async () => {
    if (await confirmar('Vas a tener que volver a ingresar para usar la app.', { titulo: '¿Cerrar sesión?', textoConfirmar: 'Cerrar sesión' })) {
      await signOut(auth);
      window.location.reload();
    }
  };

  // Carga config + empresa + counter desde su documento propio
  // (users/{uid}/meta/config). Si todavía no existe (cuenta nueva que abre
  // la app por primera vez), lo crea con los valores default — ver el
  // comentario de users/{uid}/meta en firestore.rules: esa creación tiene
  // que poder pasar siempre.
  const cargarConfigDeFirestore = async (uid) => {
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

    // Cuenta nueva: inicializamos meta/config con los valores default.
    setCfg(defaultCfg);
    setEmpresa(defaultEmpresa);
    setIdCounter(1);

    const timestampInicial = new Date().toISOString();
    await setDoc(metaRef, {
      config: defaultCfg,
      empresa: defaultEmpresa,
      counter: 1,
      ultimaActualizacion: timestampInicial
    });
    lastWrittenTimestampRefMeta.current = timestampInicial;
    pendingWriteTimestampRefMeta.current = null;
  };

  // Load data from Firestore
  const cargarDatosDeFirestore = async (uid, reintento = false, estadoToken = '') => {
    try {
      console.log("Cargando datos desde Firebase...");
      // Cada sección vive en su propia subcolección (meta/config, clientes,
      // biblioteca, pedidos, compras). Las subcolecciones se crean solas en
      // el primer addCliente/addProducto/addPedido/addCompra; meta/config se
      // inicializa con sus valores default acá si no existe. (El documento
      // monolítico legacy users/{uid} y su migración Fase 1-5 se retiraron
      // cuando ya no quedaba ninguna cuenta sin migrar.)
      await cargarConfigDeFirestore(uid);

      // El próximo cambio de cfg/empresa/idCounter que dispare el efecto de
      // autosave de meta/config va a ser el "eco" de haber cargado datos de
      // la nube recién, no una edición real del usuario — no hace falta
      // volver a guardar lo que ya está guardado.
      skipNextAutosaveRefMeta.current = true;
      setLoadError(false);
      setLoadErrorDetalle('');
      setDatosCargadosOk(true);
    } catch (e) {
      // "permission-denied" con una cuenta que sí tiene acceso suele ser un token
      // de sesión vencido o que no llegó a renovarse (red inestable, equipo que
      // estuvo suspendido): se fuerza una renovación y se reintenta una vez antes
      // de mostrar el error.
      if (e?.code === 'permission-denied' && !reintento && auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
          await new Promise((r) => setTimeout(r, 600));
          return cargarDatosDeFirestore(uid, true, 'renovado');
        } catch (errToken) {
          console.error('No se pudo renovar la sesión:', errToken);
          estadoToken = `no se pudo renovar (${errToken?.code || errToken?.message || 'error'})`;
        }
      }
      console.error("Error al cargar datos de Firestore:", e);
      // Detalle para soporte: qué sesión y qué cuenta se estaban usando (sólo el
      // comienzo de cada id), por si no coinciden o la sesión no está verificada.
      const sesion = auth.currentUser;
      const quien = sesion ? ` · sesión ${String(sesion.uid).slice(0, 6)}, cuenta ${String(uid).slice(0, 6)}, email ${sesion.emailVerified ? 'verificado' : 'sin verificar'}${e?.code === 'permission-denied' ? ` · token ${estadoToken || 'sin renovar'}${typeof navigator !== 'undefined' && navigator.onLine === false ? ' · sin red' : ''}` : ''}` : ' · sin sesión';
      setLoadErrorDetalle(`${String(e?.code || e?.message || e).slice(0, 100)}${quien}`.slice(0, 220));

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
    // Sin cuentaId es que falló la resolución del vínculo de equipo: se repite
    // desde ahí (ver iniciarCuenta).
    if (!cuentaId) {
      if (!auth.currentUser) return;
      setLoading(true);
      await iniciarCuenta(auth.currentUser);
      setLoading(false);
      return;
    }
    setLoading(true);
    await cargarDatosDeFirestore(cuentaId);
    setLoading(false);
  };

  // Resuelve a qué cuenta entra la persona (propia o de un equipo) y carga sus
  // datos. Si no se pudo resolver el vínculo, muestra la pantalla de error con
  // "Reintentar" en vez de entrar a la cuenta propia por las dudas.
  const iniciarCuenta = async (currentUser) => {
    const { idEfectivo, miembro, error } = await resolverCuentaId(currentUser);
    if (error) {
      setCuentaId(null);
      setEsMiembro(false);
      setLoadErrorDetalle(`vínculo de equipo: ${String(error?.code || error?.message || error).slice(0, 100)}`);
      setLoadError(true);
      showToast('⚠ No se pudo verificar tu cuenta de equipo. Probá reintentar.', 'error', 10000);
      return;
    }
    setCuentaId(idEfectivo);
    setEsMiembro(miembro);
    // Una vez por sesión, para que el admin/revendedor pueda ver "hace
    // cuánto no entra" en su panel de consumo (ver
    // registrarUltimoAcceso.js -- no puede ser un write directo acá
    // porque suscripcion/actual tiene escritura cerrada para el
    // cliente). No bloquea el login si falla.
    httpsCallable(functions, 'registrarUltimoAcceso')().catch((e) => {
      console.error('Error al registrar el último acceso:', e);
    });
    await cargarDatosDeFirestore(idEfectivo);
  };

  // Resuelve, a partir del email de Google recién logueado, si esta persona
  // es dueña de su propia cuenta (caso normal) o fue agregada como usuario
  // de la cuenta de otra persona (ver invitacionesMiembro / EmpresaPage
  // "Usuarios con acceso"). El ID del doc es el email en minúsculas, así
  // que es un getDoc puntual, sin queries -- ver firestore.rules y
  // functions/http/gestionarMiembros.js para cómo se crea ese vínculo.
  //
  // Si la lectura del vínculo falla (típico: token vencido o sin renovar tras
  // un F5 -> permission-denied) NO se cae en silencio a la cuenta propia: un
  // miembro terminaría trabajando en una cuenta vacía, con otro plan y otro
  // cupo de G-code. Se renueva el token antes de leer, se reintenta una vez y,
  // si sigue fallando, se devuelve { error } para que se muestre la pantalla
  // de error con "Reintentar".
  const resolverCuentaId = async (currentUser) => {
    if (!currentUser.email) return { idEfectivo: currentUser.uid, miembro: false };
    let invSnap;
    try {
      // Sin red puede fallar: se sigue con el token que haya.
      await currentUser.getIdToken(true).catch(() => {});
      const ref = doc(db, 'invitacionesMiembro', currentUser.email.toLowerCase());
      try {
        invSnap = await getDoc(ref);
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        await currentUser.getIdToken(true);
        await new Promise((r) => setTimeout(r, 600));
        invSnap = await getDoc(ref);
      }
    } catch (e) {
      console.error('Error al resolver el vínculo de equipo:', e);
      return { idEfectivo: null, miembro: false, error: e };
    }
    try {
      if (invSnap.exists() && invSnap.data().estado === 'activo') {
        return { idEfectivo: invSnap.data().ownerUid, miembro: true };
      }
      // Invitación todavía sin aceptar (ver gestionarMiembros.js): se le
      // pregunta a la persona antes de pasarla a la cuenta ajena. "Ahora
      // no" la deja pendiente y entra a su propia cuenta; se le vuelve a
      // preguntar en el próximo ingreso.
      if (invSnap.exists() && invSnap.data().estado === 'pendiente') {
        const inv = invSnap.data();
        const acepta = await confirmar(
          `${inv.ownerEmail || 'Otra cuenta'} te invitó a administrar su emprendimiento en Manager3D. Si aceptás, vas a trabajar sobre SU cuenta (no la tuya) hasta que salgas desde "Mi emprendimiento".`,
          { titulo: 'Invitación a una cuenta compartida', textoConfirmar: 'Aceptar', textoCancelar: 'Ahora no' }
        );
        if (acepta) {
          const res = await httpsCallable(functions, 'responderInvitacion')({ aceptar: true });
          if (res.data?.estado === 'activo') {
            return { idEfectivo: inv.ownerUid, miembro: true };
          }
        }
      }
    } catch (e) {
      console.error('Error al resolver el vínculo de equipo:', e);
    }
    return { idEfectivo: currentUser.uid, miembro: false };
  };

  // Completa el login por link mágico cuando el usuario vuelve del mail.
  // Si el email no está en localStorage (abrió el link en otro dispositivo
  // o navegador distinto al que lo pidió), se lo pedimos manualmente.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    (async () => {
      let email = window.localStorage.getItem('emailParaLink');
      if (!email) {
        email = await pedirTexto('Abriste el link en otro navegador o dispositivo. Confirmá el email con el que pediste el ingreso:', {
          titulo: 'Completar el ingreso',
          tipoInput: 'email',
          placeholder: 'tu@email.com',
          textoConfirmar: 'Ingresar'
        });
      }
      if (!email) return;

      signInWithEmailLink(auth, email, window.location.href)
        .then(() => {
          window.localStorage.removeItem('emailParaLink');
          window.history.replaceState(null, '', window.location.pathname);
          showToast('Sesión iniciada');
        })
        .catch((error) => {
          console.error("Error al completar el login con el link:", error);
          showToast('El link no es válido o ya expiró. Pedí uno nuevo.', 'error');
        });
    })();
  }, []);

  // Initial load from Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await iniciarCuenta(currentUser);
      } else {
        setCuentaId(null);
        setEsMiembro(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (cfg?.palette) {
      const base = paletas[cfg.palette] || paletas.lagoon;
      // paletaCustom pisa sólo los 7 roles editables desde "Paleta
      // personalizada" (Configuración) -- el resto de los roles (border,
      // warn, danger, etc.) siempre vienen de la paleta base elegida.
      const custom = cfg.paletaCustom || {};
      const palette = { ...base, ...custom };
      // "Fondo" en el editor representa el fondo general de la app: eso es
      // --bg2 en la práctica (header, sidebar, cards, modales), no sólo el
      // --bg del body. Si no la reflejamos también en --bg2, el retoque de
      // "Fondo" no se nota en el sidebar/header/cards, que es justo lo que
      // más se ve -- por eso se copia el mismo valor a los dos roles.
      if (custom.bg) palette.bg2 = custom.bg;
      Object.entries(palette).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    }
  }, [cfg?.palette, cfg?.paletaCustom]);

  // Auto-save de config + empresa + counter a su documento propio
  // (users/{uid}/meta/config). Mismo patrón de debounce + reintentos que el
  // autosave principal, pero completamente independiente: un cambio acá no
  // dispara ni cancela el guardado de pedidos/biblioteca/clientes/compras,
  // y viceversa.
  const debounceTimeoutRefMeta = useRef(null);
  const saveRetryTimeoutRefMeta = useRef(null);

  useEffect(() => {
    if (loading || !cuentaId || !datosCargadosOk) return;

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

      const metaRef = doc(db, "users", cuentaId, "meta", "config");

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
  }, [cfg, empresa, idCounter, cuentaId, loading, datosCargadosOk]);

  // Listener en tiempo real para config + empresa + counter, ahora en su
  // propio documento (users/{uid}/meta/config). Independiente del listener
  // principal de arriba: usa sus propias referencias de eco
  // (lastWrittenTimestampRefMeta / pendingWriteTimestampRefMeta), así un
  // cambio remoto en config no se confunde con uno en pedidos/biblioteca/etc.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const metaRef = doc(db, "users", cuentaId, "meta", "config");

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
  }, [cuentaId, datosCargadosOk]);

  // Los datos de contacto/marca del catálogo público (nombre, teléfono,
  // logo, colores) siempre se toman en vivo de "Mi emprendimiento" -- antes
  // había un botón "Usar datos de mi emprendimiento" que los copiaba una
  // sola vez a mano, y quedaban desactualizados si después se cambiaba el
  // teléfono o el logo sin volver a tocar ese botón. Ahora se resincronizan
  // solos cada vez que cambia alguno, sin que el dueño tenga que acordarse
  // de nada ni entrar a la pestaña Catálogo.
  // silencioso: para la resincronización automática de abajo, que no la
  // pidió el usuario -- no tiene sentido mostrarle un error por algo que
  // no hizo (ej. cuenta en modo lectura).
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;
    // Cuenta en modo lectura/suspendida: firestore.rules ya no le deja
    // escribir el catálogo, no tiene sentido intentarlo.
    if (suscripcion && !['trial', 'activa'].includes(suscripcion.estado)) return;
    guardarCatalogoConfig({
      empresaNombre: empresa?.nombre || '',
      telefono: empresa?.telefono || '',
      logo: empresa?.logo || '',
      facebook: empresa?.facebook || '',
      instagram: empresa?.instagram || '',
      colores: cfg?.colores || [],
      combinacionesColores: cfg?.combinacionesColores || []
    }, { silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaId, datosCargadosOk, suscripcion?.estado, empresa?.nombre, empresa?.telefono, empresa?.logo, empresa?.facebook, empresa?.instagram, cfg?.colores, cfg?.combinacionesColores]);

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

  // ---- Catálogo web público ----
  // catalogoTiendas/{uid}/... — separadas de users/{uid}/* a propósito: el
  // catálogo lo navega gente sin login, y sólo debe poder LEER estas
  // cosas (y CREAR solicitudes), nunca tocar biblioteca/pedidos/etc.
  // reales. Está scopeado por uid (no en colecciones raíz compartidas)
  // para que cada tienda tenga su propio catálogo — cualquier cuenta de
  // Google puede loguearse en esta app, así que si esto viviera en una
  // colección global, un usuario podría pisar/mezclar el catálogo de
  // otro. Ver firestore.rules.


  // Espeja cfg.categoriaOrden (el orden manual armado arrastrando en
  // Biblioteca) a catalogoTiendas/{uid} para que el catálogo público lo
  // respete también, en vez de mostrar siempre orden alfabético. Sólo se
  // escribe si el catálogo ya existe (evita crear el doc para cuentas que
  // nunca activaron el catálogo web).
  const catOrdenSyncRef = useRef(null);
  const catalogoExiste = !!catalogoConfig;
  useEffect(() => {
    if (loading || !cuentaId || !datosCargadosOk || !catalogoExiste) return;
    if (catOrdenSyncRef.current) clearTimeout(catOrdenSyncRef.current);
    catOrdenSyncRef.current = setTimeout(() => {
      setDoc(doc(db, "catalogoTiendas", cuentaId), { categoriaOrden: cfg.categoriaOrden || [] }, { merge: true })
        .catch((e) => console.warn("No se pudo sincronizar el orden de categorías del catálogo:", e));
    }, 1200);
    return () => clearTimeout(catOrdenSyncRef.current);
  }, [cfg.categoriaOrden, cuentaId, loading, datosCargadosOk, catalogoExiste]);

  // Acciones: funciones que se recrean en cada render y capturan el estado de
  // ese momento. Se exponen a través de envoltorios estables que llaman
  // siempre a la versión más reciente, así no cambian de identidad y no
  // obligan a dibujar de nuevo a quien las usa.
  const acciones = {
    addPedido, updatePedido, updatePedidosBulk,
    addCompra, updateCompra, removeCompra,
    addPresupuesto, updatePresupuesto, removePresupuesto,
    addProducto, updateProducto, removeProducto, updateProductosBulk,
    addFaq, updateFaq, removeFaq,
    addCliente, updateCliente, removeCliente,
    getNewId, showToast,
    agregarMiembro, quitarMiembro, salirDeCuentaCompartida,
    reintentarCargaDatos, loginWithGoogle, loginWithEmailLink, logout,
    exportarBackupData, restaurarBackupData,
    guardarCatalogoConfig, publicarProductosEnCatalogo, importarSolicitudComoPedido, descartarSolicitud
  };
  const accionesRef = useRef(acciones);
  // Se actualiza antes de cualquier efecto: los eventos y efectos de los hijos ven siempre la versión más nueva.
  useLayoutEffect(() => { accionesRef.current = acciones; });
  const A = useMemo(
    () => Object.fromEntries(NOMBRES_ACCIONES.map((k) => [k, (...args) => accionesRef.current[k](...args)])),
    []
  );

  const esRevendedor = !!suscripcion?.codigoRevendedor;

  const cuentaValue = useMemo(() => ({
    user, cuentaId, esMiembro, miembros, isAdmin, esRevendedor, suscripcion, planContratado, consumoActual,
    loading, loadError, loadErrorDetalle, datosCargadosOk, syncError,
    agregarMiembro: A.agregarMiembro, quitarMiembro: A.quitarMiembro, salirDeCuentaCompartida: A.salirDeCuentaCompartida,
    reintentarCargaDatos: A.reintentarCargaDatos, loginWithGoogle: A.loginWithGoogle,
    loginWithEmailLink: A.loginWithEmailLink, logout: A.logout,
    exportarBackupData: A.exportarBackupData, restaurarBackupData: A.restaurarBackupData
  }), [A, user, cuentaId, esMiembro, miembros, isAdmin, esRevendedor, suscripcion, planContratado, consumoActual,
    loading, loadError, loadErrorDetalle, datosCargadosOk, syncError]);

  const uiValue = useMemo(
    () => ({ activePage, setActivePage, toasts, showToast: A.showToast }),
    [A, activePage, toasts]
  );

  const configValue = useMemo(
    () => ({ empresa, setEmpresa, paisActual, fmt: (n) => formatearMoneda(n, paisActual.id), cfg, setCfg, idCounter, getNewId: A.getNewId }),
    [A, empresa, paisActual, cfg, idCounter]
  );

  const pedidosValue = useMemo(
    () => ({ pedidos, addPedido: A.addPedido, updatePedido: A.updatePedido, updatePedidosBulk: A.updatePedidosBulk }),
    [A, pedidos]
  );
  const comprasValue = useMemo(
    () => ({ compras, addCompra: A.addCompra, updateCompra: A.updateCompra, removeCompra: A.removeCompra }),
    [A, compras]
  );
  const presupuestosValue = useMemo(() => ({
    presupuestos, addPresupuesto: A.addPresupuesto, updatePresupuesto: A.updatePresupuesto,
    removePresupuesto: A.removePresupuesto, siguienteNumeroPresupuesto: () => numeroSiguientePresupuesto(presupuestos)
  }), [A, presupuestos]);
  const bibliotecaValue = useMemo(() => ({
    biblioteca, addProducto: A.addProducto, updateProducto: A.updateProducto,
    removeProducto: A.removeProducto, updateProductosBulk: A.updateProductosBulk
  }), [A, biblioteca]);
  const clientesValue = useMemo(
    () => ({ clientes, addCliente: A.addCliente, updateCliente: A.updateCliente, removeCliente: A.removeCliente }),
    [A, clientes]
  );
  const faqValue = useMemo(
    () => ({ faq, addFaq: A.addFaq, updateFaq: A.updateFaq, removeFaq: A.removeFaq }),
    [A, faq]
  );
  const catalogoValue = useMemo(() => ({
    catalogoConfig, guardarCatalogoConfig: A.guardarCatalogoConfig, publicarProductosEnCatalogo: A.publicarProductosEnCatalogo,
    solicitudesWeb, importarSolicitudComoPedido: A.importarSolicitudComoPedido, descartarSolicitud: A.descartarSolicitud
  }), [A, catalogoConfig, solicitudesWeb]);

  return (
    <CuentaCtx.Provider value={cuentaValue}>
      <UiCtx.Provider value={uiValue}>
        <ConfigCtx.Provider value={configValue}>
          <PedidosCtx.Provider value={pedidosValue}>
            <ComprasCtx.Provider value={comprasValue}>
              <PresupuestosCtx.Provider value={presupuestosValue}>
                <BibliotecaCtx.Provider value={bibliotecaValue}>
                  <ClientesCtx.Provider value={clientesValue}>
                    <FaqCtx.Provider value={faqValue}>
                      <CatalogoCtx.Provider value={catalogoValue}>{children}</CatalogoCtx.Provider>
                    </FaqCtx.Provider>
                  </ClientesCtx.Provider>
                </BibliotecaCtx.Provider>
              </PresupuestosCtx.Provider>
            </ComprasCtx.Provider>
          </PedidosCtx.Provider>
        </ConfigCtx.Provider>
      </UiCtx.Provider>
    </CuentaCtx.Provider>
  );
};

// Compatibilidad: junta todas las áreas (se vuelve a dibujar con cualquier cambio).
// Para componentes nuevos o migrados, usar el hook del área (contextos.js).
export const useApp = () => ({
  ...useCuenta(), ...useUi(), ...useConfig(), ...usePedidos(), ...useCompras(),
  ...usePresupuestos(), ...useBiblioteca(), ...useClientes(), ...useFaq(), ...useCatalogo()
});
