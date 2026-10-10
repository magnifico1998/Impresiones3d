// Prueba el destino "Abrir en Creality Print" sin tener el programa: se usa node como "programa"
// y un archivo .js inofensivo en lugar del G-code.
//   node conector/pruebas/creality-print.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DRIVERS, driverDe } from '../src/drivers/index.js';
import { crealityPrint as d, exeEnCarpeta } from '../src/drivers/crealityPrint.js';

let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

ok(DRIVERS['abrir-en-creality'] === d && driverDe('abrir-en-creality') === d, 'está registrado en los drivers');
ok(d.abre === true && d.puedeImprimir === false && d.formatos.includes('3mf') && d.formatos.includes('gcode'), 'abre en el programa, no imprime directo, y sirve para .3mf y .gcode');
ok(!/Creality/.test(DRIVERS.moonraker.nombre.replace(/para Creality usá.*$/, '')), 'Moonraker ya no se ofrece como opción de Creality');

// Programa indicado que no existe
await d.probar({ programa: path.join(os.tmpdir(), 'no-existe-creality.exe') }).then(
  () => ok(false, 'un programa inexistente tendría que fallar'),
  (e) => ok(/No existe el programa/.test(e.message), 'avisa si el .exe indicado no existe')
);
// Programa indicado que sí existe
const msg = await d.probar({ programa: process.execPath });
ok(/Listo: se va a abrir/.test(msg), 'con un .exe válido, la prueba dice que está listo');

// Búsqueda del .exe en una carpeta de instalación simulada
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'creality-'));
fs.mkdirSync(path.join(base, 'Creality Print 6.0', 'bin'), { recursive: true });
fs.writeFileSync(path.join(base, 'Creality Print 6.0', 'bin', 'uninstall.exe'), '');
fs.writeFileSync(path.join(base, 'Creality Print 6.0', 'bin', 'CrealityPrint.exe'), '');
ok(path.basename(exeEnCarpeta(base) || '') === 'CrealityPrint.exe', 'encuentra CrealityPrint.exe e ignora el desinstalador');
ok(exeEnCarpeta(path.join(base, 'no-existe')) === null, 'una carpeta que no existe no rompe la búsqueda');

// Enviar: abre el archivo con el "programa" (node corre un .js que no hace nada)
const r = await d.enviar({ programa: process.execPath }, { nombre: 'proyecto-prueba.js', contenido: Buffer.from('process.exit(0)\n') });
ok(r.estado === 'enviado' && /Creality Print/.test(r.mensaje), 'enviar abre el archivo y devuelve el estado "enviado"');
const rProyecto = await d.enviar({ programa: process.execPath }, { nombre: 'ejemplo.3mf.js', contenido: Buffer.from('process.exit(0)\n') });
ok(typeof rProyecto.mensaje === 'string' && rProyecto.mensaje.length > 10, 'el mensaje orienta sobre qué hacer en el programa');

fs.rmSync(base, { recursive: true, force: true });
console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
