import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Guardar el archivo en una carpeta de esta PC. Es el destino que siempre está
// disponible, para cualquier impresora: una tarjeta SD o un pendrive (E:\), una
// carpeta compartida de la red o la que mire un OctoPrint. Sirve sobre todo para
// las impresoras sin red, o cuando se prefiere pasar el archivo a mano. Después
// de guardarlo, se abre la carpeta con el archivo marcado.
//
// No es una impresora cargada en el panel: el conector lo ofrece siempre, con la
// carpeta que se elige en el panel (por defecto, Documentos\Manager3D-Archivos).

export const carpetaPorDefecto = () => path.join(os.homedir(), 'Documents', 'Manager3D-Archivos');

// Para las pruebas: no abrir el Explorador.
const sinAbrir = () => process.env.MANAGER3D_NO_ABRIR === '1';

// Se asegura de que la carpeta exista y se pueda escribir. Si la unidad no está
// (tarjeta SD sin poner) no se la inventa: se avisa.
export function prepararCarpeta(carpeta) {
  const ruta = path.resolve(carpeta);
  const raiz = path.parse(ruta).root;
  if (raiz && !fs.existsSync(raiz)) throw new Error(`No existe la unidad ${raiz.replace(/[\\/]+$/, '')}: ¿está puesta la tarjeta SD o el pendrive?`);
  try {
    fs.mkdirSync(ruta, { recursive: true });
    fs.accessSync(ruta, fs.constants.W_OK);
  } catch (e) {
    throw new Error(`No se puede escribir en ${ruta}: ${e.code === 'EROFS' || e.code === 'EACCES' || e.code === 'EPERM' ? 'está protegida contra escritura o sin permiso' : e.message}`, { cause: e });
  }
  return ruta;
}

// Abre la carpeta con el archivo seleccionado (Explorador de Windows).
function mostrar(ruta) {
  if (sinAbrir()) return;
  const hijo = process.platform === 'win32'
    ? spawn('explorer.exe', [`/select,"${ruta}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [process.platform === 'darwin' ? '-R' : path.dirname(ruta), ...(process.platform === 'darwin' ? [ruta] : [])], { detached: true, stdio: 'ignore' });
  hijo.once('error', () => {}); // si no se puede abrir la carpeta, el archivo igual quedó guardado
  hijo.unref();
}

export const guardarEnCarpeta = {
  tipo: 'guardar-en-carpeta',
  nombre: 'Guardar en una carpeta (tarjeta SD, pendrive, red)',
  formatos: ['gcode', '3mf'],
  puedeImprimir: false,
  guarda: true,
  oculto: true, // no se agrega a mano: está siempre
  campos: [],

  async probar(destino) {
    const ruta = prepararCarpeta(destino.carpeta);
    return `Listo: se guarda en ${ruta}.`;
  },

  async enviar(destino, { nombre, contenido }) {
    const carpeta = prepararCarpeta(destino.carpeta);
    const archivo = path.join(carpeta, nombre.replace(/[<>:"/\\|?*]/g, '_'));
    try {
      fs.writeFileSync(archivo, contenido);
    } catch (e) {
      throw new Error(`No se pudo guardar en ${carpeta}: ${e.message}`, { cause: e });
    }
    mostrar(archivo);
    return { estado: 'enviado', mensaje: `Guardado en ${carpeta}${sinAbrir() ? '' : ' (se abrió la carpeta)'}. Pasalo a la impresora desde ahí.` };
  }
};
