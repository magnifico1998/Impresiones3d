import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Bambu Lab por Bambu Connect: el camino oficial de Bambu para programas de
// terceros. Se guarda el archivo en esta PC y se abre Bambu Connect con él
// (bambu-connect://import-file); ahí se elige la impresora y la placa y se
// confirma. La impresora sigue con la nube y Bambu Handy como siempre.
// Hace falta tener Bambu Connect instalado en esta PC.
//   https://wiki.bambulab.com/en/software/third-party-integration

const ejecutar = promisify(execFile);
const CARPETA = path.join(os.tmpdir(), 'Manager3D-Conector');

async function bambuConnectInstalado() {
  if (process.platform !== 'win32') return true;
  try {
    await ejecutar('reg', ['query', 'HKCR\\bambu-connect']);
    return true;
  } catch {
    return false;
  }
}

// Abre una URL con el programa registrado para su esquema (sin pasar por cmd,
// que se come los & de la URL).
function abrirUrl(url) {
  if (process.platform === 'win32') return ejecutar('rundll32', ['url.dll,FileProtocolHandler', url]);
  if (process.platform === 'darwin') return ejecutar('open', [url]);
  return ejecutar('xdg-open', [url]);
}

export const bambuConnect = {
  tipo: 'bambu-connect',
  nombre: 'Bambu Lab (por Bambu Connect)',
  formatos: ['3mf', 'gcode'],
  puedeImprimir: false, // la impresión se confirma en Bambu Connect
  campos: [],

  async probar() {
    if (!(await bambuConnectInstalado())) throw new Error('No encontré Bambu Connect en esta PC. Instalalo desde wiki.bambulab.com.');
    return 'Bambu Connect está instalado.';
  },

  async enviar(impresora, { nombre, contenido }) {
    if (!(await bambuConnectInstalado())) throw new Error('No encontré Bambu Connect en esta PC. Instalalo desde wiki.bambulab.com.');
    fs.mkdirSync(CARPETA, { recursive: true });
    const archivo = path.join(CARPETA, nombre.replace(/[<>:"/\\|?*]/g, '_'));
    fs.writeFileSync(archivo, contenido);
    const titulo = nombre.replace(/\.gcode\.3mf$|\.3mf$|\.gcode$/i, '');
    await abrirUrl(`bambu-connect://import-file?path=${encodeURIComponent(archivo)}&name=${encodeURIComponent(titulo)}&version=1.0.0`);
    return { estado: 'enviado', mensaje: 'Abierto en Bambu Connect: elegí la impresora y confirmá la impresión ahí.' };
  }
};
