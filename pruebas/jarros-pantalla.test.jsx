import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// La pantalla sólo necesita el aviso de errores del contexto de la app.
vi.mock('../src/context/contextos', () => ({ useUi: () => ({ showToast: () => {} }), useConfig: () => ({}) }));
// El visor 3D usa WebGL (sólo en efectos, que no corren acá); se reemplaza por un marcador.
vi.mock('../src/components/herramientas/VisorPiezas', () => ({ default: () => <div data-visor /> }));

import HerramientaJarros from '../src/components/herramientas/HerramientaJarros';

describe('jarros: la pantalla se dibuja', () => {
  it('muestra todos los pasos, los editores y las exportaciones sin errores', () => {
    const html = renderToStaticMarkup(<HerramientaJarros />);
    for (const texto of ['Estilos y diseños', 'Estilos listos para usar', 'Abrir un diseño compartido', 'Lata y hueco', 'Cuerpo', 'Silueta', 'Complementos del asa', 'Envoltura del agarre', 'Símbolo sobre el asa', 'Placas de montaje decorativas', 'Impresión y costos', 'Guardar en la Biblioteca', 'Textura del cuerpo', 'Duelas de madera', 'Asa', 'Forma del asa', 'Nombre y cartel', 'Colores', 'Exportar', 'Liso', 'Despiece']) {
      expect(html, texto).toContain(texto);
    }
    // Los dos editores de puntos (silueta y asa) se dibujan como SVG con puntos para arrastrar.
    expect((html.match(/<svg/g) || []).length).toBe(2);
    expect((html.match(/<circle/g) || []).length).toBe(5); // silueta recta: 2 puntos; asa clásica: 3
    expect(html).toContain('data-visor');
  });

  it('el cartel está apagado de arranque: sus controles aparecen al activarlo', () => {
    const html = renderToStaticMarkup(<HerramientaJarros />);
    expect(html).toContain('Con cartel con el nombre');
    expect(html).not.toContain('Forma del cartel');
    expect(html).not.toContain('Cartel desmontable');
  });
});
