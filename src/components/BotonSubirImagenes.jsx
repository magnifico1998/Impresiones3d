import React, { useRef } from 'react';

// Botón para elegir las fotos de un producto (Biblioteca): reemplaza al selector de archivos del navegador, cuyo texto
// ("Seleccionar archivos / Ningún archivo seleccionado") no se entendía. `alElegir` recibe el mismo evento que un
// <input type="file" multiple>.
export default function BotonSubirImagenes({ alElegir, deshabilitado, cantidad, maximo }) {
  const ref = useRef(null);
  const lleno = cantidad >= maximo;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-primary btn-sm" disabled={deshabilitado || lleno} onClick={() => ref.current?.click()}>
        📷 Subir imágenes
      </button>
      <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
        {lleno ? `Llegaste al máximo de ${maximo} imágenes` : `${cantidad} de ${maximo} cargadas`}
      </span>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { alElegir(e); if (ref.current) ref.current.value = ''; }}
      />
    </div>
  );
}
