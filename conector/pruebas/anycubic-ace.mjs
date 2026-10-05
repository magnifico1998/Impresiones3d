// Prueba la asignación de colores a los lugares del ACE (sin impresora).
//   node conector/pruebas/anycubic-ace.mjs
import { armarMapeoAce, lugaresDelAce, filamentosDelGcode, archivoEnLista } from '../src/drivers/anycubicLan.js';

let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

// Lo que informa la impresora (multiColorBox), con las dos formas que se ven.
const informeA = { multi_color_box: [{ id: 0, slots: [
  { index: 0, status: 5, type: 'PLA', color: [200, 30, 30] },
  { index: 1, status: 0, type: '', color: [0, 0, 0] },
  { index: 2, status: 5, type: 'PLA', color: [250, 250, 250] },
  { index: 3, status: 5, type: 'PETG', color: [20, 20, 200] }
] }] };
const informeB = { multiColorBox: [{ box_info: { slot_info: [
  { index: 0, status: 4, type: 'PLA High Speed', color: [255, 255, 255] }
] } }] };

const lugaresA = lugaresDelAce(informeA);
ok(lugaresA.length === 3 && lugaresA.map((l) => l.indice).join() === '0,2,3', 'solo cuenta los lugares con filamento cargado (0, 2 y 3)');
ok(lugaresDelAce(informeB).length === 1 && lugaresDelAce(informeB)[0].tipo === 'PLA', 'entiende el formato box_info.slot_info y el tipo "PLA High Speed" como PLA');
ok(lugaresDelAce({}).length === 0 && lugaresDelAce(null).length === 0, 'sin informe del ACE no hay lugares');

// Caso del tester: archivo de un solo color blanco en PLA (TORNILLO). Antes se
// mandaba siempre el lugar 0 (rojo) y la impresora rechazaba.
let m = armarMapeoAce([{ color: '#FFFFFF', tipo: 'PLA' }], lugaresA);
ok(m.length === 1 && m[0].ams_index === 2 && m[0].material_type === 'PLA', 'un PLA blanco va al lugar 3 (índice 2, PLA blanco), no al primero');

// Dos colores PLA: rojo y blanco, sin repetir lugar.
m = armarMapeoAce([{ color: '#FFFFFF', tipo: 'PLA' }, { color: '#FF0000', tipo: 'PLA' }], lugaresA);
ok(m[0].ams_index === 2 && m[1].ams_index === 0, 'blanco → lugar 3, rojo → lugar 1 (cada uno al más parecido)');

// Un PETG azul.
m = armarMapeoAce([{ color: '#0000FF', tipo: 'PETG' }], lugaresA);
ok(m[0].ams_index === 3 && m[0].material_type === 'PETG', 'un PETG va al lugar con PETG');

// Falta material: tiene que avisar antes de mandar nada.
try { armarMapeoAce([{ color: '#00FF00', tipo: 'TPU' }], lugaresA); ok(false, 'TPU sin lugar tendría que fallar'); }
catch (e) { ok(/TPU/.test(e.message) && /Cargado:/.test(e.message), `avisa qué falta y qué hay cargado: "${e.message.slice(0, 80)}…"`); }

// Más colores PLA que lugares PLA libres.
try { armarMapeoAce([{ color: '#FFFFFF', tipo: 'PLA' }, { color: '#FF0000', tipo: 'PLA' }, { color: '#00FF00', tipo: 'PLA' }], lugaresA); ok(false, '3 PLA con 2 lugares PLA tendría que fallar'); }
catch (e) { ok(/PLA/.test(e.message), '3 colores PLA y solo 2 lugares con PLA: avisa'); }

// ACE vacío.
try { armarMapeoAce([{ color: '#FFFFFF', tipo: 'PLA' }], []); ok(false, 'ACE vacío tendría que fallar'); }
catch (e) { ok(/ningún filamento/.test(e.message), 'ACE vacío: avisa y sugiere destildar "Tiene ACE"'); }

// Colores y tipos que escribe el laminador al final del G-code.
const gcode = Buffer.from('G1 X1\n; filament_colour = #FFFFFF;#FF0000\n; filament_type = PLA;PLA\nM84\n');
const f = filamentosDelGcode(gcode);
ok(f.length === 2 && f[1].color === '#FF0000' && f[0].tipo === 'PLA', 'lee los colores y tipos del final del G-code');
ok(filamentosDelGcode(Buffer.from('G1 X1\n')).length === 1, 'sin esas líneas asume un solo filamento PLA');

// Verificar que el archivo llegó a la impresora.
const lista = [{ filename: 'TORNILLO.gcode', size: 752640 }, { name: 'otro.gcode' }];
ok(archivoEnLista(lista, 'TORNILLO.gcode'), 'el archivo subido figura en la lista de la impresora');
ok(archivoEnLista(lista, 'tornillo.GCODE'), 'la búsqueda no distingue mayúsculas');
ok(!archivoEnLista(lista, 'LLAVERO.gcode'), 'un archivo que no llegó no figura');
ok(!archivoEnLista(undefined, 'TORNILLO.gcode') && !archivoEnLista([], 'TORNILLO.gcode'), 'lista vacía o ausente: no figura');
ok(archivoEnLista(['/gcodes/TORNILLO.gcode'], 'TORNILLO.gcode'), 'también si la lista trae solo textos con la ruta');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
