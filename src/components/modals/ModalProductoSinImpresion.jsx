import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBiblioteca, useConfig, useUi, useCuenta } from '../../context/contextos';
import { useCapaModal } from '../CapaModal';
import BotonSubirImagenes from '../BotonSubirImagenes';
import { comprimirImagen, subirImagenAFirebase } from '../../utils/imageCompress';
import { camposSinImpresion, margenDesdePrecio, precioDesdeMargen } from '../../utils/productoSinImpresion';

const MAX_IMAGENES = 6;
const MARGEN_INICIAL = 50;

// Alta y edición de un producto que no se imprime (reventa): nombre, categoría, fotos, costo de compra y precio.
// El precio se recomienda como costo + margen y se puede pisar a mano; al tocar el precio, el margen se recalcula.
// Colores, variantes y stock se cargan después con "Editar" y "Stock", igual que en cualquier producto.
export default function ModalProductoSinImpresion({ isOpen, onClose, productoId }) {
  const capaModal = useCapaModal({ onClose, activo: isOpen });
  const { biblioteca, addProducto, updateProducto } = useBiblioteca();
  const { getNewId, fmt } = useConfig();
  const { showToast } = useUi();
  const { cuentaId, planContratado } = useCuenta();
  const existente = productoId != null ? biblioteca.find((p) => p.id === productoId) : null;

  const [nombre, setNombre] = useState('');
  const [desc, setDesc] = useState('');
  const [descLarga, setDescLarga] = useState('');
  const [notasInternas, setNotasInternas] = useState('');
  const [cat, setCat] = useState('');
  const [subcat, setSubcat] = useState('');
  const [subsubcat, setSubsubcat] = useState('');
  const [imagenes, setImagenes] = useState([]);
  const [costo, setCosto] = useState('');
  const [margen, setMargen] = useState(String(MARGEN_INICIAL));
  const [precio, setPrecio] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const p = existente;
    setNombre(p?.nombre || '');
    setDesc(p?.desc || '');
    setDescLarga(p?.descLarga || '');
    setNotasInternas(p?.notasInternas || '');
    setCat(p?.cat || '');
    setSubcat(p?.subcat || '');
    setSubsubcat(p?.subsubcat || '');
    setImagenes(p?.imagenes?.length ? p.imagenes : (p?.imagen ? [p.imagen] : []));
    setCosto(p ? String(p.costoUnitario ?? '') : '');
    setPrecio(p ? String(p.precioSugUnitario ?? '') : '');
    // El margen se deriva de lo guardado (el ajuste masivo de precios cambia el precio sin tocar el margen).
    setMargen(p ? String(margenDesdePrecio(p.costoUnitario, p.precioSugUnitario) || MARGEN_INICIAL) : String(MARGEN_INICIAL));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, productoId]);

  if (!isOpen) return null;

  const cats = Array.from(new Set(biblioteca.map((b) => b.cat).filter(Boolean)));
  const subcats = Array.from(new Set(biblioteca.filter((b) => b.cat === cat).map((b) => b.subcat).filter(Boolean)));
  const subsubcats = Array.from(new Set(biblioteca.filter((b) => b.cat === cat && b.subcat === subcat.trim()).map((b) => b.subsubcat).filter(Boolean)));

  // Costo o margen cambian: el precio recomendado se recalcula. Precio cambia: se recalcula el margen.
  const cambiarCosto = (v) => { setCosto(v); setPrecio(String(precioDesdeMargen(v, margen))); };
  const cambiarMargen = (v) => { setMargen(v); setPrecio(String(precioDesdeMargen(costo, v))); };
  const cambiarPrecio = (v) => { setPrecio(v); if (Number(costo) > 0) setMargen(String(margenDesdePrecio(costo, v))); };

  const subirImagenes = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const disponibles = MAX_IMAGENES - imagenes.length;
    if (disponibles <= 0) {
      showToast(`Máximo ${MAX_IMAGENES} imágenes por producto.`, 'error');
      if (e.target) e.target.value = '';
      return;
    }
    setSubiendo(true);
    try {
      for (const file of files.slice(0, disponibles)) {
        const { dataUrl } = await comprimirImagen(file, { maxWidth: 640, maxHeight: 640, maxBytes: 90 * 1024 });
        const url = await subirImagenAFirebase(dataUrl, { userId: cuentaId, fileName: file.name });
        setImagenes((prev) => [...prev, url]);
      }
    } catch (err) {
      showToast(err.message || 'No se pudo procesar la imagen.', 'error');
    } finally {
      setSubiendo(false);
      if (e.target) e.target.value = '';
    }
  };
  const hacerPrincipal = (i) => setImagenes((prev) => [prev[i], ...prev.filter((_, j) => j !== i)]);
  const quitarImagen = (i) => setImagenes((prev) => prev.filter((_, j) => j !== i));

  const guardar = async () => {
    const nom = nombre.trim();
    if (!nom) { showToast('Ingresá un nombre para el producto.', 'error'); return; }
    if (!(Number(costo) >= 0) || costo === '') { showToast('Ingresá el costo de compra (puede ser 0).', 'error'); return; }
    if (!(Number(precio) > 0)) { showToast('Ingresá el precio de venta.', 'error'); return; }
    const repetido = biblioteca.find((b) => b.id !== existente?.id && b.nombre.trim().toLowerCase() === nom.toLowerCase());
    if (repetido) { showToast(`Ya hay un producto llamado "${repetido.nombre}" en la Biblioteca.`, 'error'); return; }

    const basicos = {
      nombre: nom,
      desc: desc.trim(),
      descLarga: descLarga.trim(),
      notasInternas: notasInternas.trim(),
      cat: cat.trim() || 'General',
      subcat: subcat.trim(),
      subsubcat: subcat.trim() ? subsubcat.trim() : '',
      imagenes,
      imagen: imagenes[0] || null,
      ...camposSinImpresion({ costo, precio, margen: Number(margen) || 0 })
    };

    setGuardando(true);
    try {
      if (existente) {
        await updateProducto(existente.id, (p) => ({ ...p, ...basicos, fechaRecalculo: new Date().toLocaleDateString('es-AR') }));
        showToast('✓ Producto actualizado.');
      } else {
        const limite = planContratado?.limites?.productosBiblioteca;
        if (limite != null && biblioteca.length >= limite) {
          showToast(`Llegaste al máximo de ${limite} productos en biblioteca de tu plan. Borrá alguno o contratá un plan superior.`, 'error');
          return;
        }
        await addProducto({ id: getNewId(), fechaGuardado: new Date().toLocaleDateString('es-AR'), ...basicos });
        showToast('✓ Producto guardado en la biblioteca.');
      }
      onClose();
    } catch {
      // addProducto/updateProducto ya avisaron del error: el modal queda abierto para no perder lo cargado.
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{existente ? 'Costo y precio · ' + existente.nombre : 'Producto sin impresión'}</div>
        <div className="modal-sub">
          Para lo que vendés pero no imprimís. Se usa igual que cualquier producto en pedidos, presupuestos, stock y catálogo,
          pero no se recalcula con "Actualizar precios": el costo lo actualizás vos acá.
        </div>

        <label className="fl">Nombre del producto</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Termo acero 500 ml" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '4px' }}>
          <div>
            <label className="fl">Costo de compra</label>
            <input type="number" min="0" step="0.01" value={costo} onChange={(e) => cambiarCosto(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="fl">Margen %</label>
            <input type="number" step="0.1" value={margen} onChange={(e) => cambiarMargen(e.target.value)} />
          </div>
          <div>
            <label className="fl">Precio de venta</label>
            <input type="number" min="0" step="0.01" value={precio} onChange={(e) => cambiarPrecio(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          Precio recomendado con ese margen: {fmt(precioDesdeMargen(costo, margen))}. Podés escribir otro precio: el margen se ajusta solo.
        </div>

        <label className="fl">Descripción corta</label>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: Acero inoxidable, 500 ml" />

        <label className="fl">Descripción extendida (se muestra en el catálogo)</label>
        <textarea value={descLarga} onChange={(e) => setDescLarga(e.target.value)} rows={3} placeholder="Detalle más largo del producto…" />

        <label className="fl">Notas internas (privadas)</label>
        <textarea value={notasInternas} onChange={(e) => setNotasInternas(e.target.value)} rows={2} maxLength={2000} placeholder="Ej: proveedor, código, plazo de entrega…" />

        <label className="fl">Categoría</label>
        <input type="text" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Ej: Accesorios, Regalos…" list="sinimp-cats" />
        <datalist id="sinimp-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>

        <label className="fl">Subcategoría (opcional)</label>
        <input type="text" value={subcat} onChange={(e) => setSubcat(e.target.value)} list="sinimp-subcats" />
        <datalist id="sinimp-subcats">{subcats.map((c) => <option key={c} value={c} />)}</datalist>

        <label className="fl">Sub-subcategoría (opcional)</label>
        <input type="text" value={subsubcat} onChange={(e) => setSubsubcat(e.target.value)} list="sinimp-subsubcats" />
        <datalist id="sinimp-subsubcats">{subsubcats.map((c) => <option key={c} value={c} />)}</datalist>

        <label className="fl">Imágenes (la primera es la principal)</label>
        <BotonSubirImagenes alElegir={subirImagenes} deshabilitado={subiendo} cantidad={imagenes.length} maximo={MAX_IMAGENES} />
        {subiendo && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>Optimizando imagen...</div>}
        {imagenes.length > 0 && (
          <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
            {imagenes.map((url, i) => (
              <div key={url + i} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg2)', border: i === 0 ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
                <img src={url} alt={`Imagen ${i + 1}`} style={{ display: 'block', width: '100%', height: '90px', objectFit: 'contain' }} />
                {i === 0 && <span style={{ position: 'absolute', top: '2px', left: '2px', fontSize: '9px', background: 'var(--accent)', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>Principal</span>}
                {i !== 0 && (
                  <button type="button" onClick={() => hacerPrincipal(i)} title="Marcar como principal" style={{ position: 'absolute', top: '2px', right: '22px', width: '18px', height: '18px', padding: 0, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '11px', cursor: 'pointer' }}>⭐</button>
                )}
                <button type="button" onClick={() => quitarImagen(i)} title="Quitar imagen" style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', padding: 0, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '11px', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={guardando || subiendo} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar producto'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
