import React from 'react';
import { useApp } from '../context/AppContext';
import { paletas, paletasList } from '../utils/paletas';

export default function ConfiguracionPage() {
  const { cfg, setCfg } = useApp();

  const handleUpdateField = (section, idx, field, value) => {
    setCfg(prev => {
      const list = [...prev[section]];
      if (field !== null) {
        // Compatibilidad: si el item todavía es un string viejo (caso de
        // metodosEnvio antes de tener URL de seguimiento), lo normalizamos
        // a objeto antes de aplicarle el campo nuevo. Si ya es objeto, el
        // spread de un string no rompe nada porque nunca se llega acá.
        const base = typeof list[idx] === 'string' ? { nombre: list[idx] } : list[idx];
        list[idx] = { ...base, [field]: value };
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

  // Los 5 colores que se pueden retocar a mano en la tarjeta "Paleta
  // personalizada" (los mismos que se ven en la vista previa de cada
  // paleta de acá arriba). Se guardan aparte en cfg.paletaCustom y se
  // aplican por encima de la paleta base (ver AppContext.jsx) -- así no
  // hace falta duplicar los otros 13 roles (border, warn, danger, etc.)
  // para poder tocar sólo estos 5.
  const ROLES_PERSONALIZABLES = ['bg', 'accent', 'accent2', 'text', 'bg3'];

  const handlePaletteSelect = (paletteId) => {
    const base = paletas[paletteId];
    setCfg(prev => ({
      ...prev,
      palette: paletteId,
      // Al elegir una paleta nueva, la personalizada arranca de cero desde
      // los valores de ESA paleta (pisa cualquier retoque anterior) -- es
      // el punto de partida que se puede volver a editar después.
      paletaCustom: Object.fromEntries(ROLES_PERSONALIZABLES.map(k => [k, base[k]]))
    }));
  };

  const handleCustomColorChange = (role, hex) => {
    setCfg(prev => {
      const base = paletas[prev.palette] || paletas.lagoon;
      const actual = prev.paletaCustom || Object.fromEntries(ROLES_PERSONALIZABLES.map(k => [k, base[k]]));
      return { ...prev, paletaCustom: { ...actual, [role]: hex } };
    });
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
            <div className="cfg-row" style={{ marginBottom: '0px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              <span>Filamento</span>
              <span style={{ textAlign: 'center' }}>Monto</span>
              {/* Botón invisible idéntico al de abajo: la columna "auto" de
                  cada .cfg-row mide según SU PROPIO contenido (cada fila es
                  su propia grilla), así que si acá va vacío esa columna da
                  ~0px y corre todo lo demás -- con el mismo botón (oculto)
                  la columna mide exactamente igual que en las filas reales. */}
              <button className="btn btn-danger btn-sm" style={{ visibility: 'hidden' }} tabIndex={-1} aria-hidden="true">✕</button>
            </div>
            <div id="cfg-filamentos">
              {(cfg.filamentos || []).map((f, i) => (
                <div key={i} className="cfg-row">
                  <input
                    type="text"
                    value={f.nombre}
                    onChange={(e) => handleUpdateField('filamentos', i, 'nombre', e.target.value)}
                  />
                  <div className="input-money">
                    <span className="input-money-prefix">$</span>
                    <input
                      type="number"
                      value={f.precio}
                      onChange={(e) => handleUpdateField('filamentos', i, 'precio', parseFloat(e.target.value) || 0)}
                    />
                  </div>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px auto', gap: '6px', marginBottom: '0px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              <span>Impresora</span>
              <span style={{ textAlign: 'center' }}>Consumo</span>
              <span style={{ textAlign: 'center' }}>Amortización</span>
              <button className="btn btn-danger btn-sm" style={{ visibility: 'hidden' }} tabIndex={-1} aria-hidden="true">✕</button>
            </div>
            <div id="cfg-impresoras">
              {(cfg.impresoras || []).map((imp, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px auto', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
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
                    style={{ fontSize: '12px', textAlign: 'center' }}
                    onChange={(e) => handleUpdateField('impresoras', i, 'watts', parseFloat(e.target.value) || 0)}
                  />
                  <div className="input-money">
                    <span className="input-money-prefix">$</span>
                    <input
                      type="number"
                      value={imp.mant || 0}
                      title="Amortización $/hora"
                      style={{ fontSize: '12px' }}
                      onChange={(e) => handleUpdateField('impresoras', i, 'mant', parseFloat(e.target.value) || 0)}
                    />
                  </div>
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
              Usados al armar versiones de un pedido. "Sec." marca el color como disponible para elegir como color SECUNDARIO en los productos que permiten combinar colores (Biblioteca → Editar producto).
            </div>
            <div id="cfg-colores">
              {(cfg.colores || []).map((c, i) => (
                <div key={i} className="cfg-row" style={{ gridTemplateColumns: '1fr 46px auto auto', gap: '6px', alignItems: 'center' }}>
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={!!c.secundario}
                      title="Disponible para elegir como color secundario en productos que combinan colores"
                      onChange={(e) => handleUpdateField('colores', i, 'secundario', e.target.checked)}
                    />
                    Sec.
                  </label>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('colores', i)}>✕</button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-sm"
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => handleAddItem('colores', { nombre: 'Nuevo color', hex: '#cccccc', secundario: false })}
            >
              + Agregar
            </button>
          </div>

          {/* Shipping config card */}
          <div className="card">
            <div className="card-title">Métodos de envío</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontFamily: 'var(--mono)' }}>
              Opciones del envío en cada pedido. La URL de seguimiento se usa para armar el link cuando marcás un pedido como "Enviado" — poné <code>{'{codigo}'}</code> donde debería ir el número de seguimiento. Destildá "Incluir código" para transportes (ej. Correo Argentino) donde el link va solo a la página de seguimiento y el código se envía aparte.
            </div>
            <div id="cfg-envios">
              {(cfg.metodosEnvio || []).map((raw, i) => {
                const m = typeof raw === 'string' ? { nombre: raw, urlSeguimiento: '' } : raw;
                const incluirCodigo = m.incluirCodigo !== false;
                return (
                  <div key={i} className="cfg-row" style={{ gridTemplateColumns: '1fr 1fr auto auto', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={m.nombre}
                      placeholder="Nombre del método"
                      onChange={(e) => handleUpdateField('metodosEnvio', i, 'nombre', e.target.value)}
                    />
                    <input
                      type="text"
                      value={m.urlSeguimiento || ''}
                      placeholder="https://.../seguimiento?codigo={codigo}"
                      onChange={(e) => handleUpdateField('metodosEnvio', i, 'urlSeguimiento', e.target.value)}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={incluirCodigo}
                        title="Incluir el código de seguimiento en el link generado"
                        onChange={(e) => handleUpdateField('metodosEnvio', i, 'incluirCodigo', e.target.checked)}
                      />
                      Incluir código
                    </label>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('metodosEnvio', i)}>✕</button>
                  </div>
                );
              })}
            </div>
            <button
              className="btn btn-sm"
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => handleAddItem('metodosEnvio', { nombre: 'Nuevo método', urlSeguimiento: '', incluirCodigo: true })}
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
            <div className="cfg-row" style={{ marginBottom: '0px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              <span>Insumo</span>
              <span style={{ textAlign: 'center' }}>Monto</span>
              <button className="btn btn-danger btn-sm" style={{ visibility: 'hidden' }} tabIndex={-1} aria-hidden="true">✕</button>
            </div>
            <div id="cfg-insumos">
              {(cfg.insumos || []).map((ins, i) => (
                <div key={i} className="cfg-row">
                  <input
                    type="text"
                    value={ins.nombre}
                    onChange={(e) => handleUpdateField('insumos', i, 'nombre', e.target.value)}
                  />
                  <div className="input-money">
                    <span className="input-money-prefix">$</span>
                    <input
                      type="number"
                      value={ins.precio}
                      onChange={(e) => handleUpdateField('insumos', i, 'precio', parseFloat(e.target.value) || 0)}
                    />
                  </div>
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
            {/* Se guarda el NOMBRE de la impresora (no el índice): si se
                reordena o borra una de la lista, el default no pasa a
                apuntar a otra impresora por accidente. La Calculadora
                acepta también el índice numérico que guardaba la versión
                anterior de este selector. */}
            <select
              value={cfg.impresoraDefault || ''}
              onChange={(e) => handleDefaultPrinterChange(e.target.value)}
            >
              <option value="">— Ninguna —</option>
              {(cfg.impresoras || []).map((imp, i) => (
                <option key={i} value={imp.nombre}>{imp.nombre}</option>
              ))}
            </select>
            
            <div className="sep"></div>
            
            <label className="fl">Precio Electricidad ($/kWh)</label>
            <input 
              type="number" 
              value={cfg.kwh} 
              step="1" 
              onChange={(e) => handleDefaultValueChange('kwh', e.target.value)} 
            />
            
            <label className="fl">Costo Mano de obra ($/hora)</label>
            <input 
              type="number" 
              value={cfg.mo} 
              step="50" 
              onChange={(e) => handleDefaultValueChange('mo', e.target.value)} 
            />
            
            <label className="fl">Desperdicio (%)</label>
            <input
              type="number"
              value={cfg.desperdicio}
              step="1"
              onChange={(e) => handleDefaultValueChange('desperdicio', e.target.value)}
            />

            <div className="sep"></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <input
                type="checkbox"
                id="costoCompletoActivo"
                checked={!!cfg.costoCompletoActivo}
                onChange={(e) => setCfg(prev => ({ ...prev, costoCompletoActivo: e.target.checked }))}
              />
              <label htmlFor="costoCompletoActivo" style={{ fontSize: '13px' }}>
                Calcular gastos con el costo completo del producto
              </label>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #888)', marginTop: '4px' }}>
              Por defecto, "Gastos" en Resumen solo suma electricidad y mano de obra, y las compras
              de materiales/insumos se restan aparte en "Gastos compras". Si activás esta opción,
              "Gastos" pasa a sumar todos los ítems de costo del producto (filamento, insumos,
              mantenimiento, electricidad y mano de obra) y la rentabilidad deja de restar
              "Gastos compras", para no contar el mismo gasto dos veces.
            </p>

          </div>

          <div className="card">
            <div className="card-title">Paletas de colores</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginTop: '8px' }}>
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
          </div>

          {/* Paleta personalizada: arranca con los 5 colores de la paleta
              elegida arriba y se puede retocar color por color. Cada
              cuadrito es un <input type="color"> nativo escondido detrás
              del swatch -- clickearlo abre el selector de color del
              sistema operativo/navegador ("despliega una paleta"). */}
          <div className="card">
            <div className="card-title">Paleta personalizada</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px', fontFamily: 'var(--mono)' }}>
              Toca los colores de la paleta elegida arriba. Al elegir otra paleta, se reinicia con sus colores.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: '10px' }}>
              {[
                { key: 'bg', label: 'Fondo' },
                { key: 'bg3', label: 'Tarjetas' },
                { key: 'accent', label: 'Acento 1' },
                { key: 'accent2', label: 'Acento 2' },
                { key: 'text', label: 'Texto' }
              ].map(({ key, label }) => {
                const base = paletas[cfg.palette] || paletas.lagoon;
                const valor = cfg.paletaCustom?.[key] ?? base[key];
                return (
                  <label
                    key={key}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    title={`Editar ${label.toLowerCase()}`}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: '100%',
                        maxHeight: '38px',
                        aspectRatio: '1',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: valor
                      }}
                    />
                    <input
                      type="color"
                      value={valor}
                      onChange={(e) => handleCustomColorChange(key, e.target.value)}
                      style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
                      tabIndex={-1}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text2)', textAlign: 'center' }}>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
