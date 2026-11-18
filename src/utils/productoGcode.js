// Junta los archivos importados en un solo producto. De los .3mf de Bambu
// sólo cuentan las placas tildadas: los gramos por material y el tiempo
// salen de ellas, así tildar o destildar una placa cambia el costo.
export const buildCompositeGcode = (items) => {
  if (!items || !items.length) return null;
  const isAllBambu = items.every(item => item.tipo === 'bambu');

  const composite = {
    tipo: isAllBambu ? 'bambu' : 'gcode',
    nombre: items.length === 1 ? items[0].nombre : `Producto compuesto (${items.length})`,
    placas: [],
    matMap: {},
    totalSeg: 0,
    gramos: 0,
    tiempo: 0,
    filamento: null
  };

  items.forEach(item => {
    if (item.tipo === 'bambu') {
      const placas = (item.placas || []).map(p => ({ ...p, sel: p.sel !== false }));
      composite.placas = [...composite.placas, ...placas];
      placas.filter(p => p.sel).forEach(p => {
        composite.totalSeg += p.pred || 0;
        // Un archivo de Bambu mezclado con G-codes sueltos suma sus gramos y su tiempo al total.
        composite.tiempo += (p.pred || 0) / 3600;
        (p.fils || []).forEach(f => {
          const k = `${f.type}|${f.color}`;
          composite.matMap[k] = composite.matMap[k] || { type: f.type, color: f.color, totalG: 0, precioKg: item.matMap?.[k]?.precioKg || 0 };
          composite.matMap[k].totalG += f.usedG || 0;
          composite.matMap[k].precioKg = composite.matMap[k].precioKg || item.matMap?.[k]?.precioKg || 0;
          composite.gramos += f.usedG || 0;
        });
      });
    } else {
      composite.gramos += item.gramos || 0;
      composite.tiempo += item.tiempo || 0;
      if (!composite.filamento && item.filamento) {
        composite.filamento = item.filamento;
      }
    }
  });

  return composite;
};
