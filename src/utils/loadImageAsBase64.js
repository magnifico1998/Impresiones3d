/**
 * Carga una imagen desde URL (ej: una URL de descarga de Firebase Storage)
 * y la convierte a base64 (JPEG) junto a sus dimensiones naturales, para
 * poder ubicarla en un PDF con jsPDF — jsPDF's addImage() no acepta URLs
 * directamente, necesita datos base64 (o un elemento Image/canvas ya
 * cargado).
 *
 * Nota importante: esto requiere que el servidor de la imagen (en este caso
 * el bucket de Firebase Storage) envíe headers CORS habilitados para el
 * dominio de la app. Si no los tiene configurados, TODAS las imágenes van a
 * fallar acá con un error de red/CORS (revisar la consola del navegador).
 */
export async function loadImageAsBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    let urlFinal = imageUrl;
    if (imageUrl.includes('firebasestorage.googleapis.com') || imageUrl.includes('firebasestorage.app')) {
      urlFinal = imageUrl.includes('?')
        ? `${imageUrl}&alt=media`
        : `${imageUrl}?alt=media`;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('No se pudo crear contexto de canvas'));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ dataUrl: base64, width: canvas.width, height: canvas.height });
      } catch (err) {
        // Esto es lo típico cuando falta CORS en el bucket: la imagen carga
        // visualmente pero el canvas queda "tainted" y toDataURL tira SecurityError.
        reject(new Error(`Canvas tainted (probable falta de CORS en el bucket): ${err.message}`));
      }
    };

    img.onerror = () => {
      reject(new Error(`No se pudo cargar la imagen (red/CORS): ${imageUrl}`));
    };

    img.src = urlFinal;
  });
}

export default loadImageAsBase64;
