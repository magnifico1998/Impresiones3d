import { describe, it, expect, beforeAll, vi } from 'vitest';
import { iniciarMotor } from '../src/utils/motorBooleano';
import {
  PARAMETROS_INICIALES, TEXTURAS, TEXTURA_DUELAS, TEXTURA_NINGUNA, sanearParametros, armarJarro, radioExteriorFn, profundidadMaxima, estimarTriangulosTextura
} from '../src/utils/jarros';
import { grillaTextura, MAX_TRIANGULOS_FINAL, MAX_TRIANGULOS_VISTA } from '../src/utils/jarrosTextura';
import { revisarCerrada, volumenMalla } from '../src/utils/mallas3d';

vi.setConfig({ testTimeout: 90000 });
beforeAll(async () => { await iniciarMotor(); });

const base = (extra = {}) => ({ ...PARAMETROS_INICIALES, asa: false, ...extra });
const cuerpo = (j) => j.piezas.find((x) => x.id === 'cuerpo');
const cerrada = (m) => revisarCerrada(m).cerrada;
const radios = (malla, z0, z1) => {
  const r = [];
  for (let i = 0; i < malla.pos.length; i += 3) { const z = malla.pos[i + 2]; if (z >= z0 && z <= z1) r.push(Math.hypot(malla.pos[i], malla.pos[i + 1])); }
  return r;
};

describe('textura del cuerpo: parámetros', () => {
  it('por defecto no hay textura y los valores raros se sanean', () => {
    expect(PARAMETROS_INICIALES.textura).toBe(TEXTURA_NINGUNA);
    const s = sanearParametros({ textura: 'no existe', texturaProfundidad: 99, duelasCantidad: 2.4, duelasVeta: 5, duelasSemilla: 0, texturaResolucion: 0.1 });
    expect(s.textura).toBe(TEXTURA_NINGUNA);
    expect(s.texturaProfundidad).toBe(3);
    expect(s.duelasCantidad).toBe(4);
    expect(s.duelasVeta).toBe(1);
    expect(s.duelasSemilla).toBe(1);
    expect(s.texturaResolucion).toBe(0.3);
    expect(sanearParametros({ textura: TEXTURA_DUELAS }).textura).toBe(TEXTURA_DUELAS);
    expect(sanearParametros({ textura: TEXTURAS[0].id }).textura).toBe(TEXTURAS[0].id);
  });

  it('la profundidad máxima deja 1,4 mm de pared', () => {
    expect(profundidadMaxima({ pared: 3 })).toBeCloseTo(1.6, 9);
    expect(profundidadMaxima({ pared: 1.2 })).toBe(0);
  });
});

describe('textura del cuerpo: duelas', () => {
  const p = base({ textura: TEXTURA_DUELAS, duelasCantidad: 12, duelasProfundidad: 1, duelasSeparacion: 1.5, duelasVeta: 0, duelasIrregularidad: 0 });

  it('arma un cuerpo cerrado con ranuras reales: la pared se mete hasta la profundidad pedida y nunca sale de la silueta', () => {
    const j = armarJarro(p);
    const m = cuerpo(j).malla;
    expect(cerrada(m)).toBe(true);
    expect(volumenMalla(m)).toBeGreaterThan(0);
    const R = radioExteriorFn(j.parametros);
    const rs = radios(m, 40, 120).filter((r) => r > j.parametros.diametroHueco / 2 + 1);
    const rNom = R(80);
    expect(Math.max(...rs)).toBeLessThanOrEqual(rNom + 0.01);
    expect(Math.min(...rs)).toBeLessThan(rNom - 0.9); // ranuras de 1 mm
    expect(Math.min(...rs)).toBeGreaterThan(rNom - 1.1);
  });

  it('el borde de arriba y de abajo queda liso (la textura se apaga)', () => {
    const j = armarJarro(p);
    const m = cuerpo(j).malla;
    const R = radioExteriorFn(j.parametros);
    const arriba = radios(m, j.alto - 0.01, j.alto + 0.01);
    expect(Math.min(...arriba.filter((r) => r > j.parametros.diametroHueco / 2 + 0.5))).toBeGreaterThan(R(j.alto) - 0.002);
    const abajo = radios(m, -0.01, 0.01);
    expect(Math.min(...abajo.filter((r) => r > j.parametros.diametroHueco / 2 + 0.5))).toBeGreaterThan(R(0) - 0.001);
  });

  it('pesa menos que sin textura y las duelas son repetibles (misma semilla) y cambian con otra', () => {
    const lisa = volumenMalla(cuerpo(armarJarro(base())).malla);
    const a = volumenMalla(cuerpo(armarJarro(p)).malla);
    expect(a).toBeLessThan(lisa);
    const b = armarJarro({ ...p, duelasIrregularidad: 0.8, duelasSemilla: 1 });
    const c = armarJarro({ ...p, duelasIrregularidad: 0.8, duelasSemilla: 2 });
    expect(volumenMalla(cuerpo(b).malla)).not.toBeCloseTo(volumenMalla(cuerpo(c).malla), 3);
    expect(volumenMalla(cuerpo(armarJarro({ ...p, duelasIrregularidad: 0.8, duelasSemilla: 1 })).malla)).toBeCloseTo(volumenMalla(cuerpo(b).malla), 6);
  });

  it('con veta e irregularidad el cuerpo sigue cerrado', () => {
    const j = armarJarro({ ...p, duelasVeta: 1, duelasIrregularidad: 1, duelasSeparacion: 4 });
    expect(cerrada(cuerpo(j).malla)).toBe(true);
  });

  it('la profundidad se limita para dejar pared y avisa', () => {
    const j = armarJarro({ ...p, pared: 2, duelasProfundidad: 3 });
    expect(j.avisos.join(' ')).toMatch(/se limitó a 0,6 mm/);
    const R = radioExteriorFn(j.parametros);
    const rs = radios(cuerpo(j).malla, 40, 120).filter((r) => r > j.parametros.diametroHueco / 2 + 0.3);
    expect(Math.min(...rs)).toBeGreaterThanOrEqual(R(80) - 0.61);
  });
});

describe('textura del cuerpo: catálogo de superficies', () => {
  it('una textura del catálogo hunde la pared, cierra sin costura y respeta la profundidad', () => {
    const j = armarJarro(base({ textura: 'geo-hexagonos', texturaTamano: 14, texturaProfundidad: 0.8 }));
    const m = cuerpo(j).malla;
    expect(cerrada(m)).toBe(true);
    const R = radioExteriorFn(j.parametros);
    const rs = radios(m, 40, 120).filter((r) => r > j.parametros.diametroHueco / 2 + 1);
    expect(Math.max(...rs)).toBeLessThanOrEqual(R(80) + 0.01);
    expect(Math.min(...rs)).toBeLessThan(R(80) - 0.5);
    expect(Math.min(...rs)).toBeGreaterThan(R(80) - 0.85);
    // sin costura: en el ángulo 0 y en el de vuelta completa la pared tiene el mismo radio (misma columna)
    expect(j.avisos.join(' ')).not.toMatch(/costura/);
  });

  it('invertir cambia lo que sale y lo que entra', () => {
    const a = volumenMalla(cuerpo(armarJarro(base({ textura: 'geo-hexagonos', texturaTamano: 14 }))).malla);
    const b = volumenMalla(cuerpo(armarJarro(base({ textura: 'geo-hexagonos', texturaTamano: 14, texturaInvertir: true }))).malla);
    expect(Math.abs(a - b)).toBeGreaterThan(50);
  });

  it('todas las categorías arman un cuerpo cerrado', () => {
    for (const id of ['madera-vetas', 'carbono-sargaFina', 'geo-ondas']) {
      const j = armarJarro(base({ textura: id, texturaTamano: 20 }));
      expect(cerrada(cuerpo(j).malla), id).toBe(true);
    }
  });
});

describe('textura del cuerpo: calidad y peso', () => {
  it('la vista es liviana y el modelo final tiene más detalle, ambos dentro de su tope', () => {
    const p = base({ textura: 'geo-hexagonos', texturaTamano: 8 });
    const vista = armarJarro(p, { calidad: 'vista' });
    const final = armarJarro(p, { calidad: 'final' });
    expect(vista.triangulosCuerpoTextura).toBeLessThan(final.triangulosCuerpoTextura);
    expect(vista.triangulosCuerpoTextura).toBeLessThanOrEqual(MAX_TRIANGULOS_VISTA);
    expect(final.triangulosCuerpoTextura).toBeLessThanOrEqual(MAX_TRIANGULOS_FINAL);
    expect(vista.calidad).toBe('vista');
  });

  it('con un detalle exagerado se baja la resolución y avisa (sólo en el modelo final)', () => {
    const p = base({ textura: 'madera-corteza', texturaTamano: 4, texturaResolucion: 0.3 });
    const final = armarJarro(p, { calidad: 'final' });
    expect(final.triangulosCuerpoTextura).toBeLessThanOrEqual(MAX_TRIANGULOS_FINAL + 5000);
    expect(final.avisos.join(' ')).toMatch(/se bajó un poco la resolución/);
    expect(armarJarro(p, { calidad: 'vista' }).avisos.join(' ')).not.toMatch(/se bajó un poco la resolución/);
  });

  it('la estimación de triángulos coincide con la grilla', () => {
    const s = sanearParametros(base({ textura: TEXTURA_DUELAS }));
    const R = radioExteriorFn(s);
    const H = s.fondo + s.altoHueco;
    const g = grillaTextura(s, R, H, 'final');
    expect(estimarTriangulosTextura(s, R, H, 'final')).toBe(g.triangulos);
    expect(estimarTriangulosTextura({ ...s, textura: TEXTURA_NINGUNA }, R, H)).toBe(0);
  });
});

describe('textura del cuerpo: convive con el resto del jarro', () => {
  it('cartel desmontable, emblema, aros y asa desmontable sobre un cuerpo con duelas siguen cerrados', () => {
    const j = armarJarro({
      ...PARAMETROS_INICIALES, textura: TEXTURA_DUELAS, asaDesmontable: true, emblema: true, emblemaAngulo: 180, aroArriba: true, aroDesmontable: true
    }, { calidad: 'vista' });
    expect(cerrada(cuerpo(j).malla)).toBe(true);
    expect(j.piezas.map((x) => x.id)).toEqual(['cuerpo', 'asa', 'emblema1', 'aroArriba']);
  });
});
