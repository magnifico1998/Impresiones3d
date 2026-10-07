// Marca del catálogo web: tamaño del logo y texto destacado (eslogan / gancho
// comercial, en hasta 3 líneas y con tamaño a elección, debajo del nombre). Se eligen en Catálogo web → "Marca del catálogo" y se guardan en
// catalogoTiendas/{uid} (logoTamano, eslogan, esloganTamano); el catálogo público los lee ahí.

export const TAMANOS_LOGO = [
  { px: 40, nombre: 'Chico' },
  { px: 64, nombre: 'Mediano' },
  { px: 96, nombre: 'Grande' },
  { px: 128, nombre: 'Extra grande' }
];
export const LOGO_POR_DEFECTO = 40;
// Hasta este tamaño el encabezado queda fijo arriba al desplazar; más grande se
// va con la página para no tapar la pantalla del celular.
export const LOGO_MAX_ENCABEZADO_FIJO = 64;
// El texto destacado: hasta 3 líneas, de hasta 60 caracteres cada una.
export const MAX_LINEAS_ESLOGAN = 3;
export const MAX_CARACTERES_LINEA = 60;
export const TAMANOS_ESLOGAN = [
  { px: 11, nombre: 'Chico' },
  { px: 14, nombre: 'Mediano' },
  { px: 18, nombre: 'Grande' },
  { px: 24, nombre: 'Extra grande' }
];
export const ESLOGAN_TAMANO_POR_DEFECTO = 14;
// La frase de siempre: va debajo de la línea divisoria del encabezado.
export const TEXTO_ENCABEZADO_POR_DEFECTO = 'Elegí tus productos y armá tu pedido';

// Tamaño elegido, siempre dentro de lo razonable aunque el dato venga raro.
export const tamanoLogoDe = (config) => {
  const n = Number(config?.logoTamano);
  return Number.isFinite(n) && n > 0 ? Math.min(160, Math.max(24, Math.round(n))) : LOGO_POR_DEFECTO;
};

// Texto destacado limpio: hasta 3 líneas de hasta 60 caracteres, sin líneas vacías
// y con los espacios de más sacados. Las líneas van separadas por saltos de línea.
export const esloganDe = (config) => String(config?.eslogan ?? '')
  .split(/\r?\n/)
  .map((linea) => linea.replace(/\s+/g, ' ').trim().slice(0, MAX_CARACTERES_LINEA))
  .filter(Boolean)
  .slice(0, MAX_LINEAS_ESLOGAN)
  .join('\n');

// Para el campo de texto mientras se escribe: corta lo que pasa de 3 líneas o de
// 60 caracteres por línea, sin sacar los espacios (se limpian recién al guardar).
export const recortarBorradorEslogan = (texto) => String(texto ?? '')
  .split(/\r?\n/)
  .slice(0, MAX_LINEAS_ESLOGAN)
  .map((linea) => linea.slice(0, MAX_CARACTERES_LINEA))
  .join('\n');

// Tamaño del texto destacado, siempre dentro de lo razonable.
export const esloganTamanoDe = (config) => {
  const n = Number(config?.esloganTamano);
  return Number.isFinite(n) && n > 0 ? Math.min(32, Math.max(10, Math.round(n))) : ESLOGAN_TAMANO_POR_DEFECTO;
};
