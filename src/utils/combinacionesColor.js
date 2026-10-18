// Combinaciones de colores predefinidas (Configuración → Combinaciones de colores): pares { color, colorSecundario }.
// En los selectores de color de una versión (pedido, armar pedido, agregar pieza) se ofrecen como un grupo
// aparte: elegir una carga los DOS colores a la vez, para no dejar la combinación a medias.

export const valorCombinacion = (indice) => `combo:${indice}`;

// Si `valor` es una combinación elegida (valor "combo:N"), devuelve sus dos colores; si no, null.
export function combinacionElegida(valor, combinaciones) {
  const m = /^combo:(\d+)$/.exec(String(valor || ''));
  const c = m ? (combinaciones || [])[Number(m[1])] : null;
  return c ? { color: c.color || '', colorSecundario: c.colorSecundario || '' } : null;
}

export const textoCombinacion = (c) => [c?.color, c?.colorSecundario].filter(Boolean).join(' + ');
