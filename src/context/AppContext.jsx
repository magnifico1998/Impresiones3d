import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AppContext = createContext();

const defaultCfg = {
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
  
  // Toasts
  const [toasts, setToasts] = useState([]);
  
  const showToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const bloqueoSincronizacion = useRef(false);
  const cloudSyncTimeout = useRef(null);

  const leerDatosLocales = () => {
    const savedCfg = localStorage.getItem('p3d_cfg');
    const savedPedidos = localStorage.getItem('p3d_pedidos');
    const savedCompras = localStorage.getItem('p3d_compras');
    const savedBib = localStorage.getItem('p3d_bib');
    const savedClientes = localStorage.getItem('p3d_clientes');
    const savedEmpresa = localStorage.getItem('p3d_empresa');
    const savedCounter = localStorage.getItem('p3d_counter');

    return {
      cfg: savedCfg ? JSON.parse(savedCfg) : defaultCfg,
      pedidos: savedPedidos ? JSON.parse(savedPedidos) : [],
      compras: savedCompras ? JSON.parse(savedCompras) : [],
      biblioteca: savedBib ? JSON.parse(savedBib) : [],
      clientes: savedClientes ? JSON.parse(savedClientes) : [],
      empresa: savedEmpresa ? JSON.parse(savedEmpresa) : defaultEmpresa,
      counter: savedCounter ? parseInt(savedCounter, 10) : 1
    };
  };

  const getNewId = () => {
    const nextId = idCounter;
    const nextCounter = idCounter + 1;
    setIdCounter(nextCounter);
    localStorage.setItem('p3d_counter', String(nextCounter));
    return nextId;
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
      bloqueoSincronizacion.current = true;
      localStorage.clear();
      await signOut(auth);
      window.location.reload();
    }
  };

  // Upload partial updates to Cloud
  const subirDatosANube = async (uid, partialData) => {
    try {
      const dataPayload = {
        ...partialData,
        ultimaActualizacion: new Date().toISOString()
      };
      await setDoc(doc(db, "users", uid), dataPayload, { merge: true });
      console.log("Sincronización parcial guardada en Firestore:", Object.keys(partialData).join(', '));
      showToast('Datos guardados en Firebase correctamente.', 'success');
    } catch (e) {
      console.error("Error al respaldar en la nube:", e);
      showToast('Error al guardar en Firebase. Revisa tu conexión y sesión.', 'error');
    }
  };

  const sincronizarTodosLosDatosANube = async (uid) => {
    try {
      const dataPayload = {
        pedidos,
        config: cfg,
        compras,
        biblioteca,
        clientes,
        empresa,
        counter: idCounter,
        ultimaActualizacion: new Date().toISOString()
      };
      await setDoc(doc(db, "users", uid), dataPayload, { merge: true });
      console.log("Sincronización completa guardada en Firestore.");
      showToast('Sincronización con Firebase completada.', 'success');
    } catch (e) {
      console.error("Error al sincronizar todos los datos en la nube:", e);
      showToast('No se pudo sincronizar con Firebase. Comprueba tu conexión o autenticación.', 'error');
    }
  };

  // Download from Cloud
  const descargarDatosDeNube = async (uid) => {
    try {
      bloqueoSincronizacion.current = true;
      console.log("Descargando datos desde la nube...");
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      const localData = leerDatosLocales();

      if (docSnap.exists()) {
        const cloud = docSnap.data();
        const remotePedidos = cloud.pedidos ?? localData.pedidos;
        const remoteCfg = cloud.config ?? localData.cfg;
        const remoteCompras = cloud.compras ?? localData.compras;
        const remoteBiblioteca = cloud.biblioteca ?? localData.biblioteca;
        const remoteClientes = cloud.clientes ?? localData.clientes;
        const remoteEmpresa = cloud.empresa ?? localData.empresa;
        const remoteCounter = cloud.counter ?? localData.counter;

        setPedidos(remotePedidos);
        setCfg(remoteCfg);
        setCompras(remoteCompras);
        setBiblioteca(remoteBiblioteca);
        setClientes(remoteClientes);
        setEmpresa(remoteEmpresa);
        setIdCounter(Number(remoteCounter));

        localStorage.setItem('p3d_pedidos', JSON.stringify(remotePedidos));
        localStorage.setItem('p3d_cfg', JSON.stringify(remoteCfg));
        localStorage.setItem('p3d_compras', JSON.stringify(remoteCompras));
        localStorage.setItem('p3d_bib', JSON.stringify(remoteBiblioteca));
        localStorage.setItem('p3d_clientes', JSON.stringify(remoteClientes));
        localStorage.setItem('p3d_empresa', JSON.stringify(remoteEmpresa));
        localStorage.setItem('p3d_counter', String(remoteCounter));

        console.log("Sincronización desde la nube completada.");
      } else {
        console.log("Usuario nuevo. Inicializando base en la nube...");
        const dataPayload = {
          pedidos: localData.pedidos,
          config: localData.cfg,
          compras: localData.compras,
          biblioteca: localData.biblioteca,
          clientes: localData.clientes,
          counter: localData.counter,
          empresa: localData.empresa,
          ultimaActualizacion: new Date().toISOString()
        };
        await setDoc(docRef, dataPayload);
        setPedidos(dataPayload.pedidos);
        setCfg(dataPayload.config);
        setCompras(dataPayload.compras);
        setBiblioteca(dataPayload.biblioteca);
        setClientes(dataPayload.clientes);
        setEmpresa(dataPayload.empresa);
        setIdCounter(Number(dataPayload.counter));

        localStorage.setItem('p3d_pedidos', JSON.stringify(dataPayload.pedidos));
        localStorage.setItem('p3d_cfg', JSON.stringify(dataPayload.config));
        localStorage.setItem('p3d_compras', JSON.stringify(dataPayload.compras));
        localStorage.setItem('p3d_bib', JSON.stringify(dataPayload.biblioteca));
        localStorage.setItem('p3d_clientes', JSON.stringify(dataPayload.clientes));
        localStorage.setItem('p3d_empresa', JSON.stringify(dataPayload.empresa));
        localStorage.setItem('p3d_counter', String(dataPayload.counter));
      }
    } catch (e) {
      console.error("Error al descargar datos de Firestore:", e);
    } finally {
      bloqueoSincronizacion.current = false;
    }
  };

  // Initial load
  useEffect(() => {
    const cargarDatosLocales = () => {
      const localData = leerDatosLocales();
      setCfg(localData.cfg);
      setPedidos(localData.pedidos);
      setCompras(localData.compras);
      setBiblioteca(localData.biblioteca);
      setClientes(localData.clientes);
      setEmpresa(localData.empresa);
      setIdCounter(localData.counter);
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await descargarDatosDeNube(currentUser.uid);
      } else {
        cargarDatosLocales();
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;
    if (bloqueoSincronizacion.current) return;

    localStorage.setItem('p3d_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('p3d_cfg', JSON.stringify(cfg));
    localStorage.setItem('p3d_compras', JSON.stringify(compras));
    localStorage.setItem('p3d_bib', JSON.stringify(biblioteca));
    localStorage.setItem('p3d_clientes', JSON.stringify(clientes));
    localStorage.setItem('p3d_empresa', JSON.stringify(empresa));
    localStorage.setItem('p3d_counter', String(idCounter));

    if (user) {
      if (cloudSyncTimeout.current) {
        clearTimeout(cloudSyncTimeout.current);
      }
      cloudSyncTimeout.current = window.setTimeout(() => {
        sincronizarTodosLosDatosANube(user.uid);
      }, 300);
    }

    return () => {
      if (cloudSyncTimeout.current) {
        clearTimeout(cloudSyncTimeout.current);
      }
    };
  }, [pedidos, cfg, compras, biblioteca, clientes, empresa, idCounter, user, loading]);

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
      bloqueoSincronizacion.current = true;
      
      if (data.pedidos) {
        setPedidos(data.pedidos);
        localStorage.setItem('p3d_pedidos', JSON.stringify(data.pedidos));
      }
      if (data.cfg) {
        setCfg(data.cfg);
        localStorage.setItem('p3d_cfg', JSON.stringify(data.cfg));
      }
      if (data.compras) {
        setCompras(data.compras);
        localStorage.setItem('p3d_compras', JSON.stringify(data.compras));
      }
      if (data.biblioteca) {
        setBiblioteca(data.biblioteca);
        localStorage.setItem('p3d_bib', JSON.stringify(data.biblioteca));
      }
      if (data.clientes) {
        setClientes(data.clientes);
        localStorage.setItem('p3d_clientes', JSON.stringify(data.clientes));
      }
      if (data.empresa) {
        setEmpresa(data.empresa);
        localStorage.setItem('p3d_empresa', JSON.stringify(data.empresa));
      }
      
      const nextCounter = data._idCounter || data.idCounter || 1;
      setIdCounter(Number(nextCounter));
      localStorage.setItem('p3d_counter', nextCounter.toString());
      
      // Upload to cloud immediately if logged in
      if (user) {
        await setDoc(doc(db, "users", user.uid), {
          pedidos: data.pedidos || [],
          config: data.cfg || defaultCfg,
          compras: data.compras || [],
          biblioteca: data.biblioteca || [],
          clientes: data.clientes || [],
          counter: nextCounter,
          empresa: data.empresa || defaultEmpresa,
          ultimaActualizacion: new Date().toISOString()
        });
      }
      
      showToast('✓ Backup restaurado correctamente.');
      return true;
    } catch (e) {
      console.error(e);
      showToast('Error al restaurar el backup.', 'error');
      return false;
    } finally {
      bloqueoSincronizacion.current = false;
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
    loginWithGoogle,
    logout,
    activePage,
    setActivePage,
    toasts,
    showToast,
    exportarBackupData,
    restaurarBackupData
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);
