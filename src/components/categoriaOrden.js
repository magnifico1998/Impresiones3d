/**
 * Ordena una lista de nombres de categoría según un orden manual guardado
 * (cfg.categoriaOrden), con fallback alfabético.
 *
 * - Las categorías presentes en `orden` van primero, respetando esa posición.
 * - Las categorías que no están en `orden` (por ejemplo una categoría nueva
 *   creada después de guardar el orden) se agregan al final, ordenadas
 *   alfabéticamente entre sí.
 * - Si no hay orden guardado (o está vacío), el resultado es puramente
 *   alfabético — mismo comportamiento que antes de esta función existir.
 *
 * Usado tanto por la UI (Biblioteca) como por la generación del PDF, para
 * que el orden que el usuario arma arrastrando categorías sea siempre el
 * mismo que termina viéndose en el listado descargado.
 *
 * @param {string[]} categorias - nombres de categoría a ordenar
 * @param {string[]} [orden] - orden manual guardado (cfg.categoriaOrden)
 * @returns {string[]} nueva lista ordenada
 */
export function ordenarCategorias(categorias, orden) {
  const alfabetico = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });

  if (!orden || orden.length === 0) {
    return [...categorias].sort(alfabetico);
  }

  const posicion = new Map(orden.map((cat, i) => [cat, i]));

  return [...categorias].sort((a, b) => {
    const posA = posicion.has(a) ? posicion.get(a) : Infinity;
    const posB = posicion.has(b) ? posicion.get(b) : Infinity;
    if (posA !== posB) return posA - posB;
    return alfabetico(a, b);
  });
}
