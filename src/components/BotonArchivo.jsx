import React, { useRef } from 'react';

// Botón para elegir un archivo de la computadora: reemplaza al selector del navegador, cuyo texto ("Seleccionar archivo /
// Ningún archivo seleccionado") no invita a tocar. `alElegir(archivo, evento)` recibe el primer archivo elegido; después de elegir
// se limpia el campo para poder volver a elegir el mismo.
export default function BotonArchivo({ accept, alElegir, etiqueta = '📂 Elegir archivo', deshabilitado = false, primario = true, chico = true }) {
  const ref = useRef(null);
  return (
    <>
      <button
        type="button" className={`btn ${primario ? 'btn-primary' : ''} ${chico ? 'btn-sm' : ''}`} disabled={deshabilitado}
        onClick={() => ref.current?.click()}
      >
        {etiqueta}
      </button>
      <input
        ref={ref} type="file" accept={accept} hidden
        onChange={(e) => { alElegir?.(e.target.files?.[0], e); if (ref.current) ref.current.value = ''; }}
      />
    </>
  );
}
