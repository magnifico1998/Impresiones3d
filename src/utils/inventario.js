// Inventario: se arma a partir de las compras marcadas "Sumar al inventario"
// (campo alInventario), sólo de las categorías que se inventarían. No se
// guarda aparte: si se edita o borra una compra, el stock se corrige solo.

export const CATEGORIAS_INVENTARIO = ['Insumos', 'Accesorios'];

// Mismo artículo aunque cambien mayúsculas o espacios de más.
export const claveArticulo = (desc) => String(desc || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Artículos con su stock acumulado, ordenados por nombre.
//   { clave, nombre, cat, cantidad, costoTotal, costoPromedio, ultimaCompra, compras }
export function armarInventario(compras) {
  const articulos = new Map();
  for (const c of compras || []) {
    if (!c.alInventario || !CATEGORIAS_INVENTARIO.includes(c.cat)) continue;
    const clave = claveArticulo(c.desc);
    if (!clave) continue;
    const qty = Number(c.qty) || 0;
    const total = Number(c.total ?? (Number(c.precio) || 0) * qty) || 0;
    const nombre = c.desc.trim().replace(/\s+/g, ' ');
    const a = articulos.get(clave) || { clave, nombre, cat: c.cat, cantidad: 0, costoTotal: 0, ultimaCompra: '', compras: 0 };
    a.cantidad += qty;
    a.costoTotal += total;
    a.compras += 1;
    // Nombre y categoría de la compra más reciente.
    if ((c.fecha || '') >= a.ultimaCompra) {
      a.ultimaCompra = c.fecha || a.ultimaCompra;
      a.nombre = nombre;
      a.cat = c.cat;
    }
    articulos.set(clave, a);
  }
  return [...articulos.values()]
    .map((a) => ({ ...a, costoPromedio: a.cantidad ? a.costoTotal / a.cantidad : 0 }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
}
