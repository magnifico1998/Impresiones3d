import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { NOMBRE_PROGRAMA } from '../entorno.js';

// Lo común de los drivers "Abrir en…" (Bambu Studio, Anycubic Slicer Next): se
// guarda el archivo laminado en una carpeta temporal de esta PC y se abre con un
// programa. Desde ahí el usuario lo manda a la impresora como siempre (con su
// cuenta o por la red), así que no hace falta ningún modo especial en la
// impresora.

export const ejecutar = promisify(execFile);
const CARPETA = path.join(os.tmpdir(), NOMBRE_PROGRAMA);

// Guarda el contenido con su nombre y devuelve la ruta.
export function guardarTemporal(nombre, contenido) {
  fs.mkdirSync(CARPETA, { recursive: true });
  const ruta = path.join(CARPETA, nombre.replace(/[<>:"/\\|?*]/g, '_'));
  fs.writeFileSync(ruta, contenido);
  return ruta;
}

// Abre el archivo. Con `programa`, con ese programa; sin él, con el que tenga
// esta PC elegido para ese tipo de archivo.
export function abrirArchivo(ruta, programa) {
  if (programa) {
    return new Promise((resolver, rechazar) => {
      const falla = (e) => rechazar(new Error(`No se pudo abrir ${programa}: ${e.code === 'EFTYPE' || e.code === 'EACCES' ? 'no es un programa ejecutable (tiene que ser el .exe)' : e.message}`, { cause: e }));
      let hijo;
      try {
        hijo = spawn(programa, [ruta], { detached: true, stdio: 'ignore' });
      } catch (e) {
        falla(e);
        return;
      }
      hijo.once('error', falla);
      hijo.once('spawn', () => { hijo.unref(); resolver(); });
    });
  }
  if (process.platform === 'win32') return ejecutar('rundll32', ['url.dll,FileProtocolHandler', ruta]);
  if (process.platform === 'darwin') return ejecutar('open', [ruta]);
  return ejecutar('xdg-open', [ruta]);
}

// Programa que tiene esta PC elegido para los .3mf (sólo Windows), o null.
export async function programaPredeterminado3mf() {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await ejecutar('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.3mf\\UserChoice', '/v', 'ProgId']);
    return stdout.match(/ProgId\s+REG_SZ\s+(.+)/)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}
