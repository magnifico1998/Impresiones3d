import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { comprimirImagen, subirImagenAFirebase, borrarImagenDeFirebase } from '../../utils/imageCompress';

export default function ModalBibEditarCat({ isOpen, onClose, editId }) {
  const { biblioteca, updateProducto, showToast, cuentaId, fmt } = useApp();
  const [categoria, setCategoria] = useState('');
  const [productName, setProductName] = useState('');
  const [precio, setPrecio] = useState('');
  const [imagenes, setImagenes] = useState([]);
  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const MAX_IMAGENES = 6;

  const uniqueCats = Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort();

  useEffect(() => {
    if (isOpen && editId !== null) {
      const prod = biblioteca.find(p => p.id === editId);
      if (prod) {
        setProductName(prod.nombre);
        setCategoria(prod.cat || '');
        setPrecio(prod.precioSugUnitario !== undefined ? String(prod.precioSugUnitario) : '');
        setImagenes(prod.imagenes?.length ? prod.imagenes : (prod.imagen ? [prod.imagen] : []));
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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const disponibles = MAX_IMAGENES - imagenes.length;
    if (disponibles <= 0) {
      showToast(`Máximo ${MAX_IMAGENES} imágenes por producto.`, 'error');
      if (e.target) e.target.value = '';
      return;
    }

    const aSubir = files.slice(0, disponibles);
    setSubiendoImagen(true);
    try {
      for (const file of aSubir) {
        const { dataUrl } = await comprimirImagen(file, {
          maxWidth: 640,
          maxHeight: 640,
          maxBytes: 90 * 1024
        });
        const url = await subirImagenAFirebase(dataUrl, {
          userId: cuentaId,
          fileName: file.name
        });
        setImagenes(prev => [...prev, url]);
      }
    } catch (err) {
      showToast(err.message || 'No se pudo procesar la imagen.', 'error');
    } finally {
      setSubiendoImagen(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveImagen = async (idx) => {
    if (!window.confirm('¿Borrar esta imagen?')) return;
    const url = imagenes[idx];
    await borrarImagenDeFirebase(url);
    setImagenes(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const cleanCat = categoria.trim() || 'General';
    const cleanName = productName.trim() || 'Sin nombre';
    const cleanPrecio = parseFloat(precio) || 0;

    const prodAnterior = biblioteca.find(p => p.id === editId);
    const imagenesAnteriores = prodAnterior?.imagenes?.length ? prodAnterior.imagenes : (prodAnterior?.imagen ? [prodAnterior.imagen] : []);

    const imagenesQuitadas = imagenesAnteriores.filter(url => !imagenes.includes(url));
    for (const url of imagenesQuitadas) {
      if (url && url.includes('firebasestorage')) {
        await borrarImagenDeFirebase(url);
      }
    }

    // BUG encontrado: Firestore rechaza la escritura ENTERA si algún campo
    // llega en `undefined` (no tiene `ignoreUndefinedProperties` habilitado
    // en la inicialización). Antes, cuando el producto no tenía imagen,
    // `imagenFinal || undefined` mandaba justamente `undefined`, así que
    // cualquier edición (nombre, categoría, precio) se caía entera aunque
    // no tuviera nada que ver con la imagen. Usamos '' en su lugar: es un
    // valor válido para Firestore y además borra correctamente el campo si
    // el usuario sacó la imagen.
    try {
      await updateProducto(editId, { cat: cleanCat, nombre: cleanName, precioSugUnitario: cleanPrecio, imagenes, imagen: imagenes[0] || '' });
      showToast(`✓ Producto actualizado: ${cleanName} · ${cleanCat} · ${cleanPrecio ? fmt(cleanPrecio) : 'sin precio'}`);
      onClose();
    } catch (err) {
      // updateProducto ya muestra su propio toast de error, pero si además
      // tira acá (ej. error inesperado no contemplado), no cerramos el
      // modal para que el usuario no pierda los cambios sin darse cuenta.
      console.error("Error al guardar producto:", err);
    }
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

        <label className="fl">Imágenes del producto (la primera es la principal)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageChange}
          disabled={subiendoImagen || imagenes.length >= MAX_IMAGENES}
        />
        {subiendoImagen && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
            Optimizando imagen...
          </div>
        )}
        {imagenes.length > 0 && (
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
            {imagenes.map((url, idx) => (
              <div key={idx} style={{ position: 'relative', border: idx === 0 ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg3)' }}>
                <img src={url} alt={`Imagen ${idx + 1}`} style={{ display: 'block', width: '100%', height: '90px', objectFit: 'contain', objectPosition: 'center' }} />
                {idx === 0 && (
                  <span style={{ position: 'absolute', top: '2px', left: '2px', fontSize: '9px', background: 'var(--accent)', color: '#0a1a12', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                    Principal
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveImagen(idx)}
                  style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', lineHeight: '18px', textAlign: 'center', padding: 0, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '11px', cursor: 'pointer' }}
                  title="Quitar imagen"
                >
                  ✕
                </button>
              </div>
            ))}
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
