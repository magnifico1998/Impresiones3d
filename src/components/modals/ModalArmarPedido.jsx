import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalArmarPedido({ isOpen, onClose, selectedProdIds, fixedOrderId, onClearSelection, onViewOrder }) {
  const { 
    pedidos, 
    setPedidos, 
    biblioteca, 
    cfg, 
    getNewId, 
    showToast,
    setActivePage
  } = useApp();

  const [armarPedidoItems, setArmarPedidoItems] = useState([]);
  const [destino, setDestino] = useState('nuevo');
  const [cliente, setCliente] = useState('');
  const [desc, setDesc] = useState('');
  const [fechaPedido, setFechaPedido] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [envio, setEnvio] = useState('');
  const [montoFinal, setMontoFinal] = useState('');
  const [montoFinalTocado, setMontoFinalTocado] = useState(false);

  const activePedidos = pedidos.filter(p => p.estado !== 'cancelado' && p.estado !== 'completado');

  // Initialize form and selected items
  useEffect(() => {
    if (isOpen && selectedProdIds && selectedProdIds.size > 0) {
      const items = Array.from(selectedProdIds).map(id => {
        const prod = biblioteca.find(p => p.id === id);
        if (!prod) return null;
        const cantidad = prod.cantidad || 1;
        return {
          prodId: id,
          nombre: prod.nombre,
          cantidad,
          precioEstimado: prod.precioSugUnitario || prod.costoUnitario || 0,
          versiones: [{ id: Date.now() + Math.random(), cantidad, color: '', comentario: '' }]
        };
      }).filter(Boolean);

      setArmarPedidoItems(items);
      setDestino(fixedOrderId ? fixedOrderId.toString() : 'nuevo');
      setCliente('');
      setDesc('');
      setFechaPedido(new Date().toISOString().split('T')[0]);
      setFechaEntrega('');
      setEnvio('');
      setMontoFinalTocado(false);
    }
    // A propósito sin `biblioteca` en las dependencias: reinicializar acá
    // significa pisar cantidades/precios/versiones que el usuario ya haya
    // ajustado a mano en este modal, además del cliente/descripción/fechas
    // ya tipeados. Sólo debe volver a armarse cuando el modal se abre o
    // cambia qué productos están seleccionados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedProdIds, fixedOrderId]);

  // Recalculate estimated total when items change
  const totalEstimado = armarPedidoItems.reduce((s, it) => s + (it.cantidad * it.precioEstimado), 0);

  // Set montoFinal automatically unless it has been manually customized by user
  useEffect(() => {
    if (!montoFinalTocado) {
      setMontoFinal(Math.round(totalEstimado).toString());
    }
  }, [totalEstimado, montoFinalTocado]);

  if (!isOpen || !selectedProdIds || selectedProdIds.size === 0) return null;

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const badgeText = (e) =>
    ({
      pendiente: 'Pendiente',
      progreso: 'En progreso',
      listo: 'Listo p/ entregar',
      completado: 'Completado',
      cancelado: 'Cancelado'
    }[e] || e);

  // Change quantity
  const handleQtyChange = (idx, value) => {
    const qty = Math.max(1, parseInt(value) || 1);
    setArmarPedidoItems(prev => prev.map((item, i) => {
      if (i === idx) {
        const versiones = qty > 0 ? [{ id: Date.now() + Math.random(), cantidad: qty, color: '', comentario: '' }] : [];
        return { ...item, cantidad: qty, versiones };
      }
      return item;
    }));
  };

  // Change unit price estimation
  const handlePriceChange = (idx, value) => {
    const val = parseFloat(value) || 0;
    setArmarPedidoItems(prev => prev.map((item, i) => i === idx ? { ...item, precioEstimated: val, precioEstimado: val } : item));
  };

  // Delete item from order compiler list
  const handleRemoveItem = (idx, prodId) => {
    setArmarPedidoItems(prev => prev.filter((_, i) => i !== idx));
    if (onClearSelection) {
      // Toggle off in selected parent IDs
      const nextSet = new Set(selectedProdIds);
      nextSet.delete(prodId);
      onClearSelection(nextSet);
    }
  };

  // Version actions inside the compiler modal
  const handleAddVersion = (idx) => {
    setArmarPedidoItems(prev => prev.map((item, i) => {
      if (i === idx) {
        const sumAsignado = item.versiones.reduce((s, v) => s + v.cantidad, 0);
        const left = item.cantidad - sumAsignado;
        if (left <= 0) return item;
        return {
          ...item,
          versiones: [...item.versiones, { id: Date.now() + Math.random(), cantidad: left, color: '', comentario: '' }]
        };
      }
      return item;
    }));
  };

  const handleRemoveVersion = (idx, verId) => {
    setArmarPedidoItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return {
          ...item,
          versiones: item.versiones.filter(v => v.id !== verId)
        };
      }
      return item;
    }));
  };

  const handleVersionFieldChange = (idx, verId, field, value) => {
    setArmarPedidoItems(prev => prev.map((item, i) => {
      if (i === idx) {
        const versiones = item.versiones.map(v => {
          if (v.id === verId) {
            const val = field === 'cantidad' ? (parseInt(value) || 0) : value;
            return { ...v, [field]: val };
          }
          return v;
        });
        return { ...item, versiones };
      }
      return item;
    }));
  };

  const construirPiezaDesdeBibParaPedido = (it) => {
    const prod = biblioteca.find(p => p.id === it.prodId) || {};
    const horas = prod.horas || 0;
    const watts = prod.watts || 0;
    const precioKwh = prod.precioKwh || cfg.kwh || 0;
    const moHora = prod.moHora || 0;
    const horasTrab = prod.horasTrab || 0;
    const costeElec = (watts / 1000) * horas * precioKwh;
    const costeMO = moHora * horasTrab;
    
    let mant = 0;
    if (prod.impresoraNombre) {
      const imp = cfg.impresoras.find(i => i.nombre === prod.impresoraNombre);
      if (imp) mant = imp.mant || 0;
    }
    const costeMant = mant * horas;

    return {
      id: getNewId(),
      nombre: it.nombre,
      archivoNombre: prod.gcodeNombre || null,
      gcodeArchivos: prod.gcodeArchivos || null,
      filDetalle: prod.filDetalle || [],
      costeElec,
      costeMant,
      costeMO,
      horas,
      impresoraNombre: prod.impresoraNombre || null,
      costoUnitario: prod.costoUnitario || 0,
      precioEstimado: it.precioEstimado,
      precioVenta: it.precioEstimado || prod.precioSugUnitario || 0,
      cantidad: it.cantidad,
      elaborados: 0,
      notas: '',
      versiones: (it.versiones || []).map(v => ({
        id: Date.now() + Math.random(),
        cantidad: v.cantidad,
        color: v.color,
        comentario: v.comentario,
        realizados: 0
      }))
    };
  };

  const handleConfirm = () => {
    if (!armarPedidoItems.length) {
      showToast('No hay productos para agregar.', 'error');
      return;
    }

    const incompletas = armarPedidoItems.filter(it => 
      it.cantidad > 1 && it.versiones.reduce((s, v) => s + v.cantidad, 0) !== it.cantidad
    );
    
    if (incompletas.length) {
      if (!window.confirm('Hay productos con versiones sin asignar completamente (color/comentario). ¿Querés crear el pedido igual?')) {
        return;
      }
    }

    const finalPriceVal = parseFloat(montoFinal) || 0;
    const shippingVal = parseFloat(envio) || 0;
    const nuevasPiezas = armarPedidoItems.map(construirPiezaDesdeBibParaPedido);

    let pedidoDestinoId = null;

    if (destino === 'nuevo') {
      const cName = cliente.trim() || 'Sin nombre';
      const orderDesc = desc.trim();
      const newIdVal = getNewId();
      
      const nuevo = {
        id: newIdVal,
        cliente: cName,
        desc: orderDesc,
        estado: 'pendiente',
        fechaPedido: fechaPedido || new Date().toISOString().slice(0, 10),
        fechaEntrega: fechaEntrega || '',
        notaGeneral: '',
        piezas: nuevasPiezas,
        precioVenta: finalPriceVal,
        envio: shippingVal,
        insumos: [],
        creado: new Date().toLocaleDateString('es-AR')
      };
      
      setPedidos(prev => [...prev, nuevo]);
      pedidoDestinoId = newIdVal;
    } else {
      const targetId = parseInt(destino, 10);
      setPedidos(prev => prev.map(p => {
        if (p.id === targetId) {
          const piezas = [...p.piezas, ...nuevasPiezas];
          return {
            ...p,
            piezas,
            precioVenta: (p.precioVenta || 0) + finalPriceVal,
            envio: (p.envio || 0) + shippingVal
          };
        }
        return p;
      }));
      pedidoDestinoId = targetId;
    }

    if (onClearSelection) {
      onClearSelection(new Set());
    }

    showToast('✓ Pedido armado con éxito.');
    onClose();

    // Navigate to Pedidos page and open detail
    setActivePage('pedidos');
    if (onViewOrder && pedidoDestinoId !== null) {
      setTimeout(() => {
        onViewOrder(pedidoDestinoId);
      }, 150);
    }
  };

  const fixedOrder = fixedOrderId ? pedidos.find(p => p.id === fixedOrderId) : null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Armar pedido desde biblioteca</div>
        <div className="modal-sub">Revisá cantidades y precios estimados antes de crear el pedido.</div>

        <label className="fl">Pedido destino</label>
        {fixedOrder ? (
          <>
            <select disabled value={destino}>
              <option value={fixedOrderId}>{fixedOrder.cliente} — {fixedOrder.desc || 'Sin descripción'}</option>
            </select>
            <div style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: '4px' }}>
              📦 Agregando productos al pedido de "{fixedOrder.cliente}" — {fixedOrder.desc || 'sin descripción'}
            </div>
          </>
        ) : (
          <select value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="nuevo">+ Crear pedido nuevo</option>
            {activePedidos.map(p => (
              <option key={p.id} value={p.id}>
                {p.cliente} — {p.desc || 'Sin descripción'} [{badgeText(p.estado)}]
              </option>
            ))}
          </select>
        )}

        {destino === 'nuevo' && (
          <div style={{ marginTop: '4px' }}>
            <label className="fl">Cliente</label>
            <input 
              type="text" 
              value={cliente} 
              onChange={(e) => setCliente(e.target.value)} 
              placeholder="Nombre del cliente" 
            />
            
            <label className="fl">Descripción del proyecto</label>
            <input 
              type="text" 
              value={desc} 
              onChange={(e) => setDesc(e.target.value)} 
              placeholder="Ej: Pedido de figuras" 
            />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="fl">Fecha del pedido</label>
                <input 
                  type="date" 
                  value={fechaPedido} 
                  onChange={(e) => setFechaPedido(e.target.value)} 
                />
              </div>
              <div>
                <label className="fl">Fecha max. entrega</label>
                <input 
                  type="date" 
                  value={fechaEntrega} 
                  onChange={(e) => setFechaEntrega(e.target.value)} 
                />
              </div>
            </div>
          </div>
        )}

        <div className="sep"></div>

        <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>
          Productos seleccionados
        </div>

        <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
          {!armarPedidoItems.length ? (
            <div className="empty">No hay productos seleccionados.</div>
          ) : (
            armarPedidoItems.map((it, idx) => {
              const subtotal = it.cantidad * it.precioEstimado;
              const asignado = it.versiones.reduce((s, v) => s + v.cantidad, 0);
              const restante = it.cantidad - asignado;
              const tieneVersiones = true;

              return (
                <div key={idx} className="card" style={{ marginBottom: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{it.nombre}</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveItem(idx, it.prodId)}>✕</button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: '8px', alignItems: 'end' }}>
                    <div>
                      <label className="fl" style={{ marginTop: 0 }}>Cant.</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={it.cantidad} 
                        onChange={(e) => handleQtyChange(idx, e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="fl" style={{ marginTop: 0 }}>Precio est. /u ($)</label>
                      <input 
                        type="number" 
                        min="0" 
                        value={it.precioEstimado} 
                        onChange={(e) => handlePriceChange(idx, e.target.value)} 
                      />
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <label className="fl" style={{ marginTop: 0 }}>Subtotal</label>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, padding: '8px 0' }}>{fmt(subtotal)}</div>
                    </div>
                  </div>

                  {/* Version breakdown inside compile card */}
                  {tieneVersiones && (
                    <div style={{ background: 'rgba(255,255,255,.03)', border: '1px dashed var(--border2)', borderRadius: '8px', padding: '10px', marginTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                          Versiones
                        </span>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: restante === 0 ? 'var(--accent)' : 'var(--warn)' }}>
                          {restante === 0 ? '✓ Completo' : `Faltan asignar ${restante}`}
                        </span>
                      </div>
                      
                      {it.versiones.map(v => (
                        <div key={v.id} className="version-row">
                          <input 
                            type="number" 
                            min="1" 
                            max={it.cantidad} 
                            value={v.cantidad} 
                            onChange={(e) => handleVersionFieldChange(idx, v.id, 'cantidad', e.target.value)} 
                          />
                          <select 
                            value={v.color || ''} 
                            onChange={(e) => handleVersionFieldChange(idx, v.id, 'color', e.target.value)}
                          >
                            <option value="">Sin color</option>
                            {(cfg.colores || []).map((col, ci) => (
                              <option key={ci} value={col.nombre}>{col.nombre}</option>
                            ))}
                          </select>
                          <input 
                            type="text" 
                            placeholder="Comentario..." 
                            value={v.comentario || ''} 
                            onChange={(e) => handleVersionFieldChange(idx, v.id, 'comentario', e.target.value)} 
                          />
                          <button className="btn btn-danger btn-sm" style={{ padding: '2px 5px' }} onClick={() => handleRemoveVersion(idx, v.id)}>✕</button>
                        </div>
                      ))}

                      {restante > 0 && (
                        <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => handleAddVersion(idx)}>
                          + Agregar versión (faltan {restante})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="sep"></div>

        {/* Compile Totals summary */}
        <div className="total-section">
          <div className="cost-line strong">
            <span>Presupuesto estimado</span>
            <span>{fmt(totalEstimado)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
            <div>
              <label className="fl" style={{ marginTop: 0 }}>Monto final ($)</label>
              <input 
                type="number" 
                value={montoFinal} 
                placeholder="0" 
                onChange={(e) => {
                  setMontoFinal(e.target.value);
                  setMontoFinalTocado(true);
                }} 
              />
            </div>
            <div>
              <label className="fl" style={{ marginTop: 0 }}>
                Envío ($) <span style={{ color: 'var(--text3)', textTransform: 'none' }}>opcional</span>
              </label>
              <input 
                type="number" 
                value={envio} 
                placeholder="0" 
                onChange={(e) => setEnvio(e.target.value)} 
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm}>Crear pedido</button>
        </div>
      </div>
    </div>
  );
}
