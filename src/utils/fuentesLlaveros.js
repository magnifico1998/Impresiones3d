// Tipografías incluidas para el generador de llaveros (licencia libre, vía
// @fontsource) y carga de una propia (.ttf / .otf / .woff). Se descargan
// recién cuando se eligen y quedan en memoria.
import * as opentypeNs from 'opentype.js';
import robotoSlab from '@fontsource/roboto-slab/files/roboto-slab-latin-700-normal.woff?url';
import pacifico from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url';
import lobster from '@fontsource/lobster/files/lobster-latin-400-normal.woff?url';
import bebas from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url';
import fredoka from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff?url';
import permanentMarker from '@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff?url';
import righteous from '@fontsource/righteous/files/righteous-latin-400-normal.woff?url';
import baloo from '@fontsource/baloo-2/files/baloo-2-latin-700-normal.woff?url';
import dancing from '@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?url';

// opentype.js exporta distinto según el empaquetador.
const opentype = opentypeNs.parse ? opentypeNs : opentypeNs.default;

export const FUENTES = [
  { id: 'fredoka', nombre: 'Fredoka (redonda)', url: fredoka },
  { id: 'baloo', nombre: 'Baloo (redonda gruesa)', url: baloo },
  { id: 'bebas', nombre: 'Bebas Neue (alta, mayúsculas)', url: bebas },
  { id: 'righteous', nombre: 'Righteous (moderna)', url: righteous },
  { id: 'roboto-slab', nombre: 'Roboto Slab (con serif)', url: robotoSlab },
  { id: 'marker', nombre: 'Permanent Marker (marcador)', url: permanentMarker },
  { id: 'lobster', nombre: 'Lobster (cursiva)', url: lobster },
  { id: 'pacifico', nombre: 'Pacifico (cursiva)', url: pacifico },
  { id: 'dancing', nombre: 'Dancing Script (cursiva fina)', url: dancing }
];

const cache = new Map();

export function parsearFuente(buffer) {
  return opentype.parse(buffer);
}

export async function cargarFuente(id) {
  if (cache.has(id)) return cache.get(id);
  const def = FUENTES.find((f) => f.id === id);
  if (!def) throw new Error('Tipografía desconocida.');
  const r = await fetch(def.url);
  if (!r.ok) throw new Error('No se pudo bajar la tipografía.');
  const fuente = parsearFuente(await r.arrayBuffer());
  cache.set(id, fuente);
  return fuente;
}
