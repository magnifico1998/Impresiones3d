import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import opentypeNs from 'opentype.js';
import { iniciarMotor } from '../src/utils/motorBooleano';
import { PARAMETROS_INICIALES, ALINEACIONES, sanearParametros, armarJarro } from '../src/utils/jarros';
import { textoAlineado } from '../src/utils/jarrosCartel';
import { cajaMalla, revisarCerrada } from '../src/utils/mallas3d';

const opentype = opentypeNs.parse ? opentypeNs : opentypeNs.default;
const leerFuente = (nombre) => {
  const b = fs.readFileSync(`node_modules/@fontsource/${nombre}/files/${nombre}-latin-400-normal.woff`);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
const fuente = leerFuente('fredoka');

// Armar un cartel con texto tarda cerca de un segundo por jarro.
vi.setConfig({ testTimeout: 30000 });
beforeAll(async () => { await iniciarMotor(); });

// Rango en X de la tinta de cada renglón (las formas se agrupan por la altura de su centro).
function renglones(formas, cuantos, alto) {
  const filas = Array.from({ length: cuantos }, () => ({ x0: Infinity, x1: -Infinity }));
  for (const f of formas) {
    const pts = f.getPoints(8);
    const cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    // El renglón 0 está arriba: y positiva.
    const i = Math.min(cuantos - 1, Math.max(0, Math.floor(((alto / 2 - cy) / alto) * cuantos)));
    for (const q of pts) { filas[i].x0 = Math.min(filas[i].x0, q.x); filas[i].x1 = Math.max(filas[i].x1, q.x); }
  }
  return filas;
}

const TEXTO = 'Casa de la familia\nGarcía\nMi hogar';
const trazar = (alineacion) => {
  const r = textoAlineado(fuente, TEXTO, 12, 0, alineacion);
  return { r, filas: renglones(r.formas, 3, r.alto) };
};

describe('cartel: texto de varios renglones', () => {
  it('cada Enter es un renglón: más renglones, más alto, y las líneas vacías no cuentan', () => {
    const uno = textoAlineado(fuente, 'Ana', 12);
    const dos = textoAlineado(fuente, 'Ana\nGarcía', 12);
    expect(dos.alto).toBeGreaterThan(uno.alto + 12);
    expect(textoAlineado(fuente, 'Ana\n\n  \nGarcía', 12).alto).toBeCloseTo(dos.alto, 6);
    expect(textoAlineado(fuente, '  \n', 12).formas).toHaveLength(0);
  });

  it('el interlineado separa los renglones', () => {
    const justo = textoAlineado(fuente, 'Ana\nLuz', 12, 0, 'centro', 1.1);
    const suelto = textoAlineado(fuente, 'Ana\nLuz', 12, 0, 'centro', 2);
    expect(suelto.alto - justo.alto).toBeCloseTo(12 * (2 - 1.1), 5);
  });

  it('izquierda: todos los renglones empiezan en el margen izquierdo', () => {
    const { r, filas } = trazar('izquierda');
    for (const f of filas) expect(f.x0).toBeCloseTo(-r.ancho / 2, 0);
    // Y los más cortos terminan antes del margen derecho.
    expect(Math.min(...filas.map((f) => f.x1))).toBeLessThan(r.ancho / 2 - 5);
  });

  it('derecha: todos los renglones terminan en el margen derecho', () => {
    const { r, filas } = trazar('derecha');
    for (const f of filas) expect(f.x1).toBeCloseTo(r.ancho / 2, 0);
    expect(Math.max(...filas.map((f) => f.x0))).toBeGreaterThan(-r.ancho / 2 + 5);
  });

  it('centrada: cada renglón queda centrado', () => {
    const { filas } = trazar('centro');
    for (const f of filas) expect((f.x0 + f.x1) / 2).toBeCloseTo(0, 0);
  });

  it('ambos márgenes: los renglones llenan el ancho, menos el último, que queda a la izquierda', () => {
    const { r, filas } = trazar('justificado');
    for (const f of filas.slice(0, 2)) { expect(f.x0).toBeCloseTo(-r.ancho / 2, 0); expect(f.x1).toBeCloseTo(r.ancho / 2, 0); }
    expect(filas[2].x0).toBeCloseTo(-r.ancho / 2, 0);
    expect(filas[2].x1).toBeLessThan(r.ancho / 2 - 5);
  });

  it('ambos márgenes (todo): llenan el ancho todos los renglones, también el último', () => {
    const { r, filas } = trazar('bloque');
    for (const f of filas) { expect(f.x0).toBeCloseTo(-r.ancho / 2, 0); expect(f.x1).toBeCloseTo(r.ancho / 2, 0); }
  });

  it('una sola palabra se estira repartiendo las letras', () => {
    const r = textoAlineado(fuente, 'Casa de la familia\nGarcía', 12, 0, 'bloque');
    const filas = renglones(r.formas, 2, r.alto);
    expect(filas[1].x1 - filas[1].x0).toBeCloseTo(r.ancho, 0);
  });

  it('el ancho es el del renglón más largo, sin importar la alineación', () => {
    const base = trazar('centro').r.ancho;
    for (const a of ALINEACIONES) expect(textoAlineado(fuente, TEXTO, 12, 0, a.id).ancho).toBeCloseTo(base, 6);
  });
});

describe('cartel: texto de varios renglones en el jarro', () => {
  const conCartel = (extra) => ({ ...PARAMETROS_INICIALES, asa: false, cartel: true, ...extra });

  it('se sanea: hasta 4 renglones de 30 letras y una alineación válida', () => {
    const s = sanearParametros({ cartelTexto: `${'a'.repeat(50)}\r\nb\nc\nd\ne\nf`, cartelAlineacion: 'rara', cartelInterlineado: 9 });
    expect(s.cartelTexto.split('\n')).toHaveLength(4);
    expect(s.cartelTexto.split('\n')[0]).toHaveLength(30);
    expect(s.cartelAlineacion).toBe('centro');
    expect(s.cartelInterlineado).toBe(2.2);
    expect(sanearParametros({ cartelAlineacion: 'bloque' }).cartelAlineacion).toBe('bloque');
  });

  it('un cartel de dos renglones es más alto que uno de uno y sus partes quedan cerradas', () => {
    const uno = armarJarro(conCartel({ cartelTexto: 'Ana' }), { fuente });
    const dos = armarJarro(conCartel({ cartelTexto: 'Casa de\nGustavo', cartelAlineacion: 'bloque' }), { fuente });
    const alto = (j) => { const c = cajaMalla(j.piezas.find((x) => x.id === 'cartel').malla); return c.max[2] - c.min[2]; };
    expect(alto(dos)).toBeGreaterThan(alto(uno) + 8);
    for (const parte of dos.piezas.find((x) => x.id === 'cartel').partes) expect(revisarCerrada(parte.malla).cerrada, parte.id).toBe(true);
  });

  it('cambiar la alineación cambia las letras pero no el tamaño del cartel', () => {
    const a = armarJarro(conCartel({ cartelTexto: 'Casa de\nGustavo García', cartelAlineacion: 'izquierda' }), { fuente });
    const b = armarJarro(conCartel({ cartelTexto: 'Casa de\nGustavo García', cartelAlineacion: 'derecha' }), { fuente });
    const parte = (j, id) => j.piezas.find((x) => x.id === 'cartel').partes.find((q) => q.id === id).malla;
    const mediaX = (m) => { let t = 0; for (let i = 0; i < m.pos.length; i += 3) t += m.pos[i]; return t / (m.pos.length / 3); };
    expect(cajaMalla(parte(a, 'base')).max[0]).toBeCloseTo(cajaMalla(parte(b, 'base')).max[0], 1);
    // Alineadas a la izquierda las letras quedan más hacia la izquierda que alineadas a la derecha.
    expect(mediaX(parte(a, 'letras'))).toBeLessThan(mediaX(parte(b, 'letras')) - 0.5);
  });
});
