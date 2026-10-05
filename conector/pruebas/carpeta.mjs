// Prueba el destino "Guardar en una carpeta" (sin abrir el Explorador).
//   node conector/pruebas/carpeta.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.MANAGER3D_NO_ABRIR = '1';
const { guardarEnCarpeta: d } = await import('../src/drivers/carpeta.js');

let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };
const sd = path.join(os.tmpdir(), `sd-prueba-${process.pid}`);

await d.enviar({ carpeta: sd }, { nombre: 'TORNILLO.gcode', contenido: Buffer.from('G28\n') });
ok(fs.existsSync(path.join(sd, 'TORNILLO.gcode')), 'guarda el archivo y crea la carpeta si no existe');
await d.enviar({ carpeta: sd }, { nombre: 'TORNILLO.gcode', contenido: Buffer.from('G28\nG1 X1\n') });
ok(fs.statSync(path.join(sd, 'TORNILLO.gcode')).size === 10, 'reenviar el mismo archivo lo reemplaza');
await d.enviar({ carpeta: sd }, { nombre: 'Llavero: x24 <v2>.gcode.3mf', contenido: Buffer.from('x') });
ok(fs.readdirSync(sd).includes('Llavero_ x24 _v2_.gcode.3mf'), 'limpia los caracteres que Windows no admite en el nombre');
try { await d.enviar({ carpeta: 'Q:/Impresiones' }, { nombre: 'a.gcode', contenido: Buffer.from('x') }); ok(false, 'una unidad inexistente tendría que fallar'); }
catch (e) { ok(/unidad/.test(e.message) && /tarjeta SD/.test(e.message), 'unidad inexistente: avisa si está puesta la tarjeta SD'); }
ok(/Listo/.test(await d.probar({ carpeta: sd })), 'probar informa dónde se guarda');

fs.rmSync(sd, { recursive: true, force: true });
console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
