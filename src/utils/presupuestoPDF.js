import { loadImageAsBase64 } from './loadImageAsBase64';
import { dibujarDatosBancarios } from './datosBancarios';
import { ajustarLogo, tamanoLogoPdfDe } from './logoPdf';
import { hojasDeAnexo, porHojaDe } from './adjuntosPresupuesto';

// PDF de un presupuesto. Lo usan ModalPresupuesto (al generarlo desde la
// Calculadora o la Biblioteca) y PresupuestosPage (para volver a bajar uno
// guardado). `numero` es el correlativo del presupuesto guardado; si no se
// guardó, el PDF sale sin N°. `fecha` es un texto ya formateado (es-AR).
export async function generarPdfPresupuesto({ empresa, fmt, numero = null, fecha, cliente, telefono, email, notas, items, adjuntos = [], adjuntosPorHoja = 1 }) {
  // Import dinámico: jsPDF sólo se descarga al generar el PDF.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginX = 15, contentW = pageW - marginX * 2;
  const navy = [40, 48, 61], lightGray = [235, 237, 240];
  const total = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);
  let y = 18;

  function checkPageBreak(neededH) {
    if (y + neededH > 278) {
      doc.addPage();
      y = 20;
    }
  }

  // Logo (if exists) + Title
  let titleX = marginX;
  let logoAlto = 0;
  if (empresa.logo) {
    try {
      const { dataUrl, width, height } = await loadImageAsBase64(empresa.logo);
      const { w, h } = ajustarLogo(width, height, tamanoLogoPdfDe(empresa));
      doc.addImage(dataUrl, 'JPEG', marginX, y - 2 - h / 2, w, h);
      titleX = marginX + w + 4;
      logoAlto = h;
    } catch (err) {
      console.error('No se pudo cargar el logo para el PDF del presupuesto:', err);
    }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(30, 33, 40);
  doc.text('PRESUPUESTO', titleX, y);

  // Business details
  let ey = y - 6;
  doc.setFontSize(9);
  if (empresa.nombre) {
    doc.setFont('helvetica', 'bold');
    doc.text(empresa.nombre, pageW - marginX, ey, { align: 'right' });
    ey += 4.5;
    doc.setFont('helvetica', 'normal');
  }
  const dirLine = [empresa.direccion, empresa.cp].filter(Boolean).join(', ');
  if (dirLine) { doc.text(dirLine, pageW - marginX, ey, { align: 'right' }); ey += 4.2; }
  if (empresa.telefono) { doc.text(empresa.telefono, pageW - marginX, ey, { align: 'right' }); ey += 4.2; }
  if (empresa.email) { doc.text(empresa.email, pageW - marginX, ey, { align: 'right' }); }

  y += 10 + Math.max(0, logoAlto / 2 - 12);
  doc.setDrawColor(210); doc.setLineWidth(0.3); doc.line(marginX, y, pageW - marginX, y);
  y += 7;

  // N° (sólo si está guardado) y fecha
  doc.setFontSize(10); doc.setTextColor(30, 33, 40);
  if (numero != null) {
    doc.setFont('helvetica', 'bold'); doc.text('N°:', marginX, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(numero), marginX + 15, y);
    doc.setFont('helvetica', 'bold'); doc.text('Fecha:', marginX + 45, y);
    doc.setFont('helvetica', 'normal'); doc.text(fecha, marginX + 60, y);
  } else {
    doc.setFont('helvetica', 'bold'); doc.text('Fecha:', marginX, y);
    doc.setFont('helvetica', 'normal'); doc.text(fecha, marginX + 15, y);
  }
  y += 10;

  // Seller / Buyer Header
  const boxW = (contentW - 6) / 2, boxX2 = marginX + boxW + 6, headerH = 7;
  doc.setFillColor(...navy);
  doc.rect(marginX, y, boxW, headerH, 'F'); doc.rect(boxX2, y, boxW, headerH, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('VENDEDOR', marginX + 3, y + 5); doc.text('INTERESADO', boxX2 + 3, y + 5);
  y += headerH;

  const vendLines = [empresa.nombre || '—', [empresa.direccion, empresa.cp].filter(Boolean).join(', '), empresa.telefono || '', empresa.email || ''].filter(l => l !== '');
  const cliLines = [cliente || '—', telefono || '', email || ''].filter(l => l !== '');

  doc.setTextColor(40, 40, 40); doc.setFontSize(9);
  const wrapLines = (lines) => {
    const out = [];
    lines.forEach((l, i) => {
      doc.splitTextToSize(l, boxW - 6).forEach(w => out.push({ text: w, bold: i === 0 }));
    });
    return out;
  };
  const vendWrapped = wrapLines(vendLines);
  const cliWrapped = wrapLines(cliLines);
  const maxLines = Math.max(vendWrapped.length, cliWrapped.length, 1);
  const boxBodyH = maxLines * 4.7 + 4;
  doc.setDrawColor(220); doc.rect(marginX, y, boxW, boxBodyH); doc.rect(boxX2, y, boxW, boxBodyH);
  vendWrapped.forEach((l, i) => { doc.setFont('helvetica', l.bold ? 'bold' : 'normal'); doc.text(l.text, marginX + 3, y + 4.5 + i * 4.7); });
  cliWrapped.forEach((l, i) => { doc.setFont('helvetica', l.bold ? 'bold' : 'normal'); doc.text(l.text, boxX2 + 3, y + 4.5 + i * 4.7); });
  y += boxBodyH + 6;

  // Products table header
  checkPageBreak(20);
  doc.setFillColor(...navy);
  doc.rect(marginX, y, contentW, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('PRODUCTOS', marginX + 3, y + 5);
  y += 7;

  const colN = 8, colDesc = 86, colCant = 18, colPU = 34, colTot = 32;
  const xN = marginX, xDesc = xN + colN, xCant = xDesc + colDesc, xPU = xCant + colCant, xTot = xPU + colPU;
  doc.setFillColor(...lightGray);
  doc.rect(marginX, y, contentW, 6, 'F');
  doc.setTextColor(40, 40, 40); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text('N°', xN + 2, y + 4.5);
  doc.text('DESCRIPCIÓN', xDesc + 2, y + 4.5);
  doc.text('CANT.', xCant + colCant - 2, y + 4.5, { align: 'right' });
  doc.text('PRECIO UNIT.', xPU + colPU - 2, y + 4.5, { align: 'right' });
  doc.text('TOTAL', xTot + colTot - 2, y + 4.5, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
  items.forEach((it, i) => {
    const subtotal = it.cantidad * it.precioUnitario;
    const maxDescWidth = colDesc - 4;
    const nameLines = doc.splitTextToSize(it.nombre || 'Producto', maxDescWidth);
    const lineH = 3.6;
    const rowH = Math.max(6.5, nameLines.length * lineH + 1.8);

    checkPageBreak(rowH);
    if (i % 2 === 1) { doc.setFillColor(248, 248, 250); doc.rect(marginX, y, contentW, rowH, 'F'); }
    doc.setDrawColor(225); doc.rect(marginX, y, contentW, rowH);

    doc.setTextColor(40, 40, 40); doc.setFontSize(8.8); doc.setFont('helvetica', 'normal');
    const topTextY = y + 3.2;
    doc.text(String(i + 1), xN + 2, topTextY + 0.8);
    doc.text(nameLines, xDesc + 2, topTextY);

    const centerY = y + rowH / 2;
    doc.text(String(it.cantidad), xCant + colCant - 2, centerY, { baseline: 'middle', align: 'right' });
    doc.text(fmt(it.precioUnitario), xPU + colPU - 2, centerY, { baseline: 'middle', align: 'right' });
    doc.text(fmt(subtotal), xTot + colTot - 2, centerY, { baseline: 'middle', align: 'right' });

    y += rowH;
  });

  // TOTAL final destacado (sin descuento/envío/pagos: eso es de un pedido real)
  y += 2;
  const totalColTot = 36, totalColPU = 44;
  const xTotR = pageW - marginX - totalColTot;
  const xPUR = xTotR - totalColPU;
  const rowH = 8;
  checkPageBreak(rowH + 10);
  doc.setFillColor(...lightGray);
  doc.rect(xPUR, y, totalColPU, rowH, 'F'); doc.rect(xTotR, y, totalColTot, rowH, 'F');
  doc.setDrawColor(180); doc.rect(xPUR, y, totalColPU, rowH); doc.rect(xTotR, y, totalColTot, rowH);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(40, 40, 40);
  doc.text('TOTAL', xPUR + 2, y + 5.5);
  doc.text(fmt(total), xTotR + totalColTot - 2, y + 5.5, { align: 'right' });
  y += rowH + 10;

  // Notas
  if (notas) {
    checkPageBreak(20);
    doc.setFillColor(...navy);
    doc.rect(marginX, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('COMENTARIOS', marginX + 3, y + 5);
    y += 7;
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(notas, contentW - 6);
    const bh = lines.length * 5 + 4;
    checkPageBreak(bh);
    doc.setDrawColor(220); doc.rect(marginX, y, contentW, bh);
    doc.text(lines, marginX + 3, y + 5.5);
    y += bh + 8;
  }

  // Datos para transferir (si están cargados en Mi emprendimiento), al pie.
  dibujarDatosBancarios(doc, empresa, { yContenido: y, marginX, contentW });

  // Footer
  doc.setFontSize(9); doc.setTextColor(130, 130, 130); doc.setFont('helvetica', 'normal');
  doc.text(empresa.nombre || '', marginX, pageH - 14);

  // Hojas de anexo con las imágenes adjuntas: de a 1, 2 o 4 por hoja, cada una con su
  // comentario debajo. La imagen entra entera (sin deformarse) en su recuadro.
  if (adjuntos.length) {
    const porHoja = porHojaDe(adjuntosPorHoja);
    const hojas = hojasDeAnexo(adjuntos.length, porHoja);
    const columnas = porHoja === 4 ? 2 : 1;
    const filas = porHoja === 1 ? 1 : 2;
    const sepCeldas = 6, arriba = 32, abajo = pageH - 20;
    const celdaW = (contentW - sepCeldas * (columnas - 1)) / columnas;
    const celdaH = (abajo - arriba - sepCeldas * (filas - 1)) / filas;
    const altoComentario = porHoja === 1 ? 26 : porHoja === 2 ? 16 : 22;
    const altoLinea = porHoja === 1 ? 4.6 : 4;
    const altoImagen = celdaH - altoComentario - 2;

    for (let hoja = 0; hoja < hojas; hoja++) {
      doc.addPage();
      doc.setFillColor(...navy);
      doc.rect(marginX, 14, contentW, 8, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text(`ANEXO${numero != null ? ` · PRESUPUESTO N° ${numero}` : ''}${hojas > 1 ? ` · HOJA ${hoja + 1} DE ${hojas}` : ''}`, marginX + 3, 19.3);

      for (let k = 0; k < porHoja; k++) {
        const a = adjuntos[hoja * porHoja + k];
        if (!a) break;
        const x = marginX + (k % columnas) * (celdaW + sepCeldas);
        const yy = arriba + Math.floor(k / columnas) * (celdaH + sepCeldas);
        doc.setDrawColor(215); doc.setLineWidth(0.3); doc.rect(x, yy, celdaW, altoImagen);
        try {
          const { dataUrl, width, height } = await loadImageAsBase64(a.dataUrl || a.url);
          const escala = Math.min((celdaW - 4) / width, (altoImagen - 4) / height);
          const w = width * escala, h = height * escala;
          doc.addImage(dataUrl, 'JPEG', x + (celdaW - w) / 2, yy + (altoImagen - h) / 2, w, h);
        } catch (err) {
          console.warn('No se pudo cargar una imagen adjunta del presupuesto:', err.message);
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(150, 150, 150);
          doc.text('No se pudo cargar la imagen', x + celdaW / 2, yy + altoImagen / 2, { align: 'center' });
        }
        const comentario = String(a.comentario || '').trim();
        if (comentario) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(porHoja === 1 ? 9.5 : 8.5); doc.setTextColor(40, 40, 40);
          let lineas = doc.splitTextToSize(comentario, celdaW - 2);
          const maxLineas = Math.floor((altoComentario - 2) / altoLinea);
          if (lineas.length > maxLineas) {
            lineas = lineas.slice(0, maxLineas);
            lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/\s*\S{0,3}$/, '') + '…';
          }
          doc.text(lineas, x + 1, yy + altoImagen + 5);
        }
      }
      doc.setFontSize(9); doc.setTextColor(130, 130, 130); doc.setFont('helvetica', 'normal');
      doc.text(empresa.nombre || '', marginX, pageH - 14);
    }
  }

  const sufijo = numero != null ? `N${numero}` : String(Date.now());
  const nameFile = `Presupuesto_${(cliente || 'cliente')}_${sufijo}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  doc.save(nameFile + '.pdf');
}
