import React from 'react';
import { useApp } from '../context/AppContext';
import { paletas, paletasList } from '../utils/paletas';

export default function ConfiguracionPage() {
  const { cfg, setCfg, showToast, setActivePage } = useApp();

  const handleUpdateField = (section, idx, field, value) => {
    setCfg(prev => {
      const list = [...prev[section]];
      if (field !== null) {
        list[idx] = { ...list[idx], [field]: value };
      } else {
        list[idx] = value;
      }
      return { ...prev, [section]: list };
    });
  };

  const handleDeleteItem = (section, idx) => {
    setCfg(prev => {
      const list = prev[section].filter((_, i) => i !== idx);
      return { ...prev, [section]: list };
    });
  };

  const handleAddItem = (section, defaultValue) => {
    setCfg(prev => {
      const list = [...(prev[section] || []), defaultValue];
      return { ...prev, [section]: list };
    });
  };

  const handleDefaultValueChange = (field, val) => {
    const num = parseFloat(val) || 0;
    setCfg(prev => ({ ...prev, [field]: num }));
  };

  const handleDefaultPrinterChange = (val) => {
    setCfg(prev => ({ ...prev, impresoraDefault: val }));
  };

  const handlePaletteSelect = (paletteId) => {
    setCfg(prev => ({ ...prev, palette: paletteId }));
  };

  const handleApplyDefaultsToCalc = () => {
    showToast('Defaults aplicados a la calculadora');
    setActivePage('calc');
  };

  return (
    <div className="page active">
      <div className="page-title">Configuración</div>
      <div className="page-sub">Filamentos, impresoras, insumos y valores por defecto.</div>

      <div className="grid2" style={{ alignItems: 'flex-start' }}>
        <div>
          {/* Filaments Config Card */}
          <div className="card">
            <div className="card-title">Filamentos</div>
            <div id="cfg-filamentos">
              {(cfg.filamentos || []).map((f, i) => (
                <div key={i} className="cfg-row">
                  <input 
                    type="text"
                    value={f.nombre} 
                    onChange={(e) => handleUpdateField('filamentos', i, 'nombre', e.target.value)} 
                  />
                  <input 
                    type="number" 
                    value={f.precio} 
                    onChange={(e) => handleUpdateField('filamentos', i, 'precio', parseFloat(e.target.value) || 0)} 
                  />
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('filamentos', i)}>✕</button>
                </div>
              ))}
            </div>
            <button 
              className="btn btn-sm" 
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => handleAddItem('filamentos', { nombre: 'Nuevo filamento', precio: 18000 })}
            >
              + Agregar
            </button>
          </div>

          {/* Printers Config Card */}
          <div className="card">
            <div className="card-title">Impresoras</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontFamily: 'var(--mono)' }}>
              Nombre · W · Mant $/h
            </div>
            <div id="cfg-impresoras">
              {(cfg.impresoras || []).map((imp, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 74px auto', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                  <input 
                    type="text"
                    value={imp.nombre} 
                    placeholder="Nombre"
                    onChange={(e) => handleUpdateField('impresoras', i, 'nombre', e.target.value)} 
                  />
                  <input 
                    type="number" 
                    value={imp.watts} 
                    placeholder="W" 
                    title="Watts" 
                    style={{ fontSize: '12px' }}
                    onChange={(e) => handleUpdateField('impresoras', i, 'watts', parseFloat(e.target.value) || 0)} 
                  />
                  <input 
                    type="number" 
                    value={imp.mant || 0} 
                    placeholder="$/h" 
                    title="Mant $/hora" 
                    style={{ fontSize: '12px' }}
                    onChange={(e) => handleUpdateField('impresoras', i, 'mant', parseFloat(e.target.value) || 0)} 
                  />
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('impresoras', i)}>✕</button>
                </div>
              ))}
            </div>
            <button 
              className="btn btn-sm" 
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => handleAddItem('impresoras', { nombre: 'Nueva impresora', watts: 150, mant: 100 })}
            >
              + Agregar
            </button>
          </div>

          {/* Color list config card */}
          <div className="card">
            <div className="card-title">Colores disponibles</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontFamily: 'var(--mono)' }}>
              Usados al armar versiones de un pedido
            </div>
            <div id="cfg-colores">
              {(cfg.colores || []).map((c, i) => (
                <div key={i} className="cfg-row" style={{ gridTemplateColumns: '1fr 46px auto' }}>
                  <input 
                    type="text"
                    value={c.nombre} 
                    onChange={(e) => handleUpdateField('colores', i, 'nombre', e.target.value)} 
                  />
                  <input 
                    type="color" 
                    value={c.hex || '#cccccc'} 
                    style={{ padding: '2px', height: '34px' }}
                    onChange={(e) => handleUpdateField('colores', i, 'hex', e.target.value)} 
                  />
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('colores', i)}>✕</button>
                </div>
              ))}
            </div>
            <button 
              className="btn btn-sm" 
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => handleAddItem('colores', { nombre: 'Nuevo color', hex: '#cccccc' })}
            >
              + Agregar
            </button>
          </div>

          {/* Shipping config card */}
          <div className="card">
            <div className="card-title">Métodos de envío</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontFamily: 'var(--mono)' }}>
              Opciones del envío en cada pedido
            </div>
            <div id="cfg-envios">
              {(cfg.metodosEnvio || []).map((m, i) => (
                <div key={i} className="cfg-row" style={{ gridTemplateColumns: '1fr auto' }}>
                  <input 
                    type="text"
                    value={m} 
                    onChange={(e) => handleUpdateField('metodosEnvio', i, null, e.target.value)} 
                  />
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('metodosEnvio', i)}>✕</button>
                </div>
              ))}
            </div>
            <button 
              className="btn btn-sm" 
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => handleAddItem('metodosEnvio', 'Nuevo método')}
            >
              + Agregar
            </button>
          </div>
        </div>

        {/* Right Side Defaults config */}
        <div>
          {/* Consumables (Insumos) card */}
          <div className="card">
            <div className="card-title">Insumos y accesorios</div>
            <div id="cfg-insumos">
              {(cfg.insumos || []).map((ins, i) => (
                <div key={i} className="cfg-row">
                  <input 
                    type="text"
                    value={ins.nombre} 
                    onChange={(e) => handleUpdateField('insumos', i, 'nombre', e.target.value)} 
                  />
                  <input 
                    type="number" 
                    value={ins.precio} 
                    onChange={(e) => handleUpdateField('insumos', i, 'precio', parseFloat(e.target.value) || 0)} 
                  />
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('insumos', i)}>✕</button>
                </div>
              ))}
            </div>
            <button 
              className="btn btn-sm" 
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => handleAddItem('insumos', { nombre: 'Nuevo insumo', precio: 500 })}
            >
              + Agregar
            </button>
          </div>

          {/* Default values configuration */}
          <div className="card">
            <div className="card-title">Valores por defecto</div>
            
            <label className="fl">Impresora por defecto</label>
            <select 
              value={cfg.impresoraDefault || ''} 
              onChange={(e) => handleDefaultPrinterChange(e.target.value)}
            >
              <option value="">— Ninguna —</option>
              {(cfg.impresoras || []).map((imp, i) => (
                <option key={i} value={i}>{imp.nombre}</option>
              ))}
            </select>
            
            <div className="sep"></div>
            
            <label className="fl">Electricidad ($/kWh)</label>
            <input 
              type="number" 
              value={cfg.kwh} 
              step="1" 
              onChange={(e) => handleDefaultValueChange('kwh', e.target.value)} 
            />
            
            <label className="fl">Mano de obra ($/hora)</label>
            <input 
              type="number" 
              value={cfg.mo} 
              step="50" 
              onChange={(e) => handleDefaultValueChange('mo', e.target.value)} 
            />
            
            <label className="fl">Paleta de colores</label>
            <select
              value={cfg.palette || 'mint'}
              onChange={(e) => setCfg(prev => ({ ...prev, palette: e.target.value }))}
            >
              {paletasList.map((paleta) => (
                <option key={paleta.id} value={paleta.id}>
                  {paleta.label}
                </option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', margin: '12px 0 0' }}>
              {paletasList.map((paleta) => {
                const paletaColores = paletas[paleta.id];
                const previewColors = [paletaColores.bg, paletaColores.accent, paletaColores.accent2, paletaColores.text, paletaColores.bg3];
                const isSelected = cfg.palette === paleta.id;
                return (
                  <button
                    key={paleta.id}
                    type="button"
                    onClick={() => handlePaletteSelect(paleta.id)}
                    style={{
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: '14px',
                      padding: '10px',
                      background: 'var(--bg3)',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      minHeight: '80px',
                      cursor: 'pointer',
                      transition: 'transform .15s ease, border-color .15s ease',
                      transform: isSelected ? 'scale(1.02)' : 'none'
                    }}
                  >
                    {previewColors.map((color, index) => (
                      <div key={index} style={{ background: color, borderRadius: '999px', minHeight: '14px' }} />
                    ))}
                    <span style={{ gridColumn: '1 / -1', fontSize: '11px', fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--text2)', marginTop: '4px', textAlign: 'center' }}>
                      {paleta.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="fl">Margen (%)</label>
            <input 
              type="number" 
              value={cfg.margen} 
              step="5" 
              onChange={(e) => handleDefaultValueChange('margen', e.target.value)} 
            />
            
            <label className="fl">Desperdicio (%)</label>
            <input 
              type="number" 
              value={cfg.desperdicio} 
              step="1" 
              onChange={(e) => handleDefaultValueChange('desperdicio', e.target.value)} 
            />
            
            <div className="sep"></div>
            <button 
              className="btn btn-primary btn-sm" 
              onClick={handleApplyDefaultsToCalc}
            >
              Aplicar a la calculadora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
