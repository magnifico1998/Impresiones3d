// Arma la lista de bloques (texto/imagen/video) a mostrar/editar de una
// pregunta frecuente. (El formato viejo `respuesta`/`videos` ya no existe
// en la colección: todas las FAQs están migradas a `bloques`.)
export function obtenerBloques(item) {
  return item?.bloques ?? [];
}
