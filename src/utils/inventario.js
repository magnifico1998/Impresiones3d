// Compras e inventario.
//
// Una compra es un ingreso con una o más líneas (`lineas`), cada una con su
// categoría: así un mismo pedido al proveedor con filamentos y boquillas es
// un solo ingreso. Todas las líneas tienen los mismos datos: nombre (en
// filamento, el tipo de Configuración → Filamentos; en el resto, una
// descripción), marca, color, cantidad y precio. Las de filamento son
// categoría Insumos con subtipo 'Filamento'.
//
// Compras guardadas antes de las líneas se siguen leyendo igual (ver
// lineasDeCompra): las comunes son una línea, y las de filamento con
// `items` son varias líneas de filamento.
//
// El inventario se arma a partir de las compras marcadas "Sumar al
// inventario" (alInventario), con todas las líneas salvo impuestos: algunas
// cosas se consumen y otras no, pero sirve saber que se tienen. No se
// guarda aparte: si se edita o borra una compra, el stock se corrige solo.

export const CATEGORIAS = ['Insumos', 'Equipos', 'Accesorios', 'Impuestos', 'Otros'];
export const CATEGORIAS_INVENTARIO = ['Insumos', 'Accesorios', 'Equipos', 'Otros'];

const limpiar = (texto) => String(texto || '').trim().replace(/\s+/g, ' ');

// Mismo artículo aunque cambien mayúsculas o espacios de más.
export const claveArticulo = (desc) => limpiar(desc).toLowerCase();

export const esLineaFilamento = (l) => l?.subtipo === 'Filamento';

// Nombre base de una línea: el tipo en filamento, la descripción en el resto.
export const nombreBaseLinea = (l) => limpiar(esLineaFilamento(l) ? l.tipo : l.desc);

// Nombre completo del artículo: "PLA · Grilon3 · Blanco", "Boquilla 0.4 · Bambu".
export const nombreArticulo = (l) => [nombreBaseLinea(l), limpiar(l.marca), limpiar(l.color)].filter(Boolean).join(' · ');

export const nombreLinea = (l) => (esLineaFilamento(l) ? `Filamento ${nombreArticulo(l)}` : nombreArticulo(l) || 'Sin descripción');

// Líneas de una compra, sea cual sea su formato.
export function lineasDeCompra(c) {
  if (!c) return [];
  if (Array.isArray(c.lineas)) return c.lineas;
  if (c.subtipo === 'Filamento' && Array.isArray(c.items)) {
    return c.items.map((it) => ({ ...it, cat: 'Insumos', subtipo: 'Filamento' }));
  }
  return [{ cat: c.cat, subtipo: null, desc: c.desc, qty: Number(c.qty) || 0, precio: Number(c.precio) || 0 }];
}

export const subtotalLinea = (l) => (Number(l.qty) || 0) * (Number(l.precio) || 0);

// Total de la compra: el guardado, o la suma de las líneas.
export const totalCompra = (c) => Number(c.total) || lineasDeCompra(c).reduce((s, l) => s + subtotalLinea(l), 0);

// Categorías de una compra (sin repetir, en el orden de las líneas).
export const categoriasDeCompra = (c) => [...new Set(lineasDeCompra(c).map((l) => l.cat).filter(Boolean))];

// Descripción corta de una compra para los listados.
export function resumenCompra(lineas) {
  if (lineas.length === 1) return nombreLinea(lineas[0]);
  const unidades = lineas.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const detalle = lineas.map((l) => `${[nombreBaseLinea(l), limpiar(l.color)].filter(Boolean).join(' ')} x${l.qty}`).join(', ');
  const texto = `${lineas.length} ítems (${unidades} u.): ${detalle}`;
  return texto.length > 140 ? texto.slice(0, 137) + '…' : texto;
}

// Une listas de textos sin repetir (sin distinguir mayúsculas ni espacios),
// conservando cómo se escribió la primera vez, y las ordena. Se usa para
// marcas y para los artículos de cada categoría.
export function juntarMarcas(...listas) {
  const marcas = new Map();
  for (const lista of listas) {
    for (const m of lista || []) {
      const limpia = limpiar(m);
      if (limpia && !marcas.has(limpia.toLowerCase())) marcas.set(limpia.toLowerCase(), limpia);
    }
  }
  return [...marcas.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

// Marcas ya cargadas en compras anteriores (de cualquier categoría).
export function marcasUsadas(compras) {
  return juntarMarcas((compras || []).flatMap((c) => lineasDeCompra(c).map((l) => l.marca)));
}

// Movimiento de entrada al inventario de una línea. El artículo es la
// combinación de categoría (o filamento) + nombre + marca + color.
function entrada(l) {
  const filamento = esLineaFilamento(l);
  return {
    clave: [filamento ? 'filamento' : claveArticulo(l.cat), claveArticulo(nombreBaseLinea(l)), claveArticulo(l.marca), claveArticulo(l.color)].join('|'),
    base: nombreBaseLinea(l),
    nombre: nombreArticulo(l),
    cat: filamento ? 'Filamento' : l.cat,
    filamento,
    colorHex: l.colorHex || '',
    qty: Number(l.qty) || 0,
    total: subtotalLinea(l)
  };
}

// Artículos con su stock acumulado, ordenados: primero filamentos y después
// el resto, cada grupo por nombre.
//   { clave, nombre, cat, filamento, colorHex, cantidad, costoTotal, costoPromedio, ultimaCompra, compras }
export function armarInventario(compras) {
  const articulos = new Map();
  for (const c of compras || []) {
    if (!c.alInventario) continue;
    for (const l of lineasDeCompra(c)) {
      if (!CATEGORIAS_INVENTARIO.includes(l.cat)) continue;
      const e = entrada(l);
      if (!e.base) continue;
      const a = articulos.get(e.clave) || { ...e, cantidad: 0, costoTotal: 0, ultimaCompra: '', compras: 0 };
      a.cantidad += e.qty;
      a.costoTotal += e.total;
      a.compras += 1;
      // Nombre, categoría y color de la compra más reciente.
      if ((c.fecha || '') >= a.ultimaCompra) {
        a.ultimaCompra = c.fecha || a.ultimaCompra;
        a.nombre = e.nombre;
        a.cat = e.cat;
        a.colorHex = e.colorHex || a.colorHex;
      }
      articulos.set(e.clave, a);
    }
  }
  return [...articulos.values()]
    .map((a) => ({ ...a, costoPromedio: a.cantidad ? a.costoTotal / a.cantidad : 0 }))
    .sort((x, y) => (x.filamento === y.filamento ? x.nombre.localeCompare(y.nombre, 'es') : x.filamento ? -1 : 1));
}
