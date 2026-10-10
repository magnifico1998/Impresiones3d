import { describe, expect, it, vi } from 'vitest';
import { clienteDeSolicitud, confirmarPedidoNuevoDeCliente, esUnible, motivoNoUnible, pedidosAbiertosDelCliente, unirPedidos } from '../src/utils/unirPedidos';

const pieza = (id, extra = {}) => ({ id, nombre: `pieza ${id}`, cantidad: 2, precioVenta: 500, elaborados: 0, ...extra });
const pedido = (id, extra = {}) => ({
  id, cliente: 'Juan Pérez', desc: '', estado: 'pendiente', fechaPedido: '2026-10-05', fechaEntrega: '',
  notaGeneral: '', piezas: [pieza(1)], precioVenta: 1000, envio: 0, insumos: [], ...extra
});
const FECHA = { fecha: '10/10/2026' };

describe('pedidos abiertos de un cliente', () => {
  const lista = [
    pedido(1, { cliente: 'Juan Pérez' }),
    pedido(2, { cliente: '  juan   pérez ' }),
    pedido(3, { cliente: 'Juan Pérez', estado: 'enviado' }),
    pedido(4, { cliente: 'Juan Pérez', estado: 'cancelado' }),
    pedido(5, { cliente: 'Ana' })
  ];
  it('compara el nombre sin mayúsculas ni espacios de más y sólo cuenta los abiertos', () => {
    expect(pedidosAbiertosDelCliente(lista, 'JUAN PÉREZ').map((p) => p.id)).toEqual([1, 2]);
  });
  it('puede excluir el propio pedido', () => expect(pedidosAbiertosDelCliente(lista, 'Juan Pérez', 1).map((p) => p.id)).toEqual([2]));
  it('"Sin nombre" o vacío no se agrupan', () => {
    expect(pedidosAbiertosDelCliente([pedido(1, { cliente: 'Sin nombre' })], 'Sin nombre')).toEqual([]);
    expect(pedidosAbiertosDelCliente(lista, '')).toEqual([]);
  });
  it('sólo los estados abiertos se pueden unir', () => {
    for (const e of ['en_verificacion', 'pendiente', 'progreso', 'listo']) expect(esUnible({ estado: e })).toBe(true);
    for (const e of ['enviado', 'completado', 'cancelado']) expect(esUnible({ estado: e })).toBe(false);
  });
});

describe('cliente de una solicitud del catálogo', () => {
  const clientes = [{ nombre: 'Juan Pérez', tel: '351 555-1234' }, { nombre: 'Ana', tel: '' }];
  it('el teléfono manda sobre el nombre escrito', () => expect(clienteDeSolicitud(clientes, { cliente: 'Juancho', telefono: '3515551234' })).toBe('Juan Pérez'));
  it('sin teléfono compara por nombre', () => expect(clienteDeSolicitud(clientes, { cliente: 'ana' })).toBe('Ana'));
  it('un cliente nuevo queda con el nombre que escribió', () => expect(clienteDeSolicitud(clientes, { cliente: 'Luis', telefono: '1' })).toBe('Luis'));
});

describe('aviso al crear un pedido para alguien que ya tiene uno abierto', () => {
  const pedidos = [pedido(12, { desc: 'Llaveros', precioVenta: 15000 })];
  it('sin pedidos abiertos sigue sin preguntar', async () => {
    const confirmar = vi.fn();
    expect(await confirmarPedidoNuevoDeCliente({ pedidos, cliente: 'Otra Persona', confirmar })).toBe(true);
    expect(confirmar).not.toHaveBeenCalled();
  });
  it('con uno abierto pregunta, lista el pedido y respeta la respuesta', async () => {
    const confirmar = vi.fn().mockResolvedValue(false);
    const sigue = await confirmarPedidoNuevoDeCliente({ pedidos, cliente: 'Juan Pérez', confirmar, fmt: (n) => `$ ${n}` });
    expect(sigue).toBe(false);
    const [mensaje, opciones] = confirmar.mock.calls[0];
    expect(mensaje).toMatch(/#0012/);
    expect(mensaje).toMatch(/\$ 15000/);
    expect(mensaje).toMatch(/Unir pedidos/);
    expect(opciones.textoConfirmar).toBe('Crear pedido nuevo');
  });
});

describe('unir dos pedidos', () => {
  it('suma piezas, precio, envío y abonado, y cancela el pedido unido sin borrarlo', () => {
    const destino = pedido(1, { piezas: [pieza(1), pieza(2)], precioVenta: 2000, envio: 300, montoAbonado: 500, fechaAbonado: '2026-10-06' });
    const origen = pedido(2, { piezas: [pieza(3)], precioVenta: 1500, envio: 200, montoAbonado: 700, fechaAbonado: '2026-10-04', desc: 'Del catálogo', notaGeneral: 'Tel: 351' });
    const r = unirPedidos(destino, origen, FECHA);
    expect(r.destino.piezas.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(r.destino.precioVenta).toBe(3500);
    expect(r.destino.envio).toBe(500);
    expect(r.destino.montoAbonado).toBe(1200);
    expect(r.destino.fechaAbonado).toBe('2026-10-04');
    expect(r.destino.unidos).toEqual([2]);
    expect(r.destino.notaGeneral).toMatch(/Tel: 351/);
    expect(r.destino.notaGeneral).toMatch(/Se unió el pedido #0002 el 10\/10\/2026/);
    expect(r.destino.desc).toBe('Del catálogo');
    expect(r.origen).toMatchObject({ id: 2, estado: 'cancelado', unidoA: 1 });
    expect(r.origen.notaGeneral).toMatch(/Se unió al pedido #0001/);
    expect(r.origen.piezas).toHaveLength(1); // conserva sus datos
  });
  it('las piezas que llegan se marcan de dónde vienen y no pisan ids repetidos', () => {
    const r = unirPedidos(pedido(1, { piezas: [pieza(1)] }), pedido(2, { piezas: [pieza(1), pieza(2)] }), FECHA);
    const ids = r.destino.piezas.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    expect(r.destino.piezas.filter((p) => p.unidaDe === 2)).toHaveLength(2);
  });
  it('el estado resultante es el menos avanzado y las fechas, las más tempranas', () => {
    const r = unirPedidos(pedido(1, { estado: 'listo', fechaPedido: '2026-10-08', fechaEntrega: '2026-10-20' }), pedido(2, { estado: 'pendiente', fechaPedido: '2026-10-05', fechaEntrega: '2026-10-15' }), FECHA);
    expect(r.destino.estado).toBe('pendiente');
    expect(r.destino.fechaPedido).toBe('2026-10-05');
    expect(r.destino.fechaEntrega).toBe('2026-10-15');
  });
  it('los descuentos en porcentaje y en monto se pasan a un solo monto', () => {
    const r = unirPedidos(pedido(1, { precioVenta: 10000, descuentoPct: 10 }), pedido(2, { precioVenta: 4000, descuentoMonto: 500 }), FECHA);
    expect(r.destino.descuentoMonto).toBe(1500); // 1000 (10 % de 10000) + 500
    expect(r.destino.descuentoPct).toBe(0);
    expect(r.destino.precioVenta).toBe(14000);
  });
  it('sin descuentos no inventa ninguno', () => {
    const r = unirPedidos(pedido(1), pedido(2), FECHA);
    expect(r.destino.descuentoMonto).toBe(0);
  });
  it('si las descripciones o notas son iguales no se repiten', () => {
    const r = unirPedidos(pedido(1, { desc: 'Llaveros', notaGeneral: 'x' }), pedido(2, { desc: 'Llaveros', notaGeneral: 'x' }), FECHA);
    expect(r.destino.desc).toBe('Llaveros');
    expect(r.destino.notaGeneral.split('\n').filter((l) => l === 'x')).toHaveLength(1);
  });
  it('no se unen pedidos cerrados ni el mismo consigo mismo', () => {
    expect(() => unirPedidos(pedido(1), pedido(2, { estado: 'enviado' }), FECHA)).toThrow(/ya está/);
    expect(() => unirPedidos(pedido(1, { estado: 'completado' }), pedido(2), FECHA)).toThrow(/ya está/);
    expect(() => unirPedidos(pedido(1), pedido(1), FECHA)).toThrow(/mismo pedido/);
    expect(motivoNoUnible(pedido(1), pedido(2))).toBeNull();
  });
  it('no modifica los pedidos originales', () => {
    const a = pedido(1); const b = pedido(2);
    const antes = JSON.stringify([a, b]);
    unirPedidos(a, b, FECHA);
    expect(JSON.stringify([a, b])).toBe(antes);
  });
});
