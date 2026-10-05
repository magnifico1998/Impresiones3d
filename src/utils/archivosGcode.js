import { collection, deleteDoc, doc, onSnapshot, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase';

// Archivos G-code de los productos de la Biblioteca.
//
//   1. Se crea la ficha users/{cuenta}/gcode/{archivoId} (producto,
//      nombre, formato, impresora).
//   2. El navegador sube el archivo con una compresión rápida a
//      users/{cuenta}/gcode-entrada/{archivoId}: un .gcode en gzip (nativo
//      del navegador), un .3mf tal cual (ya es un zip).
//   3. La función onGcodeSubido lo recomprime al máximo (Brotli), controla el
//      cupo del plan y completa la ficha (estado 'listo' o 'error' con el
//      motivo). Un .3mf (el .gcode.3mf de Bambu Studio) se guarda entero
//      para poder mandarlo después a la impresora tal cual.
//   4. Al bajarlo se descomprime acá y se entrega con su nombre original.
// El espacio usado lo lleva la función en suscripcion/actual.gcodeBytes.

export const GB = 1024 ** 3;
export const EXTENSIONES_GCODE = '.gcode,.gco,.3mf';

export const formatoDe = (nombre) => (/\.3mf$/i.test(nombre) ? '3mf' : 'gcode');
export const esArchivoGcode = (nombre) => /\.(gcode|gco|3mf)$/i.test(nombre || '');

const normaliza = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Producto de la Biblioteca al que corresponde una pieza de un pedido. Las
// piezas nuevas guardan su bibliotecaId; las de pedidos anteriores no, y se
// buscan por nombre (la Biblioteca no admite dos productos con el mismo
// nombre). Sin coincidencia, es una pieza libre o de la Calculadora: null.
export function productoDePieza(pieza, biblioteca) {
  if (pieza?.bibliotecaId != null) {
    const porId = biblioteca.find((b) => String(b.id) === String(pieza.bibliotecaId));
    if (porId) return porId;
  }
  const nombre = normaliza(pieza?.nombre);
  return nombre ? (biblioteca.find((b) => normaliza(b.nombre) === nombre) || null) : null;
}

// Archivos de un producto que ya se pueden usar (terminaron de comprimirse).
export const archivosListosDe = (productoId, fichas) =>
  fichas.filter((f) => f.productoId === String(productoId) && f.estado === 'listo');

// Cupo del plan en bytes (vacío o 0 = sin espacio).
// Una cuenta en prueba (sin plan todavía) tiene 200 MB para probarlo; con un plan,
// el que diga plan.limites.gcodeGB. Mismo valor en functions/triggers/onGcodeSubido.js.
export const CUPO_GCODE_PRUEBA = 200 * 1024 * 1024;
export const cupoGcode = (plan, suscripcion) => (
  !plan && suscripcion?.estado === 'trial'
    ? CUPO_GCODE_PRUEBA
    : Math.max(0, Number(plan?.limites?.gcodeGB) || 0) * GB
);

export function formatoBytes(n) {
  const b = Number(n) || 0;
  if (b >= GB) return `${(b / GB).toLocaleString('es-AR', { maximumFractionDigits: 2 })} GB`;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

// Escucha las fichas de la cuenta. Devuelve la función para dejar de escuchar.
export function escucharArchivosGcode(cuentaId, alCambiar) {
  return onSnapshot(
    collection(db, 'users', cuentaId, 'gcode'),
    (snap) => alCambiar(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('Error al escuchar los archivos G-code:', err)
  );
}

async function gzip(file) {
  const flujo = file.stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(flujo).arrayBuffer()]);
}

// Sube un archivo para un producto. alProgreso(0..1) mientras sube.
export async function subirArchivoGcode({ cuentaId, productoId, file, impresora, alProgreso }) {
  const fichaRef = doc(collection(db, 'users', cuentaId, 'gcode'));
  const formato = formatoDe(file.name);
  await setDoc(fichaRef, {
    productoId: String(productoId),
    nombre: file.name.slice(0, 200),
    formato,
    impresora: impresora || null,
    bytesOriginal: file.size,
    estado: 'subiendo',
    creadoEl: Timestamp.now()
  });
  try {
    const usarGzip = formato === 'gcode' && typeof CompressionStream !== 'undefined';
    const datos = usarGzip ? await gzip(file) : file;
    const tarea = uploadBytesResumable(ref(storage, `users/${cuentaId}/gcode-entrada/${fichaRef.id}`), datos, {
      contentType: 'application/octet-stream',
      customMetadata: { comprimido: usarGzip ? 'gzip' : 'no' }
    });
    await new Promise((resolve, reject) => {
      tarea.on('state_changed', (s) => alProgreso?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, resolve);
    });
    return fichaRef.id;
  } catch (e) {
    await deleteDoc(fichaRef).catch(() => {});
    throw e;
  }
}

export const cambiarImpresoraGcode = (cuentaId, archivoId, impresora) =>
  updateDoc(doc(db, 'users', cuentaId, 'gcode', archivoId), { impresora: impresora || null });

export async function borrarArchivoGcode(cuentaId, archivo) {
  if (archivo.estado === 'listo') {
    await deleteObject(ref(storage, `users/${cuentaId}/gcode/${archivo.id}.br`)).catch((e) => {
      if (e?.code !== 'storage/object-not-found') throw e;
    });
  }
  await deleteDoc(doc(db, 'users', cuentaId, 'gcode', archivo.id));
}

// Contenido original del archivo (para bajarlo o, más adelante, mandarlo a
// la impresora): un .gcode tal cual; un .3mf armado de nuevo como zip normal.
export async function contenidoArchivoGcode(cuentaId, archivo) {
  const comprimido = new Uint8Array(await getBytes(ref(storage, `users/${cuentaId}/gcode/${archivo.id}.br`)));
  const { default: decompress } = await import('brotli/decompress');
  const contenido = decompress(comprimido);
  if (archivo.formato !== '3mf') return contenido;
  const { unzipSync, zipSync } = await import('fflate');
  return zipSync(unzipSync(contenido), { level: 6 });
}

export async function descargarArchivoGcode(cuentaId, archivo) {
  const contenido = await contenidoArchivoGcode(cuentaId, archivo);
  const url = URL.createObjectURL(new Blob([contenido], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
