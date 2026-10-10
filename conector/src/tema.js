// Tema (colores) que la app le deja al conector en su documento de la nube: se limpia antes de usarlo, porque llega
// de afuera y termina en el estilo del panel. Sólo nombres de color simples y valores hex o rgb(a).
const NOMBRE = /^[a-zA-Z][a-zA-Z0-9]{0,19}$/;
const VALOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9 ,.%]{1,40}\))$/;

export function sanearTema(tema) {
  if (!tema || typeof tema !== 'object' || Array.isArray(tema)) return null;
  const limpio = {};
  for (const [k, v] of Object.entries(tema).slice(0, 40)) {
    if (NOMBRE.test(k) && typeof v === 'string' && VALOR.test(v.trim())) limpio[k] = v.trim();
  }
  return Object.keys(limpio).length ? limpio : null;
}
