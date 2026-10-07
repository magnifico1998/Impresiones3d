// Tamaño del logo de la empresa en los PDF (presupuesto, pedido y listado de
// productos). Se elige en Mi emprendimiento → Logo y se guarda en empresa.logoPdfTamano
// (mm). El logo siempre entra entero en una caja cuadrada de ese tamaño, sin deformarse:
// uno rectangular queda más chico que uno cuadrado, y se agranda subiendo el tamaño.

export const TAMANOS_LOGO_PDF = [
  { mm: 10, nombre: 'Chico' },
  { mm: 14, nombre: 'Mediano' },
  { mm: 20, nombre: 'Grande' },
  { mm: 28, nombre: 'Extra grande' }
];
export const LOGO_PDF_POR_DEFECTO = 14;

export const tamanoLogoPdfDe = (empresa) => {
  const n = Number(empresa?.logoPdfTamano);
  return Number.isFinite(n) && n > 0 ? Math.min(32, Math.max(8, Math.round(n))) : LOGO_PDF_POR_DEFECTO;
};

// Medidas del logo para que entre en la caja conservando su proporción.
export function ajustarLogo(ancho, alto, caja) {
  if (!ancho || !alto) return { w: caja, h: caja };
  const proporcion = ancho / alto;
  return proporcion >= 1 ? { w: caja, h: caja / proporcion } : { w: caja * proporcion, h: caja };
}
