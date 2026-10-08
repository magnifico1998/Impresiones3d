import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { firebaseConfig } from "./entornoFirebase";

// Núcleo de Firebase (app + Firestore + Functions) separado de Auth y
// Storage: el catálogo público importa sólo esto, así su bundle no arrastra
// los SDK de login ni de Storage que no usa. La app con login importa
// ../firebase, que re-exporta esto y suma Auth/Storage.
// La config sale de entornoFirebase.js (producción o prueba según el entorno).

export const app = initializeApp(firebaseConfig);

// Caché local persistente con soporte para varias pestañas. Reemplaza a
// enableIndexedDbPersistence (deprecado), que con dos pestañas abiertas
// desactivaba la persistencia en la segunda: esa pestaña volvía a leer
// todas las colecciones desde el servidor en cada carga.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const functions = getFunctions(app);
