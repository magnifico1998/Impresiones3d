import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function BibliotecaPage({ onLoadInCalculator, onOpenEditCat, onOpenArmarPedido }) {
  // Traemos 'cfg' desde el contexto para obtener las tarifas actualizadas en tiempo real
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

  // Filtrado de la lista de productos
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

  // --- FUNCIÓN NÚCLEO: RECALCULAR COSTOS Y PRECIOS ---
  const handleRecalcularTodo = () => {
    if (biblioteca.length === 0) {
      showToast('No hay productos en la biblioteca para recalcular.', 'error');
      return;
    }

    if (!window.confirm('¿Estás seguro de que querés recalcular todos los productos del catálogo? Se sobrescribirán los costos y precios sugeridos usando las tarifas actuales de configuración (Luz, Materiales, Mano de Obra, etc.).')) {
      return;
    }

    // Sub-función para calcular una pieza/gcode individual basándose en la lógica de CalculadoraPage
    const calcularCostosPieza = (pieza) => {
      // 1. Determinar precio del filamento asignado u obtener actualización de la lista global
      let precioFilamentoActual = pieza.precioRollo || 18000;
      if (cfg.filamentos && pieza.filamentoId) {
        const fil = cfg.filamentos.find(f => f.id === pieza.filamentoId || f.nombre === pieza.selFilamento);
        if (fil) precioFilamentoActual = fil.precio;
      }

      // 2. Determinar consumo de la impresora seleccionada
      let wattsActual = pieza.watts || 120;
      if (cfg.impresoras && pieza.impresoraId) {
        const imp = cfg.impresoras.find(i => i.id === pieza.impresoraId || i.nombre === pieza.selImpresora);
        if (imp) wattsActual = imp.watts;
      }

      // 3. Variables de la configuración global actual (parámetros base del taller)
      const kwhActual = Number(cfg.kwh) || 0;
      const moActual = Number(cfg.mo) || 0;
      const margenActual = Number(cfg.margen) || 2;
      const desperdicioActual = cfg.desperdicio !== undefined ? Number(cfg.desperdicio) : 5;

      // 4. Ejecución matemática
      const gramosPuros = Number(pieza.gramos) || 0;
      const horasImpresion = Number(pieza.horas) || 0;
      const horasManoObra = Number(pieza.horasTrabajo) || 0;
      const costosExtras = Number(pieza.extras) || 0;

      const pesoConDesperdicio = gramosPuros * (1 + desperdicioActual / 100);
      const costoMaterial = pesoConDesperdicio * (precioFilamentoActual / 1000);
      const costoLuz = horasImpresion * (wattsActual / 1000) * kwhActual;
      const costoManoObra = horasManoObra * moActual;

      const costoUnitarioFinal = costoMaterial + costoLuz + costoManoObra + costosExtras;
      const precioSugeridoFinal = costoUnitarioFinal * margenActual;

      return {
        ...pieza,
        precioRollo: precioFilamentoActual,
        watts: wattsActual,
        costoUnitario: costoUnitarioFinal,
        precioSugUnitario: precioSugeridoFinal
      };
    };

    // Mapeamos e iteramos sobre toda la biblioteca
    const bibliotecaActualizada = biblioteca.map(p => {
      if (p.esCompuesto && p.componentes && p.componentes.length > 0) {
        // Si el producto es MULTI-GCODE / COMPUESTO, recalculamos cada uno de sus subcomponentes primero
        const componentesRecalculados = p.componentes.map(comp => calcularCostosPieza(comp));
        
        // Sumarizamos los totales consolidados de la matriz
        const costoConsolidado = componentesRecalculados.reduce((acc, c) => acc + (c.costoUnitario * (c.cantidad || 1)), 0);
        const precioConsolidado = componentesRecalculados.reduce((acc, c) => acc + (c.precioSugUnitario * (c.cantidad || 1)), 0);
        const gramosConsolidados = componentesRecalculados.reduce((acc, c) => acc + (Number(c.gramos) * (c.cantidad || 1)), 0);
        const horasConsolidadas = componentesRecalculados.reduce((acc, c) => acc + (Number(c.horas) * (c.cantidad || 1)), 0);

        return {
          ...p,
          componentes: componentesRecalculados,
          costoUnitario: costoConsolidado,
          precioSugUnitario: precioConsolidated,
          gramos: gramosConsolidados,
          horas: horasConsolidadas
        };
      } else {
        // Si es un producto simple, aplicamos la función directa
        return calcularCostosPieza(p);
      }
    });

    // Guardamos los cambios en el estado global (y localStorage a través del Contexto)
    setBiblioteca(bibliotecaActualizada);
    showToast('¡Catálogo de productos recalculado con éxito!', 'success');
  };

  const handleDelete = (id, nombre) => {
    if (window.confirm(`¿Seguro que querés eliminar "${nombre}" de la biblioteca?`)) {
      setBiblioteca(prev => prev.filter(p => p.id !== id));
      showToast('Producto eliminado.', 'info');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* BARRA DE ACCIONES SUPERIOR */}
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
          {/* BOTÓN RECALCULAR DE FORMA MASIVA */}
          <button 
            className="btn" 
            style={{ background: 'var(--accentDim)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
            onClick={handleRecalcularTodo}
            title="Sincroniza y recalcula todos los costos y precios sugeridos usando los últimos valores del panel de configuración"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
              <path d="M4 10a6 6 0 0110.45-3.95L16 8M16 4v4h-4M16 10a6 6 0 01-10.45 3.95L4 12M4 16v-4h4"/>
            </svg>
            Recalcular Precios Masivo
          </button>

          <button 
            className="btn btn-sm" 
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? 'Ver Lista' : 'Ver Cuadrícula'}
          </button>
        </div>
      </div>

      {/* GRILLA / RENDER DE PRODUCTOS */}
      <div style={{ 
        display: viewMode === 'grid' ? 'grid' : 'flex', 
        flexDirection: viewMode === 'list' ? 'column' : undefined,
        gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(240px, 1fr))' : undefined, 
        gap: '12px' 
      }}>
        {filteredList.length === 0 ? (
          <div className="empty" style={{ width: '100%', textAlign: 'center', padding: '40px' }}>
            No se encontraron productos en la biblioteca.
          </div>
        ) : (
          filteredList.map(p => {
            return (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg2)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>{p.nombre}</h4>
                    {p.cat && <span style={{ fontSize: '11px', color: 'var(--text2)', background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px' }}>{p.cat}</span>}
                  </div>
                  {p.esCompuesto && (
                    <span className="pill" style={{ background: 'var(--accentDim)', color: 'var(--accent)', fontSize: '10px' }}>
                      COMPUESTO ({p.componentes?.length || 0})
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)', margin: '4px 0' }}>
                  📦 {Math.round(p.gramos)}g | ⏳ {Number(p.horas).toFixed(1)}hs
                </div>

                {/* Si es compuesto, hacemos un micro desglose de las partes que lo integran */}
                {p.esCompuesto && p.componentes && (
                  <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '4px', padding: '6px', fontSize: '11px', color: 'var(--text2)' }}>
                    {p.componentes.map((c, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: i < p.componentes.length - 1 ? '1px dashed var(--border)' : 'none', padding: '2px 0' }}>
                        <span>• {c.nombre || `Parte ${i+1}`}</span>
                        <span>{c.gramos}g</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginTop: 'auto' }}>
                  <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Costo: {fmt(p.costoUnitario)}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                    Venta: {fmt(p.precioSugUnitario)}
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