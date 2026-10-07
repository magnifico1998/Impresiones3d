// Prueba el driver de Klipper/Moonraker contra una impresora simulada (sin hardware).
//   node conector/pruebas/moonraker.mjs
import http from 'node:http';
import { moonraker as d } from '../src/drivers/moonraker.js';

let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

// Impresora simulada: estado configurable y registro de lo que le llega.
const sim = { klippy: 'ready', estado: 'standby', mensaje: '', tras: null, subidas: [], inicios: [], cancelaciones: 0, auth: false };
const servidor = http.createServer((req, res) => {
  const partes = [];
  req.on('data', (c) => partes.push(c));
  req.on('end', () => {
    const cuerpo = Buffer.concat(partes);
    const url = new URL(req.url, 'http://x');
    const responder = (codigo, objeto) => { res.writeHead(codigo, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(objeto)); };
    if (sim.auth) return responder(401, { error: { code: 401, message: 'Unauthorized' } });
    if (url.pathname === '/server/info') return responder(200, { result: { klippy_state: sim.klippy, moonraker_version: 'v0.9.3' } });
    if (url.pathname === '/printer/objects/query') {
      return responder(200, { result: { status: { print_stats: { state: sim.estado, filename: sim.estado === 'printing' ? 'otro.gcode' : '', message: sim.mensaje }, heater_bed: { target: 0 }, extruder: { target: 0 } } } });
    }
    if (url.pathname === '/server/files/upload' && req.method === 'POST') {
      sim.subidas.push(cuerpo.toString('latin1'));
      return responder(201, { result: { item: { path: 'TORNILLO.gcode', root: 'gcodes', size: cuerpo.length }, action: 'create_file' } });
    }
    if (url.pathname === '/printer/print/start') {
      sim.inicios.push(url.searchParams.get('filename'));
      if (sim.tras) sim.tras();
      return responder(200, { result: 'ok' });
    }
    if (url.pathname === '/printer/print/cancel') { sim.cancelaciones++; return responder(200, { result: 'ok' }); }
    if (url.pathname === '/server/files/roots') return responder(200, { result: [{ name: 'gcodes', path: '/gcodes' }] });
    if (url.pathname === '/server/files/list') return responder(200, { result: [{ path: 'a.gcode', size: 10 }, { path: 'b.gcode', size: 20 }] });
    return responder(404, { error: { code: 404, message: 'Not Found' } });
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const imp = { nombre: 'SparkX i7', host: `127.0.0.1:${servidor.address().port}` };
const reiniciar = () => Object.assign(sim, { klippy: 'ready', estado: 'standby', mensaje: '', tras: null, subidas: [], inicios: [], cancelaciones: 0, auth: false });
const mensajes = [];
const trabajo = { nombre: 'TORNILLO.gcode', contenido: Buffer.from('G28\nG1 X10 Y10\n; fin\n'), accion: 'imprimir', avisar: (m) => mensajes.push(m) };

// 1) Ruta feliz: sube, arranca y ve "printing".
reiniciar();
sim.tras = () => { sim.estado = 'printing'; };
let r = await d.enviar(imp, trabajo);
ok(r.estado === 'imprimiendo' && /TORNILLO\.gcode/.test(r.mensaje), `imprime y confirma que empezó: "${r.mensaje}"`);
ok(sim.subidas.length === 1 && sim.subidas[0].includes('G1 X10 Y10') && /name="root"\r\n\r\ngcodes/.test(sim.subidas[0]) && /filename="TORNILLO\.gcode"/.test(sim.subidas[0]), 'sube el archivo completo a la carpeta gcodes con su nombre');
ok(sim.inicios[0] === 'TORNILLO.gcode', 'manda la orden de imprimir con el nombre del archivo subido');
ok(mensajes.some((m) => /Subiendo/.test(m)) && mensajes.some((m) => /orden de imprimir/.test(m)), 'va contando en qué paso está');

// 2) Ocupada: no sube nada.
reiniciar(); sim.estado = 'printing';
try { await d.enviar(imp, trabajo); ok(false, 'ocupada tendría que fallar'); } catch (e) { ok(/imprimiendo/.test(e.message) && /otro\.gcode/.test(e.message), 'si está imprimiendo, avisa qué y no toca nada'); }
ok(sim.subidas.length === 0 && sim.inicios.length === 0, 'ocupada: no se subió ni se arrancó nada');
reiniciar(); sim.estado = 'paused';
try { await d.enviar(imp, trabajo); ok(false, 'en pausa tendría que fallar'); } catch (e) { ok(/pausa/.test(e.message), 'en pausa también la rechaza'); }

// 3) Klipper sin estar listo.
reiniciar(); sim.klippy = 'shutdown';
try { await d.enviar(imp, trabajo); ok(false, 'Klipper caído tendría que fallar'); } catch (e) { ok(/Klipper no está listo/.test(e.message) && /shutdown/.test(e.message), 'Klipper caído: lo explica antes de subir'); }
ok(sim.subidas.length === 0, 'Klipper caído: no se subió nada');

// 4) La impresora no puede empezar (error de Klipper).
reiniciar(); sim.tras = () => { sim.estado = 'error'; sim.mensaje = 'Move out of range: 410.0 0.0'; };
try { await d.enviar(imp, trabajo); ok(false, 'el error de Klipper tendría que fallar'); } catch (e) { ok(/Move out of range/.test(e.message), 'muestra el mensaje de error de Klipper'); }

// 5) Sólo imprimir.
reiniciar();
try { await d.enviar(imp, { ...trabajo, accion: 'subir' }); ok(false, 'subir tendría que rechazarse'); } catch (e) { ok(/sólo recibe envíos para imprimir/.test(e.message), '"solo subir" se rechaza'); }

// 6) Probar y cancelar.
reiniciar();
ok(/Conectada \(Moonraker v0\.9\.3\).*libre/.test(await d.probar(imp)), 'probar informa versión y estado');
ok(/no tiene ningún trabajo/.test(await d.cancelar(imp)) && sim.cancelaciones === 0, 'cancelar sin trabajo: no manda nada');
sim.estado = 'printing';
ok(/Orden de cancelar enviada/.test(await d.cancelar(imp)) && sim.cancelaciones === 1, 'cancelar con un trabajo en curso manda la orden');

// 7) Diagnóstico.
reiniciar();
const diag = await d.diagnosticar(imp);
ok(/klippy_state/.test(diag) && /archivos en gcodes: 2/.test(diag), 'el diagnóstico muestra el estado y los archivos');

// 8) Errores de red y de autorización.
try { await d.probar({ nombre: 'x', host: '127.0.0.1:1' }); ok(false, 'puerto cerrado tendría que fallar'); } catch (e) { ok(/Revisá la IP/.test(e.message), 'IP o puerto sin respuesta: avisa que revise la IP'); }
reiniciar(); sim.auth = true;
try { await d.probar(imp); ok(false, '401 tendría que fallar'); } catch (e) { ok(/API key/.test(e.message), 'si pide autorización, lo explica'); }

servidor.close();
console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
