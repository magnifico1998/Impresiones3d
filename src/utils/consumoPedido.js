// Consumo de inventario de un pedido: cuánto filamento (por color) e
// insumos usó, para descontarlo al completarlo o enviarlo.
//
// Los gramos por unidad salen de la pieza (las piezas nuevas los guardan al
// crearse, ver utils/piezaPedido.js) o, en pedidos anteriores, del producto
// de la Biblioteca con el mismo nombre. El color sale de cada versión de la
// pieza; en piezas multicolor (G-code de Bambu) se reparte cada material
// entre los colores de la versión (ver estimarConsumoPedido).

const normal = (t) => String(t || '').trim().toLowerCase();
const hex6 = (h) => String(h || '').replace('#', '').slice(0, 6).toLowerCase();

// Nombre del color de la configuración con ese código (piezas multicolor,
// donde el archivo trae el color como código).
function nombreDeHex(colores, hex) {
  const c = (colores || []).find((x) => typeof x !== 'string' && hex6(x.hex) === hex6(hex));
  return c ? c.nombre : '';
}

function hexDeNombre(colores, nombre) {
  const c = (colores || []).find((x) => (typeof x === 'string' ? x : x.nombre) && normal(typeof x === 'string' ? x : x.nombre) === normal(nombre));
  return c && typeof c !== 'string' ? c.hex : '';
}

// Líneas de filamento estimadas del pedido: una por versión de cada pieza
// y, en las multicolor, una por material de esa versión.
//   { clave, pieza, version (texto), primeraDeVersion, filasVersion,
//     colorNombre, colorHex, tipo, gramos, sinDatos,
//     material: null | { numero, colorHex (del archivo) } }
// El color de cada línea es el de la versión: en las multicolor, el
// material con más gramos va al "Color" de la versión y el siguiente a
// "Color 2" (los demás, o si la versión no tiene ese color cargado, quedan
// con el color del archivo). Es una estimación: el rollo de cada línea se
// elige en el modal.
// sinDatos: la pieza no tiene gramos conocidos (se cargan a mano).
// Insumos del pedido: { nombre, cantidad }.
export function estimarConsumoPedido(pedido, biblioteca, cfg) {
  const lineas = [];

  (pedido?.piezas || []).forEach((pz, ip) => {
    const prod = (biblioteca || []).find((b) => normal(b.nombre) === normal(pz.nombre));
    const desperdicio = Number(pz.desperdicio ?? prod?.desperdicio ?? cfg?.desperdicio ?? 0) || 0;
    const factor = 1 + desperdicio / 100;
    const materiales = pz.materiales || prod?.materiales || null;
    const multicolor = Array.isArray(materiales) && materiales.length > 1 && (pz.multiMat ?? prod?.multiMat ?? true);
    const versiones = pz.versiones?.length ? pz.versiones : [{ cantidad: pz.cantidad, color: '', colorSecundario: '' }];

    // Materiales de mayor a menor peso: el primero es el color principal.
    const porPeso = multicolor
      ? materiales.map((m, i) => ({ ...m, numero: i + 1 })).sort((a, b) => (Number(b.totalG) || 0) - (Number(a.totalG) || 0))
      : null;
    const gramosUnidad = Number(pz.gramos ?? prod?.gramos) || Number(materiales?.[0]?.totalG) || 0;
    const tipoUnico = materiales?.[0]?.type || pz.tipoFilamento || '';

    versiones.forEach((v, iv) => {
      const cantidad = Number(v.cantidad) || 0;
      const coloresVersion = [v.color, v.colorSecundario].filter(Boolean).join(' + ');
      const version = `${cantidad} u.${coloresVersion ? ` · ${coloresVersion}` : ''}`;
      const base = { pieza: pz.nombre, version };
      const filas = multicolor
        ? porPeso.map((m, im) => {
          const delArchivo = nombreDeHex(cfg?.colores, m.color);
          const deVersion = im === 0 ? v.color : im === 1 ? v.colorSecundario : '';
          const colorNombre = deVersion || delArchivo;
          return {
            ...base,
            colorNombre,
            // Con color de la versión, su muestra (o ninguna si no está en
            // Configuración): la del archivo sería de otro color.
            colorHex: deVersion ? hexDeNombre(cfg?.colores, deVersion) : (m.color ? `#${hex6(m.color)}` : ''),
            tipo: m.type || '',
            gramos: (Number(m.totalG) || 0) * factor * cantidad,
            sinDatos: !m.totalG,
            material: { numero: m.numero, colorHex: m.color ? `#${hex6(m.color)}` : '' }
          };
        })
        : [{
          ...base,
          colorNombre: v.color || '',
          colorHex: hexDeNombre(cfg?.colores, v.color),
          tipo: tipoUnico,
          gramos: gramosUnidad * factor * cantidad,
          sinDatos: !gramosUnidad,
          material: null
        }];
      filas.forEach((f, i) => lineas.push({
        ...f,
        clave: `${ip}|${iv}|${i}`,
        primeraDeVersion: i === 0,
        filasVersion: filas.length,
        gramos: Math.round(f.gramos)
      }));
    });
  });

  const insumos = (pedido?.insumos || [])
    .filter((i) => i.nombre)
    .map((i) => ({ nombre: i.nombre, cantidad: Number(i.qty) || 1 }));

  return { lineas, insumos };
}

// Artículo del inventario propuesto para una línea de filamento: mismo
// color (por nombre o, si no, por código) y, si se conoce, mismo tipo. Entre
// varios, el de más stock. Devuelve la clave o ''.
export function sugerirFilamento(linea, articulos) {
  const filamentos = articulos.filter((a) => a.filamento);
  let candidatos = linea.colorNombre
    ? filamentos.filter((a) => normal(a.color) === normal(linea.colorNombre))
    : filamentos.filter((a) => linea.colorHex && hex6(a.colorHex) === hex6(linea.colorHex));
  if (linea.tipo) {
    const t = normal(linea.tipo);
    const porTipo = candidatos.filter((a) => normal(a.base).includes(t) || t.includes(normal(a.base)));
    if (porTipo.length) candidatos = porTipo;
  }
  return candidatos.sort((a, b) => b.stock - a.stock)[0]?.clave || '';
}

// Artículo (no filamento) con el mismo nombre que un insumo del pedido.
export function sugerirInsumo(insumo, articulos) {
  return articulos
    .filter((a) => !a.filamento && normal(a.base) === normal(insumo.nombre))
    .sort((a, b) => b.stock - a.stock)[0]?.clave || '';
}

// ¿El pedido ya tiene consumos registrados? (para no descontar dos veces)
export const consumosDelPedido = (movimientos, pedidoId) =>
  (movimientos || []).filter((m) => m.tipo === 'consumo' && String(m.pedidoId) === String(pedidoId));

export const ESTADOS_QUE_CONSUMEN = ['completado', 'enviado'];
