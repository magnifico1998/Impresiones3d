// Impresora Anycubic simulada: /info, /ctrl (firmado + AES-CBC) y /gcode_upload.
import http from 'node:http';
import crypto from 'node:crypto';
import { conectarAnycubic, anycubicLan } from '../src/drivers/anycubicLan.js';

const md5 = (t) => crypto.createHash('md5').update(t).digest('hex');
const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'; // 32: [0..16] firma, [16..32] clave AES
let subido = null, firmaOk = false;

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/info') return json({ modelName: 'Anycubic Kobra 3', modelId: 20024, token: TOKEN, ctrlInfoUrl: `http://127.0.0.1:${srv.address().port}/ctrl`, fileUploadurl: `http://127.0.0.1:${srv.address().port}/gcode_upload`, ctrlType: 'lan' });
  if (u.pathname === '/ctrl') {
    const ts = u.searchParams.get('ts'), nonce = u.searchParams.get('nonce');
    firmaOk = u.searchParams.get('sign') === md5(md5(TOKEN.slice(0, 16)) + ts + nonce);
    const iv = crypto.randomBytes(8).toString('hex'); // 16 chars
    const c = crypto.createCipheriv('aes-128-cbc', Buffer.from(TOKEN.slice(16, 32)), Buffer.from(iv));
    const info = Buffer.concat([c.update(JSON.stringify({ broker: 'mqtts://127.0.0.1:9883', username: 'u1', password: 'p1', deviceId: 'DEV123', devicecrt: '', devicepk: '' })), c.final()]).toString('base64');
    return json({ code: 200, data: { info, token: iv } });
  }
  if (u.pathname === '/gcode_upload') {
    const partes = []; req.on('data', (d) => partes.push(d)); req.on('end', () => { subido = Buffer.concat(partes).toString('latin1'); json({ code: 200, data: { gcode: 'pieza.gcode' } }); });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const host = `127.0.0.1:${srv.address().port}`;
// El driver arma http://host:18910; para la prueba se le da la dirección completa por la URL de info.
const origFetch = globalThis.fetch;
globalThis.fetch = (url, o) => origFetch(String(url).replace('127.0.0.1:' + host.split(':')[1] + ':18910', host).replace(/^http:\/\/127\.0\.0\.1:\d+:18910/, 'http://' + host), o);

const s = await conectarAnycubic(host.split(':')[0] + ':' + host.split(':')[1]).catch((e) => ({ error: e.message }));
console.log('apretón de manos:', s.error ? 'FALLA ' + s.error : `ok → modelo=${s.modelo} modelId=${s.modelId} deviceId=${s.deviceId} usuario=${s.usuario}`);
console.log('firma válida:', firmaOk);
if (!s.error) {
  // Esta impresora sólo recibe para imprimir (el MQTT no se simula acá).
  const r = await anycubicLan.enviar({ nombre: 'Kobra', host, tieneAce: false }, { nombre: 'pieza.gcode', contenido: Buffer.from('G28\n'), accion: 'subir' }).catch((e) => ({ error: e.message }));
  console.log('"solo subir" se rechaza:', /sólo recibe envíos para imprimir/.test(r.error || '') ? 'OK' : 'FALLA ' + JSON.stringify(r));
}
srv.close();
