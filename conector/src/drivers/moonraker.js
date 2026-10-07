// Impresoras con Klipper + Moonraker: Creality (SparkX i7, K1, K1C, K2, Ender-3 V3
// KE…), Elegoo Neptune 4, Sovol, Voron, Artillery y muchas más. Es el protocolo
// estándar de Klipper, documentado en https://moonraker.readthedocs.io (API HTTP,
// puerto 7125). Sirve para cualquier marca que lo traiga abierto, sin modos
// especiales en la impresora.
//
// Para imprimir:
//   1. GET  /server/info  → Klipper tiene que estar "ready".
//   2. GET  /printer/objects/query?print_stats → que no esté imprimiendo ni en pausa.
//   3. POST /server/files/upload (multipart: root=gcodes, file) → sube el .gcode.
//   4. POST /printer/print/start?filename=… → arranca.
//   5. Se mira print_stats hasta ver "printing" (o el mensaje de error de Klipper).
// Sólo recibe .gcode (Klipper no ejecuta .3mf).

const PUERTO = 7125;
const MS_CORTO = 10000;

// "192.168.0.50" o "192.168.0.50:7125".
const direccion = (host) => (String(host).includes(':') ? host : `${host}:${PUERTO}`);

async function api(impresora, metodo, ruta, { cuerpo, ms = MS_CORTO } = {}) {
  let r;
  try {
    r = await fetch(`http://${direccion(impresora.host)}${ruta}`, { method: metodo, body: cuerpo, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw new Error(`No se pudo hablar con la impresora en ${direccion(impresora.host)}: ${e.cause?.code || e.message}. Revisá la IP y que esté prendida y en la misma red.`, { cause: e });
  }
  const texto = await r.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { /* respuesta que no es JSON */ }
  if (r.status === 401 || r.status === 403) throw new Error('La impresora pide autorización (API key) para esto: por ahora el conector no la maneja. Avisá para sumarla.');
  if (!r.ok) throw new Error(`La impresora contestó ${r.status}: ${datos?.error?.message || texto.slice(0, 200) || 'sin detalle'}`);
  return datos?.result ?? datos;
}

// Estado del trabajo y temperaturas objetivo.
async function estadoDe(impresora) {
  const r = await api(impresora, 'GET', '/printer/objects/query?print_stats&heater_bed&extruder');
  const ps = r?.status?.print_stats || {};
  const estado = String(ps.state || 'standby');
  return {
    estado, // standby | printing | paused | complete | cancelled | error
    archivo: ps.filename || '',
    mensaje: ps.message || '',
    libre: !['printing', 'paused'].includes(estado),
    cama: r?.status?.heater_bed?.target ?? null,
    boquilla: r?.status?.extruder?.target ?? null
  };
}

const TEXTO_ESTADO = { standby: 'libre', complete: 'libre (terminó el último trabajo)', cancelled: 'libre (se canceló el último)', error: 'con un error del último trabajo', printing: 'imprimiendo', paused: 'en pausa con un trabajo' };

async function klipperListo(impresora) {
  const info = await api(impresora, 'GET', '/server/info');
  if (info?.klippy_state && info.klippy_state !== 'ready') {
    throw new Error(`Klipper no está listo (estado: ${info.klippy_state}). Reiniciá el firmware desde la pantalla de la impresora o desde su interfaz web y volvé a intentar.`);
  }
  return info;
}

export const moonraker = {
  tipo: 'moonraker',
  nombre: 'Klipper / Moonraker (Creality SparkX i7, K1, Elegoo Neptune 4, Sovol…)',
  formatos: ['gcode'],
  puedeImprimir: true,
  puedeCancelar: true,
  puedeDiagnosticar: true,
  campos: ['host'],

  async probar(impresora) {
    const info = await klipperListo(impresora);
    const e = await estadoDe(impresora);
    return `Conectada (Moonraker ${info?.moonraker_version || ''}). Estado: ${TEXTO_ESTADO[e.estado] || e.estado}. Cama ${e.cama ?? '?'} °C, boquilla ${e.boquilla ?? '?'} °C (objetivo).`;
  },

  // Cancela lo que tenga en curso (imprimiendo o en pausa).
  async cancelar(impresora) {
    const e = await estadoDe(impresora);
    if (e.libre) return `La impresora no tiene ningún trabajo en curso (está ${TEXTO_ESTADO[e.estado] || e.estado}).`;
    await api(impresora, 'POST', '/printer/print/cancel');
    return `Orden de cancelar enviada (cancelaba: ${e.archivo || 'el trabajo en curso'}).`;
  },

  async enviar(impresora, { nombre, contenido, accion, avisar }) {
    // Mandar un archivo sin imprimirlo no se ofrece: para esto se usa "Guardar en una carpeta".
    if (accion !== 'imprimir') throw new Error('Esta impresora sólo recibe envíos para imprimir. Volvé a mandarlo desde Manager3D (recargá la página si no te ofrece "Imprimir").');

    await klipperListo(impresora);
    const antes = await estadoDe(impresora);
    if (!antes.libre) throw new Error(`La impresora está ${TEXTO_ESTADO[antes.estado]}${antes.archivo ? ` (${antes.archivo})` : ''}: esperá a que termine o cancelala desde el panel, y volvé a mandarlo.`);

    avisar?.('Subiendo el archivo a la impresora…');
    const form = new FormData();
    form.append('root', 'gcodes');
    form.append('file', new Blob([contenido], { type: 'application/octet-stream' }), nombre);
    const subido = await api(impresora, 'POST', '/server/files/upload', { cuerpo: form, ms: 10 * 60 * 1000 });
    const ruta = subido?.item?.path || nombre;

    avisar?.('Archivo subido. Mandando la orden de imprimir…');
    await api(impresora, 'POST', `/printer/print/start?filename=${encodeURIComponent(ruta)}`);

    // Que de verdad haya empezado (Klipper pasa a "printing" enseguida; un error
    // del archivo o de la impresora aparece en print_stats.message).
    for (let i = 0; i < 10; i++) {
      await new Promise((resolver) => setTimeout(resolver, 2000));
      const e = await estadoDe(impresora);
      if (e.estado === 'printing') return { estado: 'imprimiendo', mensaje: `Imprimiendo en ${impresora.nombre} (${ruta}).` };
      if (e.estado === 'error') throw new Error(`La impresora no pudo empezar: ${e.mensaje || 'error de Klipper (mirá su pantalla)'}`);
    }
    return { estado: 'enviado', mensaje: `Subido y orden de imprimir enviada a ${impresora.nombre} (${ruta}), pero no pasó a "imprimiendo": revisá su pantalla.` };
  },

  async diagnosticar(impresora) {
    const corto = (x, n = 600) => { const t = JSON.stringify(x); return t === undefined ? '(sin datos)' : (t.length > n ? `${t.slice(0, n)}…` : t); };
    const lineas = [];
    const pedir = async (rotulo, ruta, n) => {
      try { lineas.push(`${rotulo}: ${corto(await api(impresora, 'GET', ruta), n)}`); } catch (e) { lineas.push(`${rotulo}: error (${e.message})`); }
    };
    await pedir('/server/info', '/server/info', 500);
    await pedir('/printer/info', '/printer/info', 400);
    await pedir('estado del trabajo', '/printer/objects/query?print_stats&virtual_sdcard&heater_bed&extruder', 700);
    await pedir('carpetas (roots)', '/server/files/roots', 400);
    try {
      const lista = await api(impresora, 'GET', '/server/files/list?root=gcodes');
      const archivos = Array.isArray(lista) ? lista : [];
      lineas.push(`archivos en gcodes: ${archivos.length}; los últimos: ${corto(archivos.slice(-3).map((a) => ({ path: a.path, size: a.size })), 400)}`);
    } catch (e) {
      lineas.push(`archivos en gcodes: error (${e.message})`);
    }
    return lineas.join('\n');
  }
};
