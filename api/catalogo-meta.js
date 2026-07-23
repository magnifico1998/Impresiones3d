// Sirve la ruta /catalogo con el <title> y los meta tags de preview
// (og:title, og:description, og:image) tomados del nombre real del
// emprendimiento, en vez del "Manager3D" fijo que trae index.html.
//
// Por qué hace falta esto y no alcanza con cambiarlo en React: las tarjetas
// de preview de WhatsApp/Telegram/Discord las arma un bot que lee el HTML
// tal cual llega del servidor — no ejecuta JavaScript. Como CatalogoPublico
// es una SPA que recién pinta el título después de cargar React, el bot
// nunca llega a verlo; siempre lee el <title> estático de index.html.
//
// Esta función intercepta sólo /catalogo (ver vercel.json), trae el
// index.html real ya compilado (así no hay que hardcodear los nombres de
// archivo con hash que genera cada build), le reemplaza el <title> y le
// suma meta tags de Open Graph con el nombre del emprendimiento leído en
// vivo desde catalogoConfig/meta en Firestore (lectura pública, ver
// firestore.rules) vía REST — sin necesitar el SDK de firebase-admin acá.

const FIRESTORE_PROJECT_ID = 'print3d-manager-73846';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${protocol}://${host}`;

  let empresaNombre = 'Catálogo';
  let logo = '';

  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/catalogoConfig/meta`;
    const r = await fetch(firestoreUrl);
    if (r.ok) {
      const data = await r.json();
      const fields = data.fields || {};
      if (fields.empresaNombre?.stringValue) empresaNombre = fields.empresaNombre.stringValue;
      if (fields.logo?.stringValue) logo = fields.logo.stringValue;
    }
  } catch (e) {
    console.error('No se pudo leer catalogoConfig para armar el preview de /catalogo:', e);
    // Seguimos con los valores por defecto — mejor un preview genérico
    // que romper la carga del catálogo entero.
  }

  let html;
  try {
    const htmlRes = await fetch(`${baseUrl}/index.html`);
    html = await htmlRes.text();
  } catch (e) {
    console.error('No se pudo cargar index.html base:', e);
    res.status(500).send('No se pudo cargar el catálogo. Probá de nuevo en un momento.');
    return;
  }

  const titulo = `${empresaNombre} · Catálogo`;
  const descripcion = 'Elegí tus productos y armá tu pedido';
  const urlCatalogo = `${baseUrl}/catalogo`;

  const metaTags = `<title>${escapeHtml(titulo)}</title>
    <meta property="og:title" content="${escapeHtml(titulo)}" />
    <meta property="og:description" content="${escapeHtml(descripcion)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(urlCatalogo)}" />
    ${logo ? `<meta property="og:image" content="${escapeHtml(logo)}" />` : ''}
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(titulo)}" />
    <meta name="twitter:description" content="${escapeHtml(descripcion)}" />`;

  html = html.replace(/<title>.*?<\/title>/, metaTags);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cachea 5 min en el edge de Vercel: los bots de preview no necesitan
  // pegarle a Firestore en cada request, y si el nombre cambia se ve
  // reflejado apenas expira el cache.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
}
