import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalPedido({ isOpen, onClose, editId, onSaved }) {
  const { pedidos, setPedidos, clientes, getNewId, showToast } = useApp();

  const [form, setForm] = useState({
    cliente: '',
    desc: '',
    estado: 'pendiente',
    fechaPedido: '',
    fechaEntrega: '',
    notaGeneral: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (editId !== null) {
        const p = pedidos.find(x => x.id === editId);
        if (p) {
          setForm({
            cliente: p.cliente || '',
            desc: p.desc || '',
            estado: p.estado || 'pendiente',
            fechaPedido: p.fechaPedido || p.fecha || '',
            fechaEntrega: p.fechaEntrega || '',
            notaGeneral: p.notaGeneral || ''
          });
        }
      } else {
        setForm({
          cliente: '',
          desc: '',
          estado: 'pendiente',
          fechaPedido: new Date().toISOString().split('T')[0],
          fechaEntrega: '',
          notaGeneral: ''
        });
      }
    }
  }, [isOpen, editId, pedidos]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = () => {
    const clienteName = form.cliente.trim() || 'Sin nombre';
    const d = {
      cliente: clienteName,
      desc: form.desc.trim(),
      estado: form.estado,
      fechaPedido: form.fechaPedido,
      fechaEntrega: form.fechaEntrega,
      notaGeneral: form.notaGeneral.trim()
    };

    let savedId;

    if (editId !== null) {
      setPedidos(prev => prev.map(p => {
        if (p.id === editId) {
          const eraCompletado = p.estado === 'completado';
          const newEstado = form.estado;
          let fechaCompletado = p.fechaCompletado;
          
          if (newEstado === 'completado' && !eraCompletado) {
            fechaCompletado = new Date().toISOString().slice(0, 10);
          } else if (newEstado !== 'completado') {
            fechaCompletado = null;
          }

          return { ...p, ...d, fechaCompletado };
        }
        return p;
      }));
      savedId = editId;
      showToast('Pedido actualizado con éxito');
    } else {
      const newIdVal = getNewId();
      const nuevo = {
        id: newIdVal,
        piezas: [],
        precioVenta: 0,
        insumos: [],
        ...d,
        creado: new Date().toLocaleDateString('es-AR'),
        fechaCompletado: form.estado === 'completado' ? new Date().toISOString().slice(0, 10) : null
      };
      setPedidos(prev => [...prev, nuevo]);
      savedId = newIdVal;
      showToast('Pedido creado con éxito');
    }

    onClose();

    if (onSaved && savedId !== null) {
      onSaved(savedId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editId !== null ? 'Editar pedido' : 'Nuevo pedido'}
        </div>
        <div className="modal-sub">
          Completá los datos. Después podés agregarle piezas desde la calculadora.
        </div>

        <label className="fl">Cliente</label>
        <input
          type="text"
          id="cliente"
          value={form.cliente}
          onChange={handleChange}
          placeholder="Nombre del cliente"
          list="lista-nombres-clientes-modal"
        />
        <datalist id="lista-nombres-clientes-modal">
          {clientes.map(c => (
            <option key={c.id} value={c.nombre} />
          ))}
        </datalist>

        <label className="fl">Descripción del proyecto</label>
        <input
          type="text"
          id="desc"
          value={form.desc}
          onChange={handleChange}
          placeholder="Ej: Avión B2 XL completo"
        />

        <label className="fl">Estado</label>
        <select id="estado" value={form.estado} onChange={handleChange}>
          <option value="pendiente">Pendiente</option>
          <option value="progreso">En progreso</option>
          <option value="listo">Listo para entregar</option>
          <option value="completado">Completado / Entregado</option>
          <option value="cancelado">Cancelado</option>
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="fl">Fecha del pedido</label>
            <input
              type="date"
              id="fechaPedido"
              value={form.fechaPedido}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="fl">Fecha max. entrega</label>
            <input
              type="date"
              id="fechaEntrega"
              value={form.fechaEntrega}
              onChange={handleChange}
            />
          </div>
        </div>

        <label className="fl">Nota general del pedido</label>
        <textarea
          id="notaGeneral"
          value={form.notaGeneral}
          onChange={handleChange}
          placeholder="Ej: Envío por correo, abonó seña 50%, pagar con transferencia..."
          style={{
            width: '100%',
            background: 'var(--bg3)',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontFamily: 'var(--sans)',
            fontSize: '13px',
            padding: '8px 10px',
            outline: 'none',
            resize: 'vertical',
            minHeight: '70px',
            transition: 'border-color .15s',
            lineHeight: '1.5'
          }}
        />

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar pedido</button>
        </div>
      </div>
    </div>
  );
}
