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

async function api(impresora, metodo, ruta, { cuerpo, ms = MS_CORTO, encabezados } = {}) {
  let r;
  try {
    r = await fetch(`http://${direccion(impresora.host)}${ruta}`, { method: metodo, body: cuerpo, headers: encabezados, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw new Error(`No se pudo hablar con la impresora en ${direccion(impresora.host)}: ${e.cause?.code || e.message}. Revisá la IP y que esté prendida y en la misma red.`, { cause: e });
  }
  const texto = await r.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { /* respuesta que no es JSON */ }
  if (r.status === 401 || r.status === 403) throw new Error('La impresora pide autorización (API key) para esto: por ahora el conector no la maneja. Avisá para sumarla.');
  if (!r.ok) throw new Error(`La impresora contestó ${r.status}: ${datos?.error?.message || texto.slice(0, 200) || 'sin detalle'}`);
  return datos?.result ?? datos ?? texto;
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

// Lo último que escribió la consola de Klipper (respuestas y errores), para explicar
// una pausa o un error. Devuelve las líneas más útiles, de la más vieja a la más nueva.
async function consolaDe(impresora, cuantas = 25) {
  try {
    const r = await api(impresora, 'GET', `/server/gcode_store?count=${cuantas}`);
    const lineas = (r?.gcode_store || []).map((x) => String(x.message || '').replace(/\s+/g, ' ').trim().slice(0, 220)).filter(Boolean);
    const importantes = lineas.filter((l) => /!!|error|fail|filament|runout|pause|cfs|box|timeout|can't|cannot|unknown|not ready/i.test(l));
    return (importantes.length ? importantes : lineas).slice(-4);
  } catch {
    return [];
  }
}

// Cuánto se vigila el arranque después de mandar a imprimir. Hay impresoras que
// aceptan la orden y se pausan al rato (Creality SparkX i7: "Error desconocido").
const vigilarArranqueMs = () => Number(process.env.MANAGER3D_VIGILAR_MS) || 60000;

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

    // Que de verdad haya empezado y siga: Klipper pasa a "printing" enseguida, pero hay
    // impresoras que aceptan la orden y se pausan al rato. Se vigila el arranque y, si se
    // pausa o falla, se dice por qué con lo que escribió su consola.
    const inicio = Date.now();
    const vigilar = vigilarArranqueMs();
    let vistoImprimiendo = false;
    while (Date.now() - inicio < vigilar) {
      await new Promise((resolver) => setTimeout(resolver, 2000));
      const e = await estadoDe(impresora);
      const seg = Math.round((Date.now() - inicio) / 1000);
      if (e.estado === 'printing') {
        vistoImprimiendo = true;
        avisar?.(`Imprimiendo: vigilando el arranque (${seg} s de ${Math.round(vigilar / 1000)})…`);
      } else if (['paused', 'error', 'cancelled'].includes(e.estado)) {
        const consola = await consolaDe(impresora);
        const que = e.estado === 'paused' ? 'pausó el trabajo' : (e.estado === 'cancelled' ? 'canceló el trabajo' : 'dio error');
        throw new Error(`La impresora ${que} a los ${seg} s de arrancar${e.mensaje ? `: ${e.mensaje}` : ''}${consola.length ? `. Lo último que escribió: ${consola.join(' | ')}` : ''}. Quedó con el trabajo: cancelalo desde el panel antes de mandar otro.`);
      } else if (e.estado === 'complete') {
        return { estado: 'imprimiendo', mensaje: `${impresora.nombre}: el trabajo ${ruta} ya terminó.` };
      } else if (!vistoImprimiendo && seg >= 20) {
        break;
      }
    }
    return vistoImprimiendo
      ? { estado: 'imprimiendo', mensaje: `Imprimiendo en ${impresora.nombre} (${ruta}); el arranque se vigiló ${Math.round((Date.now() - inicio) / 1000)} s sin problemas.` }
      : { estado: 'enviado', mensaje: `Subido y orden de imprimir enviada a ${impresora.nombre} (${ruta}), pero no pasó a "imprimiendo": revisá su pantalla.` };
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
    // Para entender una pausa o un error: lo que escribió la consola y el final del registro de Klipper.
    try {
      const consola = await consolaDe(impresora, 40);
      lineas.push(`consola de la impresora (últimas líneas útiles): ${consola.length ? consola.join(' | ') : '(vacía)'}`);
    } catch (e) {
      lineas.push(`consola de la impresora: error (${e.message})`);
    }
    try {
      const registro = await api(impresora, 'GET', '/server/files/logs/klippy.log', { ms: 20000, encabezados: { Range: 'bytes=-12000' } });
      const fin = String(registro || '').split(/\r?\n/).filter(Boolean).slice(-25).map((l) => l.slice(0, 200));
      lineas.push(`final del registro klippy.log:\n  ${fin.join('\n  ')}`);
    } catch (e) {
      lineas.push(`registro klippy.log: error (${e.message})`);
    }
    try {
      const objetos = await api(impresora, 'GET', '/printer/objects/list');
      lineas.push(`objetos de Klipper: ${corto(objetos?.objects, 900)}`);
    } catch (e) {
      lineas.push(`objetos de Klipper: error (${e.message})`);
    }
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
