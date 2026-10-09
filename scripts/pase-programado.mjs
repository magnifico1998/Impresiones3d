// Decide si el pase programado a producción corresponde ahora. Lo usa
// .github/workflows/pase-programado.yml (que corre desde main) con el archivo
// release/programado.json de la rama develop:
//   { "activo": true,
//     "sha": "<commit de develop que se publica>",
//     "desdeUtc": "2026-10-11T11:00:00Z",      (= domingo 11/10 08:00 hora de Argentina)
//     "descripcion": "texto libre" }
// Sólo se pasa ESE commit (lo que se haya sumado a develop después queda para el próximo
// pase), y sólo dentro de las 12 horas siguientes a "desdeUtc": un archivo viejo que
// quedó activo no vuelve a disparar nada al año siguiente.
//
//   node scripts/pase-programado.mjs <programado.json>     (EVENTO y FORZAR por variables de entorno)
// Escribe en GITHUB_OUTPUT: accion=pasar|omitir, sha=<commit> y motivo=<texto>.
// Sale con código 1 si el archivo está mal armado (el pase falla en vez de callarse).

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const VENTANA_MS = 12 * 60 * 60 * 1000;
const SHA = /^[0-9a-f]{40}$/;

export function decidir({ evento, forzar = '', ahora = Date.now(), programado }) {
  if (!programado || typeof programado !== 'object') return { accion: 'error', motivo: 'release/programado.json no existe o no es un JSON válido.' };
  if (!programado.activo) return { accion: 'omitir', motivo: 'No hay un pase activo en release/programado.json.' };
  if (!SHA.test(String(programado.sha || ''))) return { accion: 'error', motivo: 'release/programado.json: "sha" tiene que ser el commit completo (40 caracteres).' };
  const desde = Date.parse(programado.desdeUtc || '');
  if (Number.isNaN(desde)) return { accion: 'error', motivo: 'release/programado.json: "desdeUtc" no es una fecha válida (ej. 2026-10-11T11:00:00Z).' };

  if (evento === 'workflow_dispatch') {
    if (forzar !== 'PASAR') return { accion: 'omitir', motivo: 'Ejecución manual sin la confirmación PASAR: no se hizo nada.' };
    return { accion: 'pasar', sha: programado.sha, motivo: 'Ejecución manual confirmada.' };
  }
  if (ahora < desde) return { accion: 'omitir', motivo: `Todavía no es la hora del pase (${programado.desdeUtc}).` };
  if (ahora - desde > VENTANA_MS) return { accion: 'omitir', motivo: `El pase programado para ${programado.desdeUtc} ya venció (más de 12 horas): no se ejecuta. Si hace falta, corrélo a mano.` };
  return { accion: 'pasar', sha: programado.sha, motivo: `Hora del pase: ${programado.desdeUtc}.` };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let programado = null;
  try { programado = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); } catch { /* lo informa decidir() */ }
  const r = decidir({ evento: process.env.EVENTO, forzar: process.env.FORZAR || '', programado });
  console.log(`${r.accion.toUpperCase()}: ${r.motivo}${r.sha ? ` (${r.sha})` : ''}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `accion=${r.accion === 'error' ? 'omitir' : r.accion}\nsha=${r.sha || ''}\nmotivo=${r.motivo}\n`);
  }
  if (r.accion === 'error') process.exitCode = 1;
}
