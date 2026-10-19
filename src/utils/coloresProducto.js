// Colores con los que se ofrece un producto en el catálogo y la tienda. Con muchos colores en Configuración, cada
// producto puede limitarse a los que realmente tiene: en Biblioteca → editar producto → "Colores y fotos", se marcan
// los colores y se activa "Mostrar en el catálogo sólo los colores marcados" (`limitarColores`). Los marcados se
// guardan en `coloresElegidos`: [{ color, colorSecundario }]. Va aparte de la foto: un color marcado se ofrece
// tenga o no foto asignada. Sin la opción activada, o sin ningún color marcado, se ofrecen todos (como siempre).

const limpio = (s) => String(s || '').trim();

export const hayLimiteDeColores = (producto) => !!producto?.limitarColores && (producto.coloresElegidos || []).length > 0;

// Color suelto (modo "libre" o sin color 2).
export function colorPermitido(producto, nombre) {
  if (!hayLimiteDeColores(producto)) return true;
  const n = limpio(nombre);
  return producto.coloresElegidos.some((e) => limpio(e.color) === n && !limpio(e.colorSecundario));
}

// Combinación de dos colores (modo "combinaciones").
export function combinacionPermitida(producto, color, colorSecundario) {
  if (!hayLimiteDeColores(producto)) return true;
  const c = limpio(color);
  const s = limpio(colorSecundario);
  return producto.coloresElegidos.some((e) => limpio(e.color) === c && limpio(e.colorSecundario) === s);
}

export const estaMarcado = (lista, color, colorSecundario) =>
  (lista || []).some((e) => limpio(e.color) === limpio(color) && limpio(e.colorSecundario) === limpio(colorSecundario));

// Marca o desmarca un color (o combinación) en la lista.
export function marcarColor(lista, color, colorSecundario, marcado) {
  const c = limpio(color);
  const s = limpio(colorSecundario);
  const resto = (lista || []).filter((e) => !(limpio(e.color) === c && limpio(e.colorSecundario) === s));
  return marcado ? [...resto, { color: c, colorSecundario: s }] : resto;
}

// ¿El producto ofrece colores para elegir? (con combinaciones, alguna; si no, algún color suelto).
export function ofreceColores(producto, colores, combinaciones) {
  if (producto?.modoColorSecundario === 'combinaciones') {
    return (combinaciones || []).some((c) => combinacionPermitida(producto, c.color, c.colorSecundario));
  }
  return (colores || []).some((c) => colorPermitido(producto, c.nombre));
}

// Antes de confirmar una compra en el catálogo: cuántas versiones quedaron sin color elegido. Una versión sin color
// es válida si el producto no ofrece colores, o si esa cantidad sale entera de stock "sin color" (`deStock` >= cantidad).
export function versionesSinColor(producto, versiones, colores, combinaciones) {
  if (!ofreceColores(producto, colores, combinaciones)) return 0;
  return (versiones || []).filter((v) => (Number(v.cantidad) || 0) > 0 && !String(v.color || '').trim() && !((Number(v.deStock) || 0) >= (Number(v.cantidad) || 0) && (Number(v.deStock) || 0) > 0)).length;
}
