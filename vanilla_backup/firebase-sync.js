import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
  import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
  import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAcDCdC5eMraPo7hwGKhojXb8EnONZWiH0",
    authDomain: "print3d-manager-73846.firebaseapp.com",
    projectId: "print3d-manager-73846",
    storageBucket: "print3d-manager-73846.firebasestorage.app",
    messagingSenderId: "534221073184",
    appId: "1:534221073184:web:4f2e0cfda14ff4fd514545",
    measurementId: "G-C0SREN7R2Y"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();

  const loginScreen = document.getElementById('login-screen');
  const btnLoginGoogle = document.getElementById('btn-login-google');

  let bloqueoSincronizacion = false;

  btnLoginGoogle.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error en autenticación:", error);
      alert("Error al intentar conectar con Google. Revisa la consola.");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Usuario autenticado correctamente:", user.email);
      await descargarDatosDeNube(user.uid);
      loginScreen.style.display = 'none'; 
    } else {
      loginScreen.style.display = 'flex'; 
    }
  });

  async function descargarDatosDeNube(uid) {
    try {
      bloqueoSincronizacion = true; 
      console.log("Descargando datos desde la nube...");

      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const cloud = docSnap.data();
        
        if (cloud.pedidos) localStorage.setItem('p3d_pedidos', JSON.stringify(cloud.pedidos));
        if (cloud.config) localStorage.setItem('p3d_cfg', JSON.stringify(cloud.config));
        if (cloud.compras) localStorage.setItem('p3d_compras', JSON.stringify(cloud.compras));
        if (cloud.biblioteca) localStorage.setItem('p3d_bib', JSON.stringify(cloud.biblioteca));
        if (cloud.clientes) localStorage.setItem('p3d_clientes', JSON.stringify(cloud.clientes));
        if (cloud.counter) localStorage.setItem('p3d_counter', cloud.counter.toString());
        if (cloud.empresa) localStorage.setItem('p3d_empresa', JSON.stringify(cloud.empresa));
        
        console.log("Sincronización desde la nube completada.");
      } else {
        console.log("Usuario nuevo. Inicializando base en la nube...");
        await setDoc(docRef, {
          pedidos: [], config: {}, compras: [], biblioteca: [], clientes: [], counter: 0, ultimaActualizacion: new Date().toISOString()
        });
      }

    } catch (e) {
      console.error("Error al descargar datos de Firestore:", e);
    } finally {
      bloqueoSincronizacion = false; 
      forzarRefrescoUI();
    }
  }

  async function subirDatosANube(uid) {
    try {
      const dataPayload = {
        pedidos: JSON.parse(localStorage.getItem('p3d_pedidos') || '[]'),
        config: JSON.parse(localStorage.getItem('p3d_cfg') || '{}'),
        compras: JSON.parse(localStorage.getItem('p3d_compras') || '[]'),
        biblioteca: JSON.parse(localStorage.getItem('p3d_bib') || '[]'),
        clientes: JSON.parse(localStorage.getItem('p3d_clientes') || '[]'),
        counter: parseInt(localStorage.getItem('p3d_counter') || '0', 10),
        empresa: JSON.parse(localStorage.getItem('p3d_empresa') || '{}'),
        ultimaActualizacion: new Date().toISOString()
      };
      await setDoc(doc(db, "users", uid), dataPayload);
      console.log("Respaldo automático guardado en Firestore.");
    } catch (e) {
      console.error("Error al respaldar en la nube:", e);
    }
  }

  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    
    if (bloqueoSincronizacion) return;

    if (['p3d_pedidos', 'p3d_cfg', 'p3d_compras', 'p3d_bib', 'p3d_clientes', 'p3d_counter', 'p3d_empresa'].includes(key)) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        subirDatosANube(currentUser.uid);
      }
    }
  };

  function forzarRefrescoUI() {
    if (typeof window.cargarEstado === 'function') window.cargarEstado();
    if (typeof window.cargarEmpresa === 'function') window.cargarEmpresa();

    if (typeof window.renderResumen === 'function') window.renderResumen();
    if (typeof window.renderPedidos === 'function') window.renderPedidos();
    if (typeof window.renderCompras === 'function') window.renderCompras();
    if (typeof window.renderBibliotecaPage === 'function') window.renderBibliotecaPage();
    if (typeof window.renderClientes === 'function') window.renderClientes();
    if (typeof window.refreshSelects === 'function') window.refreshSelects();
    if (typeof window.calcular === 'function') window.calcular();
    if (typeof window.updateStats === 'function') window.updateStats();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.header');
    if (header) {
      const btnLogout = document.createElement('button');
      btnLogout.className = 'btn btn-sm';
      btnLogout.style.cssText = 'margin-left: 12px; font-size:11px; padding: 4px 10px; border-radius: 6px; border:1px solid var(--border2); background:none; color:var(--text2); cursor:pointer;';
      btnLogout.innerHTML = 'Salir ➔';
      btnLogout.onclick = () => {
        if(confirm("¿Cerrar sesión en Manager3D?")) {
          bloqueoSincronizacion = true; 
          localStorage.clear(); 
          auth.signOut().then(() => location.reload());
        }
      };
      header.appendChild(btnLogout);
    }
  });
