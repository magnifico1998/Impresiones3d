import React, { useRef, useState } from 'react';
import { comprimirImagen } from '../utils/imageCompress';
import { MAX_ADJUNTOS, MAX_COMENTARIO_ADJUNTO, OPCIONES_POR_HOJA, hojasDeAnexo } from '../utils/adjuntosPresupuesto';

// Imágenes adjuntas de un presupuesto (un render, una foto de referencia…), cada
// una con su comentario. Salen en hojas de anexo al final del PDF (ver
// utils/presupuestoPDF.js). Las imágenes nuevas quedan en el navegador (`dataUrl`)
// hasta que se guarda el presupuesto: ahí se suben a Storage (ModalPresupuesto).
//   adjuntos: [{ id, url?, dataUrl?, comentario }]   porHoja: 1 | 2 | 4
export default function AdjuntosPresupuesto({ adjuntos, setAdjuntos, porHoja, setPorHoja, showToast }) {
  const inputRef = useRef(null);
  const [procesando, setProcesando] = useState(false);

  const agregar = async (e) => {
    const archivos = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!archivos.length) return;
    const lugar = MAX_ADJUNTOS - adjuntos.length;
    if (lugar <= 0) { showToast(`Se pueden adjuntar hasta ${MAX_ADJUNTOS} imágenes.`, 'error'); return; }
    if (archivos.length > lugar) showToast(`Sólo entran ${lugar} más: se agregan las primeras ${lugar}.`, 'info');
    setProcesando(true);
    const nuevas = [];
    for (const archivo of archivos.slice(0, lugar)) {
      try {
        // Más grande que las fotos de producto: un render con detalle tiene que verse bien en el PDF.
        const { dataUrl } = await comprimirImagen(archivo, { maxWidth: 1400, maxHeight: 1400, maxBytes: 260 * 1024 });
        nuevas.push({ id: Date.now() + Math.random(), dataUrl, comentario: '' });
      } catch (err) {
        showToast(err.message || 'No se pudo procesar la imagen.', 'error');
      }
    }
    setAdjuntos((prev) => [...prev, ...nuevas]);
    setProcesando(false);
  };

  const cambiarComentario = (id, comentario) => setAdjuntos((prev) => prev.map((a) => (a.id === id ? { ...a, comentario: comentario.slice(0, MAX_COMENTARIO_ADJUNTO) } : a)));
  const quitar = (id) => setAdjuntos((prev) => prev.filter((a) => a.id !== id));
  const mover = (id, d) => setAdjuntos((prev) => {
    const i = prev.findIndex((a) => a.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const copia = [...prev];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });

  const hojas = hojasDeAnexo(adjuntos.length, porHoja);

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <label className="fl" style={{ margin: 0 }}>Imágenes adjuntas (opcional)</label>
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={procesando || adjuntos.length >= MAX_ADJUNTOS}>
          {procesando ? 'Procesando…' : '+ Agregar imágenes'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={agregar} />
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{adjuntos.length}/{MAX_ADJUNTOS}</span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
        Van en hojas de anexo al final del PDF, con su comentario. Sirve para un render, una foto de referencia o un plano.
      </div>

      {adjuntos.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Imágenes por hoja:</span>
            {OPCIONES_POR_HOJA.map((o) => (
              <button key={o.n} type="button" className={`btn btn-sm ${porHoja === o.n ? 'btn-primary' : ''}`} onClick={() => setPorHoja(o.n)} title={o.ayuda}>
                {o.n}
              </button>
            ))}
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
              {OPCIONES_POR_HOJA.find((o) => o.n === porHoja)?.ayuda} · {hojas} hoja{hojas === 1 ? '' : 's'} de anexo
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px', marginTop: '10px' }}>
            {adjuntos.map((a, i) => (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ position: 'relative', background: 'var(--bg3)', borderRadius: '6px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={a.dataUrl || a.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '10px', fontFamily: 'var(--mono)', background: 'var(--bg)', padding: '1px 5px', borderRadius: '8px' }}>{i + 1}</span>
                </div>
                <textarea
                  rows={2}
                  value={a.comentario}
                  onChange={(e) => cambiarComentario(a.id, e.target.value)}
                  placeholder="Comentario (opcional)"
                  style={{ fontSize: '12px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-sm" onClick={() => mover(a.id, -1)} disabled={i === 0} aria-label="Mover antes">←</button>
                  <button type="button" className="btn btn-sm" onClick={() => mover(a.id, 1)} disabled={i === adjuntos.length - 1} aria-label="Mover después">→</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => quitar(a.id)} aria-label="Quitar imagen">✕</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
