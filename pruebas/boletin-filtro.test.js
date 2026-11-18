import { describe, expect, it } from 'vitest';
import filtro from '../functions/filtroBoletin';

const { SIN_PLAN, coincidePlan, contarPorEstadoYPlan } = filtro;

describe('boletín: filtro por plan', () => {
  it('sin lista de planes manda a todos (comportamiento anterior)', () => {
    expect(coincidePlan('boceto', undefined)).toBe(true);
    expect(coincidePlan(null, undefined)).toBe(true);
  });

  it('una cuenta sin planId cuenta como "sin-plan"', () => {
    expect(coincidePlan(null, [SIN_PLAN])).toBe(true);
    expect(coincidePlan('', [SIN_PLAN])).toBe(true);
    expect(coincidePlan(null, ['boceto'])).toBe(false);
  });

  it('con plan, sólo coincide si está tildado', () => {
    expect(coincidePlan('boceto', ['boceto', 'pro'])).toBe(true);
    expect(coincidePlan('pro', ['boceto'])).toBe(false);
    expect(coincidePlan('boceto', [SIN_PLAN])).toBe(false);
  });

  it('cuenta por estado y plan', () => {
    const lista = [
      { estado: 'lectura', planId: 'boceto' },
      { estado: 'lectura', planId: 'boceto' },
      { estado: 'trial', planId: null },
      { estado: 'activa', planId: 'pro' }
    ];
    expect(contarPorEstadoYPlan(lista)).toEqual({
      'lectura|boceto': 2,
      'trial|sin-plan': 1,
      'activa|pro': 1
    });
  });
});
