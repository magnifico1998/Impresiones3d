import { describe, it, expect } from 'vitest';
import { normalizarStock, stockTotal, stockDeVariante, repartirConStock, descontarStock, textoStock } from '../src/utils/stock';

const stock = [{ color: 'Rojo', cantidad: 3 }, { color: 'Azul', colorSecundario: 'Blanco', cantidad: 2 }, { color: '', cantidad: 1 }];

describe('stock de productos', () => {
  it('normaliza: suma repetidas y saca vacías', () => {
    expect(normalizarStock([{ color: 'Rojo', cantidad: 2 }, { color: ' Rojo ', cantidad: '3' }, { color: 'Azul', cantidad: 0 }, null]))
      .toEqual([{ color: 'Rojo', colorSecundario: '', cantidad: 5 }]);
  });
  it('total y por variante', () => {
    expect(stockTotal(stock)).toBe(6);
    expect(stockDeVariante(stock, 'Azul', 'Blanco')).toBe(2);
    expect(stockDeVariante(stock, 'Azul', '')).toBe(0);
    expect(stockDeVariante(stock, '', '')).toBe(1);
  });
  it('texto legible', () => {
    expect(textoStock(stock)).toBe('Rojo 3 · Azul + Blanco 2 · Sin color 1');
  });
  it('reparte entre stock y a pedido', () => {
    const r = repartirConStock(stock, [{ cantidad: 5, color: 'Rojo' }, { cantidad: 2, color: 'Verde' }]);
    expect(r.map((v) => v.deStock)).toEqual([3, 0]);
  });
  it('dos versiones de la misma variante consumen el mismo stock', () => {
    const r = repartirConStock(stock, [{ cantidad: 2, color: 'Rojo' }, { cantidad: 2, color: 'Rojo' }]);
    expect(r.map((v) => v.deStock)).toEqual([2, 1]);
  });
  it('descuenta lo que salió de stock y no deja negativos', () => {
    const r = descontarStock(stock, [{ color: 'Rojo', deStock: 3 }, { color: '', deStock: 9 }]);
    expect(r).toEqual([{ color: 'Azul', colorSecundario: 'Blanco', cantidad: 2 }]);
  });
});

import { repartoParaImportar } from '../src/utils/stock';

describe('importar solicitud de la tienda', () => {
  it('toma lo menor entre lo declarado y el stock real', () => {
    const r = repartoParaImportar([{ color: 'Rojo', cantidad: 2 }], [{ cantidad: 3, color: 'Rojo', deStock: 3 }, { cantidad: 1, color: 'Azul', deStock: 1 }]);
    expect(r.map((v) => v.deStock)).toEqual([2, 0]);
  });
  it('una solicitud sin deStock queda toda a pedido', () => {
    expect(repartoParaImportar([{ color: 'Rojo', cantidad: 5 }], [{ cantidad: 2, color: 'Rojo' }])[0].deStock).toBe(0);
  });
});
