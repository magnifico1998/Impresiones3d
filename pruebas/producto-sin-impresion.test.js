import { describe, it, expect } from 'vitest';
import { esSinImpresion, precioDesdeMargen, margenDesdePrecio, camposSinImpresion } from '../src/utils/productoSinImpresion';
import { piezaDesdeBiblioteca } from '../src/utils/piezaPedido';
import { estimarConsumoPedido, pedidoSinConsumo } from '../src/utils/consumoPedido';

const reventa = { id: 7, nombre: 'Termo', ...camposSinImpresion({ costo: 10000, precio: 15000 }) };

describe('productos sin impresión', () => {
  it('precio recomendado = costo + margen; el margen sale del precio', () => {
    expect(precioDesdeMargen(10000, 50)).toBe(15000);
    expect(precioDesdeMargen(0, 50)).toBe(0);
    expect(margenDesdePrecio(10000, 15000)).toBe(50);
    expect(margenDesdePrecio(0, 15000)).toBe(0);
  });

  it('se reconoce por el tipo y no lleva datos de impresión', () => {
    expect(esSinImpresion(reventa)).toBe(true);
    expect(esSinImpresion({ nombre: 'Pieza impresa' })).toBe(false);
    expect(reventa).toMatchObject({ tipo: 'reventa', costoUnitario: 10000, precioSugUnitario: 15000, margen: 50, horas: 0, gramos: 0, impresoraNombre: null });
  });

  it('la pieza del pedido hereda costo y precio, sin horas, y queda marcada', () => {
    const pz = piezaDesdeBiblioteca(reventa, { id: 1, nombre: 'Termo', cantidad: 2, precioUnitario: 15000 }, { kwh: 100, impresoras: [] });
    expect(pz).toMatchObject({ bibliotecaId: 7, costoUnitario: 10000, precioVenta: 15000, horas: 0, gramos: 0, sinImpresion: true });
    expect(pz.costeElec + pz.costeMant + pz.costeMO).toBe(0);
  });

  it('no pide descontar filamento de un producto sin impresión', () => {
    const pedido = { piezas: [{ nombre: 'Termo', cantidad: 2, sinImpresion: true, versiones: [{ cantidad: 2, color: 'Rojo' }] }, { nombre: 'Soporte', cantidad: 1, gramos: 20, versiones: [{ cantidad: 1, color: 'Negro' }] }] };
    const { lineas } = estimarConsumoPedido(pedido, [reventa], {});
    expect(lineas.map((l) => l.pieza)).toEqual(['Soporte']);
    // Aunque la pieza no traiga la marca (pedidos viejos), se reconoce por el producto de la Biblioteca.
    const { lineas: l2 } = estimarConsumoPedido({ piezas: [{ nombre: 'Termo', cantidad: 1 }] }, [reventa], {});
    expect(l2).toHaveLength(0);
  });

  it('un pedido solo de reventa no abre el descuento de inventario', () => {
    const soloReventa = { piezas: [{ nombre: 'Termo', cantidad: 1, sinImpresion: true }], insumos: [] };
    expect(pedidoSinConsumo(soloReventa, [reventa])).toBe(true);
    expect(pedidoSinConsumo({ piezas: [{ nombre: 'Termo' }] }, [reventa])).toBe(true);
    expect(pedidoSinConsumo({ piezas: [{ nombre: 'Termo', sinImpresion: true }, { nombre: 'Soporte' }] }, [reventa])).toBe(false);
    expect(pedidoSinConsumo({ piezas: [{ nombre: 'Termo', sinImpresion: true }], insumos: [{ nombre: 'Caja' }] }, [reventa])).toBe(false);
    expect(pedidoSinConsumo({ piezas: [] }, [reventa])).toBe(false);
  });
});
