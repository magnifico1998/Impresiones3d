import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import opentypeNs from 'opentype.js';
import { iniciarMotor } from '../src/utils/motorBooleano';
import { PARAMETROS_INICIALES, TEXTURAS, FORMAS_ASA, sanearParametros, armarJarro, conLata } from '../src/utils/jarros';
import { FUENTES } from '../src/utils/fuentesLlaveros';
import {
  ESTILOS, MAX_BYTES_ARCHIVO, MAX_BYTES_DISENO, aplicarEstilo, datosDeDiseno, empaquetarDiseno, leerDiseno, limpiarNombreDiseno, nombreArchivoDiseno, parametrosDeDatos
} from '../src/utils/jarrosDisenos';
import { revisarCerrada } from '../src/utils/mallas3d';

const opentype = opentypeNs.parse ? opentypeNs : opentypeNs.default;
const b = fs.readFileSync('node_modules/@fontsource/fredoka/files/fredoka-latin-400-normal.woff');
const fuente = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));

vi.setConfig({ testTimeout: 90000 });
beforeAll(async () => { await iniciarMotor(); });

describe('estilos listos para usar', () => {
  it('hay estilos con nombre y descripción, sin ids repetidos', () => {
    expect(ESTILOS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ESTILOS.map((e) => e.id)).size).toBe(ESTILOS.length);
    for (const e of ESTILOS) { expect(e.nombre, e.id).toBeTruthy(); expect(e.ayuda, e.id).toBeTruthy(); }
    expect(ESTILOS.map((e) => e.id)).toEqual(expect.arrayContaining(['cervecero', 'vikingo', 'navideno']));
  });

  it('cada estilo usa texturas, tipografías y asas que existen y no pierde nada al sanearse', () => {
    for (const e of ESTILOS) {
      const p = e.parametros;
      if (p.textura && p.textura !== 'duelas') expect(TEXTURAS.some((t) => t.id === p.textura), `${e.id} textura`).toBe(true);
      if (p.cartelFuente) expect(FUENTES.some((f) => f.id === p.cartelFuente), `${e.id} tipografía`).toBe(true);
      if (p.asaForma) expect(FORMAS_ASA.some((f) => f.id === p.asaForma), `${e.id} asa`).toBe(true);
      const d = aplicarEstilo(PARAMETROS_INICIALES, e.id);
      for (const [k, v] of Object.entries(p)) {
        if (k === 'colores') continue;
        expect(d[k], `${e.id}.${k}`).toEqual(v);
      }
      for (const [k, v] of Object.entries(p.colores || {})) expect(d.colores[k], `${e.id}.colores.${k}`).toBe(v);
    }
  });

  it('un estilo conserva la lata y los ajustes de impresión, pero cambia todo lo demás', () => {
    const actual = { ...conLata(PARAMETROS_INICIALES, '330'), impresora: 'uno', emblema: true, aroArriba: true, cartelTexto: 'Otro', colores: { ...PARAMETROS_INICIALES.colores, cuerpo: '#123456' } };
    const d = aplicarEstilo(actual, 'minimalista');
    expect(d.diametroHueco).toBe(actual.diametroHueco);
    expect(d.altoHueco).toBe(actual.altoHueco);
    expect(d.latId).toBe('330');
    expect(d.impresora).toBe('uno');
    expect(d.emblema).toBe(false);
    expect(d.aroArriba).toBe(false);
    expect(d.cartelTexto).toBe('Café');
    expect(d.colores.cuerpo).toBe('#f2f2f2');
    expect(() => aplicarEstilo(actual, 'no existe')).toThrow(/No existe ese estilo/);
  });

  it('cada estilo arma un jarro completo, con el cuerpo cerrado y sin errores', () => {
    for (const e of ESTILOS) {
      const j = armarJarro(aplicarEstilo(PARAMETROS_INICIALES, e.id), { fuente, calidad: 'vista' });
      const cuerpo = j.piezas.find((x) => x.id === 'cuerpo');
      expect(revisarCerrada(cuerpo.malla).cerrada, e.id).toBe(true);
      expect(j.piezas.length, e.id).toBeGreaterThan(1);
      expect(j.avisos.filter((a) => /se pisa/.test(a)), `${e.id}: ${j.avisos.join(' | ')}`).toEqual([]);
    }
  });

  it('los estilos con cartel, emblemas y aros traen esas piezas', () => {
    const c = armarJarro(aplicarEstilo(PARAMETROS_INICIALES, 'cervecero'), { fuente, calidad: 'vista' });
    expect(c.piezas.map((x) => x.id)).toEqual(expect.arrayContaining(['cartel', 'aroArriba', 'aroAbajo', 'envoltura']));
    const v = armarJarro(aplicarEstilo(PARAMETROS_INICIALES, 'vikingo'), { fuente, calidad: 'vista' });
    expect(v.piezas.map((x) => x.id)).toEqual(expect.arrayContaining(['emblema1', 'emblema2', 'aroArriba']));
  });
});

describe('diseños guardados en la cuenta', () => {
  it('ida y vuelta: lo que se guarda vuelve igual', () => {
    const d = aplicarEstilo(PARAMETROS_INICIALES, 'cervecero');
    expect(parametrosDeDatos(datosDeDiseno(d))).toEqual(sanearParametros(d));
  });

  it('un diseño viejo o a medias se completa con los valores de siempre', () => {
    const p = parametrosDeDatos(JSON.stringify({ cartel: true, cartelTexto: 'Hola' }));
    expect(p.cartel).toBe(true);
    expect(p.diametroHueco).toBe(PARAMETROS_INICIALES.diametroHueco);
    expect(p.colores.cuerpo).toBe(PARAMETROS_INICIALES.colores.cuerpo);
  });

  it('rechaza lo que está roto o pesa demasiado', () => {
    for (const malo of ['', 'no es json', '[]', 'null', '5']) expect(() => parametrosDeDatos(malo), malo).toThrow(/no se puede leer/);
    expect(() => parametrosDeDatos('x'.repeat(MAX_BYTES_DISENO + 1))).toThrow(/no se puede leer/);
  });

  it('el máximo de peso entra: un SVG de 300 KB más una forma propia caben en un documento', () => {
    expect(MAX_BYTES_DISENO).toBeGreaterThan(300000 + 150000);
    expect(MAX_BYTES_DISENO).toBeLessThan(1048576);
  });

  it('los nombres se limpian', () => {
    expect(limpiarNombreDiseno('  Mi   jarro  ' + 'x'.repeat(80))).toHaveLength(60);
    expect(nombreArchivoDiseno('Jarro  vikingo')).toBe('Jarro vikingo.jarro.json');
    expect(nombreArchivoDiseno('')).toBe('Jarro.jarro.json');
  });
});

describe('compartir un diseño como archivo', () => {
  it('se empaqueta y se abre igual, con su nombre', () => {
    const d = aplicarEstilo(PARAMETROS_INICIALES, 'navideno');
    const texto = empaquetarDiseno(d, 'Para regalar');
    const r = leerDiseno(texto);
    expect(r.nombre).toBe('Para regalar');
    expect(r.parametros).toEqual(sanearParametros(d));
    expect(JSON.parse(texto).formato).toBe('manager3d-jarro');
  });

  it('lleva también el símbolo propio y el SVG, para que quien lo abra lo vea igual', () => {
    const d = { ...PARAMETROS_INICIALES, emblema: true, emblemaSimbolo: 'propio', emblemaForma: JSON.stringify([{ fuera: [[0, 0], [1, 0], [0, 1]], huecos: [] }]), emblemaFormaNombre: 'Mi dibujo' };
    const r = leerDiseno(empaquetarDiseno(d, 'x'));
    expect(r.parametros.emblemaSimbolo).toBe('propio');
    expect(r.parametros.emblemaForma).toBe(d.emblemaForma);
  });

  it('sanea lo que trae el archivo: valores fuera de rango o raros no pasan', () => {
    const texto = JSON.stringify({ formato: 'manager3d-jarro', version: 1, nombre: 'x', parametros: { diametroHueco: 99999, textura: 'inexistente', colores: { cuerpo: 'no-color' }, asaAngulo: 'abc' } });
    const r = leerDiseno(texto);
    expect(r.parametros.diametroHueco).toBe(120);
    expect(r.parametros.textura).toBe('ninguna');
    expect(r.parametros.colores.cuerpo).toBe(PARAMETROS_INICIALES.colores.cuerpo);
    expect(r.parametros.asaAngulo).toBe(PARAMETROS_INICIALES.asaAngulo);
  });

  it('rechaza archivos que no son diseños de Manager3D', () => {
    for (const malo of ['', 'hola', '{}', '[]', JSON.stringify({ formato: 'otro', version: 1, parametros: {} }), JSON.stringify({ formato: 'manager3d-jarro', parametros: {} }), JSON.stringify({ formato: 'manager3d-jarro', version: 1 })]) {
      expect(() => leerDiseno(malo), malo.slice(0, 30)).toThrow(/no es un diseño de jarro/);
    }
    expect(() => leerDiseno('x'.repeat(MAX_BYTES_ARCHIVO + 1))).toThrow(/demasiado pesado/);
  });
});
