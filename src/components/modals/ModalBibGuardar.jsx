import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalBibGuardar({ isOpen, onClose, presupuestoActual }) {
  const { biblioteca, setBiblioteca, getNewId, showToast } = useApp();
  const [nombre, setNombre] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('');
  const [imagen, setImagen] = useState('');
  const [imagenPreview, setImagenPreview] = useState('');

  const uniqueCats = Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean)));

  useEffect(() => {
    if (isOpen && presupuestoActual) {
      const nombreSug = presupuestoActual.nombreArchivo
        ? presupuestoActual.nombreArchivo.replace(/\.(3mf|gcode|gco)$/i, '').replace(/\s*→.*$/, '').trim()
        : 'Producto';
      setNombre(nombreSug);
      setDesc('');
      setCat('');
      setImagen('');
      setImagenPreview('');
    }
  }, [isOpen, presupuestoActual]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setImagen(result);
      setImagenPreview(result);
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen || !presupuestoActual) return null;

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const handleSave = () => {
    const nameTrimmed = nombre.trim();
    if (!nameTrimmed) {
      showToast('Ingresá un nombre para el producto.', 'error');
      return;
    }

    const p = presupuestoActual;

    const snap = {
      id: getNewId(),
      nombre: nameTrimmed,
      desc: desc.trim(),
      cat: cat.trim() || 'General',
      fechaGuardado: new Date().toLocaleDateString('es-AR'),
      costoUnitario: p.total,
      precioSugUnitario: p.precio,
      margen: p.margen,
      horas: p.horas,
      cantidad: p.cantidad || 1,
      impresoraNombre: p.impresoraNombre || null,
      filDetalle: p.filDetalle || [],
      
      // Calculator values
      gramos: p.gramos || 0,
      precioRollo: p.precioRollo || 0,
      watts: p.watts || 0,
      precioKwh: p.precioKwh || 0,
      moHora: p.moHora || 0,
      horasTrab: p.horasTrab || 0,
      extras: p.extras || 0,
      desperdicio: p.desperdicio || 0,
      
      // G-code data
      gcodeNombre: p.gcodeNombre || null,
      gcodeArchivos: p.gcodeArchivos || null,
      materiales: p.materiales || null,
      multiMat: p.multiMat || false,
      matData: p.matData || null,
      imagen: imagen || null
    };

    const idx = biblioteca.findIndex(x => x.nombre.toLowerCase() === nameTrimmed.toLowerCase());
    
    if (idx >= 0) {
      if (window.confirm(`Ya existe "${nameTrimmed}" en la biblioteca. ¿Reemplazarlo con los valores actuales?`)) {
        setBiblioteca(prev => prev.map((x, i) => i === idx ? { ...snap, id: x.id } : x));
        showToast('Producto actualizado en biblioteca.');
        onClose();
      }
    } else {
      setBiblioteca(prev => [...prev, snap]);
      showToast('✓ Producto guardado en biblioteca.');
      onClose();
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Guardar en biblioteca</div>
        <div className="modal-sub">Guardá este producto para reutilizarlo en futuros pedidos.</div>

        <label className="fl">Nombre del producto</label>
        <input 
          type="text" 
          value={nombre} 
          onChange={(e) => setNombre(e.target.value)} 
          placeholder="Ej: Soporte de escritorio 15cm" 
        />

        <label className="fl">Descripción / notas</label>
        <input 
          type="text" 
          value={desc} 
          onChange={(e) => setDesc(e.target.value)} 
          placeholder="Ej: PLA negro, 2h impresión" 
        />

        <label className="fl">Categoría del producto</label>
        <input 
          type="text" 
          value={cat} 
          onChange={(e) => setCat(e.target.value)} 
          placeholder="Ej: Soportes, Decoración, Funcional..." 
          list="bib-cats-list-modal"
        />
        <datalist id="bib-cats-list-modal">
          {uniqueCats.map((category, idx) => (
            <option key={idx} value={category} />
          ))}
        </datalist>

        <label className="fl">Imagen del producto</label>
        <input type="file" accept="image/*" onChange={handleImageChange} />
        {imagenPreview && (
          <div style={{ marginTop: '10px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg3)' }}>
            <img src={imagenPreview} alt="Vista previa" style={{ display: 'block', width: '100%', maxHeight: '180px', objectFit: 'cover' }} />
            <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text2)' }}>Imagen lista para guardar</div>
          </div>
        )}

        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 12px',
          marginTop: '12px',
          fontSize: '12px',
          color: 'var(--text2)',
          fontFamily: 'var(--mono)',
          lineHeight: '1.7'
        }}>
          <strong style={{ color: 'var(--text)' }}>
            Costo total: {fmt(presupuestoActual.total * presupuestoActual.cantidad)} · 
            Precio sugerido: {fmt(presupuestoActual.precio * presupuestoActual.cantidad)}
          </strong>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar producto</button>
        </div>
      </div>
    </div>
  );
}