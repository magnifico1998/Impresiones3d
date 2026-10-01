import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { pedirTexto, confirmar } from './Dialogos';
import { useMovimientosInventario } from '../hooks/useMovimientosInventario';
import { fechaLocalHoy } from '../utils/fechaCompletado';
import { armarInventario, estaBajoMinimo, formatoCantidad, minimoArticulo, TIPOS_MOVIMIENTO } from '../utils/inventario';
import ModalImportarInventario from './modals/ModalImportarInventario';

// Pestaña "Inventario" de Compras: stock de cada artículo (lo comprado más
// los movimientos), con ajuste por conteo, baja e historial. El filamento
// se lleva en gramos; el resto, en unidades. La carga inicial (lo que ya se
// tenía) se importa de un CSV con ModalImportarInventario.

const BADGE_CAT = {
  Filamento: 'badge-progress',
  Insumos: 'badge-pending',
  Equipos: 'badge-progress',
  Accesorios: 'badge-listo',
  Otros: 'badge-cancelled'
};

const fechaCorta = (f) => (f ? f.split('-').reverse().join('/') : '—');

export default function InventarioTab() {
  const { compras, fmt, cfg, setCfg, showToast } = useApp();
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);
  const { movimientos, agregarMovimiento, borrarMovimiento } = useMovimientosInventario();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(null); // clave del artículo con el historial desplegado
  const [importando, setImportando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const modalImportar = importando && <ModalImportarInventario onClose={() => setImportando(false)} />;

  const inventario = useMemo(() => armarInventario(compras, movimientos), [compras, movimientos]);
  const texto = busqueda.trim().toLowerCase();
  const bajoMinimo = inventario.filter((a) => estaBajoMinimo(cfg, a));
  const visibles = inventario
    .filter((a) => !texto || a.nombre.toLowerCase().includes(texto) || a.cat.toLowerCase().includes(texto))
    .filter((a) => !soloBajoMinimo || estaBajoMinimo(cfg, a));
  const valorTotal = visibles.reduce((s, a) => s + a.valorStock, 0);

  // Número escrito a mano ("1.250", "1250,5") a número.
  const leerNumero = (t) => parseFloat(String(t).replace(/\./g, '').replace(',', '.'));

  const ajustar = async (a) => {
    const unidad = a.unidad === 'g' ? 'gramos' : 'unidades';
    const respuesta = await pedirTexto(`¿Cuánto hay realmente de "${a.nombre}"? (en ${unidad})`, {
      titulo: 'Ajustar stock', valorInicial: String(Math.round(a.stock * 10) / 10), tipoInput: 'text'
    });
    if (respuesta === null) return;
    const contado = leerNumero(respuesta);
    if (!Number.isFinite(contado) || contado < 0) return;
    const diferencia = Math.round((contado - a.stock) * 10) / 10;
    if (!diferencia) return;
    await agregarMovimiento({
      clave: a.clave, nombre: a.nombre, tipo: 'ajuste', cantidad: diferencia, fecha: fechaLocalHoy(),
      nota: `Conteo: ${formatoCantidad(contado, a.unidad)}`
    });
  };

  const darDeBaja = async (a) => {
    const unidad = a.unidad === 'g' ? 'gramos' : 'unidades';
    const respuesta = await pedirTexto(`¿Cuánto das de baja de "${a.nombre}"? (en ${unidad})`, {
      titulo: 'Dar de baja', valorInicial: String(Math.max(0, Math.round(a.stock * 10) / 10)), tipoInput: 'text'
    });
    if (respuesta === null) return;
    const cantidad = leerNumero(respuesta);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return;
    const nota = await pedirTexto('Motivo (opcional)', { titulo: 'Dar de baja', placeholder: 'Ej: se rompió, se vendió' });
    await agregarMovimiento({
      clave: a.clave, nombre: a.nombre, tipo: 'baja', cantidad: -cantidad, fecha: fechaLocalHoy(), nota: nota || ''
    });
  };

  // Mínimo propio del artículo. Vacío = volver al mínimo por defecto
  // (se guarda null: la configuración se guarda con merge y una clave
  // borrada del mapa volvería a aparecer al recargar); 0 = sin mínimo.
  const definirMinimo = async (a) => {
    const unidad = a.unidad === 'g' ? 'gramos' : 'unidades';
    const { minimo: actual, porDefecto } = minimoArticulo(cfg, a);
    const defecto = Number((cfg.inventarioMinimoDefault || {})[a.unidad === 'g' ? 'g' : 'u']) || 0;
    const ayuda = defecto
      ? `Vacío = usar el mínimo por defecto (${formatoCantidad(defecto, a.unidad)}); 0 = sin mínimo.`
      : 'Vacío o 0 = sin mínimo.';
    const respuesta = await pedirTexto(`Stock mínimo de "${a.nombre}" (en ${unidad}). ${ayuda}`, {
      titulo: 'Stock mínimo', valorInicial: !porDefecto && actual ? String(actual) : '', placeholder: defecto ? String(defecto) : (a.unidad === 'g' ? 'Ej: 500' : 'Ej: 2'), tipoInput: 'text'
    });
    if (respuesta === null) return;
    const minimo = respuesta.trim() === '' ? null : leerNumero(respuesta);
    setCfg((prev) => ({
      ...prev,
      inventarioMinimos: { ...(prev.inventarioMinimos || {}), [a.clave]: minimo === null || !Number.isFinite(minimo) ? null : Math.max(0, minimo) }
    }));
  };

  // Excel con lo que está bajo el mínimo, para armar el pedido al
  // proveedor: cuánto falta para llegar al mínimo (en filamento, también en
  // rollos enteros), el costo estimado con el costo promedio y a quién se
  // le compró la última vez.
  const exportarBajoMinimo = async () => {
    setExportando(true);
    try {
      const { exportarExcel } = await import('../utils/exportarExcel');
      await exportarExcel({
        nombreArchivo: `inventario-bajo-minimo-${fechaLocalHoy()}.xlsx`,
        hoja: 'Bajo mínimo',
        columnas: [
          { titulo: 'Categoría', ancho: 12 },
          { titulo: 'Artículo', ancho: 26 },
          { titulo: 'Marca', ancho: 14 },
          { titulo: 'Color', ancho: 14 },
          { titulo: 'Unidad', ancho: 8 },
          { titulo: 'Stock', ancho: 10, tipo: 'numero' },
          { titulo: 'Mínimo', ancho: 10, tipo: 'numero' },
          { titulo: 'Faltante', ancho: 10, tipo: 'numero' },
          { titulo: 'Rollos a pedir', ancho: 13, tipo: 'numero' },
          { titulo: 'Costo promedio', ancho: 15, tipo: 'moneda' },
          { titulo: 'Costo estimado', ancho: 15, tipo: 'moneda' },
          { titulo: 'Último proveedor', ancho: 22 },
          { titulo: 'Última compra', ancho: 13, tipo: 'fecha' }
        ],
        filas: bajoMinimo.map((a) => {
          const { minimo } = minimoArticulo(cfg, a);
          const faltante = Math.max(0, minimo - a.stock);
          const rollos = a.unidad === 'g' ? Math.ceil(faltante / (a.pesoRollo || 1000)) : '';
          // historial viene del más nuevo al más viejo.
          const ultimaCompra = a.historial.find((h) => h.tipo === 'compra');
          return [
            a.cat, a.base, a.marca, a.color,
            a.unidad === 'g' ? 'g' : 'u.',
            Math.round(a.stock), minimo, Math.ceil(faltante), rollos,
            a.unidad === 'g' ? a.costoPromedio * (a.pesoRollo || 1000) : a.costoPromedio,
            a.costoPromedio * (a.unidad === 'g' && rollos ? rollos * (a.pesoRollo || 1000) : faltante),
            ultimaCompra?.nota || '', ultimaCompra?.fecha || ''
          ];
        })
      });
    } catch (e) {
      console.error('Error al exportar el inventario bajo mínimo:', e);
      showToast('No se pudo exportar el listado.', 'error');
    } finally {
      setExportando(false);
    }
  };

  const deshacer = async (m) => {
    if (!(await confirmar(`¿Borrar este movimiento (${TIPOS_MOVIMIENTO[m.tipo]} de ${formatoCantidad(m.cantidad, '')})? El stock vuelve a como estaba antes.`, { titulo: 'Borrar movimiento', peligro: true }))) return;
    await borrarMovimiento(m.id);
  };

  if (inventario.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Inventario</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
          Todavía no hay artículos. Las compras marcadas "Sumar al inventario" aparecen acá.
          Para partir de lo que ya tenés, importalo de una planilla.
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={() => setImportando(true)}>Importar inventario inicial</button>
        {modalImportar}
      </div>
    );
  }

  const botonChico = { fontSize: '11px', padding: '4px 8px' };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Inventario</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar artículo o categoría…"
            style={{ maxWidth: '260px' }}
          />
          <button className="btn btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setImportando(true)} title="Cargar lo que ya tenés desde un CSV">Importar CSV</button>
        </div>
      </div>
      {modalImportar}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
        <span>{visibles.length} artículo{visibles.length === 1 ? '' : 's'} · valor en stock {fmt(valorTotal)}</span>
        {bajoMinimo.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', cursor: 'pointer' }}>
            <input type="checkbox" checked={soloBajoMinimo} onChange={(e) => setSoloBajoMinimo(e.target.checked)} />
            {bajoMinimo.length} bajo el mínimo · ver sólo esos
          </label>
        )}
        {bajoMinimo.length > 0 && (
          <button className="btn btn-sm" style={{ fontSize: '11px', padding: '4px 10px' }} disabled={exportando} onClick={exportarBajoMinimo} title="Excel con lo que falta reponer, para armar el pedido al proveedor">
            {exportando ? 'Exportando…' : 'Exportar para pedir (Excel)'}
          </button>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Categoría</th>
              <th style={{ textAlign: 'right' }}>Stock</th>
              <th style={{ textAlign: 'right' }}>Costo prom.</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
              <th>Última compra</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((a) => {
              const esEquipo = a.cat === 'Equipos';
              const sinStock = a.stock <= 0;
              const { minimo, porDefecto } = minimoArticulo(cfg, a);
              const bajo = estaBajoMinimo(cfg, a);
              // Bajo el mínimo se resalta (aunque esté en cero); sin stock y
              // sin mínimo, se atenúa.
              const estiloFila = bajo ? { background: 'var(--dangerDim)' } : sinStock ? { opacity: 0.55 } : undefined;
              return (
                <React.Fragment key={a.clave}>
                  <tr style={estiloFila}>
                    <td style={{ cursor: 'pointer' }} onClick={() => setAbierto(abierto === a.clave ? null : a.clave)} title="Ver movimientos">
                      <span style={{ color: 'var(--text3)', marginRight: '6px' }}>{abierto === a.clave ? '▾' : '▸'}</span>
                      {a.colorHex && (
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', marginRight: '6px', verticalAlign: '-1px', border: '1px solid var(--border2)', background: a.colorHex }} />
                      )}
                      {a.nombre}
                    </td>
                    <td><span className={`badge ${BADGE_CAT[a.cat] || ''}`}>{a.cat}</span></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, whiteSpace: 'nowrap', color: bajo ? 'var(--danger)' : undefined }}>
                      {formatoCantidad(a.stock, a.unidad)}
                      {minimo > 0 && (
                        <div style={{ fontSize: '11px', fontWeight: 400, color: bajo ? 'var(--danger)' : 'var(--text3)' }}>
                          {bajo ? 'bajo mínimo · ' : ''}mín. {formatoCantidad(minimo, a.unidad)}{porDefecto ? ' (por defecto)' : ''}
                        </div>
                      )}
                      {a.unidad === 'g' && (
                        <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text3)' }}>
                          ≈ {(Math.round((a.stock / (a.pesoRollo || 1000)) * 10) / 10).toLocaleString('es-AR')} rollos
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {a.unidad === 'g' ? `${fmt(a.costoPromedio * 1000)}/kg` : fmt(a.costoPromedio)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(a.valorStock)}</td>
                    <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fechaCorta(a.ultimaCompra)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        {/* Los equipos no se consumen: sólo se dan de baja. */}
                        {!esEquipo && <button className="btn btn-sm" style={botonChico} onClick={() => definirMinimo(a)} title="Stock mínimo">Mínimo</button>}
                        {!esEquipo && <button className="btn btn-sm" style={botonChico} onClick={() => ajustar(a)}>Ajustar</button>}
                        <button className="btn btn-sm" style={botonChico} disabled={sinStock} onClick={() => darDeBaja(a)}>Dar de baja</button>
                      </div>
                    </td>
                  </tr>
                  {abierto === a.clave && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--bg3)', paddingTop: '6px', paddingBottom: '10px' }}>
                        <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {a.historial.map((h, i) => (
                            <div key={h.id || `${h.tipo}-${i}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', width: '80px' }}>{fechaCorta(h.fecha)}</span>
                              <span style={{ width: '90px' }}>{h.tipo === 'compra' ? 'Compra' : TIPOS_MOVIMIENTO[h.tipo] || h.tipo}</span>
                              <span style={{ fontFamily: 'var(--mono)', width: '90px', textAlign: 'right', color: h.cantidad < 0 ? 'var(--danger)' : 'var(--accent)' }}>
                                {h.cantidad > 0 ? '+' : ''}{formatoCantidad(h.cantidad, a.unidad)}
                              </span>
                              <span style={{ color: 'var(--text2)', flex: 1 }}>
                                {h.pedidoId ? `Pedido #${String(h.pedidoId).padStart(4, '0')}` : ''}{h.pedidoId && h.nota ? ' · ' : ''}{h.nota}
                              </span>
                              {h.id && (
                                <button className="btn btn-ghost btn-sm" style={{ ...botonChico, color: 'var(--text3)' }} onClick={() => deshacer(h)} title="Borrar este movimiento">
                                  Deshacer
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
