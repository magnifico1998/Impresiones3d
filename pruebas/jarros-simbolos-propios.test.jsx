import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { iniciarMotor } from '../src/utils/motorBooleano';
import { PARAMETROS_INICIALES, SIMBOLO_PROPIO, sanearParametros, armarJarro } from '../src/utils/jarros';
import {
  MAX_PUNTOS_SIMBOLO, aplicarSimetria, contornosAJson, contornosDeDibujo, contornosDeJson, limitarRepeticiones, limpiarNombreSimbolo, normalizarPoligonos, simplificarContornos, suavizar
} from '../src/utils/simbolosPropios';
import EditorSimbolo, { puntosIniciales } from '../src/components/herramientas/EditorSimbolo';
import { cajaMalla, revisarCerrada, volumenMalla } from '../src/utils/mallas3d';

vi.setConfig({ testTimeout: 60000 });
beforeAll(async () => { await iniciarMotor(); });

const caja = (poli) => ({
  x0: Math.min(...poli.map((q) => q[0])), x1: Math.max(...poli.map((q) => q[0])),
  y0: Math.min(...poli.map((q) => q[1])), y1: Math.max(...poli.map((q) => q[1]))
});

describe('símbolos propios: simetrías', () => {
  it('sin simetría hacen falta 3 puntos y el polígono es el mismo', () => {
    expect(aplicarSimetria([[0, 0], [1, 0]], 'ninguna')).toEqual([]);
    expect(aplicarSimetria([[0, 0], [1, 0], [0, 1]], 'ninguna')).toHaveLength(3);
  });

  it('espejo: el lado izquierdo es el reflejo y los extremos se pegan al eje', () => {
    const poli = aplicarSimetria([[0.3, 0.9], [0.8, 0.2], [0.4, -0.9]], 'espejo');
    expect(poli).toEqual([[0, 0.9], [0.8, 0.2], [0, -0.9], [-0.8, 0.2]]);
    const c = caja(poli);
    expect(c.x0).toBeCloseTo(-c.x1, 9);
    expect(aplicarSimetria([[0, 0]], 'espejo')).toEqual([]);
    // un punto que se pasó del eje se corta en el eje
    expect(aplicarSimetria([[0, 1], [-0.5, 0], [0, -1]], 'espejo').every(([x]) => Math.abs(x) <= 1)).toBe(true);
  });

  it('giratoria: n copias, con el mismo radio y repartidas parejo', () => {
    const poli = aplicarSimetria([[0.9, 0], [0.4 * Math.cos(Math.PI / 5), 0.4 * Math.sin(Math.PI / 5)]], 'radial', 5);
    expect(poli).toHaveLength(10);
    poli.forEach(([x, y], i) => expect(Math.hypot(x, y)).toBeCloseTo(i % 2 ? 0.4 : 0.9, 9));
    const ang = poli.filter((_, i) => i % 2 === 0).map(([x, y]) => Math.atan2(y, x));
    expect(((ang[1] - ang[0]) + 2 * Math.PI) % (2 * Math.PI)).toBeCloseTo((2 * Math.PI) / 5, 9);
  });

  it('giratoria con espejo: cada porción es simétrica respecto de su borde', () => {
    const poli = aplicarSimetria([[0.9, 0], [0.5 * Math.cos(0.2), 0.5 * Math.sin(0.2)]], 'radialEspejo', 4);
    expect(poli).toHaveLength(16);
    // el primer punto y su reflejo contra el borde (π/4) están a la misma distancia del borde
    const a = poli[0], b = poli[3];
    expect(Math.hypot(...a)).toBeCloseTo(Math.hypot(...b), 9);
    expect(Math.atan2(b[1], b[0])).toBeCloseTo(Math.PI / 2 - 0, 9); // reflejo de 0° respecto de 45° es 90°
  });

  it('la cantidad de repeticiones se limita entre 2 y 16', () => {
    expect(limitarRepeticiones(0)).toBe(2);
    expect(limitarRepeticiones(99)).toBe(16);
    expect(limitarRepeticiones('7.4')).toBe(7);
  });

  it('el suavizado duplica los puntos por vuelta y no sale del contorno original', () => {
    const cuadrado = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(suavizar(cuadrado, 0)).toHaveLength(4);
    expect(suavizar(cuadrado, 2)).toHaveLength(16);
    const c = caja(suavizar(cuadrado, 3));
    expect(c.x0).toBeGreaterThanOrEqual(0);
    expect(c.x1).toBeLessThanOrEqual(1);
  });
});

describe('símbolos propios: contornos y biblioteca', () => {
  it('se normaliza al centro y con el lado mayor en 1', () => {
    const [p] = normalizarPoligonos([[[10, 10], [30, 10], [30, 20], [10, 20]]]);
    const c = caja(p);
    expect(c.x1 - c.x0).toBeCloseTo(1, 9);
    expect((c.x0 + c.x1) / 2).toBeCloseTo(0, 9);
    expect((c.y0 + c.y1) / 2).toBeCloseTo(0, 9);
    expect(normalizarPoligonos([[[1, 1], [1, 1], [1, 1]]])).toBeNull();
  });

  it('cada simetría de ejemplo del editor da un símbolo válido', () => {
    for (const modo of ['ninguna', 'espejo', 'radial', 'radialEspejo']) {
      const c = contornosDeDibujo(puntosIniciales(modo, 6), modo, 6, 1);
      expect(c, modo).not.toBeNull();
      const b = caja(c[0].fuera);
      expect(Math.max(b.x1 - b.x0, b.y1 - b.y0), modo).toBeCloseTo(1, 3);
    }
    expect(contornosDeDibujo([[0, 0]], 'espejo', 6)).toBeNull();
    expect(contornosDeDibujo([], 'ninguna', 6)).toBeNull();
  });

  it('un símbolo con demasiados puntos se simplifica hasta entrar', () => {
    const muchos = Array.from({ length: 12000 }, (_, i) => [0.5 * Math.cos((2 * Math.PI * i) / 12000), 0.5 * Math.sin((2 * Math.PI * i) / 12000)]);
    const s = simplificarContornos([{ fuera: muchos, huecos: [] }]);
    expect(s[0].fuera.length).toBeLessThanOrEqual(MAX_PUNTOS_SIMBOLO);
    expect(s[0].fuera.length).toBeGreaterThan(50);
  });

  it('va y vuelve como texto, y rechaza lo que está roto', () => {
    const c = contornosDeDibujo(puntosIniciales('espejo', 6), 'espejo', 6, 0);
    expect(contornosDeJson(contornosAJson(c))).toEqual(c);
    for (const malo of ['', 'no es json', '[]', '[{"fuera":[[0,0]]}]', '[{"fuera":[[0,0],[1,"a"],[1,1]]}]', 'x'.repeat(150001)]) {
      expect(() => contornosDeJson(malo), malo.slice(0, 20)).toThrow(/no se puede leer/);
    }
    expect(limpiarNombreSimbolo('  Mi   logo  ' + 'x'.repeat(60))).toHaveLength(40);
  });
});

describe('símbolos propios: en el jarro', () => {
  const forma = contornosAJson(contornosDeDibujo(puntosIniciales('radial', 6), 'radial', 6, 1));
  const base = (extra = {}) => ({ ...PARAMETROS_INICIALES, asa: false, emblema: true, emblemaRespaldo: 'ninguno', ...extra });

  it('se sanea: sin contornos vuelve a la estrella y uno enorme se descarta', () => {
    expect(sanearParametros({ emblemaSimbolo: SIMBOLO_PROPIO }).emblemaSimbolo).toBe('estrella');
    expect(sanearParametros({ emblemaSimbolo: SIMBOLO_PROPIO, emblemaForma: forma }).emblemaSimbolo).toBe(SIMBOLO_PROPIO);
    expect(sanearParametros({ emblemaSimbolo: SIMBOLO_PROPIO, emblemaForma: 'x'.repeat(150001) }).emblemaForma).toBe('');
  });

  it('el emblema con el símbolo dibujado se arma cerrado y del tamaño pedido', () => {
    const j = armarJarro(base({ emblemaSimbolo: SIMBOLO_PROPIO, emblemaForma: forma, emblemaTamano: 30 }));
    const e = j.piezas.find((x) => x.id === 'emblema1');
    expect(revisarCerrada(e.malla).cerrada).toBe(true);
    expect(volumenMalla(e.malla)).toBeGreaterThan(0);
    const c = cajaMalla(e.mallaImpresion);
    expect(c.max[0] - c.min[0]).toBeGreaterThan(24);
    expect(c.max[1] - c.min[1]).toBeGreaterThan(5);
    expect(revisarCerrada(j.piezas[0].malla).cerrada).toBe(true);
  });

  it('un símbolo guardado roto no rompe el jarro: usa la estrella y avisa', () => {
    const j = armarJarro(base({ emblemaSimbolo: SIMBOLO_PROPIO, emblemaForma: '[{"fuera":[[0,0]]}]' }));
    expect(j.piezas.some((x) => x.id === 'emblema1')).toBe(true);
    expect(j.avisos.join(' ')).toMatch(/Se usó una estrella/);
  });
});

describe('símbolos propios: el editor se dibuja', () => {
  it('muestra la simetría, los puntos de ejemplo y las acciones', () => {
    const html = renderToStaticMarkup(<EditorSimbolo alUsar={() => {}} alGuardar={async () => true} alCerrar={() => {}} />);
    for (const texto of ['Dibujar un símbolo con simetría', 'Espejo (izquierda y derecha)', 'Usar en el emblema', 'Guardar en mi biblioteca', 'Cerrar editor', 'Suavizado']) {
      expect(html, texto).toContain(texto);
    }
    expect((html.match(/<circle/g) || []).length).toBe(6); // los 6 puntos de ejemplo del espejo
    expect(html).toContain('<polygon');
  });

  it('sin biblioteca no ofrece guardar', () => {
    const html = renderToStaticMarkup(<EditorSimbolo alUsar={() => {}} />);
    expect(html).not.toContain('Guardar en mi biblioteca');
  });
});
