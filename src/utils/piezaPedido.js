// Armado de piezas de pedido (pedido.piezas[]) a partir de lo que las
// origina: un producto de la Biblioteca, un cálculo de la Calculadora o una
// línea libre. Lo comparten ModalArmarPedido (Biblioteca -> pedido) y la
// aprobación de un presupuesto (PresupuestosPage), para que un pedido nazca
// igual sin importar desde dónde se creó.
//
// En todas, `precioVenta` es el precio UNITARIO de la pieza (mismo criterio
// que ModalAgregarPieza.jsx) y `versiones` arranca con una sola versión por
// la cantidad total si no se pasan otras.

// Datos de filamento de la pieza (del producto de la Biblioteca o del
// cálculo), para descontar el inventario al completar el pedido (ver
// utils/consumoPedido.js). Firestore rechaza undefined: todo cae a un
// valor definido.
export const datosConsumoPieza = (fuente) => ({
  gramos: Number(fuente?.gramos) || 0,
  desperdicio: Number(fuente?.desperdicio) || 0,
  materiales: Array.isArray(fuente?.materiales) ? fuente.materiales : null,
  multiMat: !!fuente?.multiMat
});

const versionesDePieza = (versiones, cantidad) =>
  (versiones && versiones.length ? versiones : [{ cantidad, color: '', colorSecundario: '', comentario: '' }])
    .map(v => ({
      id: Date.now() + Math.random(),
      cantidad: v.cantidad,
      color: v.color || '',
      colorSecundario: v.colorSecundario || '',
      comentario: v.comentario || '',
      realizados: 0
    }));

// Producto de la Biblioteca: recalcula electricidad, mantenimiento y mano
// de obra con los datos guardados del producto y la config actual.
export function piezaDesdeBiblioteca(prod, { id, nombre, cantidad, precioUnitario, versiones }, cfg) {
  const horas = prod.horas || 0;
  const watts = prod.watts || 0;
  const precioKwh = prod.precioKwh || cfg.kwh || 0;
  const moHora = prod.moHora || 0;
  const horasTrab = prod.horasTrab || 0;
  const costeElec = (watts / 1000) * horas * precioKwh;
  const costeMO = moHora * horasTrab;

  let mant = 0;
  if (prod.impresoraNombre) {
    const imp = (cfg.impresoras || []).find(i => i.nombre === prod.impresoraNombre);
    if (imp) mant = imp.mant || 0;
  }
  const costeMant = mant * horas;

  return {
    id,
    // De qué producto de la Biblioteca salió: con eso el pedido sabe si tiene
    // archivos G-code para mandar a la impresora (src/utils/archivosGcode.js).
    bibliotecaId: prod.id ?? null,
    nombre,
    archivoNombre: prod.gcodeNombre || null,
    gcodeArchivos: prod.gcodeArchivos || null,
    filDetalle: prod.filDetalle || [],
    ...datosConsumoPieza(prod),
    costeElec,
    costeMant,
    costeMO,
    horas,
    impresoraNombre: prod.impresoraNombre || null,
    costoUnitario: prod.costoUnitario || 0,
    precioEstimado: precioUnitario,
    precioVenta: precioUnitario || prod.precioSugUnitario || 0,
    cantidad,
    elaborados: 0,
    notas: '',
    versiones: versionesDePieza(versiones, cantidad)
  };
}

// Resultado de la Calculadora (el objeto currentPresupuesto de
// CalculadoraPage.jsx, o la copia que guarda un presupuesto): mismos
// campos que arma ModalAgregarPieza.jsx.
export function piezaDesdeCalculadora(calc, { id, nombre, cantidad, precioUnitario, versiones }) {
  return {
    id,
    nombre,
    archivoNombre: calc.nombreArchivo || null,
    gcodeArchivos: calc.gcodeArchivos || null,
    costeFil: calc.costeFil || 0,
    filDetalle: calc.filDetalle || [],
    ...datosConsumoPieza(calc),
    costeElec: calc.costeElec || 0,
    costeMant: calc.costeMant || 0,
    costeMO: calc.costeMO || 0,
    horas: calc.horas || 0,
    impresoraNombre: calc.impresoraNombre || null,
    costoUnitario: calc.total || 0,
    precioVenta: precioUnitario || 0,
    cantidad,
    elaborados: 0,
    notas: '',
    versiones: versionesDePieza(versiones, cantidad)
  };
}

// Línea tipeada a mano (sin costos conocidos).
export function piezaLibre({ id, nombre, cantidad, precioUnitario }) {
  return {
    id,
    nombre: nombre || 'Producto',
    archivoNombre: null,
    gcodeArchivos: null,
    filDetalle: [],
    costeElec: 0,
    costeMant: 0,
    costeMO: 0,
    horas: 0,
    impresoraNombre: null,
    costoUnitario: 0,
    precioVenta: precioUnitario || 0,
    cantidad,
    elaborados: 0,
    notas: '',
    versiones: versionesDePieza(null, cantidad)
  };
}
