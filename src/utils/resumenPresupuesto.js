// Texto de la lista de presupuestos bajo el nombre del cliente: cuántos productos tiene y cuáles son.
// Sólo nombres de producto (items[].nombre), sin versiones ni colores. Si un producto se repite en varias
// líneas se muestra una sola vez.

export function productosDePresupuesto(presupuesto) {
  const vistos = new Set();
  const nombres = [];
  for (const it of presupuesto?.items || []) {
    const n = String(it?.nombre || '').trim();
    const clave = n.toLowerCase();
    if (!n || vistos.has(clave)) continue;
    vistos.add(clave);
    nombres.push(n);
  }
  return nombres;
}

// "3 productos · Llavero, Maceta, Soporte"
export function resumenDeProductos(presupuesto) {
  const cantidad = (presupuesto?.items || []).length;
  const base = `${cantidad} producto${cantidad !== 1 ? 's' : ''}`;
  const nombres = productosDePresupuesto(presupuesto);
  return nombres.length ? `${base} · ${nombres.join(', ')}` : base;
}
