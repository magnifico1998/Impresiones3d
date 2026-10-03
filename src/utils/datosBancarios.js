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

// Bloque "DATOS PARA TRANSFERENCIA" de los PDF de presupuesto y pedido
// (jsPDF). Dibuja desde `y` y devuelve el `y` siguiente. Si no hay datos
// o se eligió no mostrarlos, no dibuja nada.
//   nota: texto chico opcional debajo (ej. el monto a transferir).
export function dibujarDatosBancarios(doc, empresa, { y, marginX, contentW, navy, nota }) {
  if (!mostrarBancoEnPdf(empresa)) return y;

  const campos = [
    ['CBU / CVU', formatoCbu(empresa.cbu)],
    ['ALIAS', empresa.alias],
    ['TITULAR', empresa.titularCuenta],
    ['BANCO / ENTIDAD', empresa.banco]
  ].filter(([, v]) => v);
  const filas = Math.ceil(campos.length / 2);
  const altoCelda = 11;
  const altoNota = nota ? 6 : 0;
  const alto = filas * altoCelda + 3 + altoNota;

  // Mismo corte de página que los PDF que lo usan: el bloque no se parte.
  if (y + 7 + alto > 278) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...navy);
  doc.rect(marginX, y, contentW, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('DATOS PARA TRANSFERENCIA', marginX + 3, y + 5);
  y += 7;

  doc.setDrawColor(220); doc.rect(marginX, y, contentW, alto);
  const anchoCol = contentW / 2;
  campos.forEach(([etiqueta, valor], i) => {
    const x = marginX + 3 + (i % 2) * anchoCol;
    const yy = y + 5 + Math.floor(i / 2) * altoCelda;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text(etiqueta, x, yy);
    // El CBU y el alias en monoespaciada: se copian a mano, carácter por carácter.
    const mono = etiqueta === 'CBU / CVU' || etiqueta === 'ALIAS';
    doc.setFont(mono ? 'courier' : 'helvetica', 'bold'); doc.setFontSize(mono ? 10.5 : 10); doc.setTextColor(30, 33, 40);
    doc.text(doc.splitTextToSize(String(valor), anchoCol - 6)[0], x, yy + 5);
  });
  if (nota) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
    doc.text(nota, marginX + 3, y + filas * altoCelda + 4.5);
  }
  return y + alto + 8;
}
