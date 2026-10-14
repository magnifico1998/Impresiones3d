import { describe, it, expect } from 'vitest';
import { productosDePresupuesto, resumenDeProductos } from '../src/utils/resumenPresupuesto';

describe('resumen de productos del presupuesto', () => {
  it('lista los nombres de producto', () => {
    const p = { items: [{ nombre: 'Llavero' }, { nombre: 'Maceta' }, { nombre: 'Soporte' }] };
    expect(resumenDeProductos(p)).toBe('3 productos · Llavero, Maceta, Soporte');
  });
  it('no repite un producto en varias líneas y cuenta las líneas', () => {
    const p = { items: [{ nombre: 'Llavero' }, { nombre: ' llavero ' }] };
    expect(productosDePresupuesto(p)).toEqual(['Llavero']);
    expect(resumenDeProductos(p)).toBe('2 productos · Llavero');
  });
  it('singular y sin items', () => {
    expect(resumenDeProductos({ items: [{ nombre: 'Maceta' }] })).toBe('1 producto · Maceta');
    expect(resumenDeProductos({})).toBe('0 productos');
  });
});
