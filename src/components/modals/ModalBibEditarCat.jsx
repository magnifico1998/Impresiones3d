import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalBibEditarCat({ isOpen, onClose, editId }) {
  const { biblioteca, setBiblioteca, showToast } = useApp();
  const [categoria, setCategoria] = useState('');
  const [productName, setProductName] = useState('');
  const [precio, setPrecio] = useState('');

  const uniqueCats = Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort();

  useEffect(() => {
    if (isOpen && editId !== null) {
      const prod = biblioteca.find(p => p.id === editId);
      if (prod) {
        setProductName(prod.nombre);
        setCategoria(prod.cat || '');
        setPrecio(prod.precioSugUnitario !== undefined ? String(prod.precioSugUnitario) : '');
      }
    }
  }, [isOpen, editId, biblioteca]);

  if (!isOpen || editId === null) return null;

  const handleSave = () => {
    const cleanCat = categoria.trim() || 'General';
    const cleanName = productName.trim() || 'Sin nombre';
    const cleanPrecio = parseFloat(precio) || 0;
    setBiblioteca(prev => prev.map(p => p.id === editId ? { ...p, cat: cleanCat, nombre: cleanName, precioSugUnitario: cleanPrecio } : p));
    showToast(`✓ Producto actualizado: ${cleanName} · ${cleanCat} · ${cleanPrecio ? '$' + Math.round(cleanPrecio).toLocaleString('es-AR') : 'sin precio'}`);
    onClose();
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Editar producto</div>
        <div className="modal-sub" style={{ fontWeight: 500, color: 'var(--text)' }}>
          {productName}
        </div>

        <label className="fl">Nombre del producto</label>
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="Ej: Soporte para celular, Pieza decorativa..."
        />

        <label className="fl">Precio sugerido por unidad</label>
        <input
          type="number"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="Ej: 1200"
          min="0"
          step="0.01"
        />

        <label className="fl">Categoría del producto</label>
        <input 
          type="text" 
          value={categoria} 
          onChange={(e) => setCategoria(e.target.value)} 
          placeholder="Ej: Soportes, Decoración, Funcional..." 
          list="bib-edit-cats-list-modal"
        />
        <datalist id="bib-edit-cats-list-modal">
          {uniqueCats.map((catName, idx) => (
            <option key={idx} value={catName} />
          ))}
        </datalist>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}
