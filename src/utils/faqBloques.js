// Arma la lista de bloques (texto/imagen/video) a mostrar/editar de una
// pregunta frecuente. Preguntas creadas antes de que existiera `bloques`
// sólo tienen `respuesta` (string) y `videos` (string[]) -- en vez de migrar
// esos docs a mano, los reconstruimos al vuelo en este mismo formato: un
// bloque de texto con la respuesta vieja, seguido de un bloque por cada
// video que tuviera. La próxima vez que un admin edite y guarde esa
// pregunta, ya queda escrita en formato `bloques`.
export function obtenerBloques(item) {
  if (!item) return [];
  if (item.bloques && item.bloques.length > 0) return item.bloques;

  const bloques = [];
  if (item.respuesta) bloques.push({ tipo: 'texto', texto: item.respuesta });
  (item.videos || []).forEach(url => bloques.push({ tipo: 'video', url }));
  return bloques;
}
