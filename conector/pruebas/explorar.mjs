// Prueba "Otra marca: solo explorar" contra un Moonraker y un OctoPrint simulados.
//   node conector/pruebas/explorar.mjs
import http from 'node:http';
import { explorar } from '../src/drivers/explorar.js';

let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

const moonraker = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/server/info') return res.end(JSON.stringify({ result: { klippy_state: 'ready', moonraker_version: 'v0.9.3', klippy_connected: true } }));
  if (req.url === '/printer/info') return res.end(JSON.stringify({ result: { state: 'ready', hostname: 'creality-sparkx' } }));
  res.statusCode = 404; res.end('{}');
});
const octoprint = http.createServer((req, res) => {
  if (req.url === '/api/version') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ api: '0.1', server: '1.10.0', text: 'OctoPrint 1.10.0' })); }
  res.setHeader('Content-Type', 'text/html'); res.end('<html><title>OctoPrint Login</title></html>');
});
await new Promise((r, j) => moonraker.listen(7125, '127.0.0.1', r).on('error', j)).catch((e) => { console.log('Puerto 7125 ocupado:', e.code); process.exit(0); });
await new Promise((r, j) => octoprint.listen(8080, '127.0.0.1', r).on('error', j)).catch((e) => { console.log('Puerto 8080 ocupado:', e.code); moonraker.close(); process.exit(0); });

const probar = await explorar.probar({ host: '127.0.0.1' });
console.log('probar →', probar);
ok(/7125 \(Moonraker\)/.test(probar) && /8080/.test(probar), 'detecta los puertos abiertos (7125 y 8080)');
ok(/Moonraker \(Klipper\)/.test(probar) && /OctoPrint/.test(probar), 'reconoce Moonraker y OctoPrint por lo que contestan');

const diag = await explorar.diagnosticar({ host: '127.0.0.1' });
console.log(diag.split('\n').map((l) => '   ' + l.slice(0, 150)).join('\n'));
ok(/klippy_state/.test(diag) && /hostname/.test(diag), 'el diagnóstico muestra lo que contesta Moonraker');
ok(/OctoPrint 8080 \/api\/version: 200/.test(diag), 'el diagnóstico muestra la respuesta de OctoPrint');
ok(/título "OctoPrint Login"/.test(diag), 'lee el título de la página web');

try { await explorar.enviar(); ok(false, 'enviar tendría que rechazarse'); } catch (e) { ok(/solo para explorar/.test(e.message), 'no manda archivos: enviar se rechaza'); }
ok(explorar.formatos.length === 0, 'sin formatos: la app nunca lo ofrece como destino de envío');

try { await explorar.probar({ host: '192.0.2.1' }); ok(false, 'una IP sin nada tendría que fallar'); }
catch (e) { ok(/No contesta ningún puerto/.test(e.message), 'IP sin respuesta: avisa que revise la IP'); }

moonraker.close(); octoprint.close();
console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
