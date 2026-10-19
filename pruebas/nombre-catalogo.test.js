import { describe, it, expect } from 'vitest';
import * as app from '../src/utils/nombreCatalogo';
import servidor from '../functions/nombreCatalogo.js';

const MUESTRAS = ['Mi Emprendimiento', '  Impresiones_3D  ', 'Cañuelas Ñandú', '--a--', 'a', 'Admin', 'WWW', 'x'.repeat(60), 'ñ', 'tienda de Lucas!!', '3D-Lucas'];

describe('nombre del catálogo en la dirección', () => {
  it('la app y el servidor normalizan y validan igual', () => {
    expect(app.RESERVADOS).toEqual(servidor.RESERVADOS);
    for (const m of MUESTRAS) {
      expect(app.normalizarNombre(m)).toBe(servidor.normalizarNombre(m));
      const n = servidor.normalizarNombre(m);
      expect(app.motivoNombreInvalido(n)).toBe(servidor.motivoNombreInvalido(n));
    }
  });
  it('normaliza acentos, espacios y símbolos', () => {
    expect(app.normalizarNombre('  Mi Emprendimiento 3D!  ')).toBe('mi-emprendimiento-3d');
    expect(app.normalizarNombre('Cañuelas Ñandú')).toBe('canuelas-nandu');
    expect(app.normalizarNombre('--a--b--')).toBe('a-b');
  });
  it('rechaza cortos, largos y reservados', () => {
    expect(app.motivoNombreInvalido('ab')).toBeTruthy();
    expect(app.motivoNombreInvalido('a'.repeat(41))).toBeTruthy();
    expect(app.motivoNombreInvalido('admin')).toBeTruthy();
    expect(app.motivoNombreInvalido('lucas-3d')).toBeNull();
  });
  it('reconoce las rutas de catálogo', () => {
    expect(app.nombreDeRuta('/lucas-3d')).toBe('lucas-3d');
    expect(app.nombreDeRuta('/lucas-3d/')).toBe('lucas-3d');
    expect(app.nombreDeRuta('/')).toBeNull();
    expect(app.nombreDeRuta('/catalogo')).toBeNull();
    expect(app.nombreDeRuta('/catalogo/abc')).toBeNull();
    expect(app.nombreDeRuta('/Lucas')).toBeNull();
    expect(app.nombreDeRuta('/version.json')).toBeNull();
    expect(app.esRutaDeCatalogo('/catalogo/abc')).toBe(true);
    expect(app.esRutaDeCatalogo('/lucas-3d')).toBe(true);
    expect(app.esRutaDeCatalogo('/')).toBe(false);
  });
});
