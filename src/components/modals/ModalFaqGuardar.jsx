import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { comprimirImagen, subirImagenAFirebase, borrarImagenDeFirebase } from '../../utils/imageCompress';
import { obtenerBloques } from '../../utils/faqBloques';
import { rutaDeFaq } from '../../utils/faqCategoriaPath';

export default function ModalFaqGuardar({ isOpen, onClose, editId }) {
  const { faq, addFaq, updateFaq, getNewId, showToast, cuentaId } = useApp();
  const [pregunta, setPregunta] = useState('');
  // Ruta completa de categoría en un solo campo, niveles separados por "/"
  // (ver rutaDeFaq) -- reemplaza los campos separados de categoría y
  // subcategoría, para poder anidar tantos niveles como haga falta sin
  // tocar código.
  const [categoriaTexto, setCategoriaTexto] = useState('');
  const [bloques, setBloques] = useState([]);
  const [subiendoIdx, setSubiendoIdx] = useState(null);
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);
  // Igual que en ModalBibEditarCat: los archivos de Storage se borran
  // recién al Guardar, nunca al quitar un bloque/imagen de la lista local
  // (si el usuario cancela, la pregunta guardada debe seguir con sus
  // imágenes intactas). Para eso se registran las URLs que tenía la
  // pregunta al abrir y las subidas durante esta edición.
  const imagenesInicialesRef = useRef([]);
  const subidasSesionRef = useRef([]);

  const rutasExistentes = Array.from(new Set(faq.map(f => rutaDeFaq(f).join(' / ')))).sort();

  useEffect(() => {
    if (!isOpen) return;
    if (editId !== null) {
      const item = faq.find(f => f.id === editId);
      if (item) {
        setPregunta(item.pregunta || '');
        setCategoriaTexto(rutaDeFaq(item).join(' / '));
        const bloquesIniciales = obtenerBloques(item);
        setBloques(bloquesIniciales);
        imagenesInicialesRef.current = bloquesIniciales
          .filter(b => b.tipo === 'imagen' && b.url)
          .map(b => b.url);
        subidasSesionRef.current = [];
      }
    } else {
      setPregunta('');
      setCategoriaTexto('');
      setBloques([]);
      imagenesInicialesRef.current = [];
      subidasSesionRef.current = [];
    }
    // Sólo se reinicializa al abrir o cambiar de pregunta -- ver el mismo
    // comentario en ModalBibEditarCat.jsx sobre por qué no depende de `faq`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId]);

  if (!isOpen) return null;

  const mover = (from, to) => {
    if (to < 0 || to >= bloques.length || from === to) return;
    setBloques(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleDragStart = (index) => (e) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (index) => (e) => {
    e.preventDefault();
    if (overIndex !== index) setOverIndex(index);
  };
  const handleDrop = (index) => (e) => {
    e.preventDefault();
    if (dragIndex.current !== null) mover(dragIndex.current, index);
    dragIndex.current = null;
    setOverIndex(null);
  };
  const handleDragEnd = () => {
    dragIndex.current = null;
    setOverIndex(null);
  };

  const actualizarBloque = (idx, cambios) => {
    setBloques(prev => prev.map((b, i) => i === idx ? { ...b, ...cambios } : b));
  };

  const agregarBloque = (tipo) => {
    setBloques(prev => [...prev, tipo === 'texto' ? { tipo, texto: '' } : { tipo, url: '' }]);
  };

  // Sólo saca el bloque de la lista local: si tenía imagen, el archivo de
  // Storage se borra recién al Guardar (ver handleSave).
  const quitarBloque = (idx) => {
    setBloques(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImagenChange = async (idx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoIdx(idx);
    try {
      const { dataUrl } = await comprimirImagen(file, { maxWidth: 900, maxHeight: 900, maxBytes: 150 * 1024 });
      const url = await subirImagenAFirebase(dataUrl, {
        userId: cuentaId,
        fileName: file.name,
        folder: 'faq'
      });
      subidasSesionRef.current.push(url);
      actualizarBloque(idx, { url });
    } catch (err) {
      showToast(err.message || 'No se pudo procesar la imagen.', 'error');
    } finally {
      setSubiendoIdx(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleQuitarImagen = (idx) => {
    actualizarBloque(idx, { url: '' });
  };

  const handleSave = async () => {
    const cleanPregunta = pregunta.trim();
    if (!cleanPregunta) {
      showToast('La pregunta no puede estar vacía.', 'error');
      return;
    }
    const segmentos = categoriaTexto.split('/').map(s => s.trim()).filter(Boolean);
    const categoriaPath = segmentos.length ? segmentos : ['General'];
    const cleanBloques = bloques
      .map(b => b.tipo === 'texto' ? { tipo: 'texto', texto: b.texto.trim() } : b)
      .filter(b =>
        (b.tipo === 'texto' && b.texto) ||
        (b.tipo === 'imagen' && b.url) ||
        (b.tipo === 'video' && b.url && b.url.trim())
      );

    try {
      if (editId !== null) {
        await updateFaq(editId, {
          pregunta: cleanPregunta,
          categoriaPath,
          bloques: cleanBloques
        });
        showToast('✓ Pregunta actualizada.');
      } else {
        await addFaq({
          id: getNewId(),
          pregunta: cleanPregunta,
          categoriaPath,
          bloques: cleanBloques,
          orden: Date.now()
        });
        showToast('✓ Pregunta agregada.');
      }
    } catch (err) {
      console.error('Error al guardar pregunta frecuente:', err);
      return;
    }

    // El guardado ya está confirmado -- el modal se cierra acá, sin esperar
    // a la limpieza de imágenes de abajo (que es de mejor esfuerzo: si
    // falla, no debe dejar la pregunta ya guardada con el modal trabado).
    onClose();

    try {
      // Se limpian de Storage las imágenes que quedaron sin referencia (las
      // que tenía la pregunta y se quitaron, y las subidas en esta sesión
      // que se descartaron).
      const referenciadas = new Set(
        cleanBloques.filter(b => b.tipo === 'imagen' && b.url).map(b => b.url)
      );
      const sinReferencia = [...new Set([...imagenesInicialesRef.current, ...subidasSesionRef.current])]
        .filter(url => url && !referenciadas.has(url));
      for (const url of sinReferencia) {
        await borrarImagenDeFirebase(url);
      }
    } catch (err) {
      console.error('Error al limpiar imágenes sin referencia de la pregunta frecuente:', err);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{editId !== null ? 'Editar pregunta' : 'Agregar pregunta'}</div>

        <label className="fl">Pregunta</label>
        <input
          type="text"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Ej: ¿Cómo cambio el precio de un filamento?"
        />

        <label className="fl">Categoría</label>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' }}>
          Separá los niveles con "/", ej: Pedidos / Capacidad de producción y ETA. Para forzar el orden,
          anteponé un número al nombre (ej: "1. Pedidos") -- el orden es siempre alfabético.
        </div>
        <input
          type="text"
          value={categoriaTexto}
          onChange={(e) => setCategoriaTexto(e.target.value)}
          placeholder="Ej: Pedidos / Capacidad de producción y ETA"
          list="faq-cats-list-modal"
        />
        <datalist id="faq-cats-list-modal">
          {rutasExistentes.map((ruta, idx) => (
            <option key={idx} value={ruta} />
          ))}
        </datalist>

        <label className="fl">Respuesta</label>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
          Armá la respuesta intercalando párrafos, imágenes y videos en el orden que quieras. Usá **texto** para negrita y líneas que empiecen con "- " para listas.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bloques.map((bloque, idx) => (
            <div
              key={idx}
              draggable
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDrop={handleDrop(idx)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                gap: '8px',
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: overIndex === idx ? 'var(--bg3)' : 'var(--bg2)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', paddingTop: '4px', flexShrink: 0 }}>
                <span aria-hidden="true" style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', cursor: 'grab' }}>⠿</span>
                <button className="btn btn-sm" style={{ padding: '1px 6px' }} disabled={idx === 0} onClick={() => mover(idx, idx - 1)} title="Subir">↑</button>
                <button className="btn btn-sm" style={{ padding: '1px 6px' }} disabled={idx === bloques.length - 1} onClick={() => mover(idx, idx + 1)} title="Bajar">↓</button>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>
                  {bloque.tipo === 'texto' ? 'Párrafo' : bloque.tipo === 'imagen' ? 'Imagen' : 'Video'}
                </div>

                {bloque.tipo === 'texto' && (
                  <textarea
                    rows={3}
                    value={bloque.texto}
                    onChange={(e) => actualizarBloque(idx, { texto: e.target.value })}
                    placeholder="Escribí un párrafo de la respuesta..."
                  />
                )}

                {bloque.tipo === 'video' && (
                  <input
                    type="text"
                    value={bloque.url}
                    onChange={(e) => actualizarBloque(idx, { url: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                )}

                {bloque.tipo === 'imagen' && (
                  subiendoIdx === idx ? (
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Subiendo imagen...</div>
                  ) : bloque.url ? (
                    <div>
                      <img src={bloque.url} alt="" style={{ maxWidth: '100%', maxHeight: '160px', display: 'block', borderRadius: '6px', border: '1px solid var(--border)' }} />
                      <button className="btn btn-danger btn-sm" style={{ marginTop: '6px', fontSize: '11px' }} onClick={() => handleQuitarImagen(idx)}>Quitar imagen</button>
                    </div>
                  ) : (
                    <input type="file" accept="image/*" onChange={(e) => handleImagenChange(idx, e)} />
                  )
                )}
              </div>

              <button className="btn btn-sm" style={{ height: 'fit-content' }} onClick={() => quitarBloque(idx)} title="Eliminar bloque">×</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          <button className="btn btn-sm" onClick={() => agregarBloque('texto')}>+ Párrafo</button>
          <button className="btn btn-sm" onClick={() => agregarBloque('imagen')}>+ Imagen</button>
          <button className="btn btn-sm" onClick={() => agregarBloque('video')}>+ Video</button>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
