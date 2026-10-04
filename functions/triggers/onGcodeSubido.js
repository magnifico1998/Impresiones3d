const { onObjectFinalized, onObjectDeleted } = require('firebase-functions/v2/storage');
const { logger } = require('firebase-functions');
const { getStorage } = require('firebase-admin/storage');
const zlib = require('zlib');
const { promisify } = require('util');
const { unzipSync, zipSync } = require('fflate');
const { db, Timestamp } = require('../admin');

// Archivos G-code de la Biblioteca (ver src/utils/archivosGcode.js).
//
// El navegador sube el archivo con una compresión rápida a
//   users/{cuenta}/gcode-entrada/{archivoId}
// (un .gcode en gzip; un .3mf tal cual, que ya es un zip) y antes crea la
// ficha users/{cuenta}/gcode/{archivoId}. Esta función lo recomprime al
// máximo con Brotli y lo guarda en
//   users/{cuenta}/gcode/{archivoId}.br
// Un .3mf (el .gcode.3mf de Bambu Studio, que la impresora necesita entero:
// placas, miniaturas, md5) se guarda completo: se desarma y se vuelve a
// armar sin compresión adentro, y ese zip va en Brotli. Al bajarlo el
// navegador lo vuelve a comprimir como un .3mf normal.
//
// El espacio usado por la cuenta (suma de sus .br) queda en
// users/{cuenta}/suscripcion/actual.gcodeBytes, y el cupo es el del plan:
// planes/{id}.limites.gcodeGB (vacío o 0 = sin espacio). Si el archivo no
// entra, se borra y la ficha queda con el motivo.

const brotli = promisify(zlib.brotliCompress);
const gunzip = promisify(zlib.gunzip);

const GB = 1024 ** 3;
const RE_ENTRADA = /^users\/([^/]+)\/gcode-entrada\/([A-Za-z0-9_-]+)$/;
const RE_GUARDADO = /^users\/([^/]+)\/gcode\/[A-Za-z0-9_-]+\.br$/;

// Calidad de Brotli según el tamaño del contenido: la 11 es la que más
// comprime pero tarda ~6 s por MB (un .3mf de 44 MB adentro: 4 minutos);
// para no pasar los 9 minutos de la función, arriba de 30 MB baja a 10
// (~2,5 s/MB, ~8 % más grande) y arriba de 120 MB a 9.
const calidadPara = (bytes) => (bytes <= 30 * 1024 * 1024 ? 11 : bytes <= 120 * 1024 * 1024 ? 10 : 9);

async function cupoDeLaCuenta(uid) {
  const sub = await db.doc(`users/${uid}/suscripcion/actual`).get();
  const planId = sub.exists ? sub.data().planId : null;
  if (!planId) return 0;
  const plan = await db.doc(`planes/${planId}`).get();
  return Math.max(0, Number(plan.exists ? plan.data().limites?.gcodeGB : 0) || 0) * GB;
}

// Recalcula el espacio usado contando los archivos guardados (idempotente).
async function actualizarUso(bucket, uid) {
  const [archivos] = await bucket.getFiles({ prefix: `users/${uid}/gcode/` });
  const usado = archivos.filter((f) => f.name.endsWith('.br')).reduce((s, f) => s + Number(f.metadata.size || 0), 0);
  await db.doc(`users/${uid}/suscripcion/actual`).set({ gcodeBytes: usado }, { merge: true });
  return usado;
}

exports.onGcodeSubido = onObjectFinalized({ memory: '2GiB', timeoutSeconds: 540, cpu: 2 }, async (event) => {
  const nombre = event.data.name || '';
  const m = RE_ENTRADA.exec(nombre);
  if (!m) return;
  const [, uid, archivoId] = m;
  const bucket = getStorage().bucket(event.data.bucket);
  const entrada = bucket.file(nombre);
  const fichaRef = db.doc(`users/${uid}/gcode/${archivoId}`);

  const fallar = async (motivo) => {
    await fichaRef.set({ estado: 'error', motivo, procesadoEl: Timestamp.now() }, { merge: true });
    await entrada.delete({ ignoreNotFound: true });
  };

  try {
    const ficha = await fichaRef.get();
    if (!ficha.exists) {
      // Sin ficha (borrada mientras se subía, o subida a mano): no se guarda.
      await entrada.delete({ ignoreNotFound: true });
      return;
    }
    const { formato } = ficha.data();

    const [subido] = await entrada.download();
    let contenido;
    if (formato === '3mf') {
      // Mismo contenido, sin compresión adentro: así Brotli lo comprime todo junto.
      const partes = unzipSync(new Uint8Array(subido));
      contenido = Buffer.from(zipSync(partes, { level: 0 }));
    } else {
      contenido = event.data.metadata?.comprimido === 'gzip' ? await gunzip(subido) : subido;
    }

    const cupo = await cupoDeLaCuenta(uid);
    const [archivos] = await bucket.getFiles({ prefix: `users/${uid}/gcode/` });
    const usado = archivos.filter((f) => f.name.endsWith('.br')).reduce((s, f) => s + Number(f.metadata.size || 0), 0);
    if (cupo <= 0) {
      await fallar('Tu plan no incluye espacio para archivos G-code.');
      return;
    }
    // Chequeo rápido antes de comprimir (con el tamaño subido, que es mayor
    // al final): si ya no hay lugar, no vale la pena el trabajo.
    if (usado >= cupo) {
      await fallar('No te queda espacio para archivos G-code en tu plan.');
      return;
    }

    const calidad = calidadPara(contenido.length);
    const comprimido = await brotli(contenido, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: calidad,
        [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
        [zlib.constants.BROTLI_PARAM_MODE]: formato === '3mf' ? zlib.constants.BROTLI_MODE_GENERIC : zlib.constants.BROTLI_MODE_TEXT,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: contenido.length
      }
    });

    if (usado + comprimido.length > cupo) {
      await fallar(`No entra en tu espacio: ocupa ${(comprimido.length / 1024 / 1024).toFixed(1)} MB y te quedan ${(Math.max(0, cupo - usado) / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }

    const ruta = `users/${uid}/gcode/${archivoId}.br`;
    await bucket.file(ruta).save(comprimido, {
      resumable: false,
      contentType: 'application/octet-stream',
      metadata: { metadata: { formato, calidad: String(calidad) } }
    });
    await entrada.delete({ ignoreNotFound: true });

    // Si la ficha se borró mientras se comprimía, el archivo sobra.
    if (!(await fichaRef.get()).exists) {
      await bucket.file(ruta).delete({ ignoreNotFound: true });
      return;
    }
    await fichaRef.set({
      estado: 'listo',
      motivo: null,
      ruta,
      bytes: comprimido.length,
      bytesContenido: contenido.length,
      calidad,
      procesadoEl: Timestamp.now()
    }, { merge: true });
    await actualizarUso(bucket, uid);
  } catch (e) {
    logger.error(`onGcodeSubido: ${nombre}`, e);
    await fallar('No se pudo procesar el archivo. Revisá que sea un .gcode o un .3mf válido.').catch(() => {});
  }
});

// Al borrar un archivo guardado, se recalcula el espacio usado.
exports.onGcodeBorrado = onObjectDeleted(async (event) => {
  const nombre = event.data.name || '';
  const m = RE_GUARDADO.exec(nombre);
  if (!m) return;
  try {
    await actualizarUso(getStorage().bucket(event.data.bucket), m[1]);
  } catch (e) {
    logger.error(`onGcodeBorrado: ${nombre}`, e);
  }
});

// Borra los archivos de un producto (al borrarlo de la Biblioteca).
exports.borrarArchivosDeProducto = async (uid, productoId) => {
  const fichas = await db.collection(`users/${uid}/gcode`).where('productoId', '==', String(productoId)).get();
  if (fichas.empty) return;
  const bucket = getStorage().bucket();
  for (const f of fichas.docs) {
    await bucket.file(`users/${uid}/gcode/${f.id}.br`).delete({ ignoreNotFound: true });
    await bucket.file(`users/${uid}/gcode-entrada/${f.id}`).delete({ ignoreNotFound: true });
    await f.ref.delete();
  }
};
