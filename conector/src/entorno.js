// A qué Manager3D se conecta el conector: producción (el de siempre) o la base de
// PRUEBA (manager3d-test), para poder probar sin tocar datos reales. La versión de
// prueba se arma con `npm run empaquetar -- --test` (esbuild define
// ES_PRUEBA_CONECTOR=true); sin empaquetar, se elige con MANAGER3D_ENTORNO=test.
// Cada una guarda su vínculo y sus archivos temporales en su propia carpeta, así pueden convivir en una PC.
// OJO: estas claves se repiten en src/entornoFirebase.js (la app web); si cambia un proyecto, cambiar los dos.

/* global ES_PRUEBA_CONECTOR */
const compilado = typeof ES_PRUEBA_CONECTOR !== 'undefined' ? ES_PRUEBA_CONECTOR : false;
export const ES_PRUEBA = compilado || process.env.MANAGER3D_ENTORNO === 'test';

export const FIREBASE = ES_PRUEBA
  ? {
      apiKey: 'AIzaSyBp9LqhpFsL5jKvG6ZBwVD2NItQZ9-TcHA',
      authDomain: 'manager3d-test.firebaseapp.com',
      projectId: 'manager3d-test',
      storageBucket: 'manager3d-test.firebasestorage.app',
      appId: '1:439596203207:web:c0038c36821fc7f82412e2'
    }
  : {
      apiKey: 'AIzaSyAcDCdC5eMraPo7hwGKhojXb8EnONZWiH0',
      authDomain: 'print3d-manager-73846.firebaseapp.com',
      projectId: 'print3d-manager-73846',
      storageBucket: 'print3d-manager-73846.firebasestorage.app',
      appId: '1:534221073184:web:4f2e0cfda14ff4fd514545'
    };

export const URL_VINCULAR = `https://us-central1-${FIREBASE.projectId}.cloudfunctions.net/vincularConector`;
export const NOMBRE_PROGRAMA = ES_PRUEBA ? 'Manager3D-Conector-PRUEBA' : 'Manager3D-Conector';
export const TITULO_PROGRAMA = ES_PRUEBA ? 'Manager3D Conector (PRUEBA)' : 'Manager3D Conector';
