import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ajustarLogo, tamanoLogoPdfDe } from '../src/utils/logoPdf';
import { MAX_COMENTARIO_ADJUNTO, adjuntoParaGuardar, hojasDeAnexo, porHojaDe } from '../src/utils/adjuntosPresupuesto';
import { aCamposArgentina, aIsoArgentina, estadoDelAviso, textoPorDefecto } from '../src/utils/avisoActualizacion';
import { esloganDe, esloganTamanoDe, recortarBorradorEslogan, tamanoLogoDe } from '../src/utils/catalogoMarca';

vi.mock('../src/utils/impresionDirecta', () => ({
  trabajoVencido: (t, ahora) => t.estado === 'pendiente' && t.accion === 'imprimir' && !!t.creadoMs && ahora - t.creadoMs > 10 * 60 * 1000
}));
const { estadoDeMarca, marcaDeEnvio, marcasDe, resumenDeArchivo, tipoDeEnvio } = await import('../src/utils/enviosPieza');

describe('logo en los PDF', () => {
  it('un logo rectangular entra entero sin deformarse', () => {
    const { w, h } = ajustarLogo(400, 100, 14);
    expect(w).toBe(14);
    expect(h).toBeCloseTo(3.5);
    expect(w / h).toBeCloseTo(4);
  });
  it('uno alto se ajusta por el alto', () => {
    const { w, h } = ajustarLogo(100, 400, 20);
    expect(h).toBe(20);
    expect(w).toBeCloseTo(5);
  });
  it('uno cuadrado llena la caja y los datos raros no rompen', () => {
    expect(ajustarLogo(300, 300, 14)).toEqual({ w: 14, h: 14 });
    expect(ajustarLogo(0, 0, 14)).toEqual({ w: 14, h: 14 });
  });
  it('el tamaño elegido queda dentro de lo razonable', () => {
    expect(tamanoLogoPdfDe({})).toBe(14);
    expect(tamanoLogoPdfDe({ logoPdfTamano: 28 })).toBe(28);
    expect(tamanoLogoPdfDe({ logoPdfTamano: 999 })).toBe(32);
    expect(tamanoLogoPdfDe({ logoPdfTamano: 1 })).toBe(8);
  });
});

describe('imágenes adjuntas de un presupuesto', () => {
  it('imágenes por hoja: sólo 1, 2 o 4', () => {
    expect(porHojaDe(2)).toBe(2);
    expect(porHojaDe('4')).toBe(4);
    expect(porHojaDe(3)).toBe(1);
    expect(porHojaDe(undefined)).toBe(1);
  });
  it('hojas de anexo necesarias', () => {
    expect(hojasDeAnexo(0, 1)).toBe(0);
    expect(hojasDeAnexo(3, 1)).toBe(3);
    expect(hojasDeAnexo(3, 2)).toBe(2);
    expect(hojasDeAnexo(5, 4)).toBe(2);
    expect(hojasDeAnexo(8, 4)).toBe(2);
  });
  it('lo que se guarda no lleva claves de más y recorta el comentario', () => {
    const g = adjuntoParaGuardar({ id: 1, url: 'u', dataUrl: 'data:...', comentario: `  ${'x'.repeat(500)}  ` });
    expect(Object.keys(g).sort()).toEqual(['comentario', 'id', 'url']);
    expect(g.comentario.length).toBe(MAX_COMENTARIO_ADJUNTO);
  });
});

describe('aviso de actualización programada', () => {
  const iso = aIsoArgentina('2026-10-11', '08:00');
  const ms = Date.parse(iso);
  it('domingo 11/10 08:00 de Argentina son las 11:00 UTC', () => expect(ms).toBe(Date.parse('2026-10-11T11:00:00Z')));
  it('los campos del formulario van y vuelven', () => {
    expect(aCamposArgentina(iso)).toEqual({ fecha: '2026-10-11', hora: '08:00' });
    expect(aCamposArgentina('2026-10-12T00:00:00-03:00')).toEqual({ fecha: '2026-10-12', hora: '00:00' });
  });
  it('el texto por defecto dice cuándo y qué hacer', () => {
    const t = textoPorDefecto(iso);
    expect(t).toMatch(/domingo/i);
    expect(t).toMatch(/08:00/);
    expect(t).toMatch(/cerrá la aplicación/);
  });
  it('se muestra desde que se publica hasta 2 horas después de la hora fijada', () => {
    const aviso = { activo: true, fechaHora: iso, mensaje: '' };
    expect(estadoDelAviso({ ...aviso, activo: false }, ms - 1000)).toBeNull();
    expect(estadoDelAviso(aviso, ms - 2 * 86400000).tipo).toBe('antes');
    expect(estadoDelAviso(aviso, ms - 30 * 60000).texto).toMatch(/faltan 30 min/);
    expect(estadoDelAviso(aviso, ms + 10 * 60000).tipo).toBe('durante');
    expect(estadoDelAviso(aviso, ms + 3 * 3600000)).toBeNull();
  });
  it('un mensaje propio reemplaza al de siempre; sin fecha válida no se muestra nada', () => {
    expect(estadoDelAviso({ activo: true, fechaHora: iso, mensaje: 'Hola' }, ms - 86400000).texto).toBe('Hola');
    expect(estadoDelAviso({ activo: true, fechaHora: '' }, ms)).toBeNull();
  });
});

describe('marca del catálogo', () => {
  it('el logo y el texto destacado quedan dentro de lo razonable', () => {
    expect(tamanoLogoDe({})).toBe(40);
    expect(tamanoLogoDe({ logoTamano: 9999 })).toBe(160);
    expect(esloganTamanoDe({ esloganTamano: 3 })).toBe(10);
  });
  it('el texto destacado: hasta 3 líneas de 60 caracteres, sin líneas vacías', () => {
    expect(esloganDe({ eslogan: ' a  b \n\n c \n d \n e' })).toBe('a b\nc\nd');
    expect(esloganDe({ eslogan: 'x'.repeat(100) }).length).toBe(60);
    expect(recortarBorradorEslogan('1\n2\n3\n4')).toBe('1\n2\n3');
  });
});

describe('G-code enviados desde una pieza', () => {
  const ahora = Date.parse('2026-10-09T15:00:00Z');
  const marca = (extra = {}) => ({ archivoId: 'a1', trabajoId: 't1', fecha: '2026-10-09T14:00:00.000Z', impresora: 'Bambulab A1', tipo: 'imprimir', ...extra });

  it('el tipo de envío sale de la impresora y la acción', () => {
    expect(tipoDeEnvio({ guarda: true })).toBe('carpeta');
    expect(tipoDeEnvio({ abre: true })).toBe('programa');
    expect(tipoDeEnvio({}, 'imprimir')).toBe('imprimir');
    expect(tipoDeEnvio({}, 'subir')).toBe('subir');
  });
  it('la marca guarda qué se mandó', () => {
    const m = marcaDeEnvio({ archivo: { id: 'a1' }, trabajoId: 't9', impresora: { nombre: 'X' }, accion: 'imprimir' });
    expect(m).toMatchObject({ archivoId: 'a1', trabajoId: 't9', impresora: 'X', tipo: 'imprimir' });
    expect(Date.parse(m.fecha)).not.toBeNaN();
  });
  it('un envío que falló, venció o se canceló NO cuenta como enviado', () => {
    expect(estadoDeMarca(marca(), [{ id: 't1', estado: 'error', mensaje: 'sin papel' }], ahora)).toMatchObject({ enviado: false });
    expect(estadoDeMarca(marca(), [{ id: 't1', estado: 'cancelado' }], ahora)).toMatchObject({ enviado: false });
    expect(estadoDeMarca(marca(), [{ id: 't1', estado: 'pendiente', accion: 'imprimir', creadoMs: ahora - 11 * 60 * 1000 }], ahora)).toMatchObject({ enviado: false });
  });
  it('en cola, imprimiendo o ya enviado sí cuenta; si se quitó de la lista queda como enviado', () => {
    expect(estadoDeMarca(marca(), [{ id: 't1', estado: 'pendiente', accion: 'imprimir', creadoMs: ahora - 60000 }], ahora)).toMatchObject({ enviado: true });
    expect(estadoDeMarca(marca(), [{ id: 't1', estado: 'imprimiendo' }], ahora)).toMatchObject({ enviado: true, texto: 'Imprimiendo' });
    expect(estadoDeMarca(marca(), [], ahora)).toMatchObject({ enviado: true, texto: 'Enviado a imprimir' });
    expect(estadoDeMarca(marca({ tipo: 'carpeta' }), [], ahora).texto).toBe('Guardado en carpeta');
  });
  it('resumen por archivo: cuántas veces, última y orden', () => {
    const pieza = { gcodeEnvios: [marca({ fecha: '2026-10-08T10:00:00Z', trabajoId: 't0' }), marca(), marca({ archivoId: 'otro' })] };
    expect(marcasDe(pieza, 'a1').map((m) => m.trabajoId)).toEqual(['t1', 't0']);
    const r = resumenDeArchivo(pieza, 'a1', [], ahora);
    expect(r.veces).toBe(2);
    expect(r.ultima.trabajoId).toBe('t1');
    expect(resumenDeArchivo(pieza, 'nunca', [], ahora)).toEqual({ veces: 0, ultima: null, estado: null });
  });
});

describe('notas internas del producto', () => {
  it('no salen en la copia pública del catálogo (el costo sólo como precio de último recurso)', () => {
    const fuente = fs.readFileSync(new URL('../src/context/AppContext.jsx', import.meta.url), 'utf8');
    const ini = fuente.indexOf('const proyeccionCatalogoProducto');
    expect(ini).toBeGreaterThan(-1);
    const cuerpo = fuente.slice(ini, fuente.indexOf('});', ini));
    for (const privado of ['notasInternas', 'notas', 'filDetalle']) expect(cuerpo).not.toContain(privado);
    // El costo sólo puede aparecer como último recurso del precio de venta (producto sin precio sugerido).
    const conCosto = cuerpo.split('\n').filter((l) => l.includes('costoUnitario'));
    expect(conCosto.every((l) => l.trim().startsWith('precio:'))).toBe(true);
  });
});
