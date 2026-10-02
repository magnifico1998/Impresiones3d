// Carga inicial del inventario desde un CSV: lo que ya se tenía antes de
// empezar a cargar compras. Cada fila válida se convierte en una línea con
// el mismo formato que una línea de compra (ver utils/inventario.js), que
// se guarda como movimiento 'inicial'.
//
// Columnas (la primera fila es el encabezado; el orden no importa y no se
// distinguen mayúsculas ni acentos):
//   categoria       Filamento, Insumo, Accesorio, Equipo u Otro (obligatoria)
//   nombre          en filamento, el tipo (PLA, PETG...); en el resto, la
//                   descripción (obligatoria)
//   marca           opcional
//   color           opcional (en filamento conviene: con él se descuenta al
//                   completar pedidos)
//   cantidad        unidades; en filamento, rollos (admite decimales: 0,5
//                   es medio rollo) (obligatoria)
//   peso_rollo_g    sólo filamento, gramos por rollo (por defecto 1000)
//   costo_unitario  por unidad o por rollo, opcional (sin costo, el stock
//                   entra con valor 0)
//
// El separador puede ser ; (el de Excel en español), coma o tabulación.

import { PESO_ROLLO_DEFAULT } from './inventario';

// Marca de orden de bytes (BOM): Excel la necesita para abrir un CSV en UTF-8.
const BOM = String.fromCharCode(0xFEFF);

const CATEGORIAS_CSV = {
  filamento: { cat: 'Insumos', subtipo: 'Filamento' },
  filamentos: { cat: 'Insumos', subtipo: 'Filamento' },
  insumo: { cat: 'Insumos', subtipo: null },
  insumos: { cat: 'Insumos', subtipo: null },
  accesorio: { cat: 'Accesorios', subtipo: null },
  accesorios: { cat: 'Accesorios', subtipo: null },
  equipo: { cat: 'Equipos', subtipo: null },
  equipos: { cat: 'Equipos', subtipo: null },
  otro: { cat: 'Otros', subtipo: null },
  otros: { cat: 'Otros', subtipo: null }
};

const COLUMNAS = ['categoria', 'nombre', 'marca', 'color', 'cantidad', 'peso_rollo_g', 'costo_unitario'];
const OBLIGATORIAS = ['categoria', 'nombre', 'cantidad'];

const normal = (t) => String(t || '').trim().toLowerCase()
  .normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[\s-]+/g, '_');

const limpiar = (t) => String(t || '').trim().replace(/\s+/g, ' ');

// Número escrito como en Excel en español ("1.250,50") o con punto decimal
// ("1250.5"). Un punto seguido de exactamente tres dígitos es de miles
// ("1.250" = 1250). Vacío = null; texto que no es número = NaN.
export function leerNumeroCSV(t) {
  let s = String(t ?? '').trim().replace(/\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}

// Separa el texto en filas y celdas, respetando comillas ("a; b" es una
// sola celda y "" dentro de comillas es una comilla).
function partirCSV(texto) {
  const primera = texto.split(/\r?\n/)[0] || '';
  const cuenta = (c) => primera.split(c).length - 1;
  const sep = [';', '\t', ','].sort((a, b) => cuenta(b) - cuenta(a))[0];
  const filas = [];
  let fila = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += ch;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim()));
}

// Lee el CSV. Devuelve { error } si no se puede leer el encabezado, o
// { filas: [{ numero (de fila en el archivo), linea, error }] }: las que
// tienen error no se importan.
export function leerCSVInventario(texto, colores = []) {
  const filas = partirCSV(String(texto || '').replace(BOM, ''));
  if (filas.length < 2) return { error: 'El archivo no tiene filas para importar (la primera fila es el encabezado).' };
  const encabezado = filas[0].map(normal);
  const faltan = OBLIGATORIAS.filter((c) => !encabezado.includes(c));
  if (faltan.length) return { error: `Faltan columnas en el encabezado: ${faltan.join(', ')}. Descargá la plantilla para ver el formato.` };
  const col = Object.fromEntries(COLUMNAS.map((c) => [c, encabezado.indexOf(c)]));
  const valor = (f, c) => (col[c] >= 0 ? limpiar(f[col[c]]) : '');

  return {
    filas: filas.slice(1).map((f, i) => {
      const numero = i + 2;
      const clase = CATEGORIAS_CSV[normal(valor(f, 'categoria'))];
      const nombre = valor(f, 'nombre');
      const cantidad = leerNumeroCSV(valor(f, 'cantidad'));
      const costo = leerNumeroCSV(valor(f, 'costo_unitario'));
      const peso = leerNumeroCSV(valor(f, 'peso_rollo_g'));
      let error = '';
      if (!clase) error = `Categoría "${valor(f, 'categoria')}" no válida (Filamento, Insumo, Accesorio, Equipo u Otro)`;
      else if (!nombre) error = 'Falta el nombre';
      else if (cantidad === null || Number.isNaN(cantidad) || cantidad <= 0) error = 'La cantidad tiene que ser un número mayor a 0';
      else if (Number.isNaN(costo) || costo < 0) error = 'El costo unitario no es un número válido';
      else if (clase.subtipo && (Number.isNaN(peso) || (peso !== null && peso <= 0))) error = 'El peso del rollo no es un número válido';
      if (error) return { numero, linea: null, error };

      const color = valor(f, 'color');
      const colorCfg = colores.find((c) => normal(c.nombre) === normal(color));
      const linea = {
        cat: clase.cat,
        subtipo: clase.subtipo,
        marca: valor(f, 'marca'),
        color,
        colorHex: colorCfg?.hex || '',
        qty: cantidad,
        precio: costo || 0
      };
      if (clase.subtipo) {
        linea.tipo = nombre;
        linea.pesoRollo = peso || PESO_ROLLO_DEFAULT;
      } else {
        linea.desc = nombre;
      }
      return { numero, linea, error: '' };
    })
  };
}

// Plantilla para completar en Excel: separador ; y BOM para que Excel en
// español la abra con acentos y en columnas.
export function plantillaCSVInventario() {
  const filas = [
    COLUMNAS,
    ['Filamento', 'PLA', 'Grilon3', 'Blanco', '3', '1000', '18000'],
    ['Filamento', 'PETG', 'Printalot', 'Negro', '0,5', '1000', '22000'],
    ['Insumo', 'Adhesivo de cama', '', '', '2', '', '3500'],
    ['Accesorio', 'Boquilla 0.4', 'Bambu', '', '4', '', '6000'],
    ['Equipo', 'Bambu Lab A1', 'Bambu', '', '1', '', '450000']
  ];
  return BOM + filas.map((f) => f.join(';')).join('\r\n') + '\r\n';
}

// Baja la plantilla como archivo (botón en el Inventario y en el modal de
// importación).
export function descargarPlantillaInventario() {
  const blob = new Blob([plantillaCSVInventario()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-inventario-inicial.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
