// Qué impresoras pueden recibir un archivo, según su formato.
//
// Un .3mf puede ser dos cosas distintas:
//   - un G-code laminado dentro de un .3mf (en Bambu Studio / Orca: "Exportar archivo de la placa
//     laminada" → *.gcode.3mf): ya está listo para imprimir.
//   - un proyecto .3mf (modelo + perfil de impresión, sin laminar): hay que abrirlo en el programa de
//     laminado, revisar el perfil, laminar y recién ahí mandarlo.
// Un proyecto sin laminar NUNCA se manda directo a una impresora: sólo a un programa de laminado
// (Creality Print, Bambu Studio, Anycubic Slicer Next) o a una carpeta.

export const esLaminado = (nombre) => /\.gcode\.3mf$/i.test(String(nombre || ''));
export const esProyecto3mf = (archivo) => archivo?.formato === '3mf' && !esLaminado(archivo.nombre);

// `impresora`: lo que el conector informa de cada una ({ formatos, puedeImprimir, abre, guarda… }).
export function puedeRecibir(impresora, archivo) {
  if (impresora?.formatos && !impresora.formatos.includes(archivo?.formato)) return false;
  // Un proyecto sin laminar no se manda directo a la impresora: sólo a un programa de laminado o a una carpeta.
  if (esProyecto3mf(archivo) && impresora?.puedeImprimir) return false;
  return true;
}

// Cómo se distingue cada tipo de archivo en las listas (insignia con ícono y color), por si hay archivos con el
// mismo nombre pero de distinto tipo (por ejemplo "Llavero.3mf" y "Llavero.gcode.3mf").
export function tipoDeArchivo(archivo) {
  const nombre = String(archivo?.nombre || '');
  if (esLaminado(nombre)) {
    return { clave: 'laminado', icono: '📦', etiqueta: '3MF laminado', ayuda: '.gcode.3mf: proyecto ya laminado, listo para imprimir', color: 'var(--accent)', fondo: 'var(--accentDim)' };
  }
  if (/\.3mf$/i.test(nombre) || archivo?.formato === '3mf') {
    return { clave: 'proyecto', icono: '🧩', etiqueta: 'Proyecto 3MF', ayuda: '.3mf: proyecto con el perfil de impresión, sin laminar (se abre en el slicer)', color: 'var(--warn)', fondo: 'var(--warnDim)' };
  }
  return { clave: 'gcode', icono: '📄', etiqueta: 'G-code', ayuda: '.gcode: archivo laminado listo para imprimir', color: 'var(--info)', fondo: 'var(--infoDim)' };
}
