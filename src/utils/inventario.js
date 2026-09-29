// Inventario: se arma a partir de las compras marcadas "Sumar al inventario"
// (campo alInventario), sólo de las categorías que se inventarían. No se
// guarda aparte: si se edita o borra una compra, el stock se corrige solo.
//
// Las compras de filamento (subtipo 'Filamento') traen varias líneas en
// `items`; cada combinación tipo + marca + color es un artículo propio.

export const CATEGORIAS_INVENTARIO = ['Insumos', 'Accesorios'];

const limpiar = (texto) => String(texto || '').trim().replace(/\s+/g, ' ');

// Mismo artículo aunque cambien mayúsculas o espacios de más.
export const claveArticulo = (desc) => limpiar(desc).toLowerCase();

export const esCompraFilamento = (c) => c?.subtipo === 'Filamento' && Array.isArray(c.items);

export const nombreFilamento = (it) => [it.tipo, it.marca || 'Sin marca', it.color || 'Sin color'].map(limpiar).join(' · ');

// Descripción corta de una compra de filamentos para el listado de Compras.
export function resumenFilamentos(items) {
  if (items.length === 1) return `Filamento ${nombreFilamento(items[0])}`;
  const unidades = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  return `Filamentos (${unidades} u.): ${items.map((it) => `${[it.tipo, it.color].filter(Boolean).join(' ')} x${it.qty}`).join(', ')}`;
}

// Marcas de filamento ya cargadas en compras anteriores (para sugerirlas).
export function marcasUsadas(compras) {
  const marcas = new Map();
  for (const c of compras || []) {
    if (!esCompraFilamento(c)) continue;
    for (const it of c.items) {
      const marca = limpiar(it.marca);
      if (marca && !marcas.has(marca.toLowerCase())) marcas.set(marca.toLowerCase(), marca);
    }
  }
  return [...marcas.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

// Movimientos de entrada de una compra: uno por línea de filamento, o uno
// solo para una compra común.
function entradas(c) {
  if (esCompraFilamento(c)) {
    return c.items.map((it) => ({
      clave: `filamento|${claveArticulo(it.tipo)}|${claveArticulo(it.marca)}|${claveArticulo(it.color)}`,
      nombre: nombreFilamento(it),
      cat: 'Filamento',
      filamento: true,
      colorHex: it.colorHex || '',
      qty: Number(it.qty) || 0,
      total: (Number(it.qty) || 0) * (Number(it.precio) || 0)
    }));
  }
  const qty = Number(c.qty) || 0;
  return [{
    clave: claveArticulo(c.desc),
    nombre: limpiar(c.desc),
    cat: c.cat,
    filamento: false,
    colorHex: '',
    qty,
    total: Number(c.total ?? (Number(c.precio) || 0) * qty) || 0
  }];
}

// Artículos con su stock acumulado, ordenados: primero filamentos y después
// el resto, cada grupo por nombre.
//   { clave, nombre, cat, filamento, colorHex, cantidad, costoTotal, costoPromedio, ultimaCompra, compras }
export function armarInventario(compras) {
  const articulos = new Map();
  for (const c of compras || []) {
    if (!c.alInventario || !CATEGORIAS_INVENTARIO.includes(c.cat)) continue;
    for (const e of entradas(c)) {
      if (!e.clave) continue;
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
