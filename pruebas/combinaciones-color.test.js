import { describe, it, expect } from 'vitest';
import { combinacionElegida, textoCombinacion, valorCombinacion } from '../src/utils/combinacionesColor';

const combos = [{ color: 'Azul', colorSecundario: 'Blanco' }, { color: 'Rojo', colorSecundario: 'Negro' }];

describe('combinaciones de colores', () => {
  it('elegir una combinación devuelve los dos colores', () => {
    expect(combinacionElegida(valorCombinacion(1), combos)).toEqual({ color: 'Rojo', colorSecundario: 'Negro' });
  });
  it('un color común no es una combinación', () => {
    expect(combinacionElegida('Azul', combos)).toBeNull();
    expect(combinacionElegida('', combos)).toBeNull();
    expect(combinacionElegida('combo:9', combos)).toBeNull();
    expect(combinacionElegida('combo:0', undefined)).toBeNull();
  });
  it('texto legible', () => {
    expect(textoCombinacion(combos[0])).toBe('Azul + Blanco');
  });
});
