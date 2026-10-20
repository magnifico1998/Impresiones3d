import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  CuentaCtx, UiCtx, ConfigCtx, PedidosCtx, ComprasCtx, PresupuestosCtx, BibliotecaCtx, ClientesCtx, FaqCtx, CatalogoCtx,
  useCuenta, useUi, useConfig, usePedidos, useCompras, usePresupuestos, useBiblioteca, useClientes, useFaq, useCatalogo
} from './contextos';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { obtenerPais, formatearMoneda, PAIS_DEFAULT } from '../utils/paises';
import { registrarEvento } from '../utils/registroSoporte';
import { numeroSiguientePresupuesto } from './documentos';
import { crearAccionesDatos } from './accionesDatos';
import { crearAccionesCatalogo } from './accionesCatalogo';
import { crearAccionesBackup } from './accionesBackup';
import { crearAccionesEquipo } from './accionesEquipo';
import { useDatosEnVivo } from './useDatosEnVivo';
import { useConfigCuenta } from './useConfigCuenta';
import { useSesion } from './useSesion';

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

  // Configuración, datos del emprendimiento y contador (users/{cuenta}/meta/config).
  const {
    cfg, setCfg, empresa, setEmpresa, idCounter, setIdCounter,
    cargarConfigDeFirestore, omitirProximoGuardadoConfig, registrarGuardadoConfig
  } = useConfigCuenta({ cuentaId, datosCargadosOk, loading, showToast, setSyncError });

  // Derivados del país del emprendimiento (moneda/teléfono) -- ver
  // src/utils/paises.js. paisActual siempre devuelve un país válido
  // (cae a Argentina si empresa.pais está vacío o es un id desconocido),
  // así que fmt nunca rompe aunque la cuenta nunca haya elegido país.
  const paisActual = obtenerPais(empresa.pais || PAIS_DEFAULT);

  // Referencia usada por getNewId para evitar que dos IDs generados en la
  // misma pestaña dentro del mismo milisegundo colisionen (ver más abajo).
  const idSeqRef = useRef(0);

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
    omitirProximoGuardadoConfig, registrarGuardadoConfig
  });
  const exportarBackupData = () => backup().exportarBackupData();
  const restaurarBackupData = (data) => backup().restaurarBackupData(data);

  const { agregarMiembro, quitarMiembro, salirDeCuentaCompartida } = crearAccionesEquipo({ showToast });

  // Ingreso, salida y carga inicial de la cuenta (maneja el estado de sesión de arriba).
  const { loginWithGoogle, loginWithEmailLink, logout, reintentarCargaDatos } = useSesion({
    cuentaId, setUser, setCuentaId, setEsMiembro, setLoading, setDatosCargadosOk, setLoadError, setLoadErrorDetalle,
    cargarConfigDeFirestore, omitirProximoGuardadoConfig, showToast
  });

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
    [A, empresa, setEmpresa, paisActual, cfg, setCfg, idCounter]
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
