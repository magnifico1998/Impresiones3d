// Verificación previa al pase a producción. La corre a mano `npm run verificar-pase` y,
// antes de publicar, el pase programado (.github/workflows/pase-programado.yml): si algo falla
// sale con código 1 y main no se toca.
//
//   npm run verificar-pase                  lint, pruebas, build, versión y novedades
//   npm run verificar-pase -- --con-reglas  además prueba firestore.rules y storage.rules (usa tu
//                                           sesión de `firebase login`: sólo a mano, no en GitHub)
//
// Qué revisa:
//   1. Lint: no más errores que los que ya había (hoy 1, de AdminPage, anterior a todo esto).
//   2. Pruebas automáticas (pruebas/*.test.js, vitest).
//   3. Que el build compile y genere index.html, version.json, sw.js y el manifest.
//   4. Que la versión de package.json sea MAYOR que la de main.
//   5. Que, si sube la versión mayor, src/utils/novedades.js tenga su entrada (o se acepte sin ella
//      con el texto "SIN_NOVEDADES" en docs/pase-a-produccion.md cuando no hay nada para suscriptores).
//   6. Que no queden marcas de conflicto ni .env en el árbol.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const conReglas = process.argv.includes('--con-reglas');
// Único error de lint conocido (anterior a todo esto); cualquier otro error hace fallar la verificación.
const ERROR_CONOCIDO = (ruta, mensaje) => /AdminPage\.jsx$/.test(ruta) && /Existing memoization/.test(mensaje);
const resultados = [];
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;

const paso = (nombre, f) => {
  process.stdout.write(`\n▶ ${nombre}\n`);
  try {
    const detalle = f();
    resultados.push({ nombre, ok: true, detalle });
    console.log(`  ✔ ${detalle || 'ok'}`);
  } catch (e) {
    resultados.push({ nombre, ok: false, detalle: e.message });
    console.log(`  ✘ ${e.message}`);
  }
};
const correr = (cmd, args, opciones = {}) => spawnSync(cmd, args, { cwd: raiz, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024, ...opciones });
const leerJson = (ruta) => JSON.parse(fs.readFileSync(path.join(raiz, ruta), 'utf8'));
const versionDe = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
const mayorQue = (a, b) => { const x = versionDe(a), y = versionDe(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

paso('Lint', () => {
  const r = correr(npx, ['eslint', 'src', '-f', 'json']);
  let datos;
  try { datos = JSON.parse(r.stdout); } catch { throw new Error(`ESLint no devolvió un resultado válido: ${(r.stderr || r.stdout || '').slice(0, 300)}`); }
  const errores = datos.flatMap((f) => f.messages.filter((m) => m.severity === 2).map((m) => ({ donde: `${path.relative(raiz, f.filePath)}:${m.line}`, ruta: f.filePath, mensaje: m.message })));
  const nuevos = errores.filter((e) => !ERROR_CONOCIDO(e.ruta, e.mensaje));
  if (nuevos.length) throw new Error(`${nuevos.length} error(es) de lint nuevos:\n    ${nuevos.slice(0, 8).map((e) => `${e.donde} ${e.mensaje}`).join('\n    ')}`);
  return `sin errores nuevos (${errores.length} conocido), ${datos.reduce((s, f) => s + f.warningCount, 0)} advertencias`;
});

paso('Pruebas automáticas', () => {
  const r = correr(npx, ['vitest', 'run']);
  const texto = `${r.stdout}\n${r.stderr}`;
  if (r.status !== 0) throw new Error(`Fallaron pruebas:\n${texto.split('\n').filter((l) => /FAIL|✗|×|AssertionError|Error:/.test(l)).slice(0, 12).join('\n')}`);
  return (texto.match(/Tests\s+[^\n]*/) || ['pruebas ok'])[0].trim();
});

paso('Build', () => {
  const r = correr(npx, ['vite', 'build']);
  if (r.status !== 0) throw new Error(`El build falló:\n${(r.stdout + r.stderr).split('\n').filter((l) => /error/i.test(l)).slice(0, 10).join('\n')}`);
  const faltan = ['index.html', 'version.json', 'sw.js', 'manifest.webmanifest'].filter((f) => !fs.existsSync(path.join(raiz, 'dist', f)));
  if (faltan.length) throw new Error(`El build no generó: ${faltan.join(', ')}`);
  const { id, version } = leerJson('dist/version.json');
  return `ok, build ${String(id).slice(0, 8)} versión ${version}`;
});

paso('Versión mayor que la de producción', () => {
  const actual = leerJson('package.json').version;
  let enMain;
  try { enMain = JSON.parse(execFileSync('git', ['show', 'origin/main:package.json'], { cwd: raiz, encoding: 'utf8' })).version; } catch { try { enMain = JSON.parse(execFileSync('git', ['show', 'main:package.json'], { cwd: raiz, encoding: 'utf8' })).version; } catch { return `no se pudo leer la versión de main (se omite); esta es ${actual}`; } }
  if (!mayorQue(actual, enMain)) throw new Error(`package.json está en ${actual} y main ya tiene ${enMain}: hay que subir la versión (regla en CLAUDE.md).`);
  return `${enMain} → ${actual}`;
});

paso('Novedades de la versión nueva', () => {
  const actual = leerJson('package.json').version;
  let enMain = '0.0.0';
  try { enMain = JSON.parse(execFileSync('git', ['show', 'origin/main:package.json'], { cwd: raiz, encoding: 'utf8' })).version; } catch { /* sin main */ }
  const mayorNueva = versionDe(actual)[0];
  if (mayorNueva <= versionDe(enMain)[0]) return 'es un arreglo (misma versión madre): no lleva entrada';
  const novedades = fs.readFileSync(path.join(raiz, 'src/utils/novedades.js'), 'utf8');
  if (new RegExp(`version:\\s*${mayorNueva}\\b`).test(novedades)) return `hay entrada para la v${mayorNueva}`;
  const doc = fs.existsSync(path.join(raiz, 'docs/pase-a-produccion.md')) ? fs.readFileSync(path.join(raiz, 'docs/pase-a-produccion.md'), 'utf8') : '';
  if (doc.includes(`SIN_NOVEDADES_V${mayorNueva}`)) return `la v${mayorNueva} se declaró sin novedades para suscriptores`;
  throw new Error(`Falta la entrada de la v${mayorNueva} en src/utils/novedades.js (o declarar SIN_NOVEDADES_V${mayorNueva} en docs/pase-a-produccion.md si no trae nada para los suscriptores).`);
});

paso('Árbol limpio de restos', () => {
  const lista = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  const env = lista.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.example'));
  if (env.length) throw new Error(`Hay archivos .env versionados: ${env.join(', ')}`);
  const conflictos = lista.filter((f) => /\.(js|jsx|json|md|css|html|rules|yml|mjs|cjs)$/.test(f) && fs.existsSync(path.join(raiz, f)) && /^(<<<<<<< |>>>>>>> )/m.test(fs.readFileSync(path.join(raiz, f), 'utf8')));
  if (conflictos.length) throw new Error(`Marcas de conflicto sin resolver en: ${conflictos.join(', ')}`);
  return 'sin .env ni marcas de conflicto';
});

if (conReglas) {
  paso('Reglas de Firestore', () => {
    const r = correr(node, ['scripts/probar-reglas-firestore.cjs']);
    if (r.status !== 0) throw new Error(`${(r.stdout || '').split('\n').filter((l) => /FALLA|falla|ERR|API/.test(l)).slice(0, 8).join('\n') || r.stderr}`);
    return (r.stdout.match(/Todo bien[^\n]*/) || ['ok'])[0];
  });
  paso('Reglas de Storage', () => {
    const r = correr(node, ['scripts/probar-reglas-storage.cjs']);
    if (!/Todo bien/.test(r.stdout)) throw new Error((r.stdout || r.stderr).split('\n').filter((l) => /FALLA|API|ERR/.test(l)).slice(0, 8).join('\n') || 'no dio "Todo bien"');
    return 'Todo bien';
  });
}

const fallas = resultados.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(60)}\n${fallas.length ? `✘ ${fallas.length} verificación(es) fallaron:` : '✔ Todo verificado:'}`);
resultados.forEach((r) => console.log(`  ${r.ok ? '✔' : '✘'} ${r.nombre}`));
if (!conReglas) console.log('\n(No se probaron las reglas: correr con --con-reglas desde tu PC antes de aprobar el pase.)');
process.exitCode = fallas.length ? 1 : 0;
