import { describe, it, expect } from 'vitest';
import { mensajeWhatsappPedido } from '../src/utils/whatsapp';

describe('mensaje de WhatsApp del pedido', () => {
  it('nombra los productos', () => {
    const p = { id: 12, cliente: 'Andrea', piezas: [{ nombre: 'Separador de placas de panadería' }, { nombre: 'Bebedero Mascota' }, { nombre: 'Llaveros Patín' }] };
    expect(mensajeWhatsappPedido(p)).toBe('Hola Andrea! Te escribo por tu pedido de Separador de placas de panadería | Bebedero Mascota | Llaveros Patín.');
  });
  it('no repite productos', () => {
    expect(mensajeWhatsappPedido({ id: 1, cliente: 'A', piezas: [{ nombre: 'Llavero' }, { nombre: 'llavero ' }] })).toBe('Hola A! Te escribo por tu pedido de Llavero.');
  });
  it('sin piezas usa el número', () => {
    expect(mensajeWhatsappPedido({ id: 12, cliente: 'A', piezas: [] })).toBe('Hola A! Te escribo por tu pedido #0012.');
  });
});
