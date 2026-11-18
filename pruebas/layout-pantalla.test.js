import { describe, expect, it } from 'vitest';
import { agruparContiguas, alternarOculta, combinarLayout, moverSeccion } from '../src/utils/layoutPantalla';

const ids = ['a', 'b', 'c', 'd'];

describe('layout de pantalla: combinar lo guardado con las secciones de hoy', () => {
  it('sin nada guardado queda el orden por defecto y nada oculto', () => {
    expect(combinarLayout(ids, null)).toEqual({ orden: ids, ocultas: [] });
    expect(combinarLayout(ids, {})).toEqual({ orden: ids, ocultas: [] });
  });

  it('respeta el orden y lo oculto que la persona guardó', () => {
    expect(combinarLayout(ids, { orden: ['c', 'a', 'd', 'b'], ocultas: ['d'] })).toEqual({ orden: ['c', 'a', 'd', 'b'], ocultas: ['d'] });
  });

  it('una sección nueva entra detrás de la que la precede por defecto', () => {
    // La persona guardó antes de que existiera "c".
    // "c" se sumó después: por defecto va detrás de "b", y "b" está segunda.
    expect(combinarLayout(ids, { orden: ['d', 'b', 'a'] }).orden).toEqual(['d', 'b', 'c', 'a']);
  });

  it('una sección nueva sin predecesora entra al principio', () => {
    expect(combinarLayout(['x', 'a', 'b'], { orden: ['b', 'a'] }).orden).toEqual(['x', 'b', 'a']);
  });

  it('descarta lo guardado que ya no existe y los repetidos', () => {
    expect(combinarLayout(ids, { orden: ['zzz', 'b', 'b', 'a'], ocultas: ['zzz', 'a', 'a'] })).toEqual({ orden: ['b', 'c', 'd', 'a'], ocultas: ['a'] });
  });

  it('una sección fija nunca queda oculta aunque lo guardado diga que sí', () => {
    expect(combinarLayout(ids, { ocultas: ['b', 'c'] }, ['b']).ocultas).toEqual(['c']);
  });

  it('tolera datos con formato inesperado', () => {
    expect(combinarLayout(ids, { orden: 'hola', ocultas: 5 })).toEqual({ orden: ids, ocultas: [] });
  });
});

describe('layout de pantalla: mover y ocultar', () => {
  it('sube y baja una sección', () => {
    expect(moverSeccion(ids, [], 'c', -1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moverSeccion(ids, [], 'b', 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('en el borde no cambia nada', () => {
    expect(moverSeccion(ids, [], 'a', -1)).toEqual(ids);
    expect(moverSeccion(ids, [], 'd', 1)).toEqual(ids);
  });

  it('salta por encima de las ocultas', () => {
    // b está oculta: c sube y queda antes de a, no "antes de b".
    expect(moverSeccion(ids, ['b'], 'c', -1)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('oculta y vuelve a mostrar, pero no oculta una fija', () => {
    expect(alternarOculta([], 'a')).toEqual(['a']);
    expect(alternarOculta(['a'], 'a')).toEqual([]);
    expect(alternarOculta([], 'a', ['a'])).toEqual([]);
  });
});

describe('layout de pantalla: secciones en columnas', () => {
  it('junta las contiguas del mismo grupo y deja las demás solas', () => {
    const lista = [{ id: 'a' }, { id: 'b', grupo: 'fila' }, { id: 'c', grupo: 'fila' }, { id: 'd' }, { id: 'e', grupo: 'fila' }];
    expect(agruparContiguas(lista).map((b) => [b.grupo, b.secciones.map((s) => s.id)])).toEqual([
      [null, ['a']],
      ['fila', ['b', 'c']],
      [null, ['d']],
      ['fila', ['e']]
    ]);
  });
});
