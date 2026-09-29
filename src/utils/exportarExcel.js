// Exportación a Excel (.xlsx) sin librerías de planillas: un .xlsx es un zip
// con unos pocos XML, y JSZip ya está en el proyecto (se carga recién al
// exportar). Alcanza para una hoja con encabezado, números y fechas.
//
// columnas: [{ titulo, ancho, tipo: 'texto' | 'numero' | 'moneda' | 'fecha' }]
// filas: arrays de valores en el orden de las columnas. Las fechas van como
// "YYYYMMDD" o "YYYY-MM-DD"; vacío o null deja la celda en blanco.

const escapar = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caracteres de control que Excel no acepta dentro del XML.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const letraColumna = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Excel cuenta los días desde el 30/12/1899.
function serialFecha(valor) {
  const limpio = String(valor).replace(/-/g, '');
  if (!/^\d{8}$/.test(limpio)) return null;
  const ms = Date.UTC(Number(limpio.slice(0, 4)), Number(limpio.slice(4, 6)) - 1, Number(limpio.slice(6, 8)));
  return (ms - Date.UTC(1899, 11, 30)) / 86400000;
}

// Estilos (índices de cellXfs): 0 normal, 1 encabezado en negrita,
// 2 moneda con dos decimales, 3 fecha dd/mm/aaaa, 4 número entero.
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

function celda(ref, valor, tipo) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (tipo === 'fecha') {
    const serial = serialFecha(valor);
    if (serial !== null) return `<c r="${ref}" s="3"><v>${serial}</v></c>`;
  }
  if ((tipo === 'moneda' || tipo === 'numero') && Number.isFinite(Number(valor))) {
    return `<c r="${ref}" s="${tipo === 'moneda' ? 2 : 4}"><v>${Number(valor)}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
}

export async function exportarExcel({ nombreArchivo, hoja = 'Hoja1', columnas, filas }) {
  const { default: JSZip } = await import('jszip');

  const encabezado = `<row r="1">${columnas.map((c, i) =>
    `<c r="${letraColumna(i)}1" s="1" t="inlineStr"><is><t>${escapar(c.titulo)}</t></is></c>`).join('')}</row>`;
  const cuerpo = filas.map((fila, f) => `<row r="${f + 2}">${fila.map((v, i) =>
    celda(`${letraColumna(i)}${f + 2}`, v, columnas[i].tipo)).join('')}</row>`).join('');
  const anchos = `<cols>${columnas.map((c, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join('')}</cols>`;
  // Encabezado fijo y autofiltro, para poder ordenar y filtrar en Excel.
  const ultima = `${letraColumna(columnas.length - 1)}${filas.length + 1}`;
  const hojaXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${anchos}<sheetData>${encabezado}${cuerpo}</sheetData><autoFilter ref="A1:${ultima}"/></worksheet>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapar(hoja).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${escapar(hoja).slice(0, 31)}'!$A$1:$${letraColumna(columnas.length - 1)}$${filas.length + 1}</definedName></definedNames>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', ESTILOS);
  zip.file('xl/worksheets/sheet1.xml', hojaXml);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
