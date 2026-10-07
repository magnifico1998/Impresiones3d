// Prueba storage.rules con la API de reglas de Google, SIN publicar nada: evalúa
// casos reales (el dueño sube imágenes, otra cuenta no, G-code, conector…).
// Correrlo ANTES de publicar las reglas: `firebase deploy` sólo revisa que compilen,
// no que se evalúen bien (el 4/10 una regla con .matches() sobre una ruta compilaba
// y rechazaba todas las imágenes, TKT-0004).
//   node scripts/probar-reglas-storage.cjs [archivo.rules]   (por defecto storage.rules)
// Usa la sesión del Firebase CLI (`firebase login`) y su copia global.
const path = require('path');
const fs = require('fs');
const G = require('child_process').execSync('npm root -g').toString().trim();
const archivo = process.argv[2] || path.join(__dirname, '..', 'storage.rules');
const BUCKET = 'print3d-manager-73846.firebasestorage.app';
const UID = 'hBTOP6GQIVTFDS1yxa7dIJ4XQkw2';
const OTRO = 'otraCuenta999';

(async () => {
  const { requireAuth } = require(path.join(G, 'firebase-tools/lib/requireAuth.js'));
  const { getAccessToken } = require(path.join(G, 'firebase-tools/lib/auth.js'));
  const { configstore } = require(path.join(G, 'firebase-tools/lib/configstore.js'));
  await requireAuth({ project: 'print3d-manager-73846' });
  const { access_token: token } = await getAccessToken(configstore.get('tokens').refresh_token, []);
  const content = fs.readFileSync(archivo, 'utf8');

  const auth = (uid, extra = {}) => ({ uid, token: { email_verified: true, email: 'x@gmail.com', ...extra } });
  const ahora = new Date().toISOString();
  const caso = (nombre, esperado, metodo, ruta, a, tamano = 1000) => ({
    nombre,
    esperado,
    tc: {
      expectation: esperado,
      request: { auth: a, path: `/b/${BUCKET}/o/${ruta}`, method: metodo, time: ahora, ...(metodo === 'create' ? { resource: { size: tamano, contentType: 'image/png' } } : {}) },
      ...(metodo === 'get' || metodo === 'delete' ? { resource: { name: ruta, size: tamano } } : {}),
      functionMocks: []
    }
  });
  const casos = [
    caso('el dueño sube una imagen de producto', 'ALLOW', 'create', `users/${UID}/biblioteca/1791292194375-ok.png`, auth(UID)),
    caso('el dueño lee una imagen de producto', 'ALLOW', 'get', `users/${UID}/biblioteca/1791292194375-ok.png`, auth(UID)),
    caso('el dueño borra una imagen', 'ALLOW', 'delete', `users/${UID}/biblioteca/1791292194375-ok.png`, auth(UID)),
    caso('el dueño sube el logo en otra subcarpeta', 'ALLOW', 'create', `users/${UID}/logo/logo.jpg`, auth(UID)),
    caso('archivo suelto en users/{uid}/', 'ALLOW', 'create', `users/${UID}/suelto.png`, auth(UID)),
    caso('otra cuenta NO puede subir a la carpeta ajena', 'DENY', 'create', `users/${UID}/biblioteca/x.png`, auth(OTRO)),
    caso('sin login NO puede leer', 'DENY', 'get', `users/${UID}/biblioteca/x.png`, null),
    caso('G-code: el dueño sube a la entrada', 'ALLOW', 'create', `users/${UID}/gcode-entrada/abc123`, auth(UID), 5 * 1024 * 1024),
    caso('G-code: pasado de 300 MB se rechaza', 'DENY', 'create', `users/${UID}/gcode-entrada/abc123`, auth(UID), 301 * 1024 * 1024),
    caso('G-code: el dueño NO escribe directo en gcode/', 'DENY', 'create', `users/${UID}/gcode/abc123.br`, auth(UID)),
    caso('G-code: el dueño lee su archivo guardado', 'ALLOW', 'get', `users/${UID}/gcode/abc123.br`, auth(UID)),
    caso('G-code: el conector de la cuenta lo lee', 'ALLOW', 'get', `users/${UID}/gcode/abc123.br`, auth('tecnico1', { conectorDe: UID })),
    caso('conector: cualquier usuario logueado baja el programa', 'ALLOW', 'get', 'conector/Manager3D-Conector.zip', auth(OTRO)),
    caso('conector: nadie lo escribe desde la app', 'DENY', 'create', 'conector/Manager3D-Conector.zip', auth(UID))
  ];

  const r = await fetch('https://firebaserules.googleapis.com/v1/projects/print3d-manager-73846:test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: 'storage.rules', content }] }, testSuite: { testCases: casos.map((c) => c.tc) } })
  });
  const j = await r.json();
  if (!r.ok) { console.log('API:', r.status, JSON.stringify(j).slice(0, 600)); return; }
  let fallas = 0;
  (j.testResults || []).forEach((x, i) => {
    const bien = x.state === 'SUCCESS';
    if (!bien) fallas++;
    console.log(bien ? 'OK   ' : 'FALLA', casos[i].nombre, `(esperado ${casos[i].esperado})`, bien ? '' : (x.errorPosition ? JSON.stringify(x.errorPosition) : '') + ' ' + (x.debugMessages || []).slice(0, 2).join(' | '));
  });
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  if (!j.testResults) console.log(JSON.stringify(j).slice(0, 600));
})().catch((e) => console.log('ERR', e.message));
