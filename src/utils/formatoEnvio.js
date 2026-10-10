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
