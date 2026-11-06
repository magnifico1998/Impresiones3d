import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Las herramientas sólo necesitan el aviso de errores del contexto de la app; el visor 3D usa WebGL (en efectos, que no
// corren acá) y se reemplaza por un marcador.
vi.mock('../src/context/contextos', () => ({ useUi: () => ({ showToast: () => {} }), useConfig: () => ({}), useCuenta: () => ({}) }));
vi.mock('../src/components/herramientas/VisorPiezas', () => ({ default: () => <div data-visor /> }));

import HerramientaJarros from '../src/components/herramientas/HerramientaJarros';
import HerramientaLlaveros from '../src/components/herramientas/HerramientaLlaveros';
import HerramientaImagenLlavero from '../src/components/herramientas/HerramientaImagenLlavero';
import HerramientaSepararColores from '../src/components/herramientas/HerramientaSepararColores';
import HerramientaSuperficie from '../src/components/herramientas/HerramientaSuperficie';

const cuenta = (html, texto) => (html.match(new RegExp(texto, 'g')) || []).length;

describe('herramientas: las tarjetas arrancan plegadas y conservan su contenido', () => {
  const casos = [
    ['Jarros porta-lata', () => <HerramientaJarros />, 6],
    ['Llaveros', () => <HerramientaLlaveros modo="llavero" />, 5], // sin la tarjeta del lápiz
    ['Imagen a llavero', () => <HerramientaImagenLlavero />, 3],
    ['Separar por colores', () => <HerramientaSepararColores />, 1], // las demás aparecen al cargar un modelo
    ['Modificador de superficies', () => <HerramientaSuperficie />, 8]
  ];
  for (const [nombre, dibujar, minimo] of casos) {
    it(nombre, () => {
      const html = renderToStaticMarkup(dibujar());
      // Todas las tarjetas arrancan cerradas (aria-expanded="false") y ninguna abierta.
      expect(cuenta(html, 'aria-expanded="false"'), nombre).toBeGreaterThanOrEqual(minimo);
      expect(cuenta(html, 'aria-expanded="true"'), nombre).toBe(0);
      // El contenido sigue armado, sólo oculto: no se pierde lo que haya adentro.
      expect(cuenta(html, 'display:none'), nombre).toBeGreaterThanOrEqual(minimo);
    });
  }

  it('el jarro muestra un resumen de cada tarjeta cerrada', () => {
    const html = renderToStaticMarkup(<HerramientaJarros />);
    expect(html).toContain('70,5 × 170 mm');
    expect(html).toContain('silueta: Recto');
    expect(html).toContain('Clásica · pegada');
    expect(html).toContain('sin cartel');
  });
});
