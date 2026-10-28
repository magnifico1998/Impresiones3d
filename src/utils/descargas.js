// Descarga de archivos generados en el navegador.
export function descargar(bytes, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Nombre de archivo sin los caracteres que Windows no acepta.
export const nombreArchivo = (s, respaldo = 'llavero') => (s || respaldo).replace(/[\\/:*?"<>|]+/g, '-').trim() || respaldo;
