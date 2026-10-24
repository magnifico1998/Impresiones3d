import { describe, it, expect } from 'vitest';
import {
  TITULO_MANTENIMIENTO_POR_DEFECTO, TEXTO_MANTENIMIENTO_POR_DEFECTO,
  MAX_CARACTERES_TITULO_MANTENIMIENTO, MAX_CARACTERES_TEXTO_MANTENIMIENTO, MAX_LINEAS_TEXTO_MANTENIMIENTO,
  tituloMantenimientoDe, textoMantenimientoDe, tituloMantenimientoPropio, textoMantenimientoPropio, recortarBorradorTextoMantenimiento
} from '../src/utils/catalogoMarca';

describe('mensaje del catálogo desactivado', () => {
  it('sin nada guardado se muestra el de siempre', () => {
    for (const config of [undefined, null, {}, { mantenimientoTitulo: '', mantenimientoTexto: '' }, { mantenimientoTitulo: '   ', mantenimientoTexto: '\n \n' }]) {
      expect(tituloMantenimientoDe(config)).toBe(TITULO_MANTENIMIENTO_POR_DEFECTO);
      expect(textoMantenimientoDe(config)).toBe(TEXTO_MANTENIMIENTO_POR_DEFECTO);
    }
  });

  it('con título y texto propios se muestran esos, ya limpios', () => {
    const config = { mantenimientoTitulo: '  Volvemos   el lunes ', mantenimientoTexto: ' Estamos  de vacaciones \n\n Escribinos por WhatsApp ' };
    expect(tituloMantenimientoDe(config)).toBe('Volvemos el lunes');
    expect(textoMantenimientoDe(config)).toBe('Estamos de vacaciones\nEscribinos por WhatsApp');
  });

  it('se puede personalizar sólo una de las dos partes', () => {
    expect(tituloMantenimientoDe({ mantenimientoTitulo: 'Cerrado por inventario' })).toBe('Cerrado por inventario');
    expect(textoMantenimientoDe({ mantenimientoTitulo: 'Cerrado por inventario' })).toBe(TEXTO_MANTENIMIENTO_POR_DEFECTO);
    expect(tituloMantenimientoDe({ mantenimientoTexto: 'Volvemos pronto' })).toBe(TITULO_MANTENIMIENTO_POR_DEFECTO);
  });

  it('respeta los máximos: título, líneas y caracteres del texto', () => {
    expect(tituloMantenimientoPropio({ mantenimientoTitulo: 'x'.repeat(200) })).toHaveLength(MAX_CARACTERES_TITULO_MANTENIMIENTO);
    const siete = Array.from({ length: 7 }, (_, i) => `linea ${i + 1}`).join('\n');
    expect(textoMantenimientoPropio({ mantenimientoTexto: siete }).split('\n')).toHaveLength(MAX_LINEAS_TEXTO_MANTENIMIENTO);
    expect(textoMantenimientoPropio({ mantenimientoTexto: 'y'.repeat(1000) })).toHaveLength(MAX_CARACTERES_TEXTO_MANTENIMIENTO);
    expect(recortarBorradorTextoMantenimiento(siete).split('\n')).toHaveLength(MAX_LINEAS_TEXTO_MANTENIMIENTO);
    expect(recortarBorradorTextoMantenimiento('z'.repeat(1000))).toHaveLength(MAX_CARACTERES_TEXTO_MANTENIMIENTO);
  });

  it('no rompe con datos raros', () => {
    expect(tituloMantenimientoDe({ mantenimientoTitulo: 123 })).toBe('123');
    expect(textoMantenimientoDe({ mantenimientoTexto: null })).toBe(TEXTO_MANTENIMIENTO_POR_DEFECTO);
  });
});
