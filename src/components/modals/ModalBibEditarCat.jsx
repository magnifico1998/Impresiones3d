import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export default function ModalBibEditarCat({ isOpen, onClose, editId }) {
  const { biblioteca, setBiblioteca, showToast } = useApp();
  const [categoria, setCategoria] = useState('');
  const [productName, setProductName] = useState('');

  const uniqueCats = Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort();

  useEffect(() => {
    if (isOpen && editId !== null) {
      const prod = biblioteca.find(p => p.id === editId);
      if (prod) {
        setProductName(prod.nombre);
        setCategoria(prod.cat || '');
      }
    }
  }, [isOpen, editId, biblioteca]);

  if (!isOpen || editId === null) return null;

  const handleSave = () => {
    const cleanCat = categoria.trim() || 'General';
    const cleanName = productName.trim() || 'Sin nombre';
    setBiblioteca(prev => prev.map(p => p.id === editId ? { ...p, cat: cleanCat, nombre: cleanName } : p));
    showToast(`✓ Producto actualizado: ${cleanName} · ${cleanCat}`);
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
