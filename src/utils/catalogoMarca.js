// Marca del catálogo web: tamaño del logo y texto destacado (eslogan / gancho
// comercial, que ocupa el lugar de "Elegí tus productos y armá tu pedido" bajo el
// nombre). Se eligen en Catálogo web → "Marca del catálogo" y se guardan en
// catalogoTiendas/{uid} (logoTamano, eslogan); el catálogo público los lee ahí.

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
export const MAX_ESLOGAN = 120;
// Lo que dice el encabezado debajo del nombre si la tienda no cargó un texto propio.
export const TEXTO_ENCABEZADO_POR_DEFECTO = 'Elegí tus productos y armá tu pedido';

// Tamaño elegido, siempre dentro de lo razonable aunque el dato venga raro.
export const tamanoLogoDe = (config) => {
  const n = Number(config?.logoTamano);
  return Number.isFinite(n) && n > 0 ? Math.min(160, Math.max(24, Math.round(n))) : LOGO_POR_DEFECTO;
};

export const esloganDe = (config) => String(config?.eslogan ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ESLOGAN);
