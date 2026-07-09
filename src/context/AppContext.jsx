import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
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

  // Referencia usada por getNewId para evitar que dos IDs generados en la
  // misma pestaña dentro del mismo milisegundo colisionen (ver más abajo).
  const idSeqRef = useRef(0);

  // Guarda el timestamp exacto de nuestro último guardado propio en
  // Firestore (autosave o creación inicial del documento). El listener en
  // tiempo real (más abajo) lo usa para reconocer "esto es el eco de mi
  // propia escritura" y no reaplicarlo, evitando pisar ediciones más nuevas
  // que el usuario haya hecho localmente mientras ese guardado viajaba.
  const lastWrittenTimestampRef = useRef(null);

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

  // Load data from Firestore
  const cargarDatosDeFirestore = async (uid) => {
    try {
      console.log("Cargando datos desde Firebase...");
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const cloud = docSnap.data();
        setPedidos(cloud.pedidos ?? []);
        setCfg(cloud.config ?? defaultCfg);
        setCompras(cloud.compras ?? []);
        setBiblioteca(cloud.biblioteca ?? []);
        setClientes(cloud.clientes ?? []);
        setEmpresa(cloud.empresa ?? defaultEmpresa);
        setIdCounter(Number(cloud.counter ?? 1));
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
        console.log("Datos cargados desde Firebase exitosamente.");
      } else {
        console.log("Usuario nuevo. Inicializando datos en Firebase...");
        const dataPayload = {
          pedidos: [],
          config: defaultCfg,
          compras: [],
          biblioteca: [],
          clientes: [],
          empresa: defaultEmpresa,
          counter: 1,
          ultimaActualizacion: new Date().toISOString()
        };
        await setDoc(docRef, dataPayload);
        // Igual que en el autosave: registramos este timestamp como "propio"
        // para que, cuando el listener en tiempo real reciba la confirmación
        // de este mismo documento recién creado, lo reconozca como un eco y
        // no muestre el aviso de "datos actualizados desde otra sesión".
        lastWrittenTimestampRef.current = dataPayload.ultimaActualizacion;
        setPedidos(dataPayload.pedidos);
        setCfg(dataPayload.config);
        setCompras(dataPayload.compras);
        setBiblioteca(dataPayload.biblioteca);
        setClientes(dataPayload.clientes);
        setEmpresa(dataPayload.empresa);
        setIdCounter(Number(dataPayload.counter));
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
        config: cfg,
        compras,
        biblioteca,
        clientes,
        empresa,
        counter: idCounter,
        ultimaActualizacion: timestamp
      };

      const intentarGuardar = (intento = 0) => {
        // Se guarda ANTES de escribir: así, en cuanto llegue la confirmación
        // por el listener en tiempo real, ya sabemos reconocer que es este
        // mismo guardado y no un cambio remoto genuino.
        lastWrittenTimestampRef.current = timestamp;

        setDoc(doc(db, "users", user.uid), dataPayload, { merge: true })
          .then(() => {
            if (cancelado) return;
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
  }, [pedidos, cfg, compras, biblioteca, clientes, empresa, idCounter, user, loading, datosCargadosOk]);

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

        // Cambio confirmado que no se originó en esta pestaña: viene de otra
        // pestaña o dispositivo del mismo usuario. Sincronizamos.
        setPedidos(cloud.pedidos ?? []);
        setCfg(cloud.config ?? defaultCfg);
        setCompras(cloud.compras ?? []);
        setBiblioteca(cloud.biblioteca ?? []);
        setClientes(cloud.clientes ?? []);
        setEmpresa(cloud.empresa ?? defaultEmpresa);
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

  // Set favicon to empresa.logo when available, otherwise revert to default
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

      if (data.pedidos) setPedidos(data.pedidos);
      if (data.cfg) setCfg(data.cfg);
      if (data.compras) setCompras(data.compras);
      if (data.biblioteca) setBiblioteca(data.biblioteca);
      if (data.clientes) setClientes(data.clientes);
      if (data.empresa) setEmpresa(data.empresa);
      
      const nextCounter = data._idCounter || data.idCounter || 1;
      setIdCounter(Number(nextCounter));
      
      // Upload to Firebase immediately if logged in
      if (user) {
        const restoreTimestamp = new Date().toISOString();
        await setDoc(doc(db, "users", user.uid), {
          pedidos: data.pedidos || [],
          config: data.cfg || defaultCfg,
          compras: data.compras || [],
          biblioteca: data.biblioteca || [],
          clientes: data.clientes || [],
          counter: nextCounter,
          empresa: data.empresa || defaultEmpresa,
          ultimaActualizacion: restoreTimestamp
        }, { merge: true });
        // Igual que en el autosave: evita que el listener en tiempo real
        // confunda la confirmación de este mismo guardado con un cambio
        // hecho desde otra pestaña/dispositivo.
        lastWrittenTimestampRef.current = restoreTimestamp;
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
    compras,
    setCompras,
    biblioteca,
    setBiblioteca,
    clientes,
    setClientes,
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
