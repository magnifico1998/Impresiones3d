import fs from 'node:fs';
import path from 'node:path';
import { abrirArchivo, ejecutar, guardarTemporal, programaPredeterminado3mf } from './abrir.js';

// Impresoras Creality (K1, K1C, K2, SparkX i7, Ender-3 V3, Hi…): abrir el archivo en Creality
// Print, el programa de laminado de Creality. El envío a la impresora lo hace el propio programa,
// con el perfil y el flujo oficiales de Creality, que son los que dejan la impresora lista (cargar
// filamento, rutina de arranque, CFS). Por eso es el camino recomendado para Creality: el envío
// directo por Moonraker arrancaba, pero la impresora se pausaba a los pocos segundos porque se
// salteaba esa rutina.
//
// Sirve con el .3mf de proyecto (con el perfil de impresión incluido) y con el .gcode laminado
// desde ese programa. El programa se busca solo (registro de Windows y carpetas habituales); si
// no se encuentra, se puede indicar la ruta del .exe en el panel.

const NOMBRE_EXE = /creality.*print|crealityprint/i;
const SIN_EXE = /uninstall|unins|update|crashreport/i;

// Primer .exe con nombre de Creality Print dentro de una carpeta (sin bajar más de 2 niveles).
export function exeEnCarpeta(carpeta, nivel = 0) {
  let entradas;
  try {
    entradas = fs.readdirSync(carpeta, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entradas) {
    if (e.isFile() && /\.exe$/i.test(e.name) && NOMBRE_EXE.test(e.name) && !SIN_EXE.test(e.name)) return path.join(carpeta, e.name);
  }
  if (nivel < 2) {
    for (const e of entradas) {
      if (e.isDirectory()) {
        const r = exeEnCarpeta(path.join(carpeta, e.name), nivel + 1);
        if (r) return r;
      }
    }
  }
  return null;
}

async function ubicarPrograma() {
  if (process.platform !== 'win32') return null;

  // 1) Registro: programas instalados con "Creality" en el nombre.
  for (const clave of [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]) {
    try {
      const { stdout } = await ejecutar('reg', ['query', clave, '/s', '/f', 'Creality']);
      for (const linea of stdout.split(/\r?\n/)) {
        const m = linea.match(/(?:InstallLocation|DisplayIcon)\s+REG_SZ\s+(.+)/i);
        if (!m) continue;
        const valor = m[1].trim().replace(/^"|"(,\d+)?$/g, '').replace(/,\d+$/, '');
        if (/\.exe$/i.test(valor) && NOMBRE_EXE.test(path.basename(valor)) && fs.existsSync(valor)) return valor;
        if (fs.existsSync(valor) && fs.statSync(valor).isDirectory()) {
          const r = exeEnCarpeta(valor);
          if (r) return r;
        }
      }
    } catch {
      // Esa rama del registro no tiene nada: se sigue con la siguiente.
    }
  }

  // 2) Carpetas habituales de instalación (C:\Program Files\Creality\Creality Print 6.0\…).
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
  for (const base of bases) {
    try {
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (e.isDirectory() && /creality/i.test(e.name)) {
          const r = exeEnCarpeta(path.join(base, e.name));
          if (r) return r;
        }
      }
    } catch {
      // Carpeta sin acceso: se sigue.
    }
  }
  return null;
}

// Programa a usar: el que se indicó en el panel o, si no, el encontrado.
async function programaDe(impresora) {
  if (impresora.programa) {
    if (!fs.existsSync(impresora.programa)) throw new Error(`No existe el programa indicado: ${impresora.programa}`);
    return impresora.programa;
  }
  const hallado = await ubicarPrograma();
  if (hallado) return hallado;
  // Sin encontrarlo: sirve igual si Windows ya abre los .3mf con Creality Print.
  if (/creality/i.test((await programaPredeterminado3mf()) || '')) return null;
  throw new Error('No encontré Creality Print en esta PC. Instalalo (lo baja de creality.com), o escribí en el panel la ruta de su .exe (en "Programa").');
}

export const crealityPrint = {
  tipo: 'abrir-en-creality',
  nombre: 'Creality (K1, K2, SparkX i7, Ender-3 V3…): abrir en Creality Print (recomendado)',
  formatos: ['3mf', 'gcode'],
  puedeImprimir: false, // se manda desde el programa
  abre: true,
  campos: ['programa'],
  opcionales: ['programa'],

  async probar(impresora) {
    const programa = await programaDe(impresora);
    return programa
      ? `Listo: se va a abrir ${programa}.`
      : 'Listo: los .3mf se abren con Creality Print (es el programa predeterminado de esta PC).';
  },

  async enviar(impresora, { nombre, contenido }) {
    const programa = await programaDe(impresora);
    const archivo = guardarTemporal(nombre, contenido);
    await abrirArchivo(archivo, programa);
    const proyecto = /\.3mf$/i.test(nombre);
    return {
      estado: 'enviado',
      mensaje: proyecto
        ? 'Abierto en Creality Print: revisá el perfil, laminá y tocá Imprimir / Enviar ahí para mandarlo a la impresora.'
        : 'Abierto en Creality Print. Si es un G-code suelto lo muestra en vista previa; para mandarlo a la impresora desde el programa, usá el .3mf del proyecto.'
    };
  }
};
