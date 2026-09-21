// Ruta de categorías (niveles ilimitados) de una pregunta frecuente.
// Preguntas nuevas guardan `categoriaPath` (array de segmentos) directo;
// preguntas viejas sólo tienen los campos planos `categoria`/`subcategoria`
// (de antes de que existiera la ruta libre) y no se migran en Firestore --
// se resuelven acá en cada lectura.
export function rutaDeFaq(item) {
  if (item.categoriaPath?.length) return item.categoriaPath;
  return [item.categoria || 'General', ...(item.subcategoria ? [item.subcategoria] : [])];
}

// Mismo criterio alfabético que el resto de la app (categoriaOrden.js), pero
// con collation numérica: "2. Calculadora" ordena antes que "10. Otro"
// comparando el número, no el primer caracter. Es lo que permite forzar un
// orden manual anteponiendo números al nombre, sin necesitar ningún modal
// de arrastrar/reordenar.
export function compararSegmentosCategoria(a, b) {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}
