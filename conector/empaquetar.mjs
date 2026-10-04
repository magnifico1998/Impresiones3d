// Arma el conector para entregarlo: un único Manager3D-Conector.exe (no hace
// falta tener Node.js) y un .zip con el .exe y las instrucciones.
//   npm run empaquetar   →   dist/Manager3D-Conector.zip
//
// Pasos: esbuild junta todo en un solo archivo; Node SEA lo mete dentro de una
// copia de node.exe (postject). Las rutas son relativas a propósito: en Windows el
// shell parte las que tienen espacios (como "Impresiones 3D"). El .exe no está firmado, así que Windows puede
// mostrar el aviso de SmartScreen la primera vez ("Más información" →
// "Ejecutar de todas formas").

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(raiz, 'dist');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const correr = (cmd, args, cwd = raiz) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

console.log('1/4 Juntando el código en un solo archivo…');
correr(npx, ['--yes', 'esbuild', 'src/index.js', '--bundle', '--platform=node', '--format=cjs', '--target=node22', '--outfile=dist/conector.cjs', '--log-level=warning']);

console.log('2/4 Preparando el ejecutable…');
fs.writeFileSync(path.join(dist, 'sea-config.json'), JSON.stringify({ main: 'conector.cjs', output: 'sea.blob', disableExperimentalSEAWarning: true }));
correr('node', ['--experimental-sea-config', 'sea-config.json'], dist);
const exe = path.join(dist, 'Manager3D-Conector.exe');
fs.copyFileSync(process.execPath, exe);

console.log('3/4 Metiendo el programa dentro del .exe…');
correr(npx, ['--yes', 'postject', 'Manager3D-Conector.exe', 'NODE_SEA_BLOB', 'sea.blob', '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], dist);

console.log('4/4 Armando el .zip…');
fs.writeFileSync(path.join(dist, 'LEEME.txt'), `Manager3D Conector
==================

Manda a tus impresoras los archivos G-code que elegís en Manager3D.

PRIMER USO
1. Abrí Manager3D-Conector.exe (doble clic). Si Windows muestra un aviso azul,
   tocá "Más información" y después "Ejecutar de todas formas".
   Se abre una ventana negra (dejala abierta) y el panel en el navegador:
   http://127.0.0.1:18930
2. En Manager3D: Configuración > Impresión directa > "Vincular un conector".
   Te muestra un código de 8 letras. Escribilo en el panel y tocá Vincular.
3. En el panel, en "Impresoras", cargá cada una:
   - Bambu Lab: elegí "Abrir en Bambu Studio / Orca" (necesita Bambu Studio
     instalado). Tocá "Probar".
   - Anycubic Kobra 3 / S1: elegí "Anycubic Kobra 3 / S1 (modo LAN)", poné la IP
     y tildá "Tiene ACE" si es Combo. La impresora tiene que estar en modo LAN.
4. En Manager3D, en la Biblioteca, tocá el icono del archivo de un producto y
   después "Mandar" para elegir la impresora.

NOTAS
- Para que lleguen los envíos, la ventana negra tiene que estar abierta.
  Para cerrar el conector, cerrá esa ventana (no la pagina del navegador).
- Para reiniciarlo: cerrá la ventana negra y volvé a abrir el .exe.
- Tus datos y los códigos de acceso de las impresoras quedan sólo en esta PC
  (carpeta %APPDATA%\\Manager3D-Conector).
`);
const zip = path.join(dist, 'Manager3D-Conector.zip');
correr('tar', ['-a', '-c', '-f', 'Manager3D-Conector.zip', 'Manager3D-Conector.exe', 'LEEME.txt'], dist);
console.log(`\nListo: ${zip} (${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB)`);
