// Consumo de inventario de un pedido: cuánto filamento (por color) e
// insumos usó, para descontarlo al completarlo o enviarlo.
//
// Los gramos por unidad salen de la pieza (las piezas nuevas los guardan al
// crearse, ver utils/piezaPedido.js) o, en pedidos anteriores, del producto
// de la Biblioteca con el mismo nombre. El color sale de cada versión de la
// pieza; en piezas multicolor (G-code de Bambu), de cada material.

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

// Líneas de filamento estimadas del pedido, agrupadas por color y tipo:
//   { clave, colorNombre, colorHex, tipo, gramos, piezas: [nombres], sinDatos }
// sinDatos: alguna pieza de esa línea no tiene gramos conocidos (se carga a mano).
// Insumos del pedido: { nombre, cantidad }.
export function estimarConsumoPedido(pedido, biblioteca, cfg) {
  const lineas = new Map();
  const agregar = ({ colorNombre, colorHex, tipo, gramos, pieza, sinDatos }) => {
    // Las piezas sin gramos conocidos van en su propia fila (por color),
    // así el aviso de "cargalos" no se mezcla con lo ya estimado.
    const clave = `${normal(colorNombre) || hex6(colorHex) || 'sin-color'}|${normal(tipo)}${sinDatos ? `|sin-datos|${normal(pieza)}` : ''}`;
    const l = lineas.get(clave) || { clave, colorNombre, colorHex, tipo, gramos: 0, piezas: [], sinDatos: false };
    l.gramos += gramos;
    if (!l.piezas.includes(pieza)) l.piezas.push(pieza);
    l.sinDatos = l.sinDatos || sinDatos;
    lineas.set(clave, l);
  };

  for (const pz of pedido?.piezas || []) {
    const prod = (biblioteca || []).find((b) => normal(b.nombre) === normal(pz.nombre));
    const desperdicio = Number(pz.desperdicio ?? prod?.desperdicio ?? cfg?.desperdicio ?? 0) || 0;
    const factor = 1 + desperdicio / 100;
    const materiales = pz.materiales || prod?.materiales || null;
    const multicolor = Array.isArray(materiales) && materiales.length > 1 && (pz.multiMat ?? prod?.multiMat ?? true);

    if (multicolor) {
      // Los colores vienen del archivo: cada material, por la cantidad total de la pieza.
      for (const m of materiales) {
        agregar({
          colorNombre: nombreDeHex(cfg?.colores, m.color),
          colorHex: m.color ? `#${hex6(m.color)}` : '',
          tipo: m.type || '',
          gramos: (Number(m.totalG) || 0) * factor * (Number(pz.cantidad) || 0),
          pieza: pz.nombre,
          sinDatos: !m.totalG
        });
      }
      continue;
    }

    const gramosUnidad = Number(pz.gramos ?? prod?.gramos) || Number(materiales?.[0]?.totalG) || 0;
    const tipo = materiales?.[0]?.type || pz.tipoFilamento || '';
    const versiones = pz.versiones?.length ? pz.versiones : [{ cantidad: pz.cantidad, color: '' }];
    for (const v of versiones) {
      agregar({
        colorNombre: v.color || '',
        colorHex: hexDeNombre(cfg?.colores, v.color),
        tipo,
        gramos: gramosUnidad * factor * (Number(v.cantidad) || 0),
        pieza: pz.nombre,
        sinDatos: !gramosUnidad
      });
    }
  }

  const insumos = (pedido?.insumos || [])
    .filter((i) => i.nombre)
    .map((i) => ({ nombre: i.nombre, cantidad: Number(i.qty) || 1 }));

  return {
    lineas: [...lineas.values()].map((l) => ({ ...l, gramos: Math.round(l.gramos) })),
    insumos
  };
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
