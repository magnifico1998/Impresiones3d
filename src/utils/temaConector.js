import { paletas } from './paletas';

// Paleta que se ve en la app ahora (la elegida más los retoques de "Paleta personalizada"), lista para mandarle al
// conector: mismos nombres de color que las variables CSS (--bg, --accent…). Misma regla que AppContext al aplicarla:
// el "Fondo" retocado también es el fondo de tarjetas y encabezado (bg2).
export function paletaEfectiva(cfg) {
  const base = paletas[cfg?.palette] || paletas.lagoon;
  const custom = cfg?.paletaCustom || {};
  const paleta = { ...base, ...custom };
  if (custom.bg) paleta.bg2 = custom.bg;
  return paleta;
}
