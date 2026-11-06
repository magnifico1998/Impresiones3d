import { describe, it, expect, beforeAll, vi } from 'vitest';
import { iniciarMotor } from '../src/utils/motorBooleano';
import { PARAMETROS_INICIALES, armarJarro, caja3d } from '../src/utils/jarros';
import { AJUSTES_IMPRESION, areaMalla, costearImpresion, estimarImpresion, formatoHoras, materialDeParte, presupuestoParaBiblioteca } from '../src/utils/jarrosImpresion';

vi.setConfig({ testTimeout: 60000 });
beforeAll(async () => { await iniciarMotor(); });

const pieza = (color, lado = 20, partes = null) => ({ id: 'x', nombre: 'x', color, mallaImpresion: caja3d(0, lado, 0, lado, 0, lado), ...(partes ? { partes } : {}) });
const costos = { precioKg: 20000, nombreFilamento: 'PLA Negro', desperdicio: 10, watts: 200, kwh: 100, mantHora: 50, moHora: 1000, horasTrabajo: 0.5, margen: 100 };

describe('impresión: estimación de material y tiempo', () => {
  it('el área y el material de un cubo', () => {
    const cubo = caja3d(0, 20, 0, 20, 0, 20);
    expect(areaMalla(cubo)).toBeCloseTo(6 * 400, 6);
    const a = AJUSTES_IMPRESION;
    const cascara = 2400 * (a.paredes * 0.42 + 0.25 * a.capasSolidas * a.alturaCapa);
    expect(materialDeParte(8000, 2400, a)).toBeCloseTo(cascara + (8000 - cascara) * 0.15, 6);
    // una pieza más finita que la cáscara es maciza
    expect(materialDeParte(100, 2400, a)).toBeCloseTo(100, 6);
  });

  it('más relleno, más gramos; los gramos salen de la densidad del plástico', () => {
    const poco = estimarImpresion([pieza('#ff0000')], { relleno: 10 });
    const mucho = estimarImpresion([pieza('#ff0000')], { relleno: 100 });
    expect(mucho.gramos).toBeGreaterThan(poco.gramos);
    expect(mucho.gramos).toBeCloseTo((8000 / 1000) * 1.24, 6); // relleno total: todo el volumen
    expect(mucho.horas).toBeGreaterThan(poco.horas);
  });

  it('agrupa por color (sin importar mayúsculas) y suma cambios de filamento sólo en piezas de varios colores', () => {
    const e = estimarImpresion([pieza('#ff0000'), pieza('#FF0000'), pieza('#00ff00')]);
    expect(e.colores.map((c) => c.color)).toEqual(['#FF0000', '#00FF00']);
    expect(e.colores[0].gramos).toBeCloseTo(2 * e.colores[1].gramos, 6);
    expect(e.cambios).toBe(0);
    const partes = [{ color: '#ff0000', mallaImpresion: caja3d(0, 20, 0, 20, 0, 20) }, { color: '#0000ff', mallaImpresion: caja3d(0, 20, 0, 20, 0, 2) }];
    const m = estimarImpresion([{ id: 'p', nombre: 'p', color: '#ff0000', partes }]);
    expect(m.colores).toHaveLength(2);
    expect(m.cambios).toBe(2 * 10); // 2 mm de alto a 0,2 mm por capa, ida y vuelta
    expect(m.horas).toBeGreaterThan(estimarImpresion([pieza('#ff0000')]).horas * 0 + (20 * 0.5) / 60);
  });

  it('un jarro real: gramos, horas y colores razonables', () => {
    const j = armarJarro({ ...PARAMETROS_INICIALES, asaDesmontable: true, emblema: true, aroArriba: true });
    const e = estimarImpresion(j.piezas);
    expect(e.colores.length).toBeGreaterThanOrEqual(3);
    expect(e.gramos).toBeGreaterThan(60);
    expect(e.gramos).toBeLessThan(400);
    expect(e.horas).toBeGreaterThan(2);
    expect(e.horas).toBeLessThan(40);
  });
});

describe('impresión: costos', () => {
  it('usa la fórmula de la Calculadora (filamento con desperdicio, electricidad, mantenimiento, mano de obra y margen)', () => {
    const est = { colores: [{ color: '#FF0000', gramos: 100 }, { color: '#00FF00', gramos: 50 }], gramos: 150, horas: 4, cambios: 0 };
    const c = costearImpresion(est, costos);
    expect(c.costeFil).toBeCloseTo(((100 * 1.1) / 1000) * 20000 + ((50 * 1.1) / 1000) * 20000, 6);
    expect(c.costeElec).toBeCloseTo(0.2 * 4 * 100, 6);
    expect(c.costeMant).toBe(200);
    expect(c.costeMO).toBe(500);
    expect(c.total).toBeCloseTo(c.costeFil + 80 + 200 + 500, 6);
    expect(c.precio).toBe(Math.round(c.total * 2));
    expect(c.filDetalle[0].label).toMatch(/PLA Negro \(100g\)/);
  });

  it('con valores vacíos no da NaN', () => {
    const c = costearImpresion({ colores: [{ color: '#FF0000', gramos: 10 }], gramos: 10, horas: 1, cambios: 0 }, {});
    expect(Number.isFinite(c.total)).toBe(true);
    expect(c.precio).toBe(0);
  });
});

describe('impresión: presupuesto para la Biblioteca', () => {
  const est = { colores: [{ color: '#FF0000', gramos: 100 }, { color: '#00FF00', gramos: 50 }], gramos: 150, horas: 4, cambios: 0 };
  const archivo = { name: 'Jarro.3mf' };

  it('de varios colores trae los materiales como un 3MF multicolor, con el archivo y la foto', () => {
    const c = costearImpresion(est, costos);
    const p = presupuestoParaBiblioteca({ nombre: 'Jarro 70x170', est, costos: c, v: costos, impresoraNombre: 'Bambu A1', archivos: [archivo], foto: 'data:image/jpeg;base64,xx' });
    expect(p.multiMat).toBe(true);
    expect(p.gramos).toBe(0);
    expect(p.materiales).toEqual([
      { type: 'PLA Negro', color: '#FF0000', totalG: 100, precioKg: 20000 },
      { type: 'PLA Negro', color: '#00FF00', totalG: 50, precioKg: 20000 }
    ]);
    expect(p.matData).toHaveLength(2);
    expect(p.archivosParaSubir).toEqual([archivo]);
    expect(p.gcodeArchivos).toEqual(['Jarro.3mf']);
    expect(p.fotoInicial).toContain('data:image');
    expect(p.total).toBe(c.total);
    expect(p.precio).toBe(c.precio);
    expect(p.horas).toBe(4);
    expect(p.aplicaMargen).toEqual({ elec: true, mant: true, mo: true, ins: true, extras: true });
  });

  it('de un solo color usa los gramos y el precio del rollo', () => {
    const uno = { colores: [{ color: '#FF0000', gramos: 80 }], gramos: 80, horas: 2, cambios: 0 };
    const p = presupuestoParaBiblioteca({ nombre: 'x', est: uno, costos: costearImpresion(uno, costos), v: costos });
    expect(p.multiMat).toBe(false);
    expect(p.gramos).toBe(80);
    expect(p.precioRollo).toBe(20000);
    expect(p.materiales).toBeNull();
    expect(p.archivosParaSubir).toEqual([]);
  });

  it('las horas se muestran como horas y minutos', () => {
    expect(formatoHoras(3.3333)).toBe('3 h 20 min');
    expect(formatoHoras(2)).toBe('2 h');
    expect(formatoHoras(0.25)).toBe('15 min');
  });
});
