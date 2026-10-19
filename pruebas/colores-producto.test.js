import { describe, it, expect } from 'vitest';
import { colorPermitido, combinacionPermitida, estaMarcado, hayLimiteDeColores, marcarColor } from '../src/utils/coloresProducto';

const p = { limitarColores: true, coloresElegidos: [{ color: 'Rojo', colorSecundario: '' }, { color: 'Azul', colorSecundario: 'Blanco' }] };

describe('colores disponibles de un producto', () => {
  it('con el límite activo solo se ofrecen los marcados', () => {
    expect(colorPermitido(p, 'Rojo')).toBe(true);
    expect(colorPermitido(p, 'Verde')).toBe(false);
    expect(combinacionPermitida(p, 'Azul', 'Blanco')).toBe(true);
    expect(combinacionPermitida(p, 'Azul', 'Negro')).toBe(false);
  });
  it('sin límite, o con límite pero ninguno marcado, se ofrecen todos', () => {
    expect(colorPermitido({ coloresElegidos: [{ color: 'Rojo' }] }, 'Verde')).toBe(true);
    expect(hayLimiteDeColores({ limitarColores: true, coloresElegidos: [] })).toBe(false);
    expect(colorPermitido({ limitarColores: true, coloresElegidos: [] }, 'Verde')).toBe(true);
    expect(colorPermitido(undefined, 'Verde')).toBe(true);
  });
  it('marcar y desmarcar sin repetir', () => {
    let l = marcarColor([], 'Rojo', '', true);
    l = marcarColor(l, 'Rojo', '', true);
    expect(l).toEqual([{ color: 'Rojo', colorSecundario: '' }]);
    expect(estaMarcado(l, 'Rojo', '')).toBe(true);
    expect(marcarColor(l, 'Rojo', '', false)).toEqual([]);
  });
});

import { ofreceColores, versionesSinColor } from '../src/utils/coloresProducto';

describe('validación de colores antes de confirmar', () => {
  const colores = [{ nombre: 'Rojo' }, { nombre: 'Azul' }];
  it('una versión sin color es un error si el producto ofrece colores', () => {
    expect(versionesSinColor({}, [{ cantidad: 2, color: '' }, { cantidad: 1, color: 'Rojo' }], colores, [])).toBe(1);
    expect(versionesSinColor({}, [{ cantidad: 2, color: 'Rojo' }], colores, [])).toBe(0);
  });
  it('no se exige si el producto no ofrece colores o si sale entero de stock sin color', () => {
    expect(versionesSinColor({}, [{ cantidad: 1, color: '' }], [], [])).toBe(0);
    expect(versionesSinColor({}, [{ cantidad: 2, color: '', deStock: 2 }], colores, [])).toBe(0);
    expect(versionesSinColor({}, [{ cantidad: 2, color: '', deStock: 1 }], colores, [])).toBe(1);
  });
  it('respeta los colores elegidos del producto y las combinaciones', () => {
    const p = { limitarColores: true, coloresElegidos: [{ color: 'Rojo', colorSecundario: '' }] };
    expect(ofreceColores(p, [{ nombre: 'Azul' }], [])).toBe(false);
    expect(ofreceColores({ modoColorSecundario: 'combinaciones' }, colores, [{ color: 'A', colorSecundario: 'B' }])).toBe(true);
    expect(versionesSinColor({ modoColorSecundario: 'combinaciones' }, [{ cantidad: 1, color: '' }], colores, [{ color: 'A', colorSecundario: 'B' }])).toBe(1);
  });
});
