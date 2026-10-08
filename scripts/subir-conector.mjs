// Sube el programa del conector de impresión a Firebase Storage
// (conector/Manager3D-Conector.zip) para que los suscriptores lo bajen desde
// Configuración → Impresión directa (botón "Descargar el conector").
//
//   npm --prefix conector run empaquetar     arma conector/dist/Manager3D-Conector.zip
//   node scripts/subir-conector.mjs          lo sube (reemplaza al anterior)
//
// Versión de PRUEBA (se conecta a manager3d-test y se baja desde la app de prueba):
//   npm --prefix conector run empaquetar -- --test
//   node scripts/subir-conector.mjs test
//
// Usa la sesión del Firebase CLI (`firebase login`) y la copia global de
// firebase-tools para obtener el permiso: no hace falta una clave de servicio.
// Las reglas de Storage dejan leer conector/* a cualquier usuario logueado.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const prueba = process.argv[2] === 'test';
const raiz = new URL('..', import.meta.url);
const archivoZip = prueba ? 'Manager3D-Conector-PRUEBA.zip' : 'Manager3D-Conector.zip';
const zip = new URL(`conector/dist/${archivoZip}`, raiz);
if (!existsSync(zip)) {
  console.error(`No existe conector/dist/${archivoZip}: corré antes \`npm --prefix conector run empaquetar${prueba ? ' -- --test' : ''}\`.`);
  process.exit(1);
}

const proyecto = JSON.parse(readFileSync(new URL('.firebaserc', raiz), 'utf8')).projects[prueba ? 'test' : 'prod'];
const bucket = `${proyecto}.firebasestorage.app`;
const destino = 'conector/Manager3D-Conector.zip';

const global = execSync('npm root -g').toString().trim();
const require = createRequire(import.meta.url);
const { requireAuth } = require(join(global, 'firebase-tools/lib/requireAuth.js'));
const { getAccessToken } = require(join(global, 'firebase-tools/lib/auth.js'));
const { configstore } = require(join(global, 'firebase-tools/lib/configstore.js'));

await requireAuth({ project: proyecto });
const { access_token: token } = await getAccessToken(configstore.get('tokens').refresh_token, []);

// Subida multipart: los datos del archivo y su token de descarga (sin él, la
// app no puede pedir la URL con getDownloadURL).
const frontera = `m3d-${randomUUID()}`;
const metadatos = JSON.stringify({
  name: destino,
  contentType: 'application/zip',
  cacheControl: 'no-cache',
  metadata: { firebaseStorageDownloadTokens: randomUUID() }
});
const cuerpo = Buffer.concat([
  Buffer.from(`--${frontera}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadatos}\r\n--${frontera}\r\nContent-Type: application/zip\r\n\r\n`),
  readFileSync(zip),
  Buffer.from(`\r\n--${frontera}--`)
]);

console.log(`Subiendo ${destino} (${(statSync(zip).size / 1024 / 1024).toFixed(1)} MB) a ${bucket}…`);
const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${frontera}` },
  body: cuerpo
});
const respuesta = await r.json();
if (!r.ok) {
  console.error('No se pudo subir:', r.status, JSON.stringify(respuesta));
  process.exit(1);
}
console.log(`Listo: ${respuesta.name}, ${(Number(respuesta.size) / 1024 / 1024).toFixed(1)} MB.`);
