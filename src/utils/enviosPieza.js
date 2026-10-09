import { trabajoVencido } from './impresionDirecta';

// Registro de los G-code que ya se mandaron desde una pieza de un pedido, para no
// mandar el mismo dos veces por error. Se guarda en la pieza del pedido:
//   pieza.gcodeEnvios = [{ archivoId, trabajoId, fecha (ISO), impresora, tipo }]
// tipo: 'imprimir' (arranca a imprimir), 'subir' (queda en la impresora),
//       'carpeta' (guardado en una carpeta) o 'programa' (abierto en el laminador).
// El estado en vivo sale del trabajo (trabajosImpresion/{trabajoId}) mientras exista:
// un envío que falló, venció o se canceló NO cuenta como enviado.

export const tipoDeEnvio = (impresora, accion) => (
  impresora?.guarda ? 'carpeta' : impresora?.abre ? 'programa' : accion === 'imprimir' ? 'imprimir' : 'subir'
);

export const marcaDeEnvio = ({ archivo, trabajoId, impresora, accion }) => ({
  archivoId: archivo.id,
  trabajoId: trabajoId || null,
  fecha: new Date().toISOString(),
  impresora: impresora?.nombre || '',
  tipo: tipoDeEnvio(impresora, accion)
});

const TEXTO_POR_TIPO = {
  imprimir: 'Enviado a imprimir',
  subir: 'Enviado a la impresora',
  carpeta: 'Guardado en carpeta',
  programa: 'Abierto en el programa'
};

// Estado de una marca: { enviado, texto, color }.
export function estadoDeMarca(marca, trabajos = [], ahora = Date.now()) {
  const t = marca.trabajoId ? trabajos.find((x) => x.id === marca.trabajoId) : null;
  if (t) {
    if (trabajoVencido(t, ahora)) return { enviado: false, texto: 'No se imprimió: venció en la cola', color: 'var(--warn)' };
    if (t.estado === 'error') return { enviado: false, texto: `Falló${t.mensaje ? `: ${t.mensaje}` : ''}`, color: 'var(--danger)' };
    if (t.estado === 'cancelado') return { enviado: false, texto: 'Se canceló', color: 'var(--text3)' };
    if (t.estado === 'pendiente') return { enviado: true, texto: 'En cola, esperando al conector', color: 'var(--text3)' };
    if (t.estado === 'imprimiendo') return { enviado: true, texto: 'Imprimiendo', color: 'var(--accent)' };
  }
  return { enviado: true, texto: TEXTO_POR_TIPO[marca.tipo] || 'Enviado', color: 'var(--accent)' };
}

// Marcas de un archivo en una pieza, la más reciente primero.
export const marcasDe = (pieza, archivoId) => (pieza?.gcodeEnvios || [])
  .filter((m) => m.archivoId === archivoId)
  .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

// Resumen de un archivo: { veces (envíos que cuentan), ultima, estado }.
export function resumenDeArchivo(pieza, archivoId, trabajos, ahora) {
  const marcas = marcasDe(pieza, archivoId);
  if (!marcas.length) return { veces: 0, ultima: null, estado: null };
  const estados = marcas.map((m) => estadoDeMarca(m, trabajos, ahora));
  return { veces: estados.filter((e) => e.enviado).length, ultima: marcas[0], estado: estados[0] };
}

export const fechaCorta = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};
