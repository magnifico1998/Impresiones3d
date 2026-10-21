// Carga masiva de productos de la Biblioteca desde un ZIP: un CSV (productos.csv) más las fotos. Son productos "sin
// impresión" (ver utils/productoSinImpresion.js): costo de compra, precio de venta, stock por color y fotos.
//
// Una fila por color. Los datos del producto (nombre, categoría, costo, precio, descripciones, fotos generales) se
// repiten en cada fila del mismo producto, o se dejan vacíos en las filas siguientes: manda el primero que no está vacío
// y, si dos filas del mismo producto traen valores distintos, el producto se rechaza. Las filas del mismo producto se
// agrupan por `codigo` (si no hay, por `nombre`).
//
// Columnas (la primera fila es el encabezado; el orden no importa y no se distinguen mayúsculas ni acentos):
//   codigo, nombre*, categoria, subcategoria, subsubcategoria, desc_corta, desc_larga, notas_internas,
//   costo*, margen, precio (con precio y margen, manda el precio), color, stock (puede ser 0),
//   foto_principal, fotos_extra (separadas con |), foto_color (la foto de ese color)
//
// Las fotos se indican por NOMBRE DE ARCHIVO (un navegador no puede abrir rutas de la PC): van dentro del mismo ZIP, en
// cualquier carpeta. Reglas: máximo 50 productos por carga, hasta 15 fotos por producto, el color tiene que existir en
// Configuración, y un producto que ya está en la Biblioteca (mismo nombre) se rechaza. Cada producto se valida entero:
// con un error en cualquiera de sus filas no se importa ninguna.

import { partirCSV, leerNumeroCSV } from './importarInventario';
import { camposSinImpresion, margenDesdePrecio, precioDesdeMargen } from './productoSinImpresion';
import { normalizarStock } from './stock';

export const MAX_PRODUCTOS_POR_CARGA = 50;
export const MAX_IMAGENES_POR_PRODUCTO = 15;
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;

export const COLUMNAS = [
  'codigo', 'nombre', 'categoria', 'subcategoria', 'subsubcategoria', 'desc_corta', 'desc_larga', 'notas_internas',
  'costo', 'margen', 'precio', 'color', 'stock', 'foto_principal', 'fotos_extra', 'foto_color'
];
const OBLIGATORIAS = ['nombre', 'costo'];

// Marca de orden de bytes (BOM): Excel la necesita para abrir un CSV en UTF-8.
const BOM = String.fromCharCode(0xFEFF);

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const extension = (nombre) => String(nombre || '').split('.').pop().toLowerCase();
export const esArchivoImagen = (nombre) => Object.prototype.hasOwnProperty.call(MIME, extension(nombre));
export const mimeDeImagen = (nombre) => MIME[extension(nombre)] || 'application/octet-stream';

// Para comparar textos sin importar mayúsculas, acentos ni espacios repetidos.
const clave = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const limpiar = (t) => String(t ?? '').trim().replace(/\s+/g, ' ');
const nombreBase = (ruta) => String(ruta || '').split(/[\\/]/).pop();
const numero = (t) => leerNumeroCSV(String(t ?? '').replace('%', ''));

// Cuántos productos más entran en la Biblioteca según el plan (null = sin límite).
export const lugarEnPlan = (limite, cantidadActual) => (limite == null ? null : Math.max(0, Number(limite) - Number(cantidadActual || 0)));

// Lee el texto del CSV con las filas agrupadas por producto.
// `imagenes`: Map(clave del nombre de archivo → { nombre, ambigua }), ver leerZipProductos.
// `colores`: nombres de los colores de Configuración. `existentes`: nombres de los productos ya cargados.
// Devuelve { error } si no se puede leer, o { productos, sueltas }: cada producto trae `errores` ([] = se puede importar).
export function validarProductosCSV(texto, { imagenes = new Map(), colores = [], existentes = [] } = {}) {
  const filas = partirCSV(String(texto || '').replace(BOM, ''));
  if (filas.length < 2) return { error: 'El CSV no tiene filas para importar (la primera fila es el encabezado).' };
  const encabezado = filas[0].map((h) => clave(h).replace(/ /g, '_'));
  const faltan = OBLIGATORIAS.filter((c) => !encabezado.includes(c));
  if (faltan.length) return { error: `Faltan columnas en el encabezado: ${faltan.join(', ')}. Descargá la plantilla para ver el formato.` };
  const col = Object.fromEntries(COLUMNAS.map((c) => [c, encabezado.indexOf(c)]));
  const val = (f, c) => (col[c] >= 0 ? limpiar(f[col[c]]) : '');

  const grupos = new Map();
  const sueltas = [];
  filas.slice(1).forEach((f, i) => {
    const n = i + 2;
    const k = clave(val(f, 'codigo')) || clave(val(f, 'nombre'));
    if (!k) { sueltas.push({ numero: n, error: 'Falta el código y el nombre: no se sabe a qué producto pertenece la fila' }); return; }
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ numero: n, f });
  });
  if (!grupos.size) return { error: 'El CSV no tiene productos para importar.' };
  if (grupos.size > MAX_PRODUCTOS_POR_CARGA) {
    return { error: `El archivo tiene ${grupos.size} productos y el máximo por carga es ${MAX_PRODUCTOS_POR_CARGA}. Dividilo en varios archivos.` };
  }

  const coloresCfg = new Map(colores.map((c) => [clave(c), c]));
  const nombresExistentes = new Set(existentes.map(clave));
  const nombresEnArchivo = new Set();

  const productos = [...grupos.values()].map((rows) => {
    const errores = [];
    const agregarError = (m) => { if (!errores.includes(m)) errores.push(m); };
    const filasNums = rows.map((r) => r.numero);

    // Dato del producto: el primero que no está vacío; si otra fila trae otro valor, error.
    const unico = (columna, etiqueta, igual = (a, b) => clave(a) === clave(b)) => {
      const vals = rows.map((r) => ({ n: r.numero, v: val(r.f, columna) })).filter((x) => x.v);
      if (!vals.length) return '';
      const otro = vals.find((x) => !igual(x.v, vals[0].v));
      if (otro) agregarError(`${etiqueta} distinto en la fila ${otro.n}: en las filas de un mismo producto tiene que coincidir`);
      return vals[0].v;
    };
    const igualNumero = (a, b) => numero(a) === numero(b);

    const nombre = unico('nombre', 'El nombre');
    const codigo = unico('codigo', 'El código');
    const cat = unico('categoria', 'La categoría');
    const subcat = unico('subcategoria', 'La subcategoría');
    const subsubcat = unico('subsubcategoria', 'La sub-subcategoría');
    const desc = unico('desc_corta', 'La descripción corta');
    const descLarga = unico('desc_larga', 'La descripción larga');
    const notasInternas = unico('notas_internas', 'Las notas internas');
    const costoTxt = unico('costo', 'El costo', igualNumero);
    const margenTxt = unico('margen', 'El margen', igualNumero);
    const precioTxt = unico('precio', 'El precio', igualNumero);
    const fotoPrincipal = unico('foto_principal', 'La foto principal');

    if (!nombre) agregarError('Falta el nombre');
    else if (nombresExistentes.has(clave(nombre))) agregarError('Ya hay un producto con ese nombre en la Biblioteca (no se reemplaza)');
    else if (nombresEnArchivo.has(clave(nombre))) agregarError('El nombre está repetido en otro producto del archivo');
    if (nombre) nombresEnArchivo.add(clave(nombre));

    // Costo y precio: el precio manda; sin precio, sale de costo + margen.
    const costo = numero(costoTxt);
    const margenIn = numero(margenTxt);
    const precioIn = numero(precioTxt);
    let precio = 0;
    let margen = 0;
    if (costoTxt === '' || costo === null || Number.isNaN(costo) || costo < 0) agregarError('El costo falta o no es un número válido (puede ser 0)');
    else if (precioTxt !== '' && (Number.isNaN(precioIn) || precioIn <= 0)) agregarError('El precio no es un número válido (tiene que ser mayor a 0)');
    else if (precioTxt !== '') { precio = precioIn; margen = margenDesdePrecio(costo, precio); }
    else if (margenTxt !== '' && !Number.isNaN(margenIn) && margenIn !== null) { precio = precioDesdeMargen(costo, margenIn); margen = margenIn; }
    else agregarError('Falta el precio (o el margen para calcularlo)');

    // Fotos: por nombre de archivo, tienen que estar en el ZIP.
    const fotoDe = (texto, n) => {
      const nom = nombreBase(texto);
      if (!esArchivoImagen(nom)) { agregarError(`"${texto}" (fila ${n}) no es una imagen (jpg, png, webp o gif)`); return null; }
      const hallada = imagenes.get(clave(nom));
      if (!hallada) { agregarError(`La foto "${nom}" (fila ${n}) no está en el ZIP`); return null; }
      if (hallada.ambigua) { agregarError(`La foto "${nom}" (fila ${n}) está más de una vez en el ZIP, en carpetas distintas`); return null; }
      return hallada.nombre;
    };
    const fotos = [];
    const sumarFoto = (nombreReal) => { if (nombreReal && !fotos.some((x) => clave(x) === clave(nombreReal))) fotos.push(nombreReal); };
    if (fotoPrincipal) sumarFoto(fotoDe(fotoPrincipal, rows.find((r) => val(r.f, 'foto_principal'))?.numero ?? filasNums[0]));
    for (const r of rows) {
      for (const parte of val(r.f, 'fotos_extra').split('|').map(limpiar).filter(Boolean)) sumarFoto(fotoDe(parte, r.numero));
    }

    // Una fila por color: stock (entero, puede ser 0) y la foto de ese color.
    const lineas = [];
    const fotosColor = [];
    for (const r of rows) {
      const nomColor = val(r.f, 'color');
      let color = '';
      if (nomColor) {
        color = coloresCfg.get(clave(nomColor));
        if (!color) { agregarError(`El color "${nomColor}" (fila ${r.numero}) no existe en Configuración → Colores`); color = nomColor; }
      }
      if (lineas.some((l) => clave(l.color) === clave(color))) agregarError(`El color ${color ? `"${color}"` : '(vacío)'} está repetido (fila ${r.numero})`);
      const stockTxt = val(r.f, 'stock');
      const stock = stockTxt === '' ? 0 : numero(stockTxt);
      if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) agregarError(`El stock (fila ${r.numero}) tiene que ser un número entero, 0 o mayor`);
      const fotoColorTxt = val(r.f, 'foto_color');
      let fotoColor = '';
      if (fotoColorTxt) {
        if (!color) agregarError(`La fila ${r.numero} tiene foto_color pero no tiene color`);
        else { fotoColor = fotoDe(fotoColorTxt, r.numero) || ''; sumarFoto(fotoColor); }
      }
      lineas.push({ color, stock: Number.isFinite(stock) ? stock : 0, foto: fotoColor });
      if (color && fotoColor) fotosColor.push({ color, imagen: fotoColor });
    }
    if (fotos.length > MAX_IMAGENES_POR_PRODUCTO) agregarError(`Trae ${fotos.length} fotos y el máximo por producto es ${MAX_IMAGENES_POR_PRODUCTO}`);

    return {
      clave: clave(nombre) || `fila-${filasNums[0]}`,
      codigo,
      nombre,
      cat,
      subcat,
      subsubcat,
      desc,
      descLarga,
      notasInternas,
      costo: Number.isFinite(costo) ? costo : 0,
      precio,
      margen,
      colores: lineas,
      stockTotal: lineas.reduce((s, l) => s + l.stock, 0),
      imagenes: fotos,
      fotosColor,
      filas: filasNums,
      errores
    };
  });

  return { productos, sueltas };
}

// El producto tal como se guarda en la Biblioteca. `urls`: nombre de archivo → URL ya subida a Storage.
export function armarProducto(p, { id, fecha, urls }) {
  const imagenes = p.imagenes.map((n) => urls[n]).filter(Boolean);
  const coloresDelProducto = p.colores.filter((c) => c.color).map((c) => c.color);
  return {
    id,
    fechaGuardado: fecha,
    nombre: p.nombre,
    desc: p.desc,
    descLarga: p.descLarga,
    notasInternas: p.notasInternas,
    cat: p.cat || 'General',
    subcat: p.subcat,
    subsubcat: p.subcat ? p.subsubcat : '',
    imagenes,
    imagen: imagenes[0] || null,
    ...camposSinImpresion({ costo: p.costo, precio: p.precio, margen: p.margen }),
    stock: normalizarStock(p.colores.map((c) => ({ color: c.color, colorSecundario: '', cantidad: c.stock }))),
    fotosColor: p.fotosColor.filter((f) => urls[f.imagen]).map((f) => ({ color: f.color, colorSecundario: '', imagen: urls[f.imagen] })),
    // Con colores en el CSV, el catálogo ofrece sólo esos (tengan stock o no), no los de toda la Configuración.
    limitarColores: coloresDelProducto.length > 0,
    coloresElegidos: coloresDelProducto.map((color) => ({ color, colorSecundario: '' }))
  };
}

// Excel en español suele guardar el CSV en Windows-1252, no en UTF-8: si el texto no es UTF-8 válido se relee así.
function decodificarCSV(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// Abre el ZIP: el CSV y la lista de fotos (de cualquier carpeta; se ignoran los restos de macOS y los archivos ocultos).
// Devuelve { error } o { csv, imagenes: Map(clave → { nombre, ruta, ambigua }), zip }.
export async function leerZipProductos(buffer) {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { error: 'No se pudo abrir el archivo: tiene que ser un .zip válido.' };
  }
  const archivos = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(f.name));
  const csvs = archivos.filter((f) => /\.csv$/i.test(f.name));
  if (!csvs.length) return { error: 'El ZIP no tiene ningún archivo .csv. Descargá la plantilla para ver el formato.' };
  const profundidad = (f) => f.name.split('/').length;
  const menor = Math.min(...csvs.map(profundidad));
  const principales = csvs.filter((f) => profundidad(f) === menor);
  if (principales.length > 1) return { error: `El ZIP tiene más de un .csv (${principales.map((f) => nombreBase(f.name)).join(', ')}). Dejá sólo el de productos.` };

  const imagenes = new Map();
  for (const f of archivos.filter((x) => esArchivoImagen(x.name))) {
    const nombre = nombreBase(f.name);
    const k = clave(nombre);
    imagenes.set(k, imagenes.has(k) ? { ...imagenes.get(k), ambigua: true } : { nombre, ruta: f.name, ambigua: false });
  }
  const csv = decodificarCSV(await principales[0].async('uint8array'));
  return { csv, imagenes, zip };
}

// La foto como File, lista para comprimir y subir.
export async function archivoDeImagen(zip, entrada) {
  const blob = await zip.file(entrada.ruta).async('blob');
  return new File([blob], entrada.nombre, { type: mimeDeImagen(entrada.nombre) });
}

const FILAS_PLANTILLA = [
  COLUMNAS,
  ['T-500', 'Termo acero 500 ml', 'Regalos', 'Termos', '', 'Acero inoxidable', 'Mantiene el frío 12 horas', 'Proveedor Ejemplo', '8000', '50', '', 'Negro', '3', 'termo_negro.jpg', 'termo_detalle.jpg|termo_tapa.jpg', 'termo_negro.jpg'],
  ['T-500', '', '', '', '', '', '', '', '', '', '', 'Rojo', '0', '', '', 'termo_rojo.jpg'],
  ['M-01', 'Mate de madera', 'Regalos', '', '', '', '', '', '3500', '', '7000', '', '10', 'mate.jpg', '', '']
];

const LEEME = `CARGA MASIVA DE PRODUCTOS
=========================

1. Completá productos.csv en Excel (guardalo como CSV). Una fila por color.
2. Copiá las fotos a esta carpeta (o a cualquier otra dentro del ZIP) y escribí sus NOMBRES en el CSV, sin la ruta.
   Ejemplo: termo_negro.jpg
3. Volvé a armar el ZIP con productos.csv y las fotos, y cargalo en Biblioteca > Cargar productos desde ZIP.

Reglas
- Máximo ${MAX_PRODUCTOS_POR_CARGA} productos por carga y ${MAX_IMAGENES_POR_PRODUCTO} fotos por producto.
- El color tiene que existir en Configuración > Colores, con el mismo nombre. Si no existe, el producto se rechaza.
- Si ya tenés un producto con ese nombre en la Biblioteca, el producto se rechaza (no se pisa).
- Las filas del mismo producto llevan el mismo codigo (o el mismo nombre). En las filas siguientes alcanza con el codigo y el color:
  lo demás se puede dejar vacío. Si repetís un dato, tiene que ser igual.
- stock puede ser 0 o estar vacío.
- precio: si lo completás, manda. Si no, se calcula con costo + margen (en %).
- fotos_extra: varias fotos separadas con |   foto_color: la foto de ese color (también se suma a las fotos del producto).
- Fotos: jpg, png, webp o gif.
- Antes de importar vas a ver una vista previa y podés cancelar sin que se suba nada.
`;

// Plantilla: un ZIP con el CSV de ejemplo (separador ; y BOM para que Excel en español lo abra bien) y un LEEME.
export async function descargarPlantillaProductos() {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('productos.csv', BOM + FILAS_PLANTILLA.map((f) => f.join(';')).join('\r\n') + '\r\n');
  zip.file('LEEME.txt', LEEME);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-productos.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
