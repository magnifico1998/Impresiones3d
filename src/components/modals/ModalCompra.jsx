import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalCompra({ isOpen, onClose, editId }) {
  const { compras, setCompras, getNewId, showToast } = useApp();

  const [form, setForm] = useState({
    desc: '',
    cat: 'Insumos',
    precio: '',
    qty: 1,
    proveedor: '',
    fecha: '',
    notas: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (editId !== null) {
        const c = compras.find(x => x.id === editId);
        if (c) {
          setForm({
            desc: c.desc || '',
            cat: c.cat || 'Insumos',
            precio: c.precio || '',
            qty: c.qty || 1,
            proveedor: c.proveedor || '',
            fecha: c.fecha || '',
            notas: c.notas || ''
          });
        }
      } else {
        setForm({
          desc: '',
          cat: 'Insumos',
          precio: '',
          qty: 1,
          proveedor: '',
          fecha: new Date().toISOString().split('T')[0],
          notas: ''
        });
      }
    }
  }, [isOpen, editId, compras]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = () => {
    const descText = form.desc.trim() || 'Sin descripción';
    const precioNum = parseFloat(form.precio) || 0;
    const qtyNum = parseInt(form.qty) || 1;

    const c = {
      id: editId !== null ? editId : getNewId(),
      desc: descText,
      cat: form.cat,
      precio: precioNum,
      qty: qtyNum,
      proveedor: form.proveedor,
      fecha: form.fecha,
      notas: form.notas,
      total: precioNum * qtyNum
    };

    if (editId !== null) {
      setCompras(prev => prev.map(x => x.id === editId ? c : x));
      showToast('Compra actualizada con éxito');
    } else {
      setCompras(prev => [...prev, c]);
      showToast('Compra guardada con éxito');
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editId !== null ? 'Editar compra' : 'Nueva compra'}
        </div>
        
        <label className="fl">Descripción del producto</label>
        <input 
          type="text" 
          id="desc" 
          value={form.desc} 
          onChange={handleChange} 
          placeholder="Ej: Rollo PLA 1kg blanco" 
        />
        
        <label className="fl">Categoría</label>
        <select id="cat" value={form.cat} onChange={handleChange}>
          <option value="Insumos">Insumos</option>
          <option value="Equipos">Equipos</option>
          <option value="Accesorios">Accesorios</option>
          <option value="Otros">Otros</option>
        </select>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="fl">Precio unitario ($)</label>
            <input 
              type="number" 
              id="precio" 
              value={form.precio} 
              onChange={handleChange} 
              placeholder="0" 
              step="100" 
            />
          </div>
          <div>
            <label className="fl">Cantidad</label>
            <input 
              type="number" 
              id="qty" 
              value={form.qty} 
              onChange={handleChange} 
              min="1" 
              step="1" 
            />
          </div>
        </div>
        
        <label className="fl">Proveedor (opcional)</label>
        <input 
          type="text" 
          id="proveedor" 
          value={form.proveedor} 
          onChange={handleChange} 
          placeholder="Ej: MercadoLibre" 
        />
        
        <label className="fl">Fecha de compra</label>
        <input 
          type="date" 
          id="fecha" 
          value={form.fecha} 
          onChange={handleChange} 
        />
        
        <label className="fl">Notas (opcional)</label>
        <input 
          type="text" 
          id="notas" 
          value={form.notas} 
          onChange={handleChange} 
          placeholder="Notas adicionales" 
        />
        
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar compra</button>
        </div>
      </div>
    </div>
  );
}
