import { describe, it, expect } from 'vitest';
import { parsearVistaGcode, colorDeTipo } from '../src/utils/vistaGcode.js';

describe('vista previa del G-code', () => {
  it('dibuja sólo lo que extruye y separa por capas', () => {
    const g = [
      'G90', 'M82', 'G92 E0',
      ';TYPE:Outer wall',
      'G1 X0 Y0 Z0.2', // viaje
      'G1 X10 Y0 E1', 'G1 X10 Y10 E2',
      'G1 E1.5', // retracción
      'G1 X20 Y20 E1.5', // viaje con retracción: sin trazo
      'G1 Z0.4',
      ';TYPE:Sparse infill',
      'G1 X20 Y30 E2.5'
    ].join('\n');
    const d = parsearVistaGcode(g);
    expect(d.nTrazos).toBe(3);
    expect(d.capas.length).toBe(2);
    expect(d.tipos).toEqual(['Outer wall', 'Sparse infill']);
    expect(d.max[2]).toBeCloseTo(0.4);
  });

  it('une tramos alineados y respeta extrusión relativa', () => {
    const g = 'M83\nG1 X0 Y0 Z0.2\nG1 X5 Y0 E0.1\nG1 X10 Y0 E0.1\nG1 X20 Y0 E0.1';
    const d = parsearVistaGcode(g);
    expect(d.nTrazos).toBe(1);
    expect(d.max[0]).toBe(20);
  });

  it('parte los arcos en tramos', () => {
    const d = parsearVistaGcode('G1 X10 Y0 Z0.2\nG3 X0 Y10 I-10 J0 E1');
    expect(d.nTrazos).toBeGreaterThan(4);
  });

  it('colorea las partes conocidas', () => {
    expect(colorDeTipo('Outer wall')).not.toBe(colorDeTipo('Sparse infill'));
  });
});
