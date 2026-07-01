import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const fmtNumber = (n) => typeof n === 'number' ? n.toFixed(2) : '—';

const getFilamentPriceKg = (product, cfg, type) => {
  if (!type) return null;
  const normalizedType = type.toLowerCase();
  const fil = (cfg.filamentos || []).find(f => {
    const name = (f.nombre || '').toLowerCase();
    return name.includes(normalizedType) || normalizedType.includes(name);
  });
  return fil ? parseFloat(fil.precio) || null : null;
};

const getFallbackMaterialCostFromFilDetalle = (product) => {
  if (!product.filDetalle || !Array.isArray(product.filDetalle)) return 0;
  return product.filDetalle.reduce((sum, item) => sum + (parseFloat(item.costo) || 0), 0);
};

const computeMaterialCost = (product, desperdicio, cfg) => {
  if (product.materiales && product.materiales.length > 0) {
    const total = product.materiales.reduce((sum, m, index) => {
      const qty = parseFloat(product.matData?.[index]?.totalG || m.totalG || 0) || 0;
      let priceKg = parseFloat(product.matData?.[index]?.precioKg || m.precioKg) || 0;
      if (!priceKg && m.type) {
        priceKg = getFilamentPriceKg(product, cfg, m.type) || 0;
      }
      return sum + (qty * (1 + desperdicio / 100) / 1000) * priceKg;
    }, 0);
    if (total > 0) return total;
  }

  const filDetalleCost = getFallbackMaterialCostFromFilDetalle(product);
  if (filDetalleCost > 0) return filDetalleCost;

  const gramos = parseFloat(product.gramos) || 0;
  let precioRollo = parseFloat(product.precioRollo) || 0;
  if (!precioRollo) {
    const inferredType = product.materiales?.[0]?.type || product.filDetalle?.[0]?.label || '';
    precioRollo = getFilamentPriceKg(product, cfg, inferredType) || 0;
  }
  return (gramos * (1 + desperdicio / 100) / 1000) * precioRollo;
};

const computeElectricityCost = (product, cfg) => {
  const hrs = parseFloat(product.horas) || 0;
  const watts = parseFloat(product.watts) || 0;
  const kwh = parseFloat(cfg.kwh) || 0;
  return (watts / 1000) * hrs * kwh;
};

const computeMaintCost = (product, cfg) => {
  const hrs = parseFloat(product.horas) || 0;
  let mantH = 0;
  if (product.impresoraNombre) {
    const printer = (cfg.impresoras || []).find(imp => imp.nombre === product.impresoraNombre);
    if (printer) mantH = parseFloat(printer.mant) || 0;
  }
  return mantH * hrs;
};

const computeLaborCost = (product) => {
  const moh = parseFloat(product.moHora) || 0;
  const hrsTrab = parseFloat(product.horasTrab) || 0;
  return moh * hrsTrab;
};

const computeExtrasCost = (product) => parseFloat(product.extras) || 0;

const calculateNewProduct = (product, cfg) => {
  const desperdicio = parseFloat(product.desperdicio) || parseFloat(cfg.desperdicio) || 0;
  const materialCost = computeMaterialCost(product, desperdicio);
  const elecCost = computeElectricityCost(product, cfg);
  const mantCost = computeMaintCost(product, cfg);
  const laborCost = computeLaborCost(product);
  const extraCost = computeExtrasCost(product);
  const costoPorUnidad = materialCost + elecCost + mantCost + laborCost + extraCost;

  const margin = Number.isFinite(parseFloat(product.margen)) ? parseFloat(product.margen) : parseFloat(cfg.margen) || 0;
  const precioSugerido = Math.round(costoPorUnidad * (1 + margin / 100));

  return {
    costoPorUnidad,
    precioSugerido,
    margin
  };
};

export default function ActualizacionMasivaPage() {
  const { biblioteca, setBiblioteca, cfg, showToast } = useApp();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [priceOverrides, setPriceOverrides] = useState({});

  const productsWithCalculation = useMemo(() => {
    return biblioteca.map(p => {
      const currentCost = parseFloat(p.costoUnitario) || 0;
      const currentPrice = parseFloat(p.precioSugUnitario) || 0;
      const salePrice = parseFloat(p.precioVenta) || currentPrice;
      const newCalc = calculateNewProduct(p, cfg);
      return {
        ...p,
        currentCost,
        currentPrice,
        currentSalePrice: salePrice,
        newCost: newCalc.costoPorUnidad,
        newPrice: newCalc.precioSugerido,
        currentMargin: Number.isFinite(parseFloat(p.margen)) ? parseFloat(p.margen) : cfg.margen,
        currentMaterialCost: computeMaterialCost(p, parseFloat(p.desperdicio) || parseFloat(cfg.desperdicio) || 0, cfg),
        currentElecCost: computeElectricityCost(p, cfg),
        currentMantCost: computeMaintCost(p, cfg),
        currentLaborCost: computeLaborCost(p),
        currentExtraCost: computeExtrasCost(p)
      };
    });
  }, [biblioteca, cfg]);

  const handleToggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handlePriceOverrideChange = (id, value) => {
    setPriceOverrides(prev => ({ ...prev, [id]: value }));
  };

  const getPriceFor = (product) => {
    const overrideValue = priceOverrides[product.id];
    const parsed = parseFloat(overrideValue);
    return Number.isFinite(parsed) ? parsed : product.newPrice;
  };

  const handleRecalculateSingle = (id) => {
    setBiblioteca(prev => prev.map(p => {
      if (p.id !== id) return p;
      const { costoPorUnidad, precioSugerido } = calculateNewProduct(p, cfg);
      const manualPrice = priceOverrides[p.id];
      const finalPrice = Number.isFinite(parseFloat(manualPrice)) ? parseFloat(manualPrice) : precioSugerido;
      return {
        ...p,
        costoUnitario: Number.isFinite(costoPorUnidad) ? Number(costoPorUnidad.toFixed(2)) : p.costoUnitario,
        precioSugUnitario: Number.isFinite(finalPrice) ? Number(finalPrice) : p.precioSugUnitario
      };
    }));
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(biblioteca.map(p => p.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleRecalculateSelected = () => {
    if (!selectedIds.size) {
      showToast('Seleccioná al menos un producto.', 'error');
      return;
    }

    setBiblioteca(prev => prev.map(p => {
      if (!selectedIds.has(p.id)) return p;
      const { costoPorUnidad, precioSugerido } = calculateNewProduct(p, cfg);
      const manualPrice = priceOverrides[p.id];
      const finalPrice = Number.isFinite(parseFloat(manualPrice)) ? parseFloat(manualPrice) : precioSugerido;
      return {
        ...p,
        costoUnitario: Number.isFinite(costoPorUnidad) ? Number(costoPorUnidad.toFixed(2)) : p.costoUnitario,
        precioSugUnitario: Number.isFinite(finalPrice) ? Number(finalPrice) : p.precioSugUnitario
      };
    }));

    showToast(`Actualizados ${selectedIds.size} producto${selectedIds.size > 1 ? 's' : ''}.`);
  };

  return (
    <div className="page active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <div>
          <div className="page-title">Actualización masiva de costos</div>
          <div className="page-sub">Seleccioná los productos y recalculá costo y precio estimado con los valores actuales de materiales e insumos.</div>
        </div>
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={handleSelectAll}>Seleccionar todo</button>
          <button className="btn btn-sm" onClick={handleDeselectAll}>Deseleccionar</button>
          <button className="btn btn-primary btn-sm" onClick={handleRecalculateSelected} disabled={!selectedIds.size}>Recalcular seleccionados</button>
          <span style={{ fontSize: '13px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          Se usan estos valores globales para la recalculación: electricidad ${fmt(cfg.kwh)} / mano de obra ${fmt(cfg.mo)} / margen {cfg.margen}% / desperdicio {cfg.desperdicio}%.
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '1320px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>#</th>
              <th style={headerCellStyle}>Producto</th>
              <th style={headerCellStyle}>Cant.</th>
              <th style={headerCellStyle}>Horas</th>
              <th style={headerCellStyle}>Gramos</th>
              <th style={headerCellStyle}>Precio rollo</th>
              <th style={headerCellStyle}>Watts</th>
              <th style={headerCellStyle}>Extras</th>
              <th style={headerCellStyle}>Costo actual</th>
              <th style={headerCellStyle}>Costo recalculado</th>
              <th style={headerCellStyle}>Precio estimado actual</th>
              <th style={headerCellStyle}>Precio estimado nuevo</th>
              <th style={headerCellStyle}>Precio real</th>
              <th style={headerCellStyle}>Actualizar</th>
            </tr>
          </thead>
          <tbody>
            {productsWithCalculation.map((p, index) => (
              <tr key={p.id} style={index % 2 === 1 ? { background: '#f8f8fa' } : undefined}>
                <td style={bodyCellStyle}>{index + 1}</td>
                <td style={{ ...bodyCellStyle, minWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => handleToggle(p.id)} style={{ accentColor: 'var(--accent)' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                      {p.desc && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{p.desc}</div>}
                      {p.materiales && p.materiales.length > 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                          {p.materiales.length} material{p.materiales.length > 1 ? 'es' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={bodyCellStyle}>{p.cantidad || 1}</td>
                <td style={bodyCellStyle}>{fmtNumber(p.horas)}</td>
                <td style={bodyCellStyle}>{fmtNumber(p.gramos)}</td>
                <td style={bodyCellStyle}>{fmtNumber(p.precioRollo)}</td>
                <td style={bodyCellStyle}>{fmtNumber(p.watts)}</td>
                <td style={bodyCellStyle}>{fmtNumber(p.extras)}</td>
                <td style={bodyCellStyle}>{fmt(p.currentCost)}</td>
                <td style={bodyCellStyle}>{fmt(p.newCost)}</td>
                <td style={bodyCellStyle}>{fmt(p.currentPrice)}</td>
                <td style={bodyCellStyle}>
                  <input
                    type="number"
                    value={priceOverrides[p.id] !== undefined ? priceOverrides[p.id] : p.newPrice}
                    onChange={(e) => handlePriceOverrideChange(p.id, e.target.value)}
                    style={{ width: '100px', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: '#111' }}
                  />
                </td>
                <td style={bodyCellStyle}>{fmt(p.currentSalePrice)}</td>
                <td style={bodyCellStyle}><button className="btn btn-sm" onClick={() => handleRecalculateSingle(p.id)}>Actualizar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const headerCellStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '12px',
  color: '#111',
  borderBottom: '1px solid #a1a1aa'
};

const bodyCellStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid #d1d5db',
  fontSize: '13px',
  color: '#111'
};
