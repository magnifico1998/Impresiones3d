import { describe, it, expect } from 'vitest';
import { fotoDeColor, normalizarFotosColor, ponerFotoColor } from '../src/utils/fotosColor';

const fotos = [
  { color: 'Rojo', colorSecundario: '', imagen: 'a.jpg' },
  { color: 'Azul', colorSecundario: 'Blanco', imagen: 'b.jpg' }
];

describe('foto de cada color', () => {
  it('busca la combinación exacta y si no, el color solo', () => {
    expect(fotoDeColor(fotos, 'Azul', 'Blanco')).toBe('b.jpg');
    expect(fotoDeColor(fotos, 'Rojo', 'Negro')).toBe('a.jpg');
    expect(fotoDeColor(fotos, 'Azul', '')).toBe('');
    expect(fotoDeColor(fotos, '', '')).toBe('');
    expect(fotoDeColor(undefined, 'Rojo', '')).toBe('');
  });
  it('al guardar descarta las que apuntan a una imagen quitada y las repetidas', () => {
    const r = normalizarFotosColor([...fotos, { color: 'Rojo', colorSecundario: '', imagen: 'a.jpg' }, { color: 'Verde', imagen: 'c.jpg' }], ['a.jpg', 'b.jpg']);
    expect(r).toEqual(fotos);
  });
  it('poner y quitar la foto de una variante', () => {
    const con = ponerFotoColor(fotos, 'Rojo', '', 'z.jpg');
    expect(fotoDeColor(con, 'Rojo', '')).toBe('z.jpg');
    expect(ponerFotoColor(con, 'Rojo', '', '')).toEqual([fotos[1]]);
  });
});
