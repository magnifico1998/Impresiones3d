// Prueba la asignación de colores a los lugares del ACE (sin impresora).
//   node conector/pruebas/anycubic-ace.mjs
import { armarMapeoAce, lugaresDelAce, filamentosDelGcode, buscarArchivo } from '../src/drivers/anycubicLan.js';

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

// Colores y tipos que escribe el laminador al final del G-code. Un proyecto con
// 8 filamentos configurados que usa uno solo (el caso del tester: "color 5").
const ocho = '#FFFFFF;#FF0000;#00FF00;#0000FF;#FFFF00;#FF00FF;#00FFFF;#808080';
const gcode8 = Buffer.from('G1 X1\n; filament used [mm] = 0.00, 1520.30, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00\n; filament used [g] = 0.00, 4.55, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00\n; filament_colour = ' + ocho + '\n; filament_type = PLA;PLA;PLA;PLA;PLA;PLA;PLA;PLA\nM84\n');
let f = filamentosDelGcode(gcode8);
ok(f.length === 1 && f[0].indice === 1 && f[0].color === '#FF0000', 'de 8 filamentos configurados, usa solo el que se usó (el 2.º, rojo)');
m = armarMapeoAce(f, lugaresA);
ok(m.length === 1 && m[0].paint_index === 1 && m[0].ams_index === 0, 'el color 2 del proyecto va al lugar del ACE con PLA rojo y conserva su número (paint_index 1)');

// Dos filamentos usados de los 8.
const gcode2 = Buffer.from('; filament used [g] = 3.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 2.00\n; filament_colour = ' + ocho + '\n; filament_type = PLA;PLA;PLA;PLA;PLA;PLA;PLA;PETG\n');
f = filamentosDelGcode(gcode2);
ok(f.length === 2 && f[0].indice === 0 && f[1].indice === 7 && f[1].tipo === 'PETG', 'dos usados (el 1.º y el 8.º): lee sus números, colores y materiales');

// Sin datos de uso: asume el primero.
const gcodeSinUso = Buffer.from('G1 X1\n; filament_colour = #FFFFFF;#FF0000\n; filament_type = PLA;PLA\n');
f = filamentosDelGcode(gcodeSinUso);
ok(f.length === 1 && f[0].indice === 0, 'sin "filament used" asume solo el primer filamento');
ok(filamentosDelGcode(Buffer.from('G1 X1\n')).length === 1, 'sin ninguna de esas líneas asume un solo filamento PLA');

// Verificar que el archivo llegó: formato real que contestó una Kobra 3 (visto con el Diagnóstico).
const records = [
  { is_dir: false, filename: '1004-0229-22LR x120_plate(27)_PLA_0.2_8h17m53s.gcode', timestamp: 1791092822686, size: 104998260, plate_number: 0 },
  { is_dir: false, filename: 'TORNILLO.gcode', timestamp: 1791092999999, size: 752640, plate_number: 0 },
  { is_dir: false, filename: '1001-1221-CAÑO_plate(15)_PETG_0.2_4h28m46s.gcode.3mf', size: 11003095 }
];
ok(buscarArchivo(records, 'TORNILLO.gcode', 752640) === 'si', 'el archivo subido figura en records con su tamaño completo');
ok(buscarArchivo(records, 'tornillo.GCODE', 752640) === 'si', 'la búsqueda no distingue mayúsculas');
ok(buscarArchivo(records, 'TORNILLO.gcode', 900000) === 'incompleto', 'figura pero con otro tamaño: todavía lo está recibiendo');
ok(buscarArchivo(records, 'LLAVERO.gcode', 100) === 'no', 'un archivo que no llegó no figura');
ok(buscarArchivo(records, 'CAÑO', 100) === 'no', 'no alcanza con que el nombre esté contenido en otro: tiene que ser el mismo');
ok(buscarArchivo(undefined, 'TORNILLO.gcode', 1) === 'no' && buscarArchivo([], 'TORNILLO.gcode', 1) === 'no', 'lista vacía o ausente: no figura');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
