import { describe, expect, it } from 'vitest';
import { buildCompositeGcode } from '../src/utils/productoGcode';

const placa = (idx, pred, fils, sel = true) => ({ idx, nombre: `P${idx}`, pred, fils, sel });
const fil = (type, color, usedG) => ({ id: '0', type, color, usedG });
const bambu = (placas, precios = {}) => ({
  tipo: 'bambu',
  nombre: 'a.3mf',
  placas,
  matMap: Object.fromEntries(placas.flatMap(p => p.fils).map(f => [`${f.type}|${f.color}`, { type: f.type, color: f.color, totalG: 0, precioKg: precios[`${f.type}|${f.color}`] ?? 18000 }]))
});

describe('producto con varios archivos de G-code', () => {
  it('sin archivos no hay producto', () => {
    expect(buildCompositeGcode([])).toBeNull();
  });

  it('suma los gramos y el tiempo de dos archivos Bambu, material por material', () => {
    const a = bambu([placa('1', 3600, [fil('PLA', '#fff', 10), fil('PETG', '#000', 5)])]);
    const b = bambu([placa('1', 1800, [fil('PLA', '#fff', 20)])]);
    const c = buildCompositeGcode([a, b]);
    expect(c.tipo).toBe('bambu');
    expect(c.totalSeg).toBe(5400);
    expect(c.matMap['PLA|#fff'].totalG).toBe(30);
    expect(c.matMap['PETG|#000'].totalG).toBe(5);
    expect(c.nombre).toBe('Producto compuesto (2)');
  });

  it('una placa destildada no cuenta ni en gramos ni en tiempo', () => {
    const a = bambu([
      placa('1', 3600, [fil('PLA', '#fff', 10)]),
      placa('2', 7200, [fil('PLA', '#fff', 40)], false)
    ]);
    const c = buildCompositeGcode([a]);
    expect(c.totalSeg).toBe(3600);
    expect(c.matMap['PLA|#fff'].totalG).toBe(10);
    expect(c.placas.map(p => p.sel)).toEqual([true, false]);
  });

  it('con todas las placas destildadas queda en cero y sin materiales', () => {
    const a = bambu([placa('1', 3600, [fil('PLA', '#fff', 10)], false)]);
    const c = buildCompositeGcode([a]);
    expect(c.totalSeg).toBe(0);
    expect(Object.keys(c.matMap)).toHaveLength(0);
  });

  it('conserva el precio por kg que traía el archivo', () => {
    const a = bambu([placa('1', 60, [fil('PLA', '#fff', 10)])], { 'PLA|#fff': 25000 });
    expect(buildCompositeGcode([a]).matMap['PLA|#fff'].precioKg).toBe(25000);
  });

  it('G-codes sueltos suman gramos y horas, y toman el primer filamento', () => {
    const g1 = { tipo: 'gcode', nombre: 'x.gcode', gramos: 12, tiempo: 1.5, filamento: 'PLA' };
    const g2 = { tipo: 'gcode', nombre: 'y.gcode', gramos: 8, tiempo: 0.5, filamento: 'PETG' };
    const c = buildCompositeGcode([g1, g2]);
    expect(c.tipo).toBe('gcode');
    expect(c.gramos).toBe(20);
    expect(c.tiempo).toBe(2);
    expect(c.filamento).toBe('PLA');
  });

  it('un Bambu mezclado con un G-code suelto suma sus gramos y su tiempo (antes se ignoraba)', () => {
    const a = bambu([placa('1', 3600, [fil('PLA', '#fff', 10)])]);
    const g = { tipo: 'gcode', nombre: 'x.gcode', gramos: 5, tiempo: 1, filamento: 'PLA' };
    const c = buildCompositeGcode([a, g]);
    expect(c.tipo).toBe('gcode');
    expect(c.gramos).toBe(15);
    expect(c.tiempo).toBe(2);
  });
});
