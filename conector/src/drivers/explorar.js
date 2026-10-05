import net from 'node:net';

// "Explorar una impresora": una herramienta de SOLO LECTURA para ver cómo se
// conecta una impresora de otra marca (Creality, Elegoo, Flashforge…) antes de
// armar su soporte. Mira qué puertos tiene abiertos y qué contestan los
// protocolos más comunes (Moonraker/Klipper, OctoPrint, el WebSocket de Creality).
// No manda archivos ni cambia nada en la impresora; por eso no ofrece envíos
// (formatos vacío): sólo sirve el botón Diagnóstico del panel.

const PUERTOS = [
  [21, 'FTP'], [22, 'SSH'], [80, 'HTTP'], [443, 'HTTPS'], [3030, 'SDCP (Elegoo)'], [4408, 'Fluidd'], [4409, 'Fluidd'],
  [5000, 'HTTP'], [7125, 'Moonraker'], [8080, 'HTTP/OctoPrint'], [8081, 'HTTP'], [8883, 'MQTT con TLS'],
  [8888, 'HTTP'], [8898, 'Flashforge'], [8899, 'Flashforge'], [9999, 'WebSocket Creality'], [18910, 'Anycubic']
];
const PUERTOS_HTTP = [80, 4408, 4409, 5000, 7125, 8080, 8081, 8888];

const abierto = (host, puerto, ms = 1500) => new Promise((resolver) => {
  const s = net.connect({ host, port: puerto });
  const fin = (v) => { s.destroy(); resolver(v); };
  s.setTimeout(ms, () => fin(false));
  s.once('connect', () => fin(true));
  s.once('error', () => fin(false));
});

async function http(host, puerto, ruta, ms = 3000) {
  try {
    const r = await fetch(`http://${host}:${puerto}${ruta}`, { signal: AbortSignal.timeout(ms) });
    const texto = (await r.text()).slice(0, 4000);
    return { estado: r.status, servidor: r.headers.get('server') || '', texto };
  } catch (e) {
    return { error: e.cause?.code || e.message };
  }
}

const corto = (t, n = 300) => String(t).replace(/\s+/g, ' ').trim().slice(0, n);
const titulo = (html) => corto(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '(sin título)', 100);

// Escucha el WebSocket que usa Creality (puerto 9999) unos segundos.
function escucharWs(host, ms = 4000) {
  return new Promise((resolver) => {
    if (typeof WebSocket === 'undefined') { resolver({ error: 'este Node no trae WebSocket' }); return; }
    const mensajes = [];
    let ws;
    try { ws = new WebSocket(`ws://${host}:9999`); } catch (e) { resolver({ error: e.message }); return; }
    const fin = () => { try { ws.close(); } catch { /* ya cerrado */ } resolver({ mensajes }); };
    const reloj = setTimeout(fin, ms);
    ws.addEventListener('open', () => {
      // Sólo pedidos de lectura.
      ws.send(JSON.stringify({ method: 'get', params: { ReqPrinterPara: 1 } }));
    });
    ws.addEventListener('message', (e) => { mensajes.push(corto(e.data, 500)); if (mensajes.length >= 3) { clearTimeout(reloj); fin(); } });
    ws.addEventListener('error', () => { clearTimeout(reloj); resolver({ error: 'no se pudo conectar' }); });
  });
}

// Qué parece ser, según lo que contestó.
async function reconocer(host) {
  const abiertos = (await Promise.all(PUERTOS.map(async ([p, n]) => ((await abierto(host, p)) ? { p, n } : null)))).filter(Boolean);
  const tiene = (p) => abiertos.some((a) => a.p === p);
  const pistas = [];
  if (tiene(7125)) {
    const r = await http(host, 7125, '/server/info');
    if (r.estado === 200 && /klippy_state|moonraker_version/.test(r.texto)) pistas.push('habla Moonraker (Klipper)');
  }
  for (const p of [80, 8080, 5000]) {
    if (!tiene(p)) continue;
    const r = await http(host, p, '/api/version');
    if (r.estado === 200 && /OctoPrint|"api"/.test(r.texto)) { pistas.push(`parece OctoPrint (puerto ${p})`); break; }
  }
  if (tiene(9999)) pistas.push('tiene el WebSocket de Creality (9999)');
  if (tiene(8899)) pistas.push('puerto de Flashforge (8899)');
  if (tiene(3030)) pistas.push('puerto SDCP (Elegoo, 3030)');
  return { abiertos, pistas };
}

export const explorar = {
  tipo: 'explorar-impresora',
  nombre: 'Otra marca: solo explorar cómo se conecta (para armar su soporte)',
  formatos: [], // no recibe envíos
  puedeImprimir: false,
  puedeDiagnosticar: true,
  campos: ['host'],

  async probar(impresora) {
    const { abiertos, pistas } = await reconocer(impresora.host);
    if (!abiertos.length) throw new Error(`No contesta ningún puerto habitual en ${impresora.host}: revisá la IP y que esté prendida y en la misma red.`);
    return `Puertos abiertos: ${abiertos.map((a) => `${a.p} (${a.n})`).join(', ')}.${pistas.length ? ` Pistas: ${pistas.join('; ')}.` : ' Sin pistas claras: usá Diagnóstico.'}`;
  },

  async enviar() {
    throw new Error('Este tipo es solo para explorar: todavía no recibe envíos. Elegí otro tipo de impresora.');
  },

  async diagnosticar(impresora) {
    const host = impresora.host;
    const { abiertos, pistas } = await reconocer(host);
    const lineas = [`Puertos abiertos: ${abiertos.length ? abiertos.map((a) => `${a.p} (${a.n})`).join(', ') : 'ninguno de los habituales'}`];
    if (pistas.length) lineas.push(`Pistas: ${pistas.join('; ')}`);

    for (const { p } of abiertos.filter((a) => PUERTOS_HTTP.includes(a.p))) {
      const r = await http(host, p, '/');
      lineas.push(`HTTP ${p} "/": ${r.error ? `error (${r.error})` : `${r.estado}, servidor "${r.servidor}", título "${titulo(r.texto)}"`}`);
    }
    if (abiertos.some((a) => a.p === 7125)) {
      for (const ruta of ['/server/info', '/printer/info', '/server/files/list?root=gcodes', '/machine/system_info']) {
        const r = await http(host, 7125, ruta);
        lineas.push(`Moonraker ${ruta}: ${r.error ? `error (${r.error})` : `${r.estado} ${corto(r.texto, 450)}`}`);
      }
    }
    for (const p of [80, 8080, 5000]) {
      if (!abiertos.some((a) => a.p === p)) continue;
      const r = await http(host, p, '/api/version');
      lineas.push(`OctoPrint ${p} /api/version: ${r.error ? `error (${r.error})` : `${r.estado} ${corto(r.texto, 200)}`}`);
    }
    if (abiertos.some((a) => a.p === 9999)) {
      const r = await escucharWs(host);
      lineas.push(`WebSocket 9999: ${r.error ? `error (${r.error})` : (r.mensajes.length ? r.mensajes.map((m, i) => `[${i + 1}] ${m}`).join(' | ') : 'conectó pero no mandó nada')}`);
    }
    return lineas.join('\n');
  }
};
