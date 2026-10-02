// Registro para los tickets de soporte: los últimos eventos de la sesión,
// en memoria (nunca se guardan solos en la base). Cuando el suscriptor crea
// un ticket se adjuntan los de los últimos minutos, o los de la grabación
// si usó "Grabar el problema" (ver components/soporte/).
//
// Se registra:
//   - error / warn: console.error y console.warn (la app loguea ahí los
//     errores de Firestore y de las funciones);
//   - excepcion / promesa: errores de JavaScript que nadie atrapó;
//   - aviso: los avisos rojos que vio el usuario (showToast de error);
//   - funcion: llamadas a las Cloud Functions (nombre, estado, duración y
//     el mensaje de error, nunca los datos enviados);
//   - nav: cambios de sección y de pestaña;
//   - click: el texto del botón o link tocado (no lo que se escribe).
// Los textos se recortan y lo que parece un token se tapa.

const MAX_EVENTOS = 300;
const MAX_TEXTO = 500;
export const MINUTOS_SIN_GRABAR = 15;

const eventos = [];
let grabacion = null; // { inicio } mientras se graba
const suscriptores = new Set();

const avisar = () => suscriptores.forEach((fn) => fn());

// Para useSyncExternalStore: el estado de la grabación.
export const suscribirRegistro = (fn) => {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
};
export const estadoGrabacion = () => grabacion;

// Tapa lo que parece un token o una clave (cadenas largas sin espacios).
const TOKEN = /[A-Za-z0-9_-]{40,}/g;

function aTexto(valor) {
  if (valor instanceof Error) {
    const pila = (valor.stack || '').split('\n').slice(1, 5).map((l) => l.trim()).join(' | ');
    return `${valor.name}: ${valor.message}${valor.code ? ` [${valor.code}]` : ''}${pila ? ` @ ${pila}` : ''}`;
  }
  if (typeof valor === 'string') return valor;
  try {
    return JSON.stringify(valor);
  } catch {
    return String(valor);
  }
}

const limpiar = (texto) => {
  const t = String(texto || '').replace(TOKEN, '[…]').replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO)}…` : t;
};

export function registrarEvento(tipo, mensaje, extra) {
  eventos.push({ t: Date.now(), tipo, msg: limpiar(mensaje), ...(extra ? { extra } : {}) });
  if (eventos.length > MAX_EVENTOS) eventos.splice(0, eventos.length - MAX_EVENTOS);
}

export function iniciarGrabacion() {
  grabacion = { inicio: Date.now() };
  registrarEvento('grabacion', 'Empezó la grabación');
  avisar();
}

// Termina la grabación y devuelve desde cuándo tomar el log.
export function terminarGrabacion() {
  if (!grabacion) return null;
  const { inicio } = grabacion;
  registrarEvento('grabacion', 'Terminó la grabación');
  grabacion = null;
  avisar();
  return inicio;
}

// Eventos desde `desde` (ms), o los de los últimos MINUTOS_SIN_GRABAR.
export function obtenerEventos(desde) {
  const limite = desde || Date.now() - MINUTOS_SIN_GRABAR * 60 * 1000;
  return eventos.filter((e) => e.t >= limite);
}

export const esError = (e) => ['error', 'excepcion', 'promesa', 'aviso'].includes(e.tipo) || (e.tipo === 'funcion' && e.extra?.ok === false);

// Nombre de la Cloud Function de una URL callable
// (https://<región>-<proyecto>.cloudfunctions.net/<nombre>), o null.
function nombreFuncion(url) {
  const m = /^https:\/\/[a-z0-9-]+\.cloudfunctions\.net\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

// Texto del elemento tocado: el botón, link o elemento con rol de botón
// más cercano (no se registran clicks sueltos en la página).
function textoDelClick(destino) {
  const el = destino?.closest?.('button, a, [role="button"], [role="tab"], label, summary, .nav-item');
  if (!el) return null;
  const texto = (el.getAttribute('aria-label') || el.title || el.innerText || '').replace(/\s+/g, ' ').trim();
  return texto ? texto.slice(0, 80) : null;
}

// Engancha la captura una sola vez por página (con HMR o StrictMode este
// módulo puede evaluarse más de una vez).
export function instalarRegistroSoporte() {
  if (typeof window === 'undefined' || window.__registroSoporteInstalado) return;
  window.__registroSoporteInstalado = true;

  for (const nivel of ['error', 'warn']) {
    const original = console[nivel].bind(console);
    console[nivel] = (...args) => {
      try {
        registrarEvento(nivel, args.map(aTexto).join(' '));
      } catch {
        // El registro nunca puede romper el log original.
      }
      original(...args);
    };
  }

  window.addEventListener('error', (ev) => {
    registrarEvento('excepcion', ev.error ? aTexto(ev.error) : `${ev.message} (${ev.filename}:${ev.lineno})`);
  });
  window.addEventListener('unhandledrejection', (ev) => registrarEvento('promesa', aTexto(ev.reason)));

  document.addEventListener('click', (ev) => {
    const texto = textoDelClick(ev.target);
    if (texto) registrarEvento('click', texto);
  }, true);

  window.addEventListener('online', () => registrarEvento('nav', 'Volvió la conexión'));
  window.addEventListener('offline', () => registrarEvento('nav', 'Sin conexión'));

  const fetchOriginal = window.fetch?.bind(window);
  if (fetchOriginal) {
    window.fetch = async (recurso, opciones) => {
      const url = typeof recurso === 'string' ? recurso : recurso?.url || '';
      const nombre = nombreFuncion(url);
      if (!nombre) return fetchOriginal(recurso, opciones);
      const inicio = Date.now();
      try {
        const resp = await fetchOriginal(recurso, opciones);
        const ms = Date.now() - inicio;
        if (resp.ok) {
          registrarEvento('funcion', nombre, { ok: true, status: resp.status, ms });
        } else {
          // El mensaje de error de una callable viene en { error: { message, status } }.
          resp.clone().json()
            .then((j) => registrarEvento('funcion', `${nombre}: ${j?.error?.status || ''} ${j?.error?.message || ''}`, { ok: false, status: resp.status, ms }))
            .catch(() => registrarEvento('funcion', nombre, { ok: false, status: resp.status, ms }));
        }
        return resp;
      } catch (e) {
        registrarEvento('funcion', `${nombre}: ${aTexto(e)}`, { ok: false, status: 0, ms: Date.now() - inicio });
        throw e;
      }
    };
  }

  registrarEvento('nav', `Abrió la app (${window.location.pathname})`);
}
