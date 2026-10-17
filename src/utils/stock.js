// Stock de productos terminados (para vender desde la tienda del catálogo web). Cada producto de la Biblioteca
// guarda `stock`: [{ color, colorSecundario, cantidad }], una línea por variante de color (sin color = '').
// Es distinto del Inventario de Compras, que lleva insumos (filamento, accesorios).
//
// En una compra de la tienda, cada variante pedida se reparte en "de stock" (lo que hay) y "a pedido" (el resto,
// que hay que fabricar): ver repartirConStock. Al confirmar la solicitud se descuenta lo que salió de stock.

const entero = (n) => Math.max(0, Math.floor(Number(n) || 0));
const clave = (color, sec) => `${String(color || '').trim()}\u0001${String(sec || '').trim()}`;

// Stock normalizado: sin líneas vacías ni repetidas (las repetidas se suman).
export function normalizarStock(stock) {
  const porClave = new Map();
  for (const l of Array.isArray(stock) ? stock : []) {
    const cantidad = entero(l?.cantidad);
    if (!cantidad) continue;
    const color = String(l?.color || '').trim();
    const colorSecundario = String(l?.colorSecundario || '').trim();
    const k = clave(color, colorSecundario);
    const previa = porClave.get(k);
    if (previa) previa.cantidad += cantidad;
    else porClave.set(k, { color, colorSecundario, cantidad });
  }
  return [...porClave.values()];
}

export const stockTotal = (stock) => normalizarStock(stock).reduce((s, l) => s + l.cantidad, 0);

export const stockDeVariante = (stock, color, colorSecundario) => (
  normalizarStock(stock).find((l) => clave(l.color, l.colorSecundario) === clave(color, colorSecundario))?.cantidad || 0
);

// "Rojo 3 · Azul + Blanco 2 · Sin color 1"
export function textoStock(stock) {
  return normalizarStock(stock)
    .map((l) => `${l.color ? l.color + (l.colorSecundario ? ` + ${l.colorSecundario}` : '') : 'Sin color'} ${l.cantidad}`)
    .join(' · ');
}

// Reparte lo pedido entre stock y pedido. `versiones`: [{ cantidad, color, colorSecundario }]. Si dos versiones
// piden la misma variante, el stock se va consumiendo en orden. Devuelve las mismas versiones con `deStock`
// (0..cantidad); lo que falta (cantidad - deStock) es a pedido.
export function repartirConStock(stock, versiones) {
  const restante = new Map(normalizarStock(stock).map((l) => [clave(l.color, l.colorSecundario), l.cantidad]));
  return (versiones || []).map((v) => {
    const cantidad = entero(v.cantidad);
    const k = clave(v.color, v.colorSecundario);
    const hay = restante.get(k) || 0;
    const deStock = Math.min(cantidad, hay);
    restante.set(k, hay - deStock);
    return { ...v, cantidad, deStock };
  });
}

// Stock después de sacar lo que se usó. `versiones` con `deStock`; nunca deja negativo.
export function descontarStock(stock, versiones) {
  const usado = new Map();
  for (const v of versiones || []) {
    const n = entero(v.deStock);
    if (!n) continue;
    const k = clave(v.color, v.colorSecundario);
    usado.set(k, (usado.get(k) || 0) + n);
  }
  return normalizarStock(stock)
    .map((l) => ({ ...l, cantidad: l.cantidad - Math.min(l.cantidad, usado.get(clave(l.color, l.colorSecundario)) || 0) }))
    .filter((l) => l.cantidad > 0);
}

// Al importar una solicitud de la tienda: cuánto de cada versión sale realmente de stock. El visitante manda
// `deStock` (lo que vio disponible), pero no es de fiar y el stock pudo cambiar: se toma lo MENOR entre lo que
// declaró y lo que hay ahora. Una solicitud del catálogo común (sin `deStock`) queda toda a pedido.
export function repartoParaImportar(stockReal, versiones) {
  const real = repartirConStock(stockReal, versiones);
  return real.map((v, i) => {
    const declarado = (versiones || [])[i]?.deStock;
    return { ...v, deStock: declarado === undefined ? 0 : Math.min(v.deStock, entero(declarado)) };
  });
}
