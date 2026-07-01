import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function BibliotecaPage({ onLoadInCalculator, onOpenEditCat, onOpenArmarPedido }) {
  // Traemos 'cfg' para obtener los costos actualizados de insumos del taller
  const { biblioteca, setBiblioteca, cfg, showToast } = useApp();

  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid');
  const [sortMode, setSortMode] = useState('nombreAsc');

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const uniqueCats = useMemo(() => {
    return Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort();
  }, [biblioteca]);

  // Filtrado de productos
  const filteredList = useMemo(() => {
    const query = q.toLowerCase().trim();
    return biblioteca.filter(p => {
      const matchQ = !query || 
        p.nombre.toLowerCase().includes(query) || 
        (p.cat && p.cat.toLowerCase().includes(query)) ||
        (p.desc && p.desc.toLowerCase().includes(query));
      const matchCat = !filterCat || p.cat === filterCat;
      return matchQ && matchCat;
    });
  }, [biblioteca, q, filterCat]);

  // --- FUNCIÓN CORREGIDA: SÓLO ACTUALIZA COSTOS ---
  const handleRecalcularCostosMasivo = () => {
    if (biblioteca.length === 0) {
      showToast('No hay productos en la biblioteca para recalcular.', 'error');
      return;
    }

    if (!window.confirm('¿Confirmás el recálculo masivo de costos? Se actualizará el "Costo Unitario" de cada pieza usando el valor actual de filamentos, luz y mano de obra. Los precios de venta actuales SE MANTENDRÁN INTACTOS.')) {
      return;
    }

    // Sub-función que computa puramente los costos de un archivo o pieza individual
    const actualizarCostosPieza = (pieza) => {
      // 1. Buscar precio actual del filamento asignado
      let precioFilamentoActual = pieza.precioRollo || 18000;
      if (cfg.filamentos && (pieza.filamentoId || pieza.selFilamento)) {
        const fil = cfg.filamentos.find(f => f.id === pieza.filamentoId || f.nombre === pieza.selFilamento);
        if (fil) precioFilamentoActual = fil.precio;
      }

      // 2. Buscar consumo eléctrico actual de la impresora asignada
      let wattsActual = pieza.watts || 120;
      if (cfg.impresoras && (pieza.impresoraId || pieza.selImpresora)) {
        const imp = cfg.impresoras.find(i => i.id === pieza.impresoraId || i.nombre === pieza.selImpresora);
        if (imp) wattsActual = imp.watts;
      }

      // 3. Traer variables generales de configuración del taller
      const kwhActual = Number(cfg.kwh) || 0;
      const moActual = Number(cfg.mo) || 0;
      const desperdicioActual = cfg.desperdicio !== undefined ? Number(cfg.desperdicio) : 5;

      // 4. Parámetros de fabricación de la pieza
      const gramosPuros = Number(pieza.gramos) || 0;
      const horasImpresion = Number(pieza.horas) || 0;
      const horasManoObra = Number(pieza.horasTrabajo) || 0;
      const costosExtras = Number(pieza.extras) || 0;

      // 5. Modelado matemático de costos de CalculadoraPage
      const pesoConDesperdicio = gramosPuros * (1 + desperdicioActual / 100);
      const costoMaterial = pesoConDesperdicio * (precioFilamentoActual / 1000);
      const costoLuz = horasImpresion * (wattsActual / 1000) * kwhActual;
      const costoManoObra = horasManoObra * moActual;

      const nuevoCostoUnitario = costoMaterial + costoLuz + costoManoObra + costosExtras;

      return {
        ...pieza,
        precioRollo: precioFilamentoActual,
        watts: wattsActual,
        costoUnitario: nuevoCostoUnitario,
        // CRÍTICO: Mantiene su precio de venta de lista exactamente igual
        precioSugUnitario: pieza.precioSugUnitario 
      };
    };

    // Recorremos todo tu catálogo
    const bibliotecaActualizada = biblioteca.map(p => {
      if (p.esCompuesto && p.componentes && p.componentes.length > 0) {
        // Si es Multi-Gcode, actualiza los costos individuales de cada sub-pieza
        const componentesActualizados = p.componentes.map(comp => actualizarCostosPieza(comp));
        
        // Consolida el nuevo costo total sumando las partes
        const costoConsolidado = componentesActualizados.reduce((acc, c) => acc + (c.costoUnitario * (c.cantidad || 1)), 0);

        return {
          ...p,
          componentes: componentesActualizados,
          costoUnitario: costoConsolidado,
          // CRÍTICO: Conserva el precio de venta original del producto compuesto
          precioSugUnitario: p.precioSugUnitario 
        };
      } else {
        // Si es una pieza normal, aplica la actualización directa
        return actualizarCostosPieza(p);
      }
    });

    // Guardamos los cambios en el estado y LocalStorage
    setBiblioteca(bibliotecaActualizada);
    showToast('Costos de producción actualizados correctamente.', 'success');
  };

  const handleDelete = (id, nombre) => {
    if (window.confirm(`¿Seguro que querés eliminar "${nombre}" de la biblioteca?`)) {
      setBiblioteca(prev => prev.filter(p => p.id !== id));
      showToast('Producto eliminado.', 'info');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* SECCIÓN FILTROS Y ACCIONES */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '280px' }}>
          <input 
            type="text" 
            placeholder="Buscar por nombre, categoría o descripción..." 
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1 }}
          />
          {uniqueCats.length > 0 && (
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ width: '160px' }}>
              <option value="">Todas las categorías</option>
              {uniqueCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* BOTÓN RECALCULAR EXCLUSIVO DE COSTOS */}
          <button 
            className="btn" 
            style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid var(--warn)', color: 'var(--warn)' }}
            onClick={handleRecalcularCostosMasivo}
            title="Sincroniza y recalcula el costo base de fabricación sin alterar tus precios de venta actuales"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px', marginRight: '4px' }}>
              <path d="M4 10a6 6 0 0110.45-3.95L16 8M16 4v4h-4M16 10a6 6 0 01-10.45 3.95L4 12M4 16v-4h4"/>
            </svg>
            Sincronizar Costos Base
          </button>

          <button 
            className="btn btn-sm" 
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? 'Ver Lista' : 'Ver Cuadrícula'}
          </button>
        </div>
      </div>

      {/* RENDERIZADO DE LAS TARJETAS */}
      <div style={{ 
        display: viewMode === 'grid' ? 'grid' : 'flex', 
        flexDirection: viewMode === 'list' ? 'column' : undefined,
        gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(260px, 1fr))' : undefined, 
        gap: '12px' 
      }}>
        {filteredList.length === 0 ? (
          <div className="empty" style={{ width: '100%', textAlign: 'center', padding: '40px' }}>
            No se encontraron productos en la biblioteca.
          </div>
        ) : (
          filteredList.map(p => {
            const cantidadItem = p.cantidad || 1;
            return (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg2)', position: 'relative' }}>
                <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>{p.nombre}</h4>
                    {p.cat && <span style={{ fontSize: '11px', color: 'var(--text2)', background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px' }}>{p.cat}</span>}
                  </div>
                  {p.esCompuesto && (
                    <span className="pill" style={{ background: 'var(--accentDim)', color: 'var(--accent)', fontSize: '10px' }}>
                      COMPUESTO
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)', margin: '4px 0' }}>
                  📦 {Math.round(p.gramos)}g | ⏳ {Number(p.horas).toFixed(1)}hs
                </div>

                {p.esCompuesto && p.componentes && (
                  <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {p.componentes.map((c, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: i < p.componentes.length - 1 ? '1px dashed var(--border)' : 'none', padding: '2px 0' }}>
                        <span>• {c.nombre || `Parte ${i+1}`}</span>
                        <span>{c.gramos}g</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* VISUALIZACIÓN DE PRECIOS */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginTop: 'auto' }}>
                  <span style={{ color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                    Costo: {fmt(p.costoUnitario * cantidadItem)}
                  </span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                    Venta: {fmt(p.precioSugUnitario * cantidadItem)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px', paddingTop: '4px' }}>
                  <button 
                    className="btn btn-sm" 
                    style={{ flex: 1, justifyContent: 'center' }} 
                    onClick={() => onLoadInCalculator(p.id)}
                  >
                    Calcular u.
                  </button>
                  <button 
                    className="btn btn-sm" 
                    onClick={() => onOpenEditCat(p.id)}
                  >
                    Editar
                  </button>
                  <button 
                    className="btn btn-danger btn-sm" 
                    onClick={() => handleDelete(p.id, p.nombre)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}