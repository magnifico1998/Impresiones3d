// Service worker de la app instalable de Manager3D. Sólo guarda en el equipo la
// pantalla de la app (index.html y los archivos de /assets) para que abra rápido y sin
// depender de la red para cargar la página. NO toca los datos: Firestore, las funciones
// y los guardados no pasan por acá (siguen yendo directo a la nube, y todo guardado se
// confirma en la nube; ver docs).
//
// Se actualiza con cada deploy sin hacer nada:
//   - La página (index.html) se pide SIEMPRE a la red primero; sólo si no hay red se usa
//     la guardada. Así, cada deploy trae el index nuevo, que apunta a los archivos
//     nuevos (los nombres de /assets llevan un código distinto en cada build).
//   - Los archivos de /assets nunca cambian de contenido con el mismo nombre, así que se
//     sirven de lo guardado y, si no están, de la red.
//   - Este archivo no se cachea (ver vercel.json): el navegador lo revisa en cada visita.
// No intercepta /api ni /catalogo (el catálogo público arma su vista en el servidor).

const CACHE = 'manager3d-pantalla-v2';
const MAX_ENTRADAS = 150;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

async function recortar(cache) {
  const claves = await cache.keys();
  if (claves.length > MAX_ENTRADAS) await Promise.all(claves.slice(0, claves.length - MAX_ENTRADAS).map((c) => cache.delete(c)));
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return; // Firebase, Google Fonts, etc.: directo
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/catalogo')) return;

  // Página: red primero; sin red, la última guardada.
  if (pedido.mode === 'navigate') {
    evento.respondWith(
      fetch(pedido)
        .then((respuesta) => {
          if (respuesta.ok) { const copia = respuesta.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copia)); }
          return respuesta;
        })
        .catch(() => caches.match('/index.html').then((guardada) => guardada || Response.error()))
    );
    return;
  }

  // Archivos del build (/assets, con el nombre cambiado por contenido): lo guardado primero, si no, la red
  // (y se guarda). Los íconos y el favicon no, porque conservan el nombre aunque cambien.
  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith(
      caches.match(pedido).then((guardada) => guardada || fetch(pedido).then((respuesta) => {
        // Vercel contesta con la página principal cuando falta un archivo viejo: eso no se guarda.
        const esPagina = (respuesta.headers.get('content-type') || '').includes('text/html');
        if (respuesta.ok && !esPagina) { const copia = respuesta.clone(); caches.open(CACHE).then(async (c) => { await c.put(pedido, copia); recortar(c); }); }
        return respuesta;
      }))
    );
  }
});
