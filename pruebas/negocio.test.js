import { describe, expect, it, vi } from 'vitest';
import { precioNeto } from '../src/utils/precioNeto';
import { montoAbonadoDe, movimientosVenta, pendienteDePedido, ventasDePedido } from '../src/utils/finanzasPedido';
import { calcularFechaCompletado } from '../src/utils/fechaCompletado';
import { formatearMoneda, validarTelefono } from '../src/utils/paises';
import { formatoCantidad, subtotalLinea, totalCompra } from '../src/utils/inventario';
import { formatoNumero } from '../src/utils/numeros';

// Reglas de negocio con plata: lo primero que no puede romperse al pasar a producción.

describe('precio neto de un pedido', () => {
  it('sin descuento es el precio de venta', () => expect(precioNeto({ precioVenta: 15000 })).toBe(15000));
  it('descuento en monto', () => expect(precioNeto({ precioVenta: 15000, descuentoMonto: 1000 })).toBe(14000));
  it('descuento en porcentaje', () => expect(precioNeto({ precioVenta: 10000, descuentoPct: 10 })).toBe(9000));
  it('si hay monto y porcentaje manda el monto', () => expect(precioNeto({ precioVenta: 10000, descuentoMonto: 500, descuentoPct: 50 })).toBe(9500));
  it('nunca da negativo ni pasa del 100%', () => {
    expect(precioNeto({ precioVenta: 100, descuentoMonto: 500 })).toBe(0);
    expect(precioNeto({ precioVenta: 100, descuentoPct: 250 })).toBe(0);
  });
  it('acepta números como texto y datos vacíos', () => {
    expect(precioNeto({ precioVenta: '2500' })).toBe(2500);
    expect(precioNeto(null)).toBe(0);
  });
});

describe('ventas y pendiente por pedido', () => {
  const pedido = (extra) => ({ precioVenta: 10000, ...extra });

  it('un pedido pendiente sólo cuenta lo abonado como venta; el resto queda pendiente', () => {
    const p = pedido({ estado: 'pendiente', montoAbonado: 4000, fechaAbonado: '2026-10-01' });
    expect(ventasDePedido(p)).toBe(4000);
    expect(pendienteDePedido(p)).toBe(6000);
    expect(movimientosVenta(p)).toEqual([{ monto: 4000, fecha: '2026-10-01' }]);
  });
  it('un pedido enviado reconoce todo como venta y no deja pendiente', () => {
    const p = pedido({ estado: 'enviado', montoAbonado: 4000, fechaAbonado: '2026-10-01', fechaCompletado: '2026-10-05' });
    expect(ventasDePedido(p)).toBe(10000);
    expect(pendienteDePedido(p)).toBe(0);
    expect(movimientosVenta(p)).toEqual([{ monto: 4000, fecha: '2026-10-01' }, { monto: 6000, fecha: '2026-10-05' }]);
  });
  it('cancelado y en verificación no aportan nada', () => {
    for (const estado of ['cancelado', 'en_verificacion']) {
      expect(ventasDePedido(pedido({ estado, montoAbonado: 5000 }))).toBe(0);
      expect(pendienteDePedido(pedido({ estado, montoAbonado: 5000 }))).toBe(0);
    }
  });
  it('lo abonado nunca supera el precio neto', () => {
    expect(montoAbonadoDe(pedido({ montoAbonado: 99999 }))).toBe(10000);
    expect(montoAbonadoDe(pedido({ montoAbonado: -5 }))).toBe(0);
  });
  it('un pedido viejo sin fechas usa la fecha de creación (dd/mm/aaaa)', () => {
    const p = pedido({ estado: 'completado', creado: '3/10/2026' });
    expect(movimientosVenta(p)).toEqual([{ monto: 10000, fecha: '2026-10-03' }]);
  });
});

describe('fecha de completado', () => {
  it('pasar a enviado pone la fecha de hoy', () => expect(calcularFechaCompletado('pendiente', null, 'enviado')).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  it('volver a guardar un enviado no corre la fecha de envío', () => expect(calcularFechaCompletado('enviado', '2026-09-01', 'enviado')).toBe('2026-09-01'));
  it('completar un enviado conserva la fecha de envío', () => expect(calcularFechaCompletado('enviado', '2026-09-01', 'completado')).toBe('2026-09-01'));
  it('los demás estados no tienen fecha', () => {
    for (const e of ['pendiente', 'progreso', 'listo', 'cancelado', 'en_verificacion']) expect(calcularFechaCompletado('enviado', '2026-09-01', e)).toBeNull();
  });
});

describe('inventario y compras', () => {
  it('subtotal y total de una compra', () => {
    expect(subtotalLinea({ qty: 3, precio: 1500 })).toBe(4500);
    expect(totalCompra({ lineas: [{ qty: 2, precio: 100 }, { qty: 1, precio: 50 }] })).toBe(250);
    expect(totalCompra({ total: 999, lineas: [{ qty: 2, precio: 100 }] })).toBe(999);
  });
  it('compras con el formato viejo (una sola línea)', () => expect(totalCompra({ qty: 4, precio: 25, cat: 'Insumos', desc: 'x' })).toBe(100));
  it('cantidad con su unidad y separador de miles', () => {
    expect(formatoCantidad(2350, 'g')).toBe('2.350 g');
    expect(formatoCantidad(3, 'u')).toBe('3 u.');
  });
});

describe('formatos', () => {
  it('números con separador de miles y coma decimal', () => {
    expect(formatoNumero(1234.5, 1)).toBe('1.234,5');
    expect(formatoNumero(1234567.891, 2)).toBe('1.234.567,89');
    expect(formatoNumero(999)).toBe('999');
    expect(formatoNumero(1500)).toBe('1.500');
    expect(formatoNumero(null, 1)).toBe('0,0');
  });
  it('moneda de cada país, sin decimales', () => {
    expect(formatearMoneda(15000, 'AR').replace(/\s/g, ' ')).toBe('$ 15.000');
    expect(formatearMoneda(15000.6, 'AR').replace(/\s/g, ' ')).toBe('$ 15.001');
    expect(formatearMoneda('x', 'AR').replace(/\s/g, ' ')).toBe('$ 0');
  });
  it('validación de teléfonos', () => {
    expect(validarTelefono('', 'AR')).toBeTypeOf('boolean');
  });
});

describe('sanidad del entorno de pruebas', () => {
  it('vitest corre', () => expect(vi.fn()).toBeDefined());
});
