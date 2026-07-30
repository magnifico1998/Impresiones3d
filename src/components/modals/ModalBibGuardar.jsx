import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { comprimirImagen, subirImagenAFirebase } from '../../utils/imageCompress';

export default function ModalBibGuardar({ isOpen, onClose, presupuestoActual, onGuardado }) {
  const { biblioteca, addProducto, updateProducto, getNewId, showToast, cuentaId, planContratado, fmt } = useApp();
  const [nombre, setNombre] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('');
  const [imagenes, setImagenes] = useState([]);

  const MAX_IMAGENES = 6;

  const uniqueCats = Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean)));

  useEffect(() => {
    if (isOpen && presupuestoActual) {
      const nombreSug = presupuestoActual.nombreArchivo
        ? presupuestoActual.nombreArchivo.replace(/\.(3mf|gcode|gco)$/i, '').replace(/\s*→.*$/, '').trim()
        : 'Producto';
      setNombre(nombreSug);
      setDesc('');
      setCat('');
      setImagenes([]);
    }
  }, [isOpen, presupuestoActual]);

  const [subiendoImagen, setSubiendoImagen] = useState(false);

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

  const handleRemoveImagen = (idx) => {
    setImagenes(prev => prev.filter((_, i) => i !== idx));
  };

  if (!isOpen || !presupuestoActual) return null;


  const handleSave = async () => {
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
      imagenes: imagenes,
      imagen: imagenes[0] || null
    };

    const existente = biblioteca.find(x => x.nombre.toLowerCase() === nameTrimmed.toLowerCase());
    
    if (existente) {
      if (window.confirm(`Ya existe "${nameTrimmed}" en la biblioteca. ¿Reemplazarlo con los valores actuales?`)) {
        updateProducto(existente.id, { ...snap, id: existente.id });
        showToast('Producto actualizado en biblioteca.');
        onClose();
        onGuardado?.();
      }
    } else {
      const limite = planContratado?.limites?.productosBiblioteca;
      if (limite != null && biblioteca.length >= limite) {
        showToast(`Llegaste al máximo de ${limite} productos en biblioteca de tu plan. Borrá alguno o contratá un plan superior.`, 'error');
        return;
      }
      addProducto(snap);
      showToast('✓ Producto guardado en biblioteca.');
      onClose();
      onGuardado?.();
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

        <label className="fl">Imágenes del producto (la primera es la principal)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageChange}
          disabled={subiendoImagen || imagenes.length >= MAX_IMAGENES}
        />
        {subiendoImagen && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
            Optimizando imagen...
          </div>
        )}
        {imagenes.length > 0 && (
          <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
            {imagenes.map((url, idx) => (
              <div key={idx} style={{ position: 'relative', border: idx === 0 ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg2)' }}>
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