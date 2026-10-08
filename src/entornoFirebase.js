// Qué proyecto de Firebase usa la app. Son dos, con la misma estructura:
//   - producción: print3d-manager-73846 (los datos reales de los clientes).
//   - prueba:     manager3d-test (para desarrollar y probar sin tocar producción).
//
// Cuál se usa:
//   - `npm run dev` (localhost): prueba. Para mirar producción desde localhost,
//     VITE_ENTORNO=prod en .env.local (con cuidado: escribe datos reales).
//   - Build de Vercel: producción, salvo que VITE_ENTORNO=test (variable de
//     entorno de Vercel con alcance "Preview": así develop y los previews usan
//     la base de prueba y main, la de producción).
// Las claves del cliente de Firebase no son secretas (las protegen las reglas).

const PRODUCCION = {
  apiKey: 'AIzaSyAcDCdC5eMraPo7hwGKhojXb8EnONZWiH0',
  authDomain: 'print3d-manager-73846.firebaseapp.com',
  projectId: 'print3d-manager-73846',
  storageBucket: 'print3d-manager-73846.firebasestorage.app',
  messagingSenderId: '534221073184',
  appId: '1:534221073184:web:4f2e0cfda14ff4fd514545',
  measurementId: 'G-C0SREN7R2Y'
};

const PRUEBA = {
  apiKey: 'AIzaSyBp9LqhpFsL5jKvG6ZBwVD2NItQZ9-TcHA',
  authDomain: 'manager3d-test.firebaseapp.com',
  projectId: 'manager3d-test',
  storageBucket: 'manager3d-test.firebasestorage.app',
  messagingSenderId: '439596203207',
  appId: '1:439596203207:web:c0038c36821fc7f82412e2',
  measurementId: 'G-7CCDPF7FQN'
};

const elegido = import.meta.env.VITE_ENTORNO || (import.meta.env.DEV ? 'test' : 'prod');

export const ES_PRUEBA = elegido === 'test';
export const firebaseConfig = ES_PRUEBA ? PRUEBA : PRODUCCION;
