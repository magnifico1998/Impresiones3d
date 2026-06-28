export const precioNeto = (p) => {
  if (!p) return 0;
  const precioVenta = parseFloat(p.precioVenta) || 0;
  const descuentoMonto = parseFloat(p.descuentoMonto) || 0;
  const descuentoPct = Math.max(0, Math.min(100, parseFloat(p.descuentoPct) || 0));
  const descuentoTotal = descuentoMonto > 0 ? descuentoMonto : (precioVenta * (descuentoPct / 100));
  return Math.max(0, precioVenta - descuentoTotal);
};

export default precioNeto;
