// Pestaña abierta desde antes de un deploy: las partes de la app que se
// descargan recién al usarlas (jsPDF para los PDF, el recorrido, el Excel...)
// tienen otro nombre en la versión nueva, y Vercel responde el archivo viejo
// con la página principal, así que el import falla en silencio (el botón
// "no hace nada"). Cuando pasa, se avisa con un cartel para recargar. No se
// recarga solo: podría perderse algo que se estaba editando.

/* global __BUILD_ID__ */
const ERROR_CARGA = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk/i;

const esErrorDeCarga = (motivo) => ERROR_CARGA.test(String(motivo?.message || motivo || ''));

function mostrarAviso(version) {
  if (document.getElementById('aviso-version-nueva')) return;
  const caja = document.createElement('div');
  caja.id = 'aviso-version-nueva';
  caja.setAttribute('role', 'alert');
  caja.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100000;'
    + 'display:flex;gap:12px;align-items:center;max-width:calc(100vw - 32px);box-sizing:border-box;'
    + 'padding:10px 14px;border-radius:10px;background:#1f2937;color:#f9fafb;'
    + 'border:1px solid #f59e0b;box-shadow:0 8px 24px rgba(0,0,0,.35);font:13px/1.4 system-ui,sans-serif';
  const texto = document.createElement('span');
  texto.textContent = `Hay una versión nueva de Manager3D${version ? ` (v${version})` : ''}. Guardá lo que estés editando y recargá la página; si después de recargar seguís viendo lo anterior, probá con Ctrl + Shift + R.`;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Recargar';
  boton.style.cssText = 'flex-shrink:0;padding:6px 12px;border-radius:6px;border:0;background:#f59e0b;color:#111827;font-weight:600;cursor:pointer';
  boton.onclick = () => window.location.reload();
  const luego = document.createElement('button');
  luego.type = 'button';
  luego.textContent = 'Más tarde';
  luego.style.cssText = 'flex-shrink:0;padding:6px 10px;border-radius:6px;border:1px solid #6b7280;background:transparent;color:#f9fafb;cursor:pointer';
  luego.onclick = () => caja.remove();
  caja.append(texto, boton, luego);
  document.body.appendChild(caja);
}

export function instalarAvisoVersionNueva() {
  if (typeof window === 'undefined' || window.__avisoVersionNueva) return;
  window.__avisoVersionNueva = true;
  // Lo que pasa por el precargador de Vite.
  window.addEventListener('vite:preloadError', (ev) => {
    ev.preventDefault();
    mostrarAviso();
  });
  // Un import() suelto que falla dentro de un botón async.
  window.addEventListener('unhandledrejection', (ev) => {
    if (esErrorDeCarga(ev.reason)) mostrarAviso();
  });
}

// Aviso anticipado: cada tanto (y al volver a la pestaña) se compara el build de esta página
// con el publicado en /version.json. Si cambió, se avisa sin esperar a que algo falle. No se
// recarga solo (podría perderse lo que se está editando). Si el usuario elige "Más tarde"
// se vuelve a avisar a los 10 minutos.
export function vigilarVersionNueva() {
  if (typeof window === 'undefined' || window.__vigilandoVersion) return;
  if (typeof __BUILD_ID__ === 'undefined' || !/^https?:$/.test(window.location.protocol)) return;
  window.__vigilandoVersion = true;
  let ultimaRevision = 0;
  let avisadoEn = 0;

  const revisar = async () => {
    const ahora = Date.now();
    if (ahora - ultimaRevision < 60 * 1000) return;
    ultimaRevision = ahora;
    try {
      const r = await fetch(`/version.json?t=${ahora}`, { cache: 'no-store' });
      if (!r.ok) return;
      const publicada = await r.json();
      if (publicada?.id && publicada.id !== __BUILD_ID__ && ahora - avisadoEn > 10 * 60 * 1000) {
        avisadoEn = ahora;
        mostrarAviso(publicada.version);
      }
    } catch { /* sin red: se revisa en la próxima */ }
  };

  setInterval(revisar, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
  setTimeout(revisar, 30 * 1000);
}
