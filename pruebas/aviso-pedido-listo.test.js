import { describe, it, expect } from 'vitest';
import { decidirAviso, textoProductos } from '../functions/avisoPedidoListo.js';

const cfg = { notificarPedidoListo: true };
const clientes = [
  { nombre: 'Juana Pérez', email: 'juana@ejemplo.com' },
  { nombre: 'Sin Mail', email: '' },
  { nombre: 'No Molestar', email: 'nm@ejemplo.com', sinNotificaciones: true }
];
const pasa = (cliente, de = 'progreso', a = 'listo') => ({ antes: { estado: de, cliente }, despues: { estado: a, cliente } });

describe('aviso de pedido listo', () => {
  it('avisa al pasar a listo', () => {
    const r = decidirAviso({ ...pasa('Juana Pérez'), cfg, clientes });
    expect(r).toMatchObject({ enviar: true, email: 'juana@ejemplo.com' });
  });
  it('no distingue mayúsculas ni espacios en el nombre', () => {
    expect(decidirAviso({ ...pasa('  juana   PÉREZ '), cfg, clientes }).enviar).toBe(true);
  });
  it('no avisa con la función apagada', () => {
    expect(decidirAviso({ ...pasa('Juana Pérez'), cfg: {}, clientes })).toMatchObject({ enviar: false, motivo: 'funcion-apagada' });
  });
  it('no avisa si el cliente no tiene mail, no está cargado o pidió no recibir', () => {
    expect(decidirAviso({ ...pasa('Sin Mail'), cfg, clientes }).motivo).toBe('sin-mail');
    expect(decidirAviso({ ...pasa('Nadie'), cfg, clientes }).motivo).toBe('cliente-no-cargado');
    expect(decidirAviso({ ...pasa('No Molestar'), cfg, clientes }).motivo).toBe('cliente-sin-notificaciones');
  });
  it('no avisa si el pedido ya estaba listo ni si pasa a otro estado', () => {
    expect(decidirAviso({ ...pasa('Juana Pérez', 'listo', 'listo'), cfg, clientes }).enviar).toBe(false);
    expect(decidirAviso({ ...pasa('Juana Pérez', 'listo', 'enviado'), cfg, clientes }).enviar).toBe(false);
    expect(decidirAviso({ antes: null, despues: { estado: 'listo', cliente: 'Juana Pérez' }, cfg, clientes }).enviar).toBe(false);
  });
});

describe('productos del aviso de pedido listo', () => {
  it('nombra cada pieza con su cantidad', () => {
    expect(textoProductos([{ nombre: 'Maceta hexagonal', cantidad: 2 }, { nombre: 'Llavero', cantidad: 1 }])).toBe('Maceta hexagonal (x2) y Llavero');
  });
  it('suma las versiones si la pieza no trae cantidad', () => {
    expect(textoProductos([{ nombre: 'Soporte', versiones: [{ cantidad: 2 }, { cantidad: 3 }] }])).toBe('Soporte (x5)');
  });
  it('resume a partir de la cuarta pieza', () => {
    const piezas = ['A', 'B', 'C', 'D', 'E'].map((nombre) => ({ nombre, cantidad: 1 }));
    expect(textoProductos(piezas)).toBe('A, B, C y 2 productos más');
    expect(textoProductos(piezas.slice(0, 4))).toBe('A, B, C y 1 producto más');
  });
  it('sin piezas con nombre usa un texto genérico', () => {
    expect(textoProductos([])).toBe('impresiones 3D');
    expect(textoProductos([{ nombre: '  ' }])).toBe('impresiones 3D');
  });
});
