import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { FUENTES, parsearFuente } from '../src/utils/fuentesLlaveros';
import { textoAlineado } from '../src/utils/jarrosCartel';

// Cada tipografía de la lista tiene que poder dibujar texto (Roboto Slab traía una tabla de sustituciones que opentype.js no soporta).
const ARCHIVOS = {
  'roboto-slab': 'roboto-slab/files/roboto-slab-latin-700-normal.woff',
  pacifico: 'pacifico/files/pacifico-latin-400-normal.woff',
  lobster: 'lobster/files/lobster-latin-400-normal.woff',
  bebas: 'bebas-neue/files/bebas-neue-latin-400-normal.woff',
  fredoka: 'fredoka/files/fredoka-latin-600-normal.woff',
  marker: 'permanent-marker/files/permanent-marker-latin-400-normal.woff',
  righteous: 'righteous/files/righteous-latin-400-normal.woff',
  baloo: 'baloo-2/files/baloo-2-latin-700-normal.woff',
  dancing: 'dancing-script/files/dancing-script-latin-700-normal.woff'
};
const leer = (id) => {
  const b = fs.readFileSync(`node_modules/@fontsource/${ARCHIVOS[id]}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
};

describe('tipografías del cartel', () => {
  it('la lista de archivos del test cubre todas las tipografías', () => {
    expect(FUENTES.map((f) => f.id).sort()).toEqual(Object.keys(ARCHIVOS).sort());
  });
  for (const f of FUENTES) {
    it(`${f.id} dibuja texto con ligaduras y sin errores`, () => {
      const fuente = parsearFuente(leer(f.id));
      const r = textoAlineado(fuente, 'Mi jarro\nCerveza fría fi fl', 10);
      expect(r.formas.length).toBeGreaterThan(5);
      expect(r.ancho).toBeGreaterThan(10);
    });
  }
});
