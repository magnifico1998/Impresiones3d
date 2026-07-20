import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalCliente({ isOpen, onClose, editId }) {
  const { clientes, addCliente, updateCliente, setPedidos, getNewId, showToast } = useApp();

  const [form, setForm] = useState({
    nombre: '',
    tel: '',
    email: '',
    prov: '',
    loc: '',
    cp: '',
    calle: '',
    altura: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (editId !== null) {
        const c = clientes.find(x => x.id === editId);
        if (c) {
          setForm({
            nombre: c.nombre || '',
            tel: c.tel || '',
            email: c.email || '',
            prov: c.prov || '',
            loc: c.loc || '',
            cp: c.cp || '',
            calle: c.calle || '',
            altura: c.altura || ''
          });
        }
      } else {
        setForm({
          nombre: '',
          tel: '',
          email: '',
          prov: '',
          loc: '',
          cp: '',
          calle: '',
          altura: ''
        });
      }
    }
    // A propósito sin `clientes` en las dependencias: sólo debe reinicializar
    // el formulario al abrir el modal o cambiar qué cliente se edita, no en
    // cada cambio de `clientes` por sincronización en tiempo real — si no, se
    // pisaría lo que el usuario ya esté escribiendo a mitad de edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = () => {
    const nombreTrimmed = form.nombre.trim();
    if (!nombreTrimmed) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }

    const d = {
      nombre: nombreTrimmed,
      tel: form.tel,
      email: form.email,
      prov: form.prov,
      loc: form.loc,
      cp: form.cp,
      calle: form.calle,
      altura: form.altura
    };

    if (editId !== null) {
      // Edit mode
      const targetCliente = clientes.find(x => x.id === editId);
      if (!targetCliente) return;

      const oldName = targetCliente.nombre;
      
      // Update client list
      updateCliente(editId, d);

      // Update client name in all their orders if name changed
      if (oldName !== nombreTrimmed) {
        setPedidos(prev => prev.map(p => 
          p.cliente.trim().toLowerCase() === oldName.trim().toLowerCase() 
            ? { ...p, cliente: nombreTrimmed } 
            : p
        ));
      }
      showToast('Cliente actualizado con éxito');
    } else {
      // Create mode
      const newClient = {
        id: getNewId(),
        ...d,
        fechaAlta: new Date().toLocaleDateString('es-AR')
      };
      addCliente(newClient);
      showToast('Cliente guardado con éxito');
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editId !== null ? 'Editar cliente' : 'Nuevo cliente'}
        </div>
        <div className="grid2">
          <div>
            <label className="fl">Nombre completo</label>
            <input type="text" id="nombre" value={form.nombre} onChange={handleChange} />
          </div>
          <div>
            <label className="fl">Teléfono</label>
            <input type="text" id="tel" value={form.tel} onChange={handleChange} />
          </div>
          <div>
            <label className="fl">Email</label>
            <input type="text" id="email" value={form.email} onChange={handleChange} />
          </div>
          <div>
            <label className="fl">Provincia</label>
            <input type="text" id="prov" value={form.prov} onChange={handleChange} />
          </div>
          <div>
            <label className="fl">Localidad</label>
            <input type="text" id="loc" value={form.loc} onChange={handleChange} />
          </div>
          <div>
            <label className="fl">Código Postal</label>
            <input type="text" id="cp" value={form.cp} onChange={handleChange} />
          </div>
          <div>
            <label className="fl">Calle</label>
            <input type="text" id="calle" value={form.calle} onChange={handleChange} />
          </div>
          <div>
            <label className="fl">Altura</label>
            <input type="text" id="altura" value={form.altura} onChange={handleChange} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar cliente</button>
        </div>
      </div>
    </div>
  );
}
