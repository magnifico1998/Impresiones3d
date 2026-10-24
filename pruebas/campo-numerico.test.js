import { describe, it, expect } from 'vitest';
import { valorAlDejarVacio } from '../src/utils/campoNumerico';

describe('campo numérico: con qué se completa un campo que quedó vacío', () => {
  it('sin mínimo, o con mínimo 0 o negativo, queda en 0', () => {
    expect(valorAlDejarVacio(undefined)).toBe(0);
    expect(valorAlDejarVacio('')).toBe(0);
    expect(valorAlDejarVacio('0')).toBe(0);
    expect(valorAlDejarVacio(0)).toBe(0);
    expect(valorAlDejarVacio('-5')).toBe(0);
  });

  it('con un mínimo mayor a 0 (una cantidad que no puede ser 0), queda en el mínimo', () => {
    expect(valorAlDejarVacio('1')).toBe(1);
    expect(valorAlDejarVacio(1)).toBe(1);
    expect(valorAlDejarVacio('50')).toBe(50);
    expect(valorAlDejarVacio('0.5')).toBe(0.5);
  });

  it('nunca devuelve vacío, null ni NaN', () => {
    for (const min of [undefined, null, '', 'abc', NaN, '1']) {
      expect(Number.isFinite(valorAlDejarVacio(min))).toBe(true);
    }
  });
});
