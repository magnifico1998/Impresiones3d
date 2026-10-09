// Aprueba el pase programado a producción: escribe release/programado.json con el commit de
// develop que se va a publicar y la hora (UTC) a partir de la cual el workflow puede pasarlo.
//
//   node scripts/programar-pase.mjs --sha <commit|HEAD> --desde 2026-10-11T11:00:00Z [--descripcion "texto"]
//   node scripts/programar-pase.mjs --cancelar          (desactiva el pase)
//
// Después hay que commitear y subir release/programado.json a develop (el workflow lo lee de
// ahí); el commit que se aprueba es el que va en "sha", no el que contiene este archivo.
// 08:00 de Argentina = 11:00 UTC. Ver docs/pase-a-produccion.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivo = path.join(raiz, 'release', 'programado.json');
const args = process.argv.slice(2);
const valor = (nombre) => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : undefined; };
const git = (...a) => execFileSync('git', a, { cwd: raiz, encoding: 'utf8' }).trim();
const falla = (m) => { console.error(`✘ ${m}`); process.exit(1); };

fs.mkdirSync(path.dirname(archivo), { recursive: true });
const actual = fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')) : {};

if (args.includes('--cancelar')) {
  fs.writeFileSync(archivo, JSON.stringify({ ...actual, activo: false }, null, 2) + '\n');
  console.log('✔ Pase desactivado. Subí release/programado.json a develop.');
  process.exit(0);
}

const sha = git('rev-parse', valor('--sha') || 'HEAD');
const desde = valor('--desde') || actual.desdeUtc;
if (!desde || Number.isNaN(Date.parse(desde))) falla('Falta --desde con una fecha válida en UTC, ej. 2026-10-11T11:00:00Z (08:00 de Argentina).');
if (Date.parse(desde) < Date.now()) falla(`${desde} ya pasó.`);

try { git('fetch', 'origin', 'main', 'develop'); } catch { console.warn('(no se pudo actualizar origin; se usa lo que hay local)'); }
try { git('merge-base', '--is-ancestor', sha, 'origin/develop'); } catch { falla(`El commit ${sha.slice(0, 8)} no está en origin/develop: subí develop antes.`); }
try { git('merge-base', '--is-ancestor', 'origin/main', sha); } catch { falla(`main tiene commits que ${sha.slice(0, 8)} no incluye: traé main a develop (git merge main) y volvé a aprobar.`); }
if (git('rev-parse', 'origin/main') === sha) falla('main ya está en ese commit: no hay nada que pasar.');

const version = JSON.parse(git('show', `${sha}:package.json`)).version;
const programado = {
  activo: true,
  sha,
  desdeUtc: new Date(Date.parse(desde)).toISOString().replace('.000Z', 'Z'),
  version,
  descripcion: valor('--descripcion') || actual.descripcion || ''
};
fs.writeFileSync(archivo, JSON.stringify(programado, null, 2) + '\n');
console.log(`✔ Pase aprobado: ${sha.slice(0, 8)} (v${version}) a partir de ${programado.desdeUtc}.`);
console.log('  Falta: git add release/programado.json && git commit && git push origin develop');
