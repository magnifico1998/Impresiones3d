// Copia los archivos G-code de UNA cuenta de producción a su cuenta homónima de la base de
// PRUEBA (manager3d-test): los documentos users/{uid}/gcode y los archivos de Storage a los
// que apuntan. Sólo LEE de producción. Hay que haber entrado antes a la versión de prueba
// con ese email, y haber corrido clonar-cuenta-a-prueba.cjs (la Biblioteca tiene que estar).
//   node scripts/copiar-gcode-a-prueba.cjs <email>
// Usa la sesión del Firebase CLI (`firebase login`).
const path = require('path');
const G = require('child_process').execSync('npm root -g').toString().trim();

const ORIGEN = 'print3d-manager-73846';
const DESTINO = 'manager3d-test';

(async () => {
  const email = (process.argv[2] || '').toLowerCase();
  if (!email) throw new Error('Uso: node scripts/copiar-gcode-a-prueba.cjs <email>');
  const { requireAuth } = require(path.join(G, 'firebase-tools/lib/requireAuth.js'));
  const { getAccessToken } = require(path.join(G, 'firebase-tools/lib/auth.js'));
  const { configstore } = require(path.join(G, 'firebase-tools/lib/configstore.js'));
  await requireAuth({ project: DESTINO });
  const { access_token: token } = await getAccessToken(configstore.get('tokens').refresh_token, []);
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = (p) => `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;

  const uidDe = async (proyecto) => {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${proyecto}/accounts:lookup`, { method: 'POST', headers: h, body: JSON.stringify({ email: [email] }) });
    const u = ((await r.json()).users || [])[0];
    if (!u) throw new Error(`No hay una cuenta ${email} en ${proyecto}`);
    return u.localId;
  };
  const uidOrigen = await uidDe(ORIGEN);
  const uidDestino = await uidDe(DESTINO);

  const r = await fetch(`${base(ORIGEN)}/users/${uidOrigen}/gcode?pageSize=100`, { headers: h });
  if (!r.ok) throw new Error(`leer gcode: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const docs = (await r.json()).documents || [];
  let n = 0;
  for (const d of docs) {
    const id = d.name.split('/').pop();
    const ruta = d.fields?.ruta?.stringValue;
    if (!ruta) { console.log(`${id}: sin archivo, se omite`); continue; }
    const rutaDestino = ruta.replace(`users/${uidOrigen}/`, `users/${uidDestino}/`);
    const enc = (s) => encodeURIComponent(s);
    const cp = await fetch(`https://storage.googleapis.com/storage/v1/b/${ORIGEN}.firebasestorage.app/o/${enc(ruta)}/rewriteTo/b/${DESTINO}.firebasestorage.app/o/${enc(rutaDestino)}`, { method: 'POST', headers: h, body: '{}' });
    const cj = await cp.json();
    if (!cp.ok || !cj.done) throw new Error(`copiar ${ruta}: ${cp.status} ${JSON.stringify(cj).slice(0, 200)}`);
    const campos = { ...d.fields, ruta: { stringValue: rutaDestino } };
    const w = await fetch(`${base(DESTINO)}/users/${uidDestino}/gcode/${enc(id)}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: campos }) });
    if (!w.ok) throw new Error(`${id}: escribir ${w.status} ${(await w.text()).slice(0, 200)}`);
    n++;
  }
  console.log(`Listo: ${n} archivo(s) G-code copiados a users/${uidDestino}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
