import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalAgregarPieza({ isOpen, onClose, presupuestoActual, onConfirm }) {
  const { pedidos, setPedidos, getNewId, showToast, setActivePage } = useApp();
  const [nombre, setNombre] = useState('');
  const [pedidoId, setPedidoId] = useState('');

  const activePedidos = pedidos.filter(p => p.estado !== 'cancelado' && p.estado !== 'completado');

  useEffect(() => {
    if (isOpen && presupuestoActual) {
      const nombreSug = presupuestoActual.nombreArchivo
        ? presupuestoActual.nombreArchivo.replace(/\.(3mf|gcode|gco)$/i, '').replace(/\s*→.*$/, '').trim()
        : 'Pieza';
      setNombre(nombreSug);
      if (activePedidos.length > 0) {
        setPedidoId(activePedidos[0].id.toString());
      }
    }
  }, [isOpen, presupuestoActual, pedidos]);

  if (!isOpen || !presupuestoActual) return null;

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const badgeText = (e) =>
    ({
      pendiente: 'Pendiente',
      progreso: 'En progreso',
      listo: 'Listo p/ entregar',
      completado: 'Completado',
      cancelado: 'Cancelado'
    }[e] || e);

  const handleConfirm = () => {
    if (!pedidoId) {
      showToast('Seleccioná un pedido destino', 'error');
      return;
    }

    const targetPedidoId = parseInt(pedidoId, 10);
    const pz = presupuestoActual;

    const nuevaPieza = {
      id: getNewId(),
      nombre: nombre.trim() || 'Sin nombre',
      archivoNombre: pz.nombreArchivo || null,
      gcodeArchivos: pz.gcodeArchivos || null,
      costeFil: pz.costeFil,
      filDetalle: pz.filDetalle,
      costeElec: pz.costeElec,
      costeMant: pz.costeMant || 0,
      costeMO: pz.costeMO,
      horas: pz.horas,
      impresoraNombre: pz.impresoraNombre || null,
      costoUnitario: pz.total,
      precioVenta: pz.precio || 0,
      cantidad: pz.cantidad,
      elaborados: 0,
      notas: ''
    };

    setPedidos(prev => prev.map(p => {
      if (p.id === targetPedidoId) {
        const piezas = [...p.piezas, nuevaPieza];
        
        // Recalculate order sale price
        const newPrecioVenta = piezas.reduce((s, x) => {
          const unit = x.precioVenta !== undefined ? x.precioVenta : (x.precioEstimado || 0);
          return s + (unit * x.cantidad);
        }, 0);

        return { ...p, piezas, precioVenta: newPrecioVenta };
      }
      return p;
    }));

    showToast(`Pieza "${nuevaPieza.nombre}" agregada con éxito`);
    onClose();

    if (onConfirm) {
      onConfirm(nuevaPieza.nombre, targetPedidoId);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Agregar pieza a pedido</div>
        <div className="modal-sub">Nombrá la pieza y seleccioná el pedido destino.</div>

        <label className="fl">Nombre de la pieza</label>
        <input 
          type="text" 
          value={nombre} 
          onChange={(e) => setNombre(e.target.value)} 
          placeholder="Ej: Fuselaje delantero" 
        />

        <label className="fl">Pedido destino</label>
        <select value={pedidoId} onChange={(e) => setPedidoId(e.target.value)}>
          {activePedidos.map(p => (
            <option key={p.id} value={p.id}>
              {p.cliente} — {p.desc || 'Sin descripción'} [{badgeText(p.estado)}]
            </option>
          ))}
        </select>

        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px',
          marginTop: '12px',
          fontSize: '12px',
          color: 'var(--text2)',
          fontFamily: 'var(--mono)'
        }}>
          Costo: <strong>{fmt(presupuestoActual.total * presupuestoActual.cantidad)}</strong> · 
          Precio sugerido: <strong>{fmt(presupuestoActual.precio * presupuestoActual.cantidad)}</strong> · 
          {presupuestoActual.cantidad} unidad(es)
          {presupuestoActual.gcodeArchivos && presupuestoActual.gcodeArchivos.length > 1 && (
            <div style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '11px' }}>
              Archivos: {presupuestoActual.gcodeArchivos.join(', ')}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm}>Agregar pieza</button>
        </div>
      </div>
    </div>
  );
}
