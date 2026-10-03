// Datos bancarios del emprendimiento (Mi emprendimiento → Datos bancarios)
// para que el cliente pague por transferencia. Se guardan en `empresa`:
//   cbu, alias, titularCuenta, banco, mostrarBancoEnPdf (por defecto sí).

export const tieneDatosBancarios = (empresa) => !!(empresa?.cbu || empresa?.alias);

export const mostrarBancoEnPdf = (empresa) => tieneDatosBancarios(empresa) && empresa.mostrarBancoEnPdf !== false;

// CBU/CVU en grupos para leerlo y dictarlo sin errores: 8 (banco y
// sucursal) + 14 (cuenta), como se lee en los homebanking.
export const formatoCbu = (cbu) => {
  const d = String(cbu || '').replace(/\D/g, '');
  return d.length === 22 ? `${d.slice(0, 8)} ${d.slice(8)}` : String(cbu || '');
};

// "Datos para transferencia" de los PDF de presupuesto y pedido (jsPDF):
// va al pie de la última página, justo arriba del pie con el nombre del
// emprendimiento, con un estilo liviano (sin encabezado oscuro ni bordes)
// para que no se lea como parte del comprobante. Si el contenido ya llega
// hasta ahí, pasa a una página nueva. Si no hay datos o se eligió no
// mostrarlos, no dibuja nada.
//   yContenido: dónde terminó el contenido de la página actual.
//   nota: texto opcional a la derecha del título (ej. el monto a transferir).
const Y_PIE = 283; // el pie con el nombre del emprendimiento va en pageH - 14

export function dibujarDatosBancarios(doc, empresa, { yContenido, marginX, contentW, nota }) {
  if (!mostrarBancoEnPdf(empresa)) return;

  const campos = [
    ['CBU / CVU', formatoCbu(empresa.cbu)],
    ['Alias', empresa.alias],
    ['Titular', empresa.titularCuenta],
    ['Banco / Entidad', empresa.banco]
  ].filter(([, v]) => v);
  const filas = Math.ceil(campos.length / 2);
  const altoFila = 9;
  const alto = 7 + filas * altoFila;
  // Entre líneas separadoras (arriba y abajo), dejando aire antes del pie.
  const yInicio = Y_PIE - 9 - alto;
  let y = yInicio;
  if (yContenido > y - 4) {
    doc.addPage();
    y = yInicio;
  }

  doc.setDrawColor(200); doc.setLineWidth(0.3);
  doc.line(marginX, y, marginX + contentW, y);
  doc.line(marginX, y + alto + 3, marginX + contentW, y + alto + 3);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
  doc.text('DATOS PARA TRANSFERENCIA', marginX, y + 5);
  // Subrayado fino del título.
  doc.setDrawColor(150); doc.setLineWidth(0.15);
  doc.line(marginX, y + 5.8, marginX + doc.getTextWidth('DATOS PARA TRANSFERENCIA'), y + 5.8);
  if (nota) {
    doc.setFont('helvetica', 'normal');
    doc.text(nota, marginX + contentW, y + 5, { align: 'right' });
  }

  const anchoCol = contentW / 2;
  campos.forEach(([etiqueta, valor], i) => {
    const x = marginX + (i % 2) * anchoCol;
    const yy = y + 7 + Math.floor(i / 2) * altoFila + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    doc.text(etiqueta.toUpperCase(), x, yy);
    // El CBU y el alias en monoespaciada: se copian a mano, carácter por carácter.
    const mono = etiqueta === 'CBU / CVU' || etiqueta === 'Alias';
    doc.setFont(mono ? 'courier' : 'helvetica', mono ? 'bold' : 'normal'); doc.setFontSize(9.5); doc.setTextColor(50, 50, 50);
    doc.text(doc.splitTextToSize(String(valor), anchoCol - 6)[0], x, yy + 4.2);
  });
}
