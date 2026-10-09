// Aviso de actualización programada: el admin carga cuándo se va a actualizar Manager3D
// y todos los que tengan la app abierta ven un cartel arriba. Vive en un solo documento,
// avisoSistema/actualizacion (lo lee cualquier usuario con sesión, lo escribe sólo un
// admin; ver firestore.rules):
//   { activo: boolean, fechaHora: ISO con zona (ej. "2026-10-11T08:00:00-03:00"),
//     mensaje: string opcional (vacío = el texto por defecto), actualizadoEl, actualizadoPor }
// El cartel aparece apenas se activa y se muestra hasta 2 horas después de la hora fijada.

export const ZONA = 'America/Argentina/Buenos_Aires';
const DOS_HORAS = 2 * 60 * 60 * 1000;

const formatear = (ms, opciones) => new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, ...opciones }).format(new Date(ms));

// "domingo 11/10"
export const diaCorto = (ms) => formatear(ms, { weekday: 'long', day: '2-digit', month: '2-digit' });
// "08:00"
export const horaCorta = (ms) => formatear(ms, { hour: '2-digit', minute: '2-digit', hour12: false });

// De los dos campos del formulario (fecha "2026-10-11", hora "08:00", hora de Argentina) al
// ISO con zona. Argentina no tiene horario de verano: siempre -03:00.
export const aIsoArgentina = (fecha, hora) => (fecha && hora ? `${fecha}T${hora}:00-03:00` : '');

// Del ISO guardado a los campos del formulario.
export function aCamposArgentina(iso) {
  const ms = Date.parse(iso || '');
  if (Number.isNaN(ms)) return { fecha: '', hora: '' };
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(ms)).map((p) => [p.type, p.value])
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour === '24' ? '00' : partes.hour}:${partes.minute}` };
}

export const textoPorDefecto = (iso) => {
  const ms = Date.parse(iso || '');
  if (Number.isNaN(ms)) return '';
  return `El ${diaCorto(ms)} a las ${horaCorta(ms)} hs (hora de Argentina) se va a actualizar Manager3D. Guardá tu trabajo y cerrá la aplicación antes de esa hora; cuando termine, volvé a abrirla.`;
};

// Qué mostrar ahora: null (nada) o { tipo: 'antes' | 'durante', texto }.
export function estadoDelAviso(aviso, ahora) {
  if (!aviso?.activo) return null;
  const ms = Date.parse(aviso.fechaHora || '');
  if (Number.isNaN(ms)) return null;
  if (ahora < ms) {
    const faltan = ms - ahora;
    const texto = String(aviso.mensaje || '').trim() || textoPorDefecto(aviso.fechaHora);
    if (faltan <= 60 * 60 * 1000) return { tipo: 'antes', texto: `${texto} (faltan ${Math.max(1, Math.ceil(faltan / 60000))} min)` };
    return { tipo: 'antes', texto };
  }
  if (ahora - ms <= DOS_HORAS) {
    return { tipo: 'durante', texto: 'Manager3D se está actualizando o se actualizó recién. Si ves algo raro, recargá la página (Ctrl + Shift + R).' };
  }
  return null;
}
