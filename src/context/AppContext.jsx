import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
  
  // Toasts
  const [toasts, setToasts] = useState([]);
  
  const showToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const getNewId = () => {
    const nextId = idCounter;
    setIdCounter(idCounter + 1);
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
        setPedidos(dataPayload.pedidos);
        setCfg(dataPayload.config);
        setCompras(dataPayload.compras);
        setBiblioteca(dataPayload.biblioteca);
        setClientes(dataPayload.clientes);
        setEmpresa(dataPayload.empresa);
        setIdCounter(Number(dataPayload.counter));
      }
    } catch (e) {
      console.error("Error al cargar datos de Firestore:", e);
      showToast('Error al cargar datos de Firebase.', 'error');
    }
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
  useEffect(() => {
    if (loading || !user) return;

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

    setDoc(doc(db, "users", user.uid), dataPayload, { merge: true }).catch(e => {
      console.error("Error al guardar en Firebase:", e);
    });
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
        await setDoc(doc(db, "users", user.uid), {
          pedidos: data.pedidos || [],
          config: data.cfg || defaultCfg,
          compras: data.compras || [],
          biblioteca: data.biblioteca || [],
          clientes: data.clientes || [],
          counter: nextCounter,
          empresa: data.empresa || defaultEmpresa,
          ultimaActualizacion: new Date().toISOString()
        }, { merge: true });
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
