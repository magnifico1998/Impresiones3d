import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { linkificar } from '../src/utils/linkificar';

const html = (t) => renderToStaticMarkup(<div>{linkificar(t)}</div>);

describe('linkificar (descripción extendida del catálogo)', () => {
  it('convierte una dirección con https en link', () => {
    expect(html('Mirá https://sitio.com/a')).toContain('<a href="https://sitio.com/a"');
  });
  it('agrega https a las que empiezan con www', () => {
    expect(html('www.sitio.com')).toContain('href="https://www.sitio.com"');
  });
  it('deja fuera del link la puntuación final', () => {
    const h = html('Manual: https://sitio.com/a.');
    expect(h).toContain('href="https://sitio.com/a"');
    expect(h).toContain('</a>.');
  });
  it('no toca un texto sin direcciones', () => {
    expect(html('Sin links')).toBe('<div>Sin links</div>');
  });
});
