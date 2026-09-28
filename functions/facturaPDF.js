const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');

// PDF de una factura/nota de crédito C con los datos que exige ARCA
// (RG 1415 y el QR de la RG 4892). Se genera en el momento a partir del doc
// facturas/{id}: no se guarda en Storage, así un cambio de diseño no deja
// PDFs viejos distintos de los nuevos.

const NOMBRES_TIPO = { 11: 'FACTURA', 13: 'NOTA DE CRÉDITO' };
const DOC_TIPO_TEXTO = { 80: 'CUIT', 96: 'DNI', 99: 'Doc.' };

const fechaAR = (yyyymmdd) => yyyymmdd ? `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}` : '';
const isoAYyyymmdd = (iso) => (iso || '').replace(/-/g, '');
const pesos = (n) => '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeroCompleto = (ptoVta, numero) => `${String(ptoVta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`;

// URL del QR según la especificación de ARCA: JSON en base64 como parámetro.
function urlQr(f) {
  const datos = {
    ver: 1,
    fecha: `${f.fecha.slice(0, 4)}-${f.fecha.slice(4, 6)}-${f.fecha.slice(6, 8)}`,
    cuit: Number(f.emisor.cuit),
    ptoVta: f.ptoVta,
    tipoCmp: f.tipoCbte,
    nroCmp: f.numero,
    importe: f.importeTotal,
    moneda: 'PES',
    ctz: 1,
    tipoCodAut: 'E',
    codAut: Number(f.cae)
  };
  if (f.receptor.docTipo !== 99) {
    datos.tipoDocRec = f.receptor.docTipo;
    datos.nroDocRec = Number(f.receptor.docNro);
  }
  return `https://www.arca.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString('base64')}`;
}

// El QR se dibuja con rectángulos en vez de insertarlo como imagen: evita
// depender del decodificador de PNG de jsPDF en Node.
function dibujarQr(doc, texto, x, y, lado) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const celda = lado / n;
  doc.setFillColor(0, 0, 0);
  for (let fila = 0; fila < n; fila++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(fila, col)) doc.rect(x + col * celda, y + fila * celda, celda, celda, 'F');
    }
  }
}

function generarFacturaPDF(f) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const e = f.emisor;
  const M = 12;
  const ancho = 210 - 2 * M;

  // Encabezado: dos columnas con la letra en el medio.
  doc.setDrawColor(0);
  doc.rect(M, M, ancho, 8);
  doc.setFont('helvetica', 'bold').setFontSize(12);
  doc.text('ORIGINAL', 105, M + 5.5, { align: 'center' });

  const yCab = M + 8;
  doc.rect(M, yCab, ancho, 44);
  doc.line(105, yCab + 14, 105, yCab + 44);
  doc.rect(98, yCab, 14, 14);
  doc.setFontSize(22).text('C', 105, yCab + 8.5, { align: 'center' });
  doc.setFontSize(7).text(`COD. ${String(f.tipoCbte).padStart(3, '0')}`, 105, yCab + 12.5, { align: 'center' });

  doc.setFontSize(14).text(e.razonSocial || '', M + 3, yCab + 10, { maxWidth: 80 });
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text(`Domicilio comercial: ${e.domicilio || ''}`, M + 3, yCab + 24, { maxWidth: 85 });
  doc.text('Condición frente al IVA: Responsable Monotributo', M + 3, yCab + 34);

  doc.setFont('helvetica', 'bold').setFontSize(14);
  doc.text(NOMBRES_TIPO[f.tipoCbte], 115, yCab + 10);
  doc.setFontSize(9);
  doc.text(`Punto de venta: ${String(f.ptoVta).padStart(5, '0')}    Comp. Nro: ${String(f.numero).padStart(8, '0')}`, 110, yCab + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de emisión: ${fechaAR(f.fecha)}`, 110, yCab + 26);
  doc.text(`CUIT: ${e.cuit}`, 110, yCab + 31);
  doc.text(`Ingresos Brutos: ${e.iibb || ''}`, 110, yCab + 36);
  doc.text(`Fecha de inicio de actividades: ${fechaAR(isoAYyyymmdd(e.inicioActividades))}`, 110, yCab + 41);

  let y = yCab + 44;
  // Período facturado: sólo para servicios.
  if (f.concepto !== 1) {
    doc.rect(M, y, ancho, 8);
    doc.text(`Período facturado desde: ${fechaAR(f.servicioDesde)}   hasta: ${fechaAR(f.servicioHasta)}   Vto. de pago: ${fechaAR(f.vtoPago || f.fecha)}`, M + 3, y + 5.5);
    y += 8;
  }

  // Receptor.
  const r = f.receptor;
  doc.rect(M, y, ancho, 20);
  const docTexto = r.docTipo === 99 ? 'Consumidor final' : `${DOC_TIPO_TEXTO[r.docTipo]}: ${r.docNro}`;
  doc.text(docTexto, M + 3, y + 6);
  doc.text(`Apellido y nombre / Razón social: ${r.nombre || ''}`, 80, y + 6, { maxWidth: 115 });
  doc.text(`Condición frente al IVA: ${r.condicionIvaTexto}`, M + 3, y + 12);
  doc.text(`Domicilio: ${r.domicilio || ''}`, 80, y + 12, { maxWidth: 115 });
  if (f.asociada) {
    doc.text(`Comprobante asociado: Factura C ${numeroCompleto(f.asociada.ptoVta, f.asociada.numero)} del ${fechaAR(f.asociada.fecha)}`, M + 3, y + 18);
  }
  y += 24;

  // Ítems.
  doc.setFillColor(230, 230, 230);
  doc.rect(M, y, ancho, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.text('Descripción', M + 2, y + 5);
  doc.text('Cantidad', 130, y + 5, { align: 'right' });
  doc.text('Precio unit.', 160, y + 5, { align: 'right' });
  doc.text('Subtotal', 196, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 12;
  for (const item of f.items) {
    const lineas = doc.splitTextToSize(item.descripcion, 95);
    doc.text(lineas, M + 2, y);
    doc.text(String(item.cantidad), 130, y, { align: 'right' });
    doc.text(pesos(item.precioUnitario), 160, y, { align: 'right' });
    doc.text(pesos(item.cantidad * item.precioUnitario), 196, y, { align: 'right' });
    y += lineas.length * 5 + 2;
  }

  // Totales y CAE al pie.
  const yPie = 230;
  doc.rect(M, yPie - 18, ancho, 14);
  doc.text('Subtotal:', 160, yPie - 12, { align: 'right' });
  doc.text(pesos(f.importeTotal), 196, yPie - 12, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text('Importe total:', 160, yPie - 6.5, { align: 'right' });
  doc.text(pesos(f.importeTotal), 196, yPie - 6.5, { align: 'right' });

  dibujarQr(doc, urlQr(f), M, yPie, 35);
  doc.setFontSize(10);
  doc.text(`CAE N°: ${f.cae}`, 196, yPie + 8, { align: 'right' });
  doc.text(`Fecha de vto. de CAE: ${fechaAR(f.caeVto)}`, 196, yPie + 14, { align: 'right' });
  doc.setFont('helvetica', 'italic').setFontSize(8);
  doc.text('Comprobante autorizado por ARCA', 52, yPie + 8);
  if (f.entorno !== 'produccion') {
    doc.setTextColor(200, 0, 0).setFont('helvetica', 'bold').setFontSize(10);
    doc.text('HOMOLOGACIÓN: comprobante de prueba, sin validez fiscal', 105, 290, { align: 'center' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

const nombreArchivoFactura = (f) =>
  `${f.tipoCbte === 13 ? 'NC' : 'Factura'}-C-${numeroCompleto(f.ptoVta, f.numero)}.pdf`;

module.exports = { generarFacturaPDF, nombreArchivoFactura, numeroCompleto };
