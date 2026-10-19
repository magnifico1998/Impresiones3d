// Productos "sin impresión" (reventa) de la Biblioteca: cosas que el negocio vende pero no imprime. Se guardan con
// `tipo: 'reventa'`, un costo de compra (`costoUnitario`) y un precio de venta (`precioSugUnitario`), que son los dos
// únicos números que leen pedidos, presupuestos, stock y catálogo. No llevan gramos, horas ni impresora, y por eso
// NUNCA entran al recálculo por insumos de impresión ("Actualizar precios"): su costo se cambia a mano.

export const TIPO_SIN_IMPRESION = 'reventa';

export const esSinImpresion = (producto) => producto?.tipo === TIPO_SIN_IMPRESION;

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Precio recomendado: costo + margen sobre el costo (misma cuenta que el margen de la Calculadora).
export const precioDesdeMargen = (costo, margenPct) => redondear((Number(costo) || 0) * (1 + (Number(margenPct) || 0) / 100));

// Margen que resulta de un precio dado. Sin costo no hay margen que calcular.
export const margenDesdePrecio = (costo, precio) => {
  const c = Number(costo) || 0;
  if (c <= 0) return 0;
  return Math.round((((Number(precio) || 0) - c) / c) * 1000) / 10;
};

// Lo que se guarda en la Biblioteca. Los campos de impresión quedan en cero/vacíos a propósito: los lugares que los
// leen (capacidad de producción, descuento de filamento, G-code) los interpretan como "no aplica".
export function camposSinImpresion({ costo, precio, margen }) {
  const costoUnitario = redondear(costo);
  const precioSugUnitario = redondear(precio);
  return {
    tipo: TIPO_SIN_IMPRESION,
    costoUnitario,
    precioSugUnitario,
    margen: margen ?? margenDesdePrecio(costoUnitario, precioSugUnitario),
    cantidad: 1,
    horas: 0,
    horasTrab: 0,
    gramos: 0,
    extras: 0,
    costeIns: 0,
    impresoraNombre: null,
    filDetalle: [],
    materiales: null,
    matData: null,
    multiMat: false
  };
}
