import { initializeApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { firebaseConfig } from "./entornoFirebase";
import { esRutaDeCatalogo } from "./utils/nombreCatalogo";

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
//
// El catálogo público (/catalogo/{uid}) NO usa esa caché compartida: con varias pestañas del mismo sitio, una sola
// pestaña ("primaria") habla con el servidor y las demás le piden prestada la conexión. Si la primaria era una
// pestaña del catálogo (sin sesión), las lecturas de la app con login salían sin credenciales y fallaban con
// "permission-denied" (admins, faq, vínculo de equipo) aunque el token estuviera bien: no se arreglaba reintentando
// ni renovando el token, sólo cerrando esa pestaña. El catálogo es de sólo lectura pública y no necesita caché
// persistente, así que va con caché en memoria y nunca compite por ser la pestaña primaria.
const esCatalogoPublico = typeof window !== 'undefined' && esRutaDeCatalogo(window.location.pathname);
export const db = initializeFirestore(app, {
  localCache: esCatalogoPublico
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const functions = getFunctions(app);
