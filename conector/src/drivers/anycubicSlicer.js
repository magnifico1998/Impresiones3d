import fs from 'node:fs';
import path from 'node:path';
import { abrirArchivo, ejecutar, guardarTemporal, programaPredeterminado3mf } from './abrir.js';

// Abrir el archivo en Anycubic Slicer Next, el programa de laminado de Anycubic.
// Para las Kobra (cualquier modelo) SIN modo LAN: el envío a la impresora lo hace
// el propio programa, con la cuenta Anycubic del usuario o por la red como ya lo
// tenga. Sólo sirve con archivos .gcode.3mf laminados desde ese programa ("Exportar
// archivo de la placa laminada"): un .gcode suelto no se puede abrir como proyecto
// para enviarlo.
//
// El programa se busca solo (registro de Windows y carpetas habituales); si no se
// encuentra, se puede indicar la ruta del .exe en el panel.

const NOMBRE_EXE = /anycubic.*slicer|slicer.*anycubic/i;

// Primer .exe con nombre de Anycubic Slicer dentro de una carpeta (sin bajar más de 2 niveles).
function exeEnCarpeta(carpeta, nivel = 0) {
  let entradas;
  try {
    entradas = fs.readdirSync(carpeta, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entradas) {
    if (e.isFile() && /\.exe$/i.test(e.name) && NOMBRE_EXE.test(e.name) && !/uninstall|unins|update/i.test(e.name)) return path.join(carpeta, e.name);
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

  // 1) Registro: programas instalados con "Anycubic" en el nombre.
  for (const clave of [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]) {
    try {
      const { stdout } = await ejecutar('reg', ['query', clave, '/s', '/f', 'Anycubic']);
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

  // 2) Carpetas habituales de instalación.
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
  for (const base of bases) {
    try {
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (e.isDirectory() && /anycubic/i.test(e.name)) {
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
  // Sin encontrarlo: sirve igual si Windows ya abre los .3mf con Anycubic Slicer.
  if (/anycubic/i.test((await programaPredeterminado3mf()) || '')) return null;
  throw new Error('No encontré Anycubic Slicer Next en esta PC. Instalalo, o escribí en el panel la ruta de su .exe (en "Programa").');
}

export const anycubicSlicer = {
  tipo: 'abrir-en-anycubic',
  nombre: 'Anycubic Kobra: abrir en Anycubic Slicer Next (no necesita modo LAN)',
  formatos: ['3mf'],
  puedeImprimir: false, // se manda desde el programa
  abre: true,
  campos: ['programa'],
  opcionales: ['programa'],

  async probar(impresora) {
    const programa = await programaDe(impresora);
    return programa
      ? `Listo: se va a abrir ${programa}.`
      : 'Listo: los .3mf se abren con Anycubic Slicer Next (es el programa predeterminado de esta PC).';
  },

  async enviar(impresora, { nombre, contenido }) {
    const programa = await programaDe(impresora);
    const archivo = guardarTemporal(nombre, contenido);
    await abrirArchivo(archivo, programa);
    return { estado: 'enviado', mensaje: 'Abierto en Anycubic Slicer Next: tocá Imprimir / Enviar ahí para mandarlo a la impresora.' };
  }
};
