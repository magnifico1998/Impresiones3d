import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Configuración del conector en esta PC (nunca sube a la nube):
//   %APPDATA%\Manager3D-Conector\config.json
//   { vinculo: { cuentaId, conectorId, email, password, equipo },
//     impresoras: [{ id, nombre, tipo, host, codigoAcceso, serie, tieneAce }] }
// El código de acceso de las Bambu y la contraseña del usuario técnico
// quedan sólo acá.

const CARPETA = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'Manager3D-Conector');
const ARCHIVO = path.join(CARPETA, 'config.json');

export const carpetaDatos = CARPETA;

export function leerConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    return { vinculo: c.vinculo || null, impresoras: Array.isArray(c.impresoras) ? c.impresoras : [] };
  } catch {
    return { vinculo: null, impresoras: [] };
  }
}

export function guardarConfig(config) {
  fs.mkdirSync(CARPETA, { recursive: true });
  const temporal = `${ARCHIVO}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(temporal, ARCHIVO);
}

export const nuevoId = () => crypto.randomBytes(6).toString('hex');
