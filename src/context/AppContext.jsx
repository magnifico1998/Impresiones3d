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

  // Synchronous sequence ID generator
  const getNewId = () => {
    let tempCounter = parseInt(localStorage.getItem('p3d_counter') || '1', 10);
    const nextId = tempCounter;
    tempCounter++;
    localStorage.setItem('p3d_counter', String(tempCounter));
    setIdCounter(tempCounter);
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

  // Upload to Cloud
  const subirDatosANube = async (uid, currentData) => {
    try {
      const dataPayload = {
        pedidos: currentData.pedidos,
        config: currentData.cfg,
        compras: currentData.compras,
        biblioteca: currentData.biblioteca,
        clientes: currentData.clientes,
        counter: currentData.idCounter,
        empresa: currentData.empresa,
        ultimaActualizacion: new Date().toISOString()
      };
      await setDoc(doc(db, "users", uid), dataPayload);
      console.log("Respaldo automático guardado en Firestore.");
    } catch (e) {
      console.error("Error al respaldar en la nube:", e);
    }
  };

  // Download from Cloud
  const descargarDatosDeNube = async (uid) => {
    try {
      bloqueoSincronizacion.current = true;
      console.log("Descargando datos desde la nube...");
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const cloud = docSnap.data();
        if (cloud.pedidos) {
          setPedidos(cloud.pedidos);
          localStorage.setItem('p3d_pedidos', JSON.stringify(cloud.pedidos));
        }
        if (cloud.config) {
          setCfg(cloud.config);
          localStorage.setItem('p3d_cfg', JSON.stringify(cloud.config));
        }
        if (cloud.compras) {
          setCompras(cloud.compras);
          localStorage.setItem('p3d_compras', JSON.stringify(cloud.compras));
        }
        if (cloud.biblioteca) {
          setBiblioteca(cloud.biblioteca);
          localStorage.setItem('p3d_bib', JSON.stringify(cloud.biblioteca));
        }
        if (cloud.clientes) {
          setClientes(cloud.clientes);
          localStorage.setItem('p3d_clientes', JSON.stringify(cloud.clientes));
        }
        if (cloud.counter) {
          setIdCounter(Number(cloud.counter));
          localStorage.setItem('p3d_counter', cloud.counter.toString());
        }
        if (cloud.empresa) {
          setEmpresa(cloud.empresa);
          localStorage.setItem('p3d_empresa', JSON.stringify(cloud.empresa));
        }
        console.log("Sincronización desde la nube completada.");
      } else {
        console.log("Usuario nuevo. Inicializando base en la nube...");
        const dataPayload = {
          pedidos: [],
          config: defaultCfg,
          compras: [],
          biblioteca: [],
          clientes: [],
          counter: 1,
          empresa: defaultEmpresa,
          ultimaActualizacion: new Date().toISOString()
        };
        await setDoc(docRef, dataPayload);
      }
    } catch (e) {
      console.error("Error al descargar datos de Firestore:", e);
    } finally {
      bloqueoSincronizacion.current = false;
    }
  };

  // Initial load
  useEffect(() => {
    const savedCfg = localStorage.getItem('p3d_cfg');
    if (savedCfg) setCfg(JSON.parse(savedCfg));
    
    const savedPedidos = localStorage.getItem('p3d_pedidos');
    if (savedPedidos) setPedidos(JSON.parse(savedPedidos));

    const savedCompras = localStorage.getItem('p3d_compras');
    if (savedCompras) setCompras(JSON.parse(savedCompras));

    const savedBib = localStorage.getItem('p3d_bib');
    if (savedBib) setBiblioteca(JSON.parse(savedBib));

    const savedClientes = localStorage.getItem('p3d_clientes');
    if (savedClientes) setClientes(JSON.parse(savedClientes));

    const savedCounter = localStorage.getItem('p3d_counter');
    if (savedCounter) setIdCounter(parseInt(savedCounter, 10) || 1);

    const savedEmpresa = localStorage.getItem('p3d_empresa');
    if (savedEmpresa) setEmpresa(JSON.parse(savedEmpresa));

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await descargarDatosDeNube(currentUser.uid);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Save to localStorage & Cloud
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
      subirDatosANube(user.uid, { pedidos, cfg, compras, biblioteca, clientes, idCounter, empresa });
    }
  }, [pedidos, compras, biblioteca, clientes, empresa, cfg, idCounter, user, loading]);

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
