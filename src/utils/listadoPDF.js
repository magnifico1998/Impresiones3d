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
    const catA = (a.cat || 'Sin categoría').toLowerCase();
    const catB = (b.cat || 'Sin categoría').toLowerCase();
    if (catA !== catB) return catA.localeCompare(catB);
    return (a.nombre || '').toLowerCase().localeCompare((b.nombre || '').toLowerCase());
  });

  // Agrupar por categoría
  const productosPorCategoria = {};
  productosOrdenados.forEach(prod => {
    const cat = prod.cat || 'Sin categoría';
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
  const cardHeight = 125; // alto de cada tarjeta
  const imgSize = 60; // tamaño de la imagen
  const cardPadding = 3;

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
    if (currentY + 35 > pageHeight - margin) {
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
        currentY += cardHeight + 6;
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
      pdf.setDrawColor(150, 150, 150);
      pdf.setLineWidth(0.4);
      pdf.rect(currentX, currentY, cardWidth, cardHeight);

      // Sección de imagen - CENTRADA
      const imgAreaHeight = 70;
      const imgX = currentX + (cardWidth - imgSize) / 2; // Centrar horizontalmente
      const imgY = currentY + cardPadding + 2;

      if (prod.imagen) {
        try {
          // Las imágenes de Storage son URLs, las cargamos asincronamente
          const imgData = await loadImageAsBase64(prod.imagen);
          pdf.addImage(imgData, 'JPEG', imgX, imgY, imgSize, imgSize);
        } catch (err) {
          // Si falla, dibujar un placeholder
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.2);
          pdf.rect(imgX, imgY, imgSize, imgSize);
          pdf.setFontSize(7);
          pdf.setFont(undefined, 'italic');
          pdf.setTextColor(180, 180, 180);
          pdf.text('[Sin imagen]', imgX + imgSize / 2, imgY + imgSize / 2, { align: 'center' });
          pdf.setTextColor(0, 0, 0);
        }
      } else {
        // Placeholder si no hay imagen
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.2);
        pdf.rect(imgX, imgY, imgSize, imgSize);
        pdf.setFontSize(7);
        pdf.setFont(undefined, 'italic');
        pdf.setTextColor(180, 180, 180);
        pdf.text('[Sin imagen]', imgX + imgSize / 2, imgY + imgSize / 2, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
      }

      // Nombre del producto - centrado bajo la imagen
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'bold');
      const nameY = currentY + imgAreaHeight + 2;
      pdf.setTextColor(0, 0, 0);
      const nameLines = pdf.splitTextToSize(prod.nombre || '', cardWidth - 2);
      const maxNameLines = 2;
      const displayNameLines = nameLines.slice(0, maxNameLines);
      pdf.text(displayNameLines, currentX + cardWidth / 2, nameY, { align: 'center', maxWidth: cardWidth - 2 });

      // Precio - CENTRADO Y DESTACADO
      const priceY = nameY + (Math.min(displayNameLines.length, maxNameLines) * 3) + 5;
      pdf.setFontSize(11);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(0, 120, 0);
      const precio = prod.precioSugUnitario || prod.costoUnitario || 0;
      pdf.text(`$${Math.round(precio).toLocaleString('es-ES')}`, currentX + cardWidth / 2, priceY, { align: 'center' });
      pdf.setTextColor(0, 0, 0);

      colCount++;
    }
  }

  // Descargar PDF
  const nombreArchivo = `Listado-Productos-${empresa?.nombre || 'empresa'}-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(nombreArchivo);
}

/**
 * Carga una imagen desde URL y la convierte a base64
 * Maneja URLs de Firebase Storage con parámetro alt=media para bypass de CORS
 */
async function loadImageAsBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    // Si es URL de Firebase Storage, agregar parámetro alt=media
    let urlFinal = imageUrl;
    if (imageUrl.includes('firebasestorage.googleapis.com')) {
      urlFinal = imageUrl.includes('?') 
        ? `${imageUrl}&alt=media` 
        : `${imageUrl}?alt=media`;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('No se pudo crear contexto de canvas'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(base64);
      } catch (err) {
        reject(new Error(`Error al convertir imagen: ${err.message}`));
      }
    };
    
    img.onerror = () => {
      reject(new Error(`No se pudo cargar la imagen: ${imageUrl}`));
    };
    
    img.src = urlFinal;
  });
}
