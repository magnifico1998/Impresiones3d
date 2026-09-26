import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Núcleo de Firebase (app + Firestore + Functions) separado de Auth y
// Storage: el catálogo público importa sólo esto, así su bundle no arrastra
// los SDK de login ni de Storage que no usa. La app con login importa
// ../firebase, que re-exporta esto y suma Auth/Storage.
const firebaseConfig = {
  apiKey: "AIzaSyAcDCdC5eMraPo7hwGKhojXb8EnONZWiH0",
  authDomain: "print3d-manager-73846.firebaseapp.com",
  projectId: "print3d-manager-73846",
  storageBucket: "print3d-manager-73846.firebasestorage.app",
  messagingSenderId: "534221073184",
  appId: "1:534221073184:web:4f2e0cfda14ff4fd514545",
  measurementId: "G-C0SREN7R2Y"
};

export const app = initializeApp(firebaseConfig);

// Caché local persistente con soporte para varias pestañas. Reemplaza a
// enableIndexedDbPersistence (deprecado), que con dos pestañas abiertas
// desactivaba la persistencia en la segunda: esa pestaña volvía a leer
// todas las colecciones desde el servidor en cada carga.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const functions = getFunctions(app);
