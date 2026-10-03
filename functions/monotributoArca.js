// Lectura de la tabla de categorías del monotributo de la página de ARCA,
// para actualizar monotributo/categorias desde el panel admin (ver
// functions/http/monotributo.js). ARCA la actualiza dos veces por año.
//
// Se lee el texto de la página (sin etiquetas): cada fila de la tabla
// arranca con la letra de la categoría, sola, y la celda siguiente es el
// tope de ingresos brutos anuales ("$12.009.410,45"). Si el formato
// cambia, devuelve un error en vez de números dudosos.

const URL_CATEGORIAS = 'https://www.afip.gob.ar/monotributo/categorias.asp';

const aTexto = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ')
  .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
  .split('\n').map((l) => l.trim()).filter(Boolean);

// "$12.009.410,45" → 12009410.45
const leerMonto = (t) => {
  const m = /^\$\s*([\d.]+,\d{2})$/.exec(t);
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
};

function interpretarCategorias(html) {
  const lineas = aTexto(html);
  const fecha = lineas.map((l) => /desde el (\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(l)).find(Boolean);
  const categorias = [];
  for (let i = 0; i < lineas.length - 1; i++) {
    if (!/^[A-K]$/.test(lineas[i])) continue;
    const tope = leerMonto(lineas[i + 1]);
    if (tope && !categorias.some((c) => c.letra === lineas[i])) categorias.push({ letra: lineas[i], topeAnual: tope });
  }
  // Controles: al menos 8 categorías, en orden y con topes crecientes.
  const ordenadas = categorias.every((c, i) => i === 0 || (c.letra > categorias[i - 1].letra && c.topeAnual > categorias[i - 1].topeAnual));
  if (categorias.length < 8 || !ordenadas || !fecha) {
    throw new Error('La página de ARCA no tiene el formato esperado: cargá las categorías a mano.');
  }
  return {
    categorias,
    vigencia: `${fecha[2].padStart(2, '0')}/${fecha[3]}`,
    vigenteDesde: `${fecha[1].padStart(2, '0')}/${fecha[2].padStart(2, '0')}/${fecha[3]}`,
    fuente: URL_CATEGORIAS
  };
}

async function leerCategoriasArca() {
  const resp = await fetch(URL_CATEGORIAS, { headers: { 'User-Agent': 'Mozilla/5.0 (Manager3D)' }, signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`ARCA respondió ${resp.status}.`);
  // La página está en ISO-8859-1.
  const html = new TextDecoder('latin1').decode(await resp.arrayBuffer());
  return interpretarCategorias(html);
}

module.exports = { leerCategoriasArca, interpretarCategorias, URL_CATEGORIAS };
