// Foto de cada color de un producto (Biblioteca → editar producto → "Foto de cada color"): en la tienda, al elegir un
// color se muestra la foto que le corresponde. Se guarda en el producto como `fotosColor`:
// [{ color, colorSecundario, imagen }], donde `imagen` es una de las URL de `imagenes` del mismo producto.

const limpio = (s) => String(s || '').trim();

// Foto para una variante: primero la de esa combinación exacta (color + color 2); si no hay, la del color solo.
export function fotoDeColor(fotosColor, color, colorSecundario) {
  const lista = Array.isArray(fotosColor) ? fotosColor : [];
  const c = limpio(color);
  const s = limpio(colorSecundario);
  if (!c) return '';
  const exacta = lista.find((f) => limpio(f.color) === c && limpio(f.colorSecundario) === s);
  if (exacta?.imagen) return exacta.imagen;
  const solo = s ? lista.find((f) => limpio(f.color) === c && !limpio(f.colorSecundario)) : null;
  return solo?.imagen || '';
}

// Para guardar: sólo las que apuntan a una imagen que el producto todavía tiene, sin repetir variante.
export function normalizarFotosColor(fotosColor, imagenes) {
  const validas = new Set(imagenes || []);
  const vistas = new Set();
  const res = [];
  for (const f of Array.isArray(fotosColor) ? fotosColor : []) {
    const color = limpio(f?.color);
    const colorSecundario = limpio(f?.colorSecundario);
    const clave = `${color}\u0001${colorSecundario}`;
    if (!color || !validas.has(f?.imagen) || vistas.has(clave)) continue;
    vistas.add(clave);
    res.push({ color, colorSecundario, imagen: f.imagen });
  }
  return res;
}

// Cambia (o quita, con imagen vacía) la foto de una variante.
export function ponerFotoColor(fotosColor, color, colorSecundario, imagen) {
  const c = limpio(color);
  const s = limpio(colorSecundario);
  const resto = (Array.isArray(fotosColor) ? fotosColor : []).filter((f) => !(limpio(f.color) === c && limpio(f.colorSecundario) === s));
  return imagen ? [...resto, { color: c, colorSecundario: s, imagen }] : resto;
}
