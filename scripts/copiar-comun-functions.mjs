// Copia los módulos compartidos de functions/ (codebase default) a cada codebase
// que los usa, antes de desplegar: Firebase sube sólo la carpeta de cada codebase,
// así que no pueden requerirse desde afuera. Las copias están en .gitignore: el
// original sigue siendo el de functions/ y las copias no se editan.
// Se ejecuta solo desde firebase.json (predeploy); también a mano: node scripts/copiar-comun-functions.mjs
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMUN = ['admin.js', 'mailer.js', 'emailTemplates.js'];
const DESTINOS = ['functions-facturacion'];

const raiz = new URL('../', import.meta.url);
for (const destino of DESTINOS) {
  for (const archivo of COMUN) {
    const origen = fileURLToPath(new URL(`functions/${archivo}`, raiz));
    if (!existsSync(origen)) throw new Error(`Falta functions/${archivo}`);
    copyFileSync(origen, fileURLToPath(new URL(`${destino}/${archivo}`, raiz)));
  }
  console.log(`Módulos comunes copiados a ${destino}/`);
}
