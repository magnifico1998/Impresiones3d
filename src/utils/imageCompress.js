import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

// Comprime y redimensiona imágenes en el navegador (canvas) antes de
// convertirlas a base64 para guardarlas en Firestore.
//
// Por qué existe esto:
// Firestore tiene un límite DURO de 1 MiB por documento. Este proyecto guarda
// todo (pedidos, compras, biblioteca, clientes, empresa) en UN SOLO documento
// por usuario, y las imágenes (logo, fotos de producto) se guardan como
// base64 dentro de ese mismo documento. Una foto de celular sin comprimir
// (3-8MB) ya supera el límite ella sola, y como el base64 pesa ~33% más que
// el binario original, el margen es todavía menor. Si eso pasa, el guardado
// en la nube empieza a fallar para TODO (no solo para esa imagen), afectando
// pedidos y compras nuevos aunque no tengan nada que ver con la imagen.
//
// Esta función reduce cada imagen a un tamaño acotado (por defecto apunta a
// quedar bajo ~180KB) para dejar margen para varias imágenes dentro del
// mismo documento de 1 MiB.

const dataUrlToBytes = (dataUrl) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  // Cada 4 caracteres base64 representan 3 bytes (aprox, ignorando padding)
  return Math.ceil((base64.length * 3) / 4);
};

const cargarImagen = (dataUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo procesar la imagen. Probá con otro archivo.'));
    img.src = dataUrl;
  });
};

const dibujarEnCanvas = (img, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // Fondo blanco: si el original es PNG con transparencia y lo pasamos a
  // JPEG (que no soporta transparencia), evita que quede negro.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

/**
 * Lee un File de imagen, lo redimensiona y comprime, y devuelve un data URL
 * (base64) listo para guardar en el estado de la app / Firestore.
 *
 * @param {File} file
 * @param {Object} opts
 * @param {number} opts.maxWidth  Ancho máximo en px (default 700)
 * @param {number} opts.maxHeight Alto máximo en px (default 700)
 * @param {number} opts.maxBytes  Tamaño máximo objetivo del resultado en bytes (default ~90KB)
 * @returns {Promise<{dataUrl: string, bytes: number, originalBytes: number}>}
 */
export const comprimirImagen = async (file, opts = {}) => {
  const {
    maxWidth = 700,
    maxHeight = 700,
    maxBytes = 90 * 1024
  } = opts;

  if (!file) {
    throw new Error('No se seleccionó ningún archivo.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Elegí un archivo de imagen (jpg, png, webp...).');
  }

  const HARD_LIMIT_ORIGINAL = 25 * 1024 * 1024; // 25MB: evita que el navegador se cuelgue con archivos absurdos
  if (file.size > HARD_LIMIT_ORIGINAL) {
    throw new Error('La imagen es demasiado pesada (más de 25MB). Elegí una más liviana.');
  }

  const originalDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });

  const img = await cargarImagen(originalDataUrl);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  let canvas = dibujarEnCanvas(img, width, height);
  let quality = 0.75;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  // Si sigue pesando más de lo permitido, bajamos calidad y, si no alcanza,
  // reducimos dimensiones también. Máximo 8 intentos para no trabar la UI.
  let attempts = 0;
  while (dataUrlToBytes(dataUrl) > maxBytes && attempts < 8) {
    if (quality > 0.4) {
      quality -= 0.1;
    } else {
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
      canvas = dibujarEnCanvas(img, width, height);
      quality = 0.6;
    }
    dataUrl = canvas.toDataURL('image/jpeg', Math.max(quality, 0.3));
    attempts++;
  }

  const finalBytes = dataUrlToBytes(dataUrl);

  if (finalBytes > maxBytes) {
    throw new Error(
      `La imagen sigue pesando ${(finalBytes / 1024).toFixed(0)}KB después de comprimirla. Probá con una imagen más simple o de menor resolución.`
    );
  }

  return {
    dataUrl,
    bytes: finalBytes,
    originalBytes: file.size
  };
};

export const subirImagenAFirebase = async (dataUrl, { userId, fileName = 'producto.jpg' } = {}) => {
  if (!dataUrl) throw new Error('No hay imagen para subir.');
  if (!userId) throw new Error('Necesitás iniciar sesión para guardar la imagen en la nube.');

  const safeName = (fileName || 'producto.jpg')
    .toLowerCase()
    .replace(/[^a-z0-9.\-]/g, '_')
    .replace(/_+/g, '_');

  const storagePath = `users/${userId}/biblioteca/${Date.now()}-${safeName}`;
  const imageRef = ref(storage, storagePath);

  await uploadString(imageRef, dataUrl, 'data_url');
  return getDownloadURL(imageRef);
};

export const borrarImagenDeFirebase = async (imageUrl) => {
  if (!imageUrl || !imageUrl.includes('firebasestorage')) {
    return;
  }

  try {
    const decodedUrl = decodeURIComponent(imageUrl);
    const match = decodedUrl.match(/\/o\/([^?]+)/);
    
    if (!match || !match[1]) {
      return;
    }

    const storagePath = match[1];
    const imageRef = ref(storage, storagePath);
    await deleteObject(imageRef);
  } catch (err) {
    console.warn('No se pudo borrar la imagen de Storage:', err);
  }
};

export default comprimirImagen;
