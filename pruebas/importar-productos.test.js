import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  validarProductosCSV, armarProducto, leerZipProductos, lugarEnPlan,
  MAX_PRODUCTOS_POR_CARGA, MAX_IMAGENES_POR_PRODUCTO
} from '../src/utils/importarProductos';

const ENC = 'codigo;nombre;categoria;subcategoria;subsubcategoria;desc_corta;desc_larga;notas_internas;costo;margen;precio;color;stock;foto_principal;fotos_extra;foto_color';
const csv = (...filas) => [ENC, ...filas].join('\r\n');
const fotos = (...nombres) => new Map(nombres.map((n) => [n.toLowerCase(), { nombre: n, ruta: n, ambigua: false }]));
const COLORES = ['Negro', 'Rojo', 'Azul'];
const validar = (texto, extra = {}) => validarProductosCSV(texto, { imagenes: fotos('a.jpg', 'b.jpg', 'c.png'), colores: COLORES, existentes: [], ...extra });

describe('importar productos desde CSV', () => {
  it('agrupa las filas por código y arma un producto con un color por fila', () => {
    const r = validar(csv(
      'T1;Termo;Regalos;Termos;;corta;larga;nota;8000;50;;Negro;3;a.jpg;b.jpg;a.jpg',
      'T1;;;;;;;;;;;Rojo;0;;;c.png'
    ));
    expect(r.productos).toHaveLength(1);
    const p = r.productos[0];
    expect(p.errores).toEqual([]);
    expect(p).toMatchObject({ nombre: 'Termo', cat: 'Regalos', costo: 8000, precio: 12000, margen: 50, stockTotal: 3 });
    expect(p.colores).toEqual([{ color: 'Negro', stock: 3, foto: 'a.jpg' }, { color: 'Rojo', stock: 0, foto: 'c.png' }]);
    expect(p.imagenes).toEqual(['a.jpg', 'b.jpg', 'c.png']);
    expect(p.fotosColor).toEqual([{ color: 'Negro', imagen: 'a.jpg' }, { color: 'Rojo', imagen: 'c.png' }]);
  });

  it('el precio manda sobre el margen; sin ninguno de los dos se rechaza', () => {
    const r = validar(csv(
      ';Con precio;;;;;;;1000;50;1800;;1;;;',
      ';Sin precio;;;;;;;1000;;;;1;;;'
    ));
    expect(r.productos[0]).toMatchObject({ precio: 1800, margen: 80, errores: [] });
    expect(r.productos[1].errores.join()).toMatch(/Falta el precio/);
  });

  it('rechaza el producto si un color no existe en Configuración', () => {
    const r = validar(csv('T1;Termo;;;;;;;100;;200;Verde fluor;1;;;'));
    expect(r.productos[0].errores.join()).toMatch(/color "Verde fluor".*no existe/);
  });

  it('el color se reconoce sin importar mayúsculas ni acentos y queda con el nombre de Configuración', () => {
    const r = validar(csv('T1;Termo;;;;;;;100;;200;  ROJO ;1;;;'));
    expect(r.productos[0].errores).toEqual([]);
    expect(r.productos[0].colores[0].color).toBe('Rojo');
  });

  it('el stock puede ser 0 o estar vacío, pero no negativo, decimal ni texto', () => {
    const ok = validar(csv(';A;;;;;;;1;;2;Negro;0;;;', ';B;;;;;;;1;;2;Negro;;;;')).productos;
    expect(ok.map((p) => p.errores)).toEqual([[], []]);
    for (const mal of ['-1', '1,5', 'tres']) {
      expect(validar(csv(`;A;;;;;;;1;;2;Negro;${mal};;;`)).productos[0].errores.join()).toMatch(/stock/);
    }
  });

  it('rechaza el producto si una foto no está en el ZIP o no es una imagen', () => {
    const r = validar(csv(';A;;;;;;;1;;2;Negro;1;falta.jpg;;', ';B;;;;;;;1;;2;Negro;1;doc.pdf;;'));
    expect(r.productos[0].errores.join()).toMatch(/"falta.jpg".*no está en el ZIP/);
    expect(r.productos[1].errores.join()).toMatch(/no es una imagen/);
  });

  it('la foto se busca por nombre aunque el CSV traiga una ruta, y una foto repetida en carpetas distintas se rechaza', () => {
    const imagenes = fotos('a.jpg');
    imagenes.set('dup.jpg', { nombre: 'dup.jpg', ruta: 'x/dup.jpg', ambigua: true });
    const r = validar(csv(';A;;;;;;;1;;2;;1;C:\\fotos\\A.JPG;;', ';B;;;;;;;1;;2;;1;dup.jpg;;'), { imagenes });
    expect(r.productos[0].errores).toEqual([]);
    expect(r.productos[0].imagenes).toEqual(['a.jpg']);
    expect(r.productos[1].errores.join()).toMatch(/más de una vez/);
  });

  it(`rechaza el producto con más de ${MAX_IMAGENES_POR_PRODUCTO} fotos`, () => {
    const nombres = Array.from({ length: MAX_IMAGENES_POR_PRODUCTO + 1 }, (_, i) => `f${i}.jpg`);
    const r = validar(csv(`;A;;;;;;;1;;2;;1;${nombres[0]};${nombres.slice(1).join('|')};`), { imagenes: fotos(...nombres) });
    expect(r.productos[0].errores.join()).toMatch(/máximo por producto es 15/);
    const justo = nombres.slice(0, MAX_IMAGENES_POR_PRODUCTO);
    expect(validar(csv(`;A;;;;;;;1;;2;;1;${justo[0]};${justo.slice(1).join('|')};`), { imagenes: fotos(...justo) }).productos[0].errores).toEqual([]);
  });

  it('rechaza un producto que ya existe en la Biblioteca o que se repite en el archivo', () => {
    const r = validar(csv('A1;Termo;;;;;;;1;;2;;1;;;', 'A2;Mate;;;;;;;1;;2;;1;;;', 'A3;mate;;;;;;;1;;2;;1;;;'), { existentes: ['TERMO'] });
    expect(r.productos[0].errores.join()).toMatch(/Ya hay un producto con ese nombre/);
    expect(r.productos[1].errores).toEqual([]);
    expect(r.productos[2].errores.join()).toMatch(/repetido en otro producto/);
  });

  it('rechaza el producto si sus filas traen datos distintos o repiten un color', () => {
    const r = validar(csv('T1;Termo;;;;;;;100;;200;Negro;1;;;', 'T1;Termo;;;;;;;999;;200;Rojo;1;;;', 'T2;Otro;;;;;;;1;;2;Negro;1;;;', 'T2;;;;;;;;;;;negro;2;;;'));
    expect(r.productos[0].errores.join()).toMatch(/costo distinto en la fila 3/i);
    expect(r.productos[1].errores.join()).toMatch(/repetido/);
  });

  it('una fila sin código ni nombre queda suelta', () => {
    const r = validar(csv(';;;;;;;;1;;2;Negro;1;;;', ';A;;;;;;;1;;2;;1;;;'));
    expect(r.sueltas).toEqual([{ numero: 2, error: expect.stringMatching(/Falta el código y el nombre/) }]);
    expect(r.productos).toHaveLength(1);
  });

  it(`todo el archivo se rechaza con más de ${MAX_PRODUCTOS_POR_CARGA} productos`, () => {
    const filas = Array.from({ length: MAX_PRODUCTOS_POR_CARGA + 1 }, (_, i) => `;P${i};;;;;;;1;;2;;1;;;`);
    expect(validar(csv(...filas)).error).toMatch(/máximo por carga es 50/);
    expect(validar(csv(...filas.slice(0, MAX_PRODUCTOS_POR_CARGA))).productos).toHaveLength(MAX_PRODUCTOS_POR_CARGA);
  });

  it('pide las columnas obligatorias y entiende el separador y los números de Excel en español', () => {
    expect(validarProductosCSV('nombre;color\r\nA;Negro', {}).error).toMatch(/Faltan columnas.*costo/);
    const r = validar(csv(';A;;;;;;;1.250,50;;2.000,00;;1;;;'));
    expect(r.productos[0]).toMatchObject({ costo: 1250.5, precio: 2000, errores: [] });
  });
});

describe('plan: lugar para productos', () => {
  it('sin límite no restringe; con límite, cuenta lo que ya hay', () => {
    expect(lugarEnPlan(null, 10)).toBeNull();
    expect(lugarEnPlan(undefined, 10)).toBeNull();
    expect(lugarEnPlan(30, 25)).toBe(5);
    expect(lugarEnPlan(30, 40)).toBe(0);
  });
});

describe('armar el producto para guardar', () => {
  const p = validar(csv(
    'T1;Termo;Regalos;;;corta;larga;nota;8000;50;;Negro;3;a.jpg;;a.jpg',
    'T1;;;;;;;;;;;Rojo;0;;;'
  )).productos[0];
  const guardado = armarProducto(p, { id: 77, fecha: '1/1/2026', urls: { 'a.jpg': 'https://x/a' } });

  it('es un producto sin impresión con costo, precio y fotos', () => {
    expect(guardado).toMatchObject({
      id: 77, nombre: 'Termo', cat: 'Regalos', tipo: 'reventa', costoUnitario: 8000, precioSugUnitario: 12000,
      imagenes: ['https://x/a'], imagen: 'https://x/a', fotosColor: [{ color: 'Negro', colorSecundario: '', imagen: 'https://x/a' }]
    });
  });

  it('el stock queda por color (sin líneas en 0) y el producto ofrece sólo sus colores', () => {
    expect(guardado.stock).toEqual([{ color: 'Negro', colorSecundario: '', cantidad: 3 }]);
    expect(guardado.limitarColores).toBe(true);
    expect(guardado.coloresElegidos.map((c) => c.color)).toEqual(['Negro', 'Rojo']);
  });

  it('un producto sin colores no limita colores y usa la categoría General', () => {
    const sin = armarProducto(validar(csv(';Mate;;;;;;;1;;2;;5;;;')).productos[0], { id: 1, fecha: 'hoy', urls: {} });
    expect(sin).toMatchObject({ cat: 'General', limitarColores: false, coloresElegidos: [], imagen: null, stock: [{ color: '', colorSecundario: '', cantidad: 5 }] });
  });
});

describe('leer el ZIP', () => {
  const armar = async (archivos) => {
    const zip = new JSZip();
    for (const [nombre, contenido] of Object.entries(archivos)) zip.file(nombre, contenido);
    return zip.generateAsync({ type: 'arraybuffer' });
  };

  it('encuentra el CSV y las fotos en cualquier carpeta, e ignora lo oculto', async () => {
    const r = await leerZipProductos(await armar({
      'carga/productos.csv': csv(';A;;;;;;;1;;2;;1;;;'),
      'carga/fotos/Termo.JPG': 'x',
      'carga/__MACOSX/fotos/._Termo.JPG': 'x',
      'carga/.oculto.png': 'x',
      'carga/notas.txt': 'x'
    }));
    expect(r.error).toBeUndefined();
    expect(r.csv).toContain('A;');
    expect([...r.imagenes.keys()]).toEqual(['termo.jpg']);
    expect(r.imagenes.get('termo.jpg')).toMatchObject({ nombre: 'Termo.JPG', ambigua: false });
  });

  it('marca como ambigua una foto con el mismo nombre en dos carpetas', async () => {
    const r = await leerZipProductos(await armar({ 'productos.csv': 'x', 'a/f.jpg': '1', 'b/f.jpg': '2' }));
    expect(r.imagenes.get('f.jpg').ambigua).toBe(true);
  });

  it('avisa si no hay CSV, si hay más de uno o si no es un ZIP', async () => {
    expect((await leerZipProductos(await armar({ 'a.jpg': 'x' }))).error).toMatch(/ningún archivo .csv/);
    expect((await leerZipProductos(await armar({ 'uno.csv': 'x', 'dos.csv': 'y' }))).error).toMatch(/más de un .csv/);
    expect((await leerZipProductos(new TextEncoder().encode('no soy un zip').buffer)).error).toMatch(/\.zip válido/);
  });

  it('relee en Windows-1252 un CSV de Excel que no es UTF-8', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('nombre;costo\r\nTermo ')].concat([0xF1, 0x6F]));
    const r = await leerZipProductos(await armar({ 'productos.csv': bytes }));
    expect(r.csv).toContain('Termo ño');
  });
});
