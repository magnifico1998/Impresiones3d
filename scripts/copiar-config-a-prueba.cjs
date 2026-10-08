// Copia de producción a la base de PRUEBA (manager3d-test) sólo la configuración que
// no es de clientes: planes, preguntas frecuentes y tablas de monotributo. Nunca copia
// datos de usuarios, pagos, facturas ni credenciales. Sólo LEE de producción y escribe
// en prueba (los documentos que ya existan en prueba se pisan).
//   node scripts/copiar-config-a-prueba.cjs [coleccion ...]
// Usa la sesión del Firebase CLI (`firebase login`) y su copia global.
const path = require('path');
const G = require('child_process').execSync('npm root -g').toString().trim();

const ORIGEN = 'print3d-manager-73846';
const DESTINO = 'manager3d-test';
const POR_DEFECTO = ['planes', 'faq', 'faqMeta', 'monotributo'];

(async () => {
  const { requireAuth } = require(path.join(G, 'firebase-tools/lib/requireAuth.js'));
  const { getAccessToken } = require(path.join(G, 'firebase-tools/lib/auth.js'));
  const { configstore } = require(path.join(G, 'firebase-tools/lib/configstore.js'));
  await requireAuth({ project: DESTINO });
  const { access_token: token } = await getAccessToken(configstore.get('tokens').refresh_token, []);
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = (p) => `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;
  const colecciones = process.argv.slice(2).length ? process.argv.slice(2) : POR_DEFECTO;

  for (const col of colecciones) {
    let pagina = '';
    let n = 0;
    do {
      const r = await fetch(`${base(ORIGEN)}/${col}?pageSize=100${pagina ? `&pageToken=${pagina}` : ''}`, { headers: h });
      if (!r.ok) throw new Error(`${col}: leer producción ${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      for (const d of j.documents || []) {
        const id = d.name.split('/').pop();
        const w = await fetch(`${base(DESTINO)}/${col}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: d.fields || {} }) });
        if (!w.ok) throw new Error(`${col}/${id}: escribir en prueba ${w.status} ${(await w.text()).slice(0, 200)}`);
        n++;
      }
      pagina = j.nextPageToken || '';
    } while (pagina);
    console.log(`${col}: ${n} documentos copiados`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
