import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { comprimirImagen } from '../../utils/imageCompress';

export default function ModalBibEditarCat({ isOpen, onClose, editId }) {
  const { biblioteca, setBiblioteca, showToast } = useApp();
  const [categoria, setCategoria] = useState('');
  const [productName, setProductName] = useState('');
  const [precio, setPrecio] = useState('');
  const [imagen, setImagen] = useState('');
  const [imagenPreview, setImagenPreview] = useState('');
  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const uniqueCats = Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort();

  useEffect(() => {
    if (isOpen && editId !== null) {
      const prod = biblioteca.find(p => p.id === editId);
      if (prod) {
        setProductName(prod.nombre);
        setCategoria(prod.cat || '');
        setPrecio(prod.precioSugUnitario !== undefined ? String(prod.precioSugUnitario) : '');
        setImagen(prod.imagen || '');
        setImagenPreview(prod.imagen || '');
      }
    }
    // Sólo se reinicializa cuando el modal se abre o cambia el producto a
    // editar — a propósito NO depende de `biblioteca`. Antes sí dependía, y
    // como ahora `biblioteca` puede cambiar de referencia por la
    // sincronización en tiempo real con otras pestañas (o incluso por un
    // eco mal reconocido de nuestra propia escritura), cada cambio remoto
    // reiniciaba este formulario a mitad de edición — por ejemplo, borrando
    // una imagen recién elegida antes de que el usuario llegara a guardar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId]);

  if (!isOpen || editId === null) return null;

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoImagen(true);
    try {
      const { dataUrl } = await comprimirImagen(file);
      setImagen(dataUrl);
      setImagenPreview(dataUrl);
    } catch (err) {
      showToast(err.message || 'No se pudo procesar la imagen.', 'error');
    } finally {
      setSubiendoImagen(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSave = () => {
    const cleanCat = categoria.trim() || 'General';
    const cleanName = productName.trim() || 'Sin nombre';
    const cleanPrecio = parseFloat(precio) || 0;
    setBiblioteca(prev => prev.map(p => p.id === editId ? { ...p, cat: cleanCat, nombre: cleanName, precioSugUnitario: cleanPrecio, imagen: imagen || p.imagen || '' } : p));
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

        <label className="fl">Imagen del producto</label>
        <input type="file" accept="image/*" onChange={handleImageChange} disabled={subiendoImagen} />
        {subiendoImagen && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
            Optimizando imagen...
          </div>
        )}
        {imagenPreview && !subiendoImagen && (
          <div style={{ marginTop: '10px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={imagenPreview} alt="Vista previa" style={{ display: 'block', width: '100%', maxHeight: '180px', objectFit: 'contain', objectPosition: 'center' }} />
          </div>
        )}
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
