// Orden y secciones ocultas de una pantalla (la persona las acomoda con
// "Personalizar pantalla"). Funciones puras: lo que se guarda en la cuenta es
// { orden: [ids], ocultas: [ids] } y acá se combina con las secciones que la
// pantalla tiene HOY, para que una sección nueva (o una que se quitó en una
// versión posterior) no rompa lo que la persona ya había armado.

// Devuelve { orden, ocultas } listos para dibujar.
//   ids: las secciones de la pantalla, en su orden por defecto.
//   guardado: { orden?, ocultas? } tal como se guardó (puede venir vacío o viejo).
//   fijas: secciones que se pueden mover pero no ocultar (alimentan un cálculo
//          o tienen datos obligatorios).
// - Lo guardado que ya no existe en la pantalla se descarta.
// - Una sección nueva entra detrás de la que la precede por defecto.
// - Una sección fija nunca queda oculta, aunque lo guardado diga otra cosa.
export function combinarLayout(ids, guardado, fijas = []) {
  const g = guardado || {};
  const ordenGuardado = Array.isArray(g.orden) ? g.orden : [];
  const orden = ordenGuardado.filter((id, i) => ids.includes(id) && ordenGuardado.indexOf(id) === i);

  ids.forEach((id, i) => {
    if (orden.includes(id)) return;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = orden.indexOf(ids[j]);
      if (k >= 0) { pos = k + 1; break; }
    }
    orden.splice(pos, 0, id);
  });

  const ocultasGuardadas = Array.isArray(g.ocultas) ? g.ocultas : [];
  const ocultas = ocultasGuardadas.filter((id, i) => ids.includes(id) && !fijas.includes(id) && ocultasGuardadas.indexOf(id) === i);
  return { orden, ocultas };
}

// Sube (-1) o baja (+1) una sección respecto de la visible que tiene al lado
// (las ocultas no cuentan: se salta por encima). Si ya está en el borde, no cambia.
export function moverSeccion(orden, ocultas, id, delta) {
  const visibles = orden.filter((x) => !ocultas.includes(x));
  const i = visibles.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= visibles.length) return orden;
  const otro = visibles[j];
  const copia = [...orden];
  const a = copia.indexOf(id);
  const b = copia.indexOf(otro);
  [copia[a], copia[b]] = [copia[b], copia[a]];
  return copia;
}

// Oculta o vuelve a mostrar una sección. Una fija no se oculta.
export function alternarOculta(ocultas, id, fijas = []) {
  if (ocultas.includes(id)) return ocultas.filter((x) => x !== id);
  if (fijas.includes(id)) return ocultas;
  return [...ocultas, id];
}

// Agrupa secciones visibles contiguas que comparten `grupo` (por ejemplo, tres
// tarjetas que se dibujan en columnas). Devuelve una lista de
// { grupo, secciones: [...] }; una sección sin grupo va sola con grupo null.
export function agruparContiguas(secciones) {
  const bloques = [];
  secciones.forEach((s) => {
    const ultimo = bloques[bloques.length - 1];
    if (s.grupo && ultimo && ultimo.grupo === s.grupo) ultimo.secciones.push(s);
    else bloques.push({ grupo: s.grupo || null, secciones: [s] });
  });
  return bloques;
}
