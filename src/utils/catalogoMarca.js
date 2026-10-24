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

// Mensaje que ve el visitante cuando el catálogo está desactivado (Catálogo web → "Mensaje del catálogo desactivado").
// Se guarda en catalogoTiendas/{uid} (mantenimientoTitulo, mantenimientoTexto); sin nada guardado, se muestra el de siempre.
export const TITULO_MANTENIMIENTO_POR_DEFECTO = 'Estamos en mantenimiento';
export const TEXTO_MANTENIMIENTO_POR_DEFECTO = 'Estamos preparando novedades para vos.\nVolvé a visitarnos pronto, ¡te vamos a sorprender!';
export const MAX_CARACTERES_TITULO_MANTENIMIENTO = 60;
export const MAX_CARACTERES_TEXTO_MANTENIMIENTO = 300;
export const MAX_LINEAS_TEXTO_MANTENIMIENTO = 5;

// Lo que la tienda escribió (sin el valor por defecto): el título en una línea, y el texto en hasta 5 líneas y 300
// caracteres, sin líneas vacías ni espacios de más. Vacío = no personalizó nada.
export const tituloMantenimientoPropio = (config) => String(config?.mantenimientoTitulo ?? '')
  .replace(/\s+/g, ' ').trim().slice(0, MAX_CARACTERES_TITULO_MANTENIMIENTO);
export const textoMantenimientoPropio = (config) => String(config?.mantenimientoTexto ?? '')
  .split(/\r?\n/)
  .map((linea) => linea.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .slice(0, MAX_LINEAS_TEXTO_MANTENIMIENTO)
  .join('\n')
  .slice(0, MAX_CARACTERES_TEXTO_MANTENIMIENTO);

// Lo que se muestra: lo propio o, si está vacío, el de siempre.
export const tituloMantenimientoDe = (config) => tituloMantenimientoPropio(config) || TITULO_MANTENIMIENTO_POR_DEFECTO;
export const textoMantenimientoDe = (config) => textoMantenimientoPropio(config) || TEXTO_MANTENIMIENTO_POR_DEFECTO;

// Para el campo de texto mientras se escribe: corta lo que pasa de 5 líneas o de 300 caracteres, sin sacar los espacios.
export const recortarBorradorTextoMantenimiento = (texto) => String(texto ?? '')
  .split(/\r?\n/)
  .slice(0, MAX_LINEAS_TEXTO_MANTENIMIENTO)
  .join('\n')
  .slice(0, MAX_CARACTERES_TEXTO_MANTENIMIENTO);

// Mezcla de dos colores hex: `pct` % de `a` y el resto de `b` (devuelve un hex).
export function mezclarHex(a, b, pct) {
  const leer = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const x = leer(a); const y = leer(b);
  if (!x || !y) return a;
  const t = Math.max(0, Math.min(100, pct)) / 100;
  return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}

// Los dos textos secundarios de una paleta del catálogo: los elegidos o, en catálogos con la paleta guardada
// antes de poder elegirlos, una mezcla del texto con el fondo (así nunca quedan ilegibles sobre un fondo distinto
// del de siempre). text2 = textos de apoyo (75 % texto); text3 = etiquetas y la frase de arriba (60 % texto).
export function textosSecundariosDe(paleta) {
  const p = paleta || {};
  return {
    text2: p.text2 || (p.text && p.bg ? mezclarHex(p.text, p.bg, 75) : undefined),
    text3: p.text3 || (p.text && p.bg ? mezclarHex(p.text, p.bg, 60) : undefined)
  };
}
