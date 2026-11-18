import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// El almacén de preferencias habla con Firestore: acá se reemplaza por uno en memoria.
const preferencias = { pantallas: {} };
vi.mock('../src/context/preferenciasUi', () => ({
  usePreferenciasUi: () => ({ layoutDe: (p) => preferencias.pantallas[p] || null, guardarLayout: () => {} })
}));

import SeccionesPersonalizables from '../src/components/SeccionesPersonalizables';

const secciones = [
  { id: 'a', titulo: 'Sección A', nodo: <div data-sec="a">A</div> },
  { id: 'b', titulo: 'Sección B', nodo: <div data-sec="b">B</div> },
  { id: 'c', titulo: 'Sección C', fija: true, nodo: <div data-sec="c">C</div> }
];

const dibujar = (extra = {}) => renderToStaticMarkup(
  <SeccionesPersonalizables pantalla="prueba" secciones={secciones} encabezado={<h1>Título</h1>} {...extra} />
);
const orden = (html) => [...html.matchAll(/data-sec="(\w)"/g)].map((m) => m[1]);

describe('pantalla personalizable: dibujo', () => {
  it('muestra el botón para personalizar, el encabezado y las secciones en su orden', () => {
    preferencias.pantallas = {};
    const html = dibujar();
    expect(html).toContain('Personalizar pantalla');
    expect(html).toContain('Título');
    expect(orden(html)).toEqual(['a', 'b', 'c']);
    // Sin personalizar no hay barras ni panel.
    expect(html).not.toContain('seccion-barra');
    expect(html).not.toContain('Restaurar orden original');
  });

  it('respeta el orden guardado y no dibuja las ocultas', () => {
    preferencias.pantallas = { prueba: { orden: ['c', 'a', 'b'], ocultas: ['b'] } };
    expect(orden(dibujar())).toEqual(['c', 'a']);
  });

  it('una sección fija no se oculta aunque lo guardado lo pida', () => {
    preferencias.pantallas = { prueba: { orden: ['a', 'b', 'c'], ocultas: ['c'] } };
    expect(orden(dibujar())).toEqual(['a', 'b', 'c']);
  });

  it('dibuja las secciones del mismo grupo dentro de un mismo contenedor', () => {
    preferencias.pantallas = {};
    const conGrupo = [
      { id: 'a', titulo: 'A', nodo: <div data-sec="a" /> },
      { id: 'b', titulo: 'B', grupo: 'cols', nodo: <div data-sec="b" /> },
      { id: 'c', titulo: 'C', grupo: 'cols', nodo: <div data-sec="c" /> }
    ];
    const html = renderToStaticMarkup(<SeccionesPersonalizables pantalla="prueba" secciones={conGrupo} grupos={{ cols: 'grid3' }} />);
    // Las dos secciones del grupo van juntas dentro del contenedor; la primera, que no tiene grupo, queda afuera.
    const contenedor = html.slice(html.indexOf('<div class="grid3">'));
    expect(html).toContain('<div class="grid3">');
    expect(contenedor).toContain('data-sec="b"');
    expect(contenedor).toContain('data-sec="c"');
    expect(html.indexOf('data-sec="a"')).toBeLessThan(html.indexOf('<div class="grid3">'));
  });
});
