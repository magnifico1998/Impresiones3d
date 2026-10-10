// Prueba el destino "Abrir en el slicer" sin tener ningún programa: se usa node como "programa" y un archivo
// .js inofensivo en lugar del G-code.
//   node conector/pruebas/slicer.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DRIVERS, driverDe } from '../src/drivers/index.js';
import { MARCAS, exeEnCarpeta, marcaDe, slicer as d } from '../src/drivers/slicer.js';

let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

// Registro y lo que se ofrece
ok(DRIVERS['abrir-en-slicer'] === d && driverDe('abrir-en-slicer') === d, 'está registrado');
ok(d.abre === true && d.puedeImprimir === false && d.formatos.includes('3mf') && d.formatos.includes('gcode') && !d.oculto, 'abre en el programa, no imprime directo, sirve para .3mf y .gcode y se ofrece');
ok(d.campos.includes('marca') && d.campos.includes('programa') && d.opcionales.includes('programa'), 'pide la marca y, opcional, la ruta del programa');
const visibles = Object.values(DRIVERS).filter((x) => !x.oculto).map((x) => x.tipo);
ok(visibles.length === 1 && visibles[0] === 'abrir-en-slicer', `es el único destino que se ofrece al cargar una impresora (hay: ${visibles.join(', ')})`);
for (const tipo of ['anycubic-lan', 'bambu-lan', 'bambu-connect', 'moonraker', 'explorar-impresora', 'abrir-en-programa', 'abrir-en-anycubic']) {
  ok(DRIVERS[tipo]?.oculto === true && typeof DRIVERS[tipo].enviar === 'function', `${tipo}: oculto pero sigue funcionando para las impresoras ya cargadas`);
}

// Marcas
ok(['bambu', 'anycubic', 'creality', 'otra'].every((id) => MARCAS.some((m) => m.id === id)), 'están Bambu, Anycubic, Creality y "Otra marca"');
ok(MARCAS[MARCAS.length - 1].id === 'otra', '"Otra marca" va última');
ok(marcaDe('no-existe').id === 'otra' && marcaDe(undefined).id === 'otra', 'una marca desconocida cae en "Otra marca"');

// Cada marca encuentra su programa por el nombre del .exe e ignora el desinstalador
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'slicers-'));
const casos = { bambu: 'bambu-studio.exe', anycubic: 'AnycubicSlicerNext.exe', creality: 'CrealityPrint.exe', elegoo: 'ElegooSlicer.exe', prusa: 'prusa-slicer.exe', qidi: 'qidi-studio.exe', flashforge: 'orca-flashforge.exe', snapmaker: 'snapmaker-orca.exe' };
for (const [id, exe] of Object.entries(casos)) {
  const carpeta = path.join(base, id, 'Programa 1.0', 'bin');
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, 'uninstall.exe'), '');
  fs.writeFileSync(path.join(carpeta, exe), '');
  const hallado = exeEnCarpeta(path.join(base, id), marcaDe(id).exe);
  ok(path.basename(hallado || '') === exe, `${id}: encuentra ${exe} e ignora el desinstalador`);
  ok(exeEnCarpeta(path.join(base, id), marcaDe(id === 'bambu' ? 'anycubic' : 'bambu').exe) === null, `${id}: no confunde su programa con el de otra marca`);
}
ok(exeEnCarpeta(path.join(base, 'no-existe'), marcaDe('bambu').exe) === null, 'una carpeta que no existe no rompe la búsqueda');

// Ruta indicada a mano
await d.probar({ marca: 'creality', programa: path.join(os.tmpdir(), 'no-existe.exe') }).then(
  () => ok(false, 'un programa inexistente tendría que fallar'),
  (e) => ok(/No existe el programa/.test(e.message), 'avisa si el .exe indicado no existe')
);
ok(/Listo: se va a abrir/.test(await d.probar({ marca: 'otra', programa: process.execPath })), 'con la ruta de un programa válido, la prueba dice que está listo (también en "Otra marca")');

// Marca conocida sin el programa instalado: tiene que pedirlo (salvo que ya sea el predeterminado de los .3mf)
const sinRuta = await d.probar({ marca: 'elegoo' }).then((m) => ({ m }), (e) => ({ e }));
ok(sinRuta.e ? /No encontré ElegooSlicer/.test(sinRuta.e.message) : /Listo/.test(sinRuta.m), 'sin el programa, pide instalarlo o indicar la ruta (o usa el predeterminado si ya lo es)');
// Otra marca sin ruta: usa el programa predeterminado de los .3mf, nunca falla
ok(/^Listo/.test(await d.probar({ marca: 'otra' })), '"Otra marca" sin ruta no falla: usa el programa predeterminado');

// Enviar
const r = await d.enviar({ marca: 'creality', programa: process.execPath }, { nombre: 'proyecto.3mf.js', contenido: Buffer.from('process.exit(0)\n') });
ok(r.estado === 'enviado' && /Creality Print/.test(r.mensaje), 'enviar abre el archivo y el mensaje nombra el programa de la marca');
const r2 = await d.enviar({ marca: 'otra', programa: process.execPath }, { nombre: 'suelto.js', contenido: Buffer.from('process.exit(0)\n') });
ok(r2.estado === 'enviado' && /programa de laminado/.test(r2.mensaje) && /G-code suelto/.test(r2.mensaje), 'en "Otra marca" el mensaje no inventa un programa y avisa lo del G-code suelto');

fs.rmSync(base, { recursive: true, force: true });
console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
