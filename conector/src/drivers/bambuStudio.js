import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Abrir el archivo en Bambu Studio (o el programa que tenga esta PC para los
// .3mf, como Orca Slicer): se guarda el archivo laminado y se abre. Desde ahí
// se manda a la impresora como siempre (nube de Bambu, LAN, o la tarjeta).
// No toca la impresora ni exige Bambu Connect ni el modo LAN, así que sirve
// para cualquier Bambu (y para cualquier otra marca cuyo programa abra el
// archivo).

const ejecutar = promisify(execFile);
const CARPETA = path.join(os.tmpdir(), 'Manager3D-Conector');

// Qué programa tiene esta PC elegido para los .3mf (sólo Windows).
async function programaDe3mf() {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await ejecutar('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.3mf\\UserChoice', '/v', 'ProgId']);
    return stdout.match(/ProgId\s+REG_SZ\s+(.+)/)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function abrirArchivo(ruta) {
  if (process.platform === 'win32') return ejecutar('rundll32', ['url.dll,FileProtocolHandler', ruta]);
  if (process.platform === 'darwin') return ejecutar('open', [ruta]);
  return ejecutar('xdg-open', [ruta]);
}

export const bambuStudio = {
  tipo: 'abrir-en-programa',
  nombre: 'Abrir en Bambu Studio / Orca (el programa de tus .3mf)',
  formatos: ['3mf', 'gcode'],
  puedeImprimir: false, // se imprime desde el programa
  campos: [],

  async probar() {
    const prog = await programaDe3mf();
    if (!prog) return 'Listo: el archivo se va a abrir con el programa que tenga esta PC para los .3mf.';
    if (/bambu|orca/i.test(prog)) return `Listo: los .3mf se abren con ${prog.replace(/^Applications\\/, '')}.`;
    return `Ojo: los .3mf se abren con ${prog}. Para que se abran en Bambu Studio, elegilo como programa predeterminado de los .3mf en Windows.`;
  },

  async enviar(impresora, { nombre, contenido }) {
    fs.mkdirSync(CARPETA, { recursive: true });
    const archivo = path.join(CARPETA, nombre.replace(/[<>:"/\\|?*]/g, '_'));
    fs.writeFileSync(archivo, contenido);
    await abrirArchivo(archivo);
    return { estado: 'enviado', mensaje: 'Abierto en tu programa de laminado: mandalo a la impresora desde ahí.' };
  }
};
