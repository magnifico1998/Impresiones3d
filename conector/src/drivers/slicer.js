import fs from 'node:fs';
import path from 'node:path';
import { abrirArchivo, ejecutar, guardarTemporal, programaPredeterminado3mf } from './abrir.js';

// "Abrir en el slicer": el único destino que se ofrece al cargar una impresora. Guarda el archivo en esta PC
// y lo abre en el programa de laminado de la marca (Bambu Studio, Anycubic Slicer Next, Creality Print…); desde
// ahí se revisa el perfil, se lamina y se manda a la impresora con el flujo oficial de cada marca. Todas las
// marcas se manejan igual, así que no hay un soporte distinto por impresora.
//
// Cada marca conocida sabe cómo se llama su programa y lo busca sola (registro de Windows y carpetas
// habituales). Para una marca que no está en la lista ("Otra marca") se indica la ruta del .exe en el panel;
// y en cualquier marca se puede indicar a mano si el programa está en otro lugar.
//
// Las marcas con el programa verificado en uso son Bambu Lab y Anycubic; el resto se busca por el nombre
// habitual de su programa y, si no lo encuentra, alcanza con indicar la ruta.

export const MARCAS = [
  { id: 'bambu', nombre: 'Bambu Lab', programa: 'Bambu Studio u Orca Slicer', exe: /bambu.*studio|bambustudio|orca.?slicer/i, buscar: ['Bambu', 'Orca'], carpeta: /bambu|orca/i, predeterminado: /bambu|orca/i },
  { id: 'anycubic', nombre: 'Anycubic', programa: 'Anycubic Slicer Next', exe: /anycubic.*slicer|slicer.*anycubic/i, buscar: ['Anycubic'], carpeta: /anycubic/i, predeterminado: /anycubic/i },
  { id: 'creality', nombre: 'Creality', programa: 'Creality Print', exe: /creality.*print|crealityprint/i, buscar: ['Creality'], carpeta: /creality/i, predeterminado: /creality/i },
  { id: 'elegoo', nombre: 'Elegoo', programa: 'ElegooSlicer', exe: /elegoo.?slicer|elegoo.*slicer/i, buscar: ['Elegoo'], carpeta: /elegoo/i, predeterminado: /elegoo/i },
  { id: 'prusa', nombre: 'Prusa', programa: 'PrusaSlicer', exe: /prusa.?slicer/i, buscar: ['Prusa'], carpeta: /prusa/i, predeterminado: /prusa/i },
  { id: 'qidi', nombre: 'QIDI', programa: 'QIDI Studio', exe: /qidi.?studio/i, buscar: ['QIDI'], carpeta: /qidi/i, predeterminado: /qidi/i },
  { id: 'flashforge', nombre: 'Flashforge', programa: 'Orca-Flashforge o FlashPrint', exe: /orca.?flashforge|flashprint/i, buscar: ['Flashforge', 'FlashPrint'], carpeta: /flashforge|flashprint/i, predeterminado: /flashforge|flashprint/i },
  { id: 'snapmaker', nombre: 'Snapmaker', programa: 'Snapmaker Orca', exe: /snapmaker.*orca|orca.*snapmaker/i, buscar: ['Snapmaker'], carpeta: /snapmaker/i, predeterminado: /snapmaker/i },
  { id: 'otra', nombre: 'Otra marca (indicar el programa)', programa: 'el programa de laminado de tu marca', exe: null, buscar: [], carpeta: null, predeterminado: null }
];

export const marcaDe = (id) => MARCAS.find((m) => m.id === id) || MARCAS[MARCAS.length - 1];

const SIN_EXE = /uninstall|unins|update|crashreport/i;

// Primer .exe cuyo nombre cumple `regex` dentro de una carpeta (sin bajar más de 2 niveles).
export function exeEnCarpeta(carpeta, regex, nivel = 0) {
  let entradas;
  try {
    entradas = fs.readdirSync(carpeta, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entradas) {
    if (e.isFile() && /\.exe$/i.test(e.name) && regex.test(e.name) && !SIN_EXE.test(e.name)) return path.join(carpeta, e.name);
  }
  if (nivel < 2) {
    for (const e of entradas) {
      if (e.isDirectory()) {
        const r = exeEnCarpeta(path.join(carpeta, e.name), regex, nivel + 1);
        if (r) return r;
      }
    }
  }
  return null;
}

// Busca el programa de una marca: registro de Windows y carpetas habituales de instalación.
export async function ubicarPrograma(marca) {
  if (process.platform !== 'win32' || !marca.exe) return null;

  for (const clave of [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]) {
    for (const termino of marca.buscar) {
      try {
        const { stdout } = await ejecutar('reg', ['query', clave, '/s', '/f', termino]);
        for (const linea of stdout.split(/\r?\n/)) {
          const m = linea.match(/(?:InstallLocation|DisplayIcon)\s+REG_SZ\s+(.+)/i);
          if (!m) continue;
          const valor = m[1].trim().replace(/^"|"(,\d+)?$/g, '').replace(/,\d+$/, '');
          if (/\.exe$/i.test(valor) && marca.exe.test(path.basename(valor)) && fs.existsSync(valor)) return valor;
          if (fs.existsSync(valor) && fs.statSync(valor).isDirectory()) {
            const r = exeEnCarpeta(valor, marca.exe);
            if (r) return r;
          }
        }
      } catch {
        // Esa rama del registro no tiene nada: se sigue con la siguiente.
      }
    }
  }

  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
  for (const base of bases) {
    try {
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (e.isDirectory() && marca.carpeta.test(e.name)) {
          const r = exeEnCarpeta(path.join(base, e.name), marca.exe);
          if (r) return r;
        }
      }
    } catch {
      // Carpeta sin acceso: se sigue.
    }
  }
  return null;
}

// Programa a usar: el que se indicó en el panel, el que se encuentra de la marca o, si no hay forma de
// saberlo, el que esta PC tenga elegido para los .3mf (devuelve null: se abre con el predeterminado).
async function programaDe(impresora) {
  if (impresora.programa) {
    if (!fs.existsSync(impresora.programa)) throw new Error(`No existe el programa indicado: ${impresora.programa}`);
    return impresora.programa;
  }
  const marca = marcaDe(impresora.marca);
  const hallado = await ubicarPrograma(marca);
  if (hallado) return hallado;
  const predeterminado = (await programaPredeterminado3mf()) || '';
  // Marca conocida: sirve si Windows ya abre los .3mf con su programa. Otra marca: se usa el predeterminado.
  if (marca.id === 'otra' || (marca.predeterminado && marca.predeterminado.test(predeterminado))) return null;
  throw new Error(`No encontré ${marca.programa} en esta PC. Instalalo, o escribí en el panel la ruta de su .exe (en "Programa").`);
}

export const slicer = {
  tipo: 'abrir-en-slicer',
  nombre: 'Abrir en el slicer de tu marca (Bambu, Anycubic, Creality, Elegoo, Prusa…)',
  formatos: ['3mf', 'gcode'],
  puedeImprimir: false, // se manda desde el programa
  abre: true,
  campos: ['marca', 'programa'],
  opcionales: ['programa'],

  async probar(impresora) {
    const marca = marcaDe(impresora.marca);
    const programa = await programaDe(impresora);
    if (programa) return `Listo: se va a abrir ${programa}.`;
    return marca.id === 'otra'
      ? 'Listo: se va a abrir con el programa que esta PC tiene elegido para los .3mf (si querés otro, escribí su ruta en "Programa").'
      : `Listo: los .3mf se abren con ${marca.programa} (es el programa predeterminado de esta PC).`;
  },

  async enviar(impresora, { nombre, contenido }) {
    const marca = marcaDe(impresora.marca);
    const programa = await programaDe(impresora);
    const archivo = guardarTemporal(nombre, contenido);
    await abrirArchivo(archivo, programa);
    const donde = marca.id === 'otra' ? 'el programa de laminado' : marca.programa;
    return {
      estado: 'enviado',
      mensaje: /\.3mf$/i.test(nombre)
        ? `Abierto en ${donde}: revisá el perfil, laminá y tocá Imprimir / Enviar ahí para mandarlo a la impresora.`
        : `Abierto en ${donde}. Si es un G-code suelto, el programa lo muestra en vista previa; para mandarlo a la impresora desde ahí, usá el .3mf del proyecto.`
    };
  }
};
