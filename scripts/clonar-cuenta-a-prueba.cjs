// Copia los datos de UNA cuenta de producción a su cuenta homónima de la base de PRUEBA
// (manager3d-test), para tener datos precargados. Sólo LEE de producción y escribe en
// prueba (pisa lo que ya haya en users/{uidPrueba}). Hay que haber entrado antes a la
// versión de prueba con ese email, para que exista la cuenta.
//   node scripts/clonar-cuenta-a-prueba.cjs <email>
// No copia: facturas y configuración de facturación (ARCA), suscripción (la de prueba
// arranca con su propio trial), conectores, trabajos de impresión ni archivos G-code
// (los archivos viven en Storage de producción). Las imágenes siguen apuntando a
// Storage de producción (se ven, pero no se copian). Cambia el uid viejo por el de
// prueba dentro de los datos. Usa la sesión del Firebase CLI (`firebase login`).
const path = require('path');
const G = require('child_process').execSync('npm root -g').toString().trim();

const ORIGEN = 'print3d-manager-73846';
const DESTINO = 'manager3d-test';
const EXCLUIR = new Set(['facturas', 'facturasPorPedido', 'facturacion', 'suscripcion', 'conectores', 'trabajosImpresion', 'gcode']);

(async () => {
  const email = (process.argv[2] || '').toLowerCase();
  if (!email) throw new Error('Uso: node scripts/clonar-cuenta-a-prueba.cjs <email>');
  const { requireAuth } = require(path.join(G, 'firebase-tools/lib/requireAuth.js'));
  const { getAccessToken } = require(path.join(G, 'firebase-tools/lib/auth.js'));
  const { configstore } = require(path.join(G, 'firebase-tools/lib/configstore.js'));
  await requireAuth({ project: DESTINO });
  const { access_token: token } = await getAccessToken(configstore.get('tokens').refresh_token, []);
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = (p) => `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;

  const uidDe = async (proyecto) => {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${proyecto}/accounts:lookup`, { method: 'POST', headers: h, body: JSON.stringify({ email: [email] }) });
    const j = await r.json();
    const u = (j.users || [])[0];
    if (!u) throw new Error(`No hay una cuenta ${email} en ${proyecto}`);
    return u.localId;
  };
  const uidOrigen = await uidDe(ORIGEN);
  const uidDestino = await uidDe(DESTINO);
  console.log(`Origen ${uidOrigen} -> prueba ${uidDestino}`);

  const coleccionesDe = async (proyecto, ruta) => {
    const r = await fetch(`${base(proyecto)}/${ruta}:listCollectionIds`, { method: 'POST', headers: h, body: JSON.stringify({ pageSize: 100 }) });
    if (!r.ok) throw new Error(`listCollectionIds ${ruta}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).collectionIds || [];
  };

  let total = 0;
  const copiarColeccion = async (rutaCol) => {
    let pagina = '';
    do {
      const r = await fetch(`${base(ORIGEN)}/${rutaCol}?pageSize=100${pagina ? `&pageToken=${pagina}` : ''}`, { headers: h });
      if (!r.ok) throw new Error(`${rutaCol}: leer ${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      for (const d of j.documents || []) {
        const rel = d.name.split('/documents/')[1];
        const destino = rel.replace(`users/${uidOrigen}`, `users/${uidDestino}`);
        const campos = JSON.parse(JSON.stringify(d.fields || {}).split(uidOrigen).join(uidDestino));
        const w = await fetch(`${base(DESTINO)}/${destino.split('/').map(encodeURIComponent).join('/')}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: campos }) });
        if (!w.ok) throw new Error(`${destino}: escribir ${w.status} ${(await w.text()).slice(0, 200)}`);
        total++;
        for (const sub of await coleccionesDe(ORIGEN, rel)) await copiarColeccion(`${rel}/${sub}`);
      }
      pagina = j.nextPageToken || '';
    } while (pagina);
  };

  for (const col of await coleccionesDe(ORIGEN, `users/${uidOrigen}`)) {
    if (EXCLUIR.has(col)) { console.log(`${col}: se omite`); continue; }
    const antes = total;
    await copiarColeccion(`users/${uidOrigen}/${col}`);
    console.log(`${col}: ${total - antes} documentos`);
  }
  console.log(`Listo: ${total} documentos copiados a users/${uidDestino}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
