import jsPDF from 'jspdf';

// Paleta de impresión (no reutiliza los colores oscuros de la UI: en papel
// blanco lo que funciona es un acento fuerte + tintes claros de fondo).
const COLOR = {
  accent: [67, 56, 202],       // indigo - banda superior y detalles
  accentDark: [55, 48, 163],   // indigo oscuro - texto de categoría
  accentTint: [238, 240, 253], // indigo muy claro - fondo de pill de categoría
  price: [21, 128, 61],        // verde - texto del precio
  priceTint: [240, 253, 244],  // verde muy claro - fondo del badge de precio
  textDark: [31, 41, 55],
  textGray: [107, 114, 128],
  textLight: [156, 163, 175],
  border: [229, 231, 235],
  shadow: [214, 218, 224],
  white: [255, 255, 255]
};

/**
 * Genera un PDF con listado de productos ordenados por categoría.
 * Incluye foto, nombre, categoría y precio de cada producto.
 */
export async function generarListadoProductosPDF(biblioteca, empresa) {
  if (!biblioteca || biblioteca.length === 0) {
    alert('No hay productos para generar el listado');
    return;
  }

  // Ordenar por categoría y luego por nombre
  const productosOrdenados = [...biblioteca].sort((a, b) => {
    const catA = (a.cat || 'Sin categoría').toLowerCase();
    const catB = (b.cat || 'Sin categoría').toLowerCase();
    if (catA !== catB) return catA.localeCompare(catB);
    return (a.nombre || '').toLowerCase().localeCompare((b.nombre || '').toLowerCase());
  });

  // Agrupar por categoría
  const productosPorCategoria = {};
  productosOrdenados.forEach(prod => {
    const cat = prod.cat || 'Sin categoría';
    if (!productosPorCategoria[cat]) productosPorCategoria[cat] = [];
    productosPorCategoria[cat].push(prod);
  });

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const gap = 4;
  const colsPerRow = 3;
  const cardWidth = (pageWidth - margin * 2 - gap * (colsPerRow - 1)) / colsPerRow;
  const cardHeight = 66;
  const imgBoxSize = 40; // caja cuadrada donde se centra la imagen (contain-fit)
  const footerHeight = 10;
  const usableBottom = pageHeight - margin - footerHeight;
  const headerBandHeight = 28;

  let imagenesFallidas = 0;

  const setFill = (c) => pdf.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c) => pdf.setTextColor(c[0], c[1], c[2]);

  // --- Encabezado ---
  const dibujarHeader = async () => {
    setFill(COLOR.accent);
    pdf.rect(0, 0, pageWidth, headerBandHeight, 'F');

    let tituloX = margin;

    if (empresa?.logo) {
      try {
        const { dataUrl } = await loadImageAsBase64(empresa.logo);
        const logoSize = 15;
        const logoY = (headerBandHeight - logoSize) / 2;
        setFill(COLOR.white);
        pdf.roundedRect(margin, logoY, logoSize, logoSize, 2, 2, 'F');
        pdf.addImage(dataUrl, 'JPEG', margin + 1, logoY + 1, logoSize - 2, logoSize - 2);
        tituloX = margin + logoSize + 6;
      } catch (err) {
        console.warn('No se pudo cargar el logo de la empresa en el PDF:', err.message);
      }
    }

    setText(COLOR.white);
    pdf.setFontSize(17);
    pdf.setFont(undefined, 'bold');
    pdf.text('Listado de Productos', tituloX, headerBandHeight / 2 + 1);

    pdf.setFontSize(9.5);
    pdf.setFont(undefined, 'normal');
    pdf.text(
      `${empresa?.nombre || 'Empresa'} · ${new Date().toLocaleDateString('es-AR')}`,
      tituloX,
      headerBandHeight / 2 + 7
    );

    pdf.setFontSize(9);
    const totalTxt = `${productosOrdenados.length} producto${productosOrdenados.length === 1 ? '' : 's'}`;
    pdf.text(totalTxt, pageWidth - margin, headerBandHeight / 2 + 1, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  };

  await dibujarHeader();
  let currentY = headerBandHeight + 10;
  let currentX;
  let colCount = 0;

  const dibujarCategoria = (categoria, cantidad) => {
    const pillHeight = 9;
    setFill(COLOR.accentTint);
    pdf.roundedRect(margin, currentY, pageWidth - margin * 2, pillHeight, 1.5, 1.5, 'F');
    setFill(COLOR.accent);
    pdf.rect(margin, currentY, 1.3, pillHeight, 'F');

    setText(COLOR.accentDark);
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'bold');
    pdf.text(categoria, margin + 5, currentY + pillHeight / 2 + 1.5);

    pdf.setFontSize(8.5);
    pdf.setFont(undefined, 'normal');
    setText(COLOR.textGray);
    pdf.text(
      `${cantidad} producto${cantidad === 1 ? '' : 's'}`,
      pageWidth - margin - 3,
      currentY + pillHeight / 2 + 1.5,
      { align: 'right' }
    );
    pdf.setTextColor(0, 0, 0);
    currentY += pillHeight + 6;
  };

  const categories = Object.keys(productosPorCategoria).sort();

  for (const categoria of categories) {
    const productos = productosPorCategoria[categoria];

    if (currentY + 9 + cardHeight > usableBottom) {
      pdf.addPage();
      await dibujarHeader();
      currentY = headerBandHeight + 10;
      colCount = 0;
    }

    dibujarCategoria(categoria, productos.length);

    for (let i = 0; i < productos.length; i++) {
      const prod = productos[i];

      if (colCount === colsPerRow) {
        colCount = 0;
        currentY += cardHeight + gap;
      }

      if (currentY + cardHeight > usableBottom) {
        pdf.addPage();
        await dibujarHeader();
        currentY = headerBandHeight + 10;
        colCount = 0;
      }

      currentX = margin + colCount * (cardWidth + gap);

      // Sombra suave + tarjeta
      setFill(COLOR.shadow);
      pdf.roundedRect(currentX + 0.6, currentY + 0.8, cardWidth, cardHeight, 2.5, 2.5, 'F');
      setFill(COLOR.white);
      setDraw(COLOR.border);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(currentX, currentY, cardWidth, cardHeight, 2.5, 2.5, 'FD');

      // Caja de imagen
      const imgBoxX = currentX + (cardWidth - imgBoxSize) / 2;
      const imgBoxY = currentY + 3;
      setFill(COLOR.accentTint);
      pdf.roundedRect(imgBoxX, imgBoxY, imgBoxSize, imgBoxSize, 1.5, 1.5, 'F');

      let imagenCargada = false;
      if (prod.imagen) {
        try {
          const { dataUrl, width, height } = await loadImageAsBase64(prod.imagen);
          const { w, h } = fitContain(width, height, imgBoxSize - 3);
          const dx = imgBoxX + (imgBoxSize - w) / 2;
          const dy = imgBoxY + (imgBoxSize - h) / 2;
          pdf.addImage(dataUrl, 'JPEG', dx, dy, w, h);
          imagenCargada = true;
        } catch (err) {
          imagenesFallidas++;
          console.warn(`No se pudo cargar la imagen de "${prod.nombre || 'producto'}":`, err.message, prod.imagen);
        }
      }

      if (!imagenCargada) {
        pdf.setFontSize(7);
        pdf.setFont(undefined, 'italic');
        setText(COLOR.textLight);
        pdf.text('Sin imagen', imgBoxX + imgBoxSize / 2, imgBoxY + imgBoxSize / 2 + 1, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
      }

      // Nombre del producto
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'bold');
      setText(COLOR.textDark);
      const nameY = imgBoxY + imgBoxSize + 5;
      const maxNameLines = 2;
      const nameLines = pdf.splitTextToSize(prod.nombre || '', cardWidth - 4).slice(0, maxNameLines);
      pdf.text(nameLines, currentX + cardWidth / 2, nameY, { align: 'center', maxWidth: cardWidth - 4 });

      // Precio como badge
      const precio = prod.precioSugUnitario || prod.costoUnitario || 0;
      const precioTxt = `$${new Intl.NumberFormat('es-AR').format(Math.round(precio))}`;
      pdf.setFontSize(9.5);
      pdf.setFont(undefined, 'bold');
      const badgeW = Math.min(cardWidth - 6, pdf.getTextWidth(precioTxt) + 8);
      const badgeH = 6.5;
      const badgeX = currentX + (cardWidth - badgeW) / 2;
      const badgeY = currentY + cardHeight - badgeH - 3;
      setFill(COLOR.priceTint);
      pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'F');
      setText(COLOR.price);
      pdf.text(precioTxt, currentX + cardWidth / 2, badgeY + badgeH / 2 + 1.4, { align: 'center' });
      pdf.setTextColor(0, 0, 0);

      colCount++;
    }

    currentY += cardHeight + 8;
    colCount = 0;
  }

  // Pie de página en todas las hojas
  const totalPages = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    setDraw(COLOR.border);
    pdf.setLineWidth(0.2);
    pdf.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight);
    pdf.setFontSize(7.5);
    pdf.setFont(undefined, 'normal');
    setText(COLOR.textGray);
    pdf.text(empresa?.nombre || '', margin, pageHeight - footerHeight + 5);
    pdf.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - footerHeight + 5, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  }

  if (imagenesFallidas > 0) {
    console.warn(
      `[listadoPDF] ${imagenesFallidas} imagen(es) no se pudieron cargar. ` +
      'Esto casi siempre pasa porque el bucket de Firebase Storage no tiene CORS configurado ' +
      'para este dominio. Revisá la consola del navegador arriba de este mensaje para ver el error ' +
      'puntual de cada imagen (network/CORS).'
    );
  }

  const nombreArchivo = `Listado-Productos-${empresa?.nombre || 'empresa'}-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(nombreArchivo);
}

/** Calcula w/h de una imagen para que entre en un cuadrado maxSize manteniendo proporción. */
function fitContain(naturalWidth, naturalHeight, maxSize) {
  if (!naturalWidth || !naturalHeight) return { w: maxSize, h: maxSize };
  const ratio = naturalWidth / naturalHeight;
  if (ratio >= 1) {
    return { w: maxSize, h: maxSize / ratio };
  }
  return { w: maxSize * ratio, h: maxSize };
}

/**
 * Carga una imagen desde URL y la convierte a base64 (JPEG) junto a sus
 * dimensiones naturales, para poder ubicarla con contain-fit en el PDF.
 *
 * Nota importante: esto requiere que el servidor de la imagen (en este caso
 * el bucket de Firebase Storage) envíe headers CORS habilitados para el
 * dominio de la app. Si no los tiene configurados, TODAS las imágenes van a
 * fallar acá con un error de red/CORS (revisar la consola del navegador).
 */
async function loadImageAsBase64(imageUrl) {
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
