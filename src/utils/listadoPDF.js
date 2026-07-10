import jsPDF from 'jspdf';

/**
 * Genera un PDF con listado de productos ordenados por categoría
 * Incluye foto, nombre, categoría y precio de cada producto
 */
export async function generarListadoProductosPDF(biblioteca, empresa) {
  if (!biblioteca || biblioteca.length === 0) {
    alert('No hay productos para generar el listado');
    return;
  }

  // Ordenar por categoría y luego por nombre
  const productosOrdenados = [...biblioteca].sort((a, b) => {
    const catA = (a.categoria || 'Sin categoría').toLowerCase();
    const catB = (b.categoria || 'Sin categoría').toLowerCase();
    if (catA !== catB) return catA.localeCompare(catB);
    return (a.nombre || '').toLowerCase().localeCompare((b.nombre || '').toLowerCase());
  });

  // Agrupar por categoría
  const productosPorCategoria = {};
  productosOrdenados.forEach(prod => {
    const cat = prod.categoria || 'Sin categoría';
    if (!productosPorCategoria[cat]) {
      productosPorCategoria[cat] = [];
    }
    productosPorCategoria[cat].push(prod);
  });

  // Crear PDF
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const colsPerRow = 3;
  const cardWidth = (pageWidth - margin * 2 - 10) / colsPerRow; // 10 = gap entre columnas
  const cardHeight = 110; // alto de cada tarjeta
  const imgSize = 70; // tamaño de la imagen

  let currentY = margin;
  let currentX = margin;
  let colCount = 0;

  // Título
  pdf.setFontSize(16);
  pdf.setFont(undefined, 'bold');
  pdf.text('Listado de Productos', margin, currentY);
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'normal');
  pdf.text(`${empresa?.nombre || 'Empresa'} - ${new Date().toLocaleDateString('es-ES')}`, margin, currentY + 6);
  currentY += 18;

  const categories = Object.keys(productosPorCategoria).sort();

  for (const categoria of categories) {
    // Resetear posición si necesario
    if (currentY + 30 > pageHeight - margin) {
      pdf.addPage();
      currentY = margin;
      colCount = 0;
    }

    // Título de categoría
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.setDrawColor(100, 100, 100);
    pdf.setLineWidth(0.5);
    pdf.line(margin, currentY + 2, pageWidth - margin, currentY + 2);
    pdf.text(categoria, margin, currentY + 8);
    currentY += 12;

    const productos = productosPorCategoria[categoria];

    for (let i = 0; i < productos.length; i++) {
      const prod = productos[i];

      // Calcular posición en grid
      if (colCount === colsPerRow) {
        colCount = 0;
        currentY += cardHeight + 5;
        currentX = margin;
      }

      // Verificar si necesita nueva página
      if (currentY + cardHeight > pageHeight - margin) {
        pdf.addPage();
        currentY = margin;
        colCount = 0;
        currentX = margin;
      }

      currentX = margin + colCount * (cardWidth + 3);

      // Dibujar tarjeta (recuadro)
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.rect(currentX, currentY, cardWidth, cardHeight);

      // Cargar y dibujar imagen
      if (prod.imagen) {
        try {
          // Las imágenes de Storage son URLs, las cargamos asincronamente
          const imgData = await loadImageAsBase64(prod.imagen);
          pdf.addImage(imgData, 'JPEG', currentX + 2, currentY + 2, imgSize, imgSize);
        } catch (err) {
          // Si falla, dibujar un placeholder
          pdf.setDrawColor(220, 220, 220);
          pdf.setLineWidth(0.2);
          pdf.rect(currentX + 2, currentY + 2, imgSize, imgSize);
          pdf.setFontSize(8);
          pdf.setFont(undefined, 'italic');
          pdf.setTextColor(150, 150, 150);
          pdf.text('[Sin imagen]', currentX + 2 + imgSize / 2, currentY + 2 + imgSize / 2, { align: 'center' });
          pdf.setTextColor(0, 0, 0);
        }
      } else {
        // Placeholder si no hay imagen
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.2);
        pdf.rect(currentX + 2, currentY + 2, imgSize, imgSize);
        pdf.setFontSize(8);
        pdf.setFont(undefined, 'italic');
        pdf.setTextColor(150, 150, 150);
        pdf.text('[Sin imagen]', currentX + 2 + imgSize / 2, currentY + 2 + imgSize / 2, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
      }

      // Nombre del producto
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'bold');
      const textX = currentX + 2;
      const textY = currentY + imgSize + 6;
      pdf.setTextColor(0, 0, 0);
      const nameLines = pdf.splitTextToSize(prod.nombre || '', cardWidth - 4);
      pdf.text(nameLines, textX, textY, { maxWidth: cardWidth - 4 });

      // Precio
      const priceY = textY + (nameLines.length * 3.5) + 2;
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(0, 120, 0);
      const precio = prod.precioVenta || prod.pv || 0;
      pdf.text(`$${precio.toLocaleString('es-ES')}`, textX, priceY);

      colCount++;
    }
  }

  // Descargar PDF
  const nombreArchivo = `Listado-Productos-${empresa?.nombre || 'empresa'}-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(nombreArchivo);
}

/**
 * Carga una imagen desde URL y la convierte a base64
 */
async function loadImageAsBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${imageUrl}`));
    img.src = imageUrl;
  });
}
