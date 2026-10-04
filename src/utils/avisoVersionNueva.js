// Pestaña abierta desde antes de un deploy: las partes de la app que se
// descargan recién al usarlas (jsPDF para los PDF, el recorrido, el Excel...)
// tienen otro nombre en la versión nueva, y Vercel responde el archivo viejo
// con la página principal, así que el import falla en silencio (el botón
// "no hace nada"). Cuando pasa, se avisa con un cartel para recargar. No se
// recarga solo: podría perderse algo que se estaba editando.

const ERROR_CARGA = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk/i;

const esErrorDeCarga = (motivo) => ERROR_CARGA.test(String(motivo?.message || motivo || ''));

function mostrarAviso() {
  if (document.getElementById('aviso-version-nueva')) return;
  const caja = document.createElement('div');
  caja.id = 'aviso-version-nueva';
  caja.setAttribute('role', 'alert');
  caja.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100000;'
    + 'display:flex;gap:12px;align-items:center;max-width:calc(100vw - 32px);box-sizing:border-box;'
    + 'padding:10px 14px;border-radius:10px;background:#1f2937;color:#f9fafb;'
    + 'border:1px solid #f59e0b;box-shadow:0 8px 24px rgba(0,0,0,.35);font:13px/1.4 system-ui,sans-serif';
  const texto = document.createElement('span');
  texto.textContent = 'Hay una versión nueva de Manager3D. Recargá la página para seguir (guardá antes lo que estés editando).';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Recargar';
  boton.style.cssText = 'flex-shrink:0;padding:6px 12px;border-radius:6px;border:0;background:#f59e0b;color:#111827;font-weight:600;cursor:pointer';
  boton.onclick = () => window.location.reload();
  caja.append(texto, boton);
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
