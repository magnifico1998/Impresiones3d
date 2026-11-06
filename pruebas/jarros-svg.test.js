import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { iniciarMotor } from '../src/utils/motorBooleano';
import { PARAMETROS_INICIALES, sanearParametros, armarJarro, SIMBOLO_SVG } from '../src/utils/jarros';
import { contornosDeSvg, caminosDeSvg } from '../src/utils/svgSimbolo';
import { cajaMalla, volumenMalla, revisarCerrada } from '../src/utils/mallas3d';

// El motor 3D corre en Node; sólo se le presta a la lectura de SVG el DOMParser de jsdom (en el navegador ya existe).
globalThis.DOMParser = new JSDOM('').window.DOMParser;
vi.setConfig({ testTimeout: 60000 });
beforeAll(async () => { await iniciarMotor(); });

// Rectángulo de 40 × 20 con un agujero cuadrado, y un círculo aparte; las coordenadas están corridas y el eje Y va para abajo.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <path d="M100 100 h40 v20 h-40 z M110 105 h10 v10 h-10 z" fill="#000" fill-rule="evenodd"/>
  <circle cx="150" cy="150" r="10" fill="red"/>
  <path d="M0 0 L50 0" stroke="black" fill="none"/>
</svg>`;
const base = (extra = {}) => ({ ...PARAMETROS_INICIALES, asa: false, emblema: true, emblemaRespaldo: 'ninguno', ...extra });

describe('SVG propio: lectura', () => {
  it('toma las formas rellenas, con huecos, centradas y con el lado mayor en 1; ignora los trazos', () => {
    const c = contornosDeSvg(SVG);
    expect(c).toHaveLength(2); // el rectángulo con hueco y el círculo; la línea sin relleno no
    const puntos = c.flatMap((f) => f.fuera);
    const xs = puntos.map((q) => q[0]), ys = puntos.map((q) => q[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 5);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 5);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(0, 5);
    expect(c.find((f) => f.huecos.length)).toBeTruthy();
    // El círculo está más abajo en el dibujo (y mayor): después de dar vuelta el eje queda más abajo (y menor)
    const circulo = c.find((f) => !f.huecos.length);
    const rect = c.find((f) => f.huecos.length);
    expect(circulo.fuera[0][1]).toBeLessThan(rect.fuera[0][1]);
  });

  it('el símbolo mide lo pedido en mm', () => {
    const caminos = caminosDeSvg(SVG, 30);
    let x0 = Infinity, x1 = -Infinity;
    for (const c of caminos) for (const q of c) { x0 = Math.min(x0, q.X); x1 = Math.max(x1, q.X); }
    expect((x1 - x0) / 1000).toBeCloseTo(30, 1);
  });

  it('rechaza lo que no sirve con un mensaje claro', () => {
    expect(() => contornosDeSvg('hola')).toThrow(/no parece un SVG/);
    expect(() => contornosDeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L9 9" stroke="black" fill="none"/></svg>')).toThrow(/formas rellenas/);
    expect(() => contornosDeSvg('<svg>' + 'x'.repeat(300001) + '</svg>')).toThrow(/pesado/);
  });
});

describe('SVG propio: en el jarro', () => {
  it('se sanea: sin texto de SVG vuelve a la estrella, y un SVG demasiado grande se descarta', () => {
    expect(sanearParametros({ emblemaSimbolo: SIMBOLO_SVG }).emblemaSimbolo).toBe('estrella');
    expect(sanearParametros({ emblemaSimbolo: SIMBOLO_SVG, emblemaSvg: SVG }).emblemaSimbolo).toBe(SIMBOLO_SVG);
    expect(sanearParametros({ emblemaSimbolo: SIMBOLO_SVG, emblemaSvg: 'x'.repeat(300001) }).emblemaSvg).toBe('');
  });

  it('el emblema con tu SVG se arma, conserva el hueco y queda cerrado', () => {
    const j = armarJarro(base({ emblemaSimbolo: SIMBOLO_SVG, emblemaSvg: SVG, emblemaTamano: 30 }));
    const e = j.piezas.find((x) => x.id === 'emblema1');
    expect(e.partes.map((q) => q.id)).toEqual(['simbolo']);
    expect(revisarCerrada(e.malla).cerrada).toBe(true);
    expect(volumenMalla(e.malla)).toBeGreaterThan(0);
    expect(revisarCerrada(j.piezas[0].malla).cerrada).toBe(true);
    const c = cajaMalla(e.mallaImpresion);
    expect(c.max[0] - c.min[0]).toBeGreaterThan(25);
  });

  it('con respaldo, el SVG va como símbolo encima', () => {
    const j = armarJarro(base({ emblemaRespaldo: 'ovalo', emblemaSimbolo: SIMBOLO_SVG, emblemaSvg: SVG }));
    expect(j.piezas.find((x) => x.id === 'emblema1').partes.map((q) => q.id)).toEqual(['respaldo', 'borde', 'simbolo']);
  });

  it('un SVG roto no rompe el jarro: usa la estrella y avisa', () => {
    const j = armarJarro(base({ emblemaSimbolo: SIMBOLO_SVG, emblemaSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L9 9" stroke="black" fill="none"/></svg>' }));
    expect(j.piezas.some((x) => x.id === 'emblema1')).toBe(true);
    expect(j.avisos.join(' ')).toMatch(/Se usó una estrella/);
  });
});
