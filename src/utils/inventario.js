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
//
// La otra entrada es la carga inicial (movimiento 'inicial', importado de un
// CSV): lo que ya se tenía antes de empezar a cargar compras. Crea el
// artículo como una compra, pero no es un gasto, así que no va en Compras.

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

// Peso de un rollo cuando la compra no lo dice (compras anteriores al
// inventario en gramos).
export const PESO_ROLLO_DEFAULT = 1000;

// Entrada al inventario de una línea. El artículo es la combinación de
// categoría (o filamento) + nombre + marca + color. El filamento se lleva
// en gramos (rollos x peso por rollo); el resto, en unidades.
export function entrada(l) {
  const filamento = esLineaFilamento(l);
  const pesoRollo = filamento ? (Number(l.pesoRollo) || PESO_ROLLO_DEFAULT) : 1;
  return {
    clave: [filamento ? 'filamento' : claveArticulo(l.cat), claveArticulo(nombreBaseLinea(l)), claveArticulo(l.marca), claveArticulo(l.color)].join('|'),
    base: nombreBaseLinea(l),
    nombre: nombreArticulo(l),
    // Partes del artículo, para buscarlo al descontar un pedido.
    marca: limpiar(l.marca),
    color: limpiar(l.color),
    cat: filamento ? 'Filamento' : l.cat,
    filamento,
    unidad: filamento ? 'g' : 'u',
    pesoRollo,
    colorHex: l.colorHex || '',
    qty: (Number(l.qty) || 0) * pesoRollo,
    total: subtotalLinea(l)
  };
}

// Movimientos de inventario (users/{uid}/inventarioMovimientos): salidas y
// correcciones que no vienen de compras. `cantidad` va con signo y en la
// unidad del artículo (gramos para filamento, unidades para el resto).
//   tipo: 'consumo' (de un pedido) | 'ajuste' (conteo físico) | 'baja'
//         | 'inicial' (carga inicial: trae la línea del artículo en `linea`,
//           con el mismo formato que una línea de compra, y un `lote` por
//           importación)
export const TIPOS_MOVIMIENTO = { consumo: 'Consumo', ajuste: 'Ajuste', baja: 'Baja', inicial: 'Carga inicial' };

// Artículos del inventario con su stock, ordenados: primero filamentos y
// después el resto, cada grupo por nombre.
//   { clave, nombre, cat, filamento, unidad, pesoRollo, colorHex,
//     comprado, movido, stock, costoTotal, costoPromedio (por unidad),
//     valorStock, ultimaCompra, compras, historial }
// historial: entradas por compra y movimientos, del más nuevo al más viejo.
export function armarInventario(compras, movimientos = []) {
  const articulos = new Map();
  // Suma una entrada (línea de compra o de carga inicial) a su artículo.
  const sumarEntrada = (l, fecha, item) => {
    if (!CATEGORIAS_INVENTARIO.includes(l.cat)) return;
    const e = entrada(l);
    if (!e.base) return;
    const a = articulos.get(e.clave) || { ...e, comprado: 0, movido: 0, costoTotal: 0, ultimaCompra: '', compras: 0, historial: [] };
    a.comprado += e.qty;
    a.costoTotal += e.total;
    a.compras += 1;
    a.historial.push({ ...item, fecha, cantidad: e.qty });
    // Nombre, categoría, color y peso de rollo de la entrada más reciente.
    if (fecha >= a.ultimaCompra) {
      a.ultimaCompra = fecha || a.ultimaCompra;
      a.nombre = e.nombre;
      a.cat = e.cat;
      a.colorHex = e.colorHex || a.colorHex;
      a.pesoRollo = e.pesoRollo;
    }
    articulos.set(e.clave, a);
  };
  for (const c of compras || []) {
    if (!c.alInventario) continue;
    for (const l of lineasDeCompra(c)) sumarEntrada(l, c.fecha || '', { tipo: 'compra', nota: c.proveedor || '', compraId: c.id });
  }
  for (const m of movimientos || []) {
    if (m.tipo === 'inicial' && m.linea) sumarEntrada(m.linea, m.fecha || '', { tipo: 'inicial', nota: m.nota || '', id: m.id });
  }
  // Los movimientos de un artículo que ya no tiene compras (se borraron)
  // no crean un artículo nuevo: sin compras no hay de dónde descontar.
  for (const m of movimientos || []) {
    if (m.tipo === 'inicial') continue;
    const a = articulos.get(m.clave);
    if (!a) continue;
    a.movido += Number(m.cantidad) || 0;
    a.historial.push({ tipo: m.tipo, fecha: m.fecha || '', cantidad: Number(m.cantidad) || 0, nota: m.nota || '', pedidoId: m.pedidoId || null, id: m.id });
  }
  return [...articulos.values()]
    .map((a) => {
      const costoPromedio = a.comprado ? a.costoTotal / a.comprado : 0;
      const stock = a.comprado + a.movido;
      return {
        ...a,
        stock,
        costoPromedio,
        valorStock: Math.max(0, stock) * costoPromedio,
        historial: a.historial.sort((x, y) => (y.fecha || '').localeCompare(x.fecha || ''))
      };
    })
    .sort((x, y) => (x.filamento === y.filamento ? x.nombre.localeCompare(y.nombre, 'es') : x.filamento ? -1 : 1));
}

// Stock mínimo de un artículo, en su unidad:
//  - propio: cfg.inventarioMinimos[clave] (0 = sin mínimo a propósito);
//  - si no tiene propio (no está o es null): el mínimo por defecto de la
//    configuración, cfg.inventarioMinimoDefault = { g: gramos para
//    filamento, u: unidades para el resto }.
// Los equipos no llevan mínimo. Devuelve { minimo, porDefecto }.
export function minimoArticulo(cfg, a) {
  if (a.cat === 'Equipos') return { minimo: 0, porDefecto: false };
  const propio = (cfg?.inventarioMinimos || {})[a.clave];
  if (propio !== undefined && propio !== null) return { minimo: Number(propio) || 0, porDefecto: false };
  const defecto = Number((cfg?.inventarioMinimoDefault || {})[a.unidad === 'g' ? 'g' : 'u']) || 0;
  return { minimo: defecto, porDefecto: defecto > 0 };
}

// Un artículo está "bajo mínimo" cuando tiene mínimo y su stock quedó por debajo.
export const estaBajoMinimo = (cfg, a) => {
  const { minimo } = minimoArticulo(cfg, a);
  return minimo > 0 && a.stock < minimo;
};

// Cantidad con su unidad: "2.350 g" o "3 u.".
export function formatoCantidad(cantidad, unidad) {
  const n = Math.round((Number(cantidad) || 0) * 10) / 10;
  return `${n.toLocaleString('es-AR')} ${unidad === 'g' ? 'g' : 'u.'}`;
}
