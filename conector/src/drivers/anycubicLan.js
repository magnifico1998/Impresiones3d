import crypto from 'node:crypto';
import mqtt from 'mqtt';

// Anycubic Kobra 3 / Kobra 3 V2 / Kobra S1 (con o sin ACE) en MODO LAN, con
// el firmware original. La impresora tiene que estar en "LAN mode" (en la
// pantalla: Ajustes → Red → modo LAN); en modo nube no acepta nada local.
//
// Protocolo (el mismo que usa Anycubic Slicer Next en la red local):
//   1. GET  http://IP:18910/info → token, modelId, ctrlInfoUrl, url de subida.
//   2. POST ctrlInfoUrl?ts&nonce&sign&did, con
//        sign = md5( md5(token[0..16]) + ts + nonce )
//      → data.info cifrado en AES-128-CBC (clave token[16..32], IV data.token)
//      con el usuario y la contraseña del MQTT de la impresora, su certificado
//      de cliente y el deviceId.
//   3. Subida: POST multipart a /gcode_upload (campos filename y gcode).
//   4. Imprimir: MQTT con TLS en el puerto 9883, tema
//        anycubic/anycubicCloud/v1/slicer/printer/{modelId}/{deviceId}/print
//      y la respuesta en .../printer/public/{modelId}/{deviceId}/print/report.

const PUERTO_HTTP = 18910;
const PUERTO_MQTT = 9883;
// Identificador de este equipo para la impresora (fijo por instalación).
const ID_EQUIPO = crypto.createHash('md5').update(`manager3d-conector-${process.env.COMPUTERNAME || 'pc'}`).digest('hex').toUpperCase();

async function pedirJson(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, signal: AbortSignal.timeout(opciones.timeout || 10000) });
  if (!r.ok) throw new Error(`La impresora respondió ${r.status} en ${new URL(url).pathname}`);
  return r.json();
}

const md5 = (t) => crypto.createHash('md5').update(t).digest('hex');

// Pasos 1 y 2: datos de la impresora y credenciales del MQTT.
export async function conectarAnycubic(host) {
  let info;
  try {
    info = await pedirJson(`http://${host}:${PUERTO_HTTP}/info`);
  } catch (e) {
    throw new Error(`No se encontró la impresora en ${host}. Revisá la IP y que esté prendida y en la misma red. (${e.message})`, { cause: e });
  }
  if (info.ctrlType === 'cloud') throw new Error('La impresora está en modo nube: pasala a "modo LAN" desde su pantalla.');
  const token = info.token || '';
  if (!token || !info.ctrlInfoUrl || !info.modelId) {
    throw new Error('Esta impresora no usa el modo LAN de Anycubic (hace falta una Kobra 3, Kobra 3 V2 o Kobra S1).');
  }

  const ts = Date.now();
  const nonce = crypto.randomBytes(4).toString('hex').slice(0, 6);
  const sign = md5(md5(token.slice(0, 16)) + ts + nonce);
  const ctrl = await pedirJson(`${info.ctrlInfoUrl}?ts=${ts}&nonce=${nonce}&sign=${sign}&did=${ID_EQUIPO}`, { method: 'POST' });
  if (ctrl.code !== 200) throw new Error(`La impresora no aceptó la conexión: ${ctrl.message || ctrl.code}`);

  const iv = Buffer.alloc(16);
  Buffer.from(String(ctrl.data.token)).copy(iv, 0, 0, 16);
  const descifrador = crypto.createDecipheriv('aes-128-cbc', Buffer.from(token.slice(16, 32)), iv);
  const datos = JSON.parse(Buffer.concat([descifrador.update(Buffer.from(ctrl.data.info, 'base64')), descifrador.final()]).toString('utf8'));

  return {
    info,
    modelo: info.modelName || 'Anycubic',
    modelId: String(info.modelId),
    deviceId: datos.deviceId,
    usuario: datos.username,
    password: datos.password,
    certificado: datos.devicecrt || '',
    clave: datos.devicepk || '',
    urlSubida: info.fileUploadurl || info.urls?.fileUploadurl || `http://${host}:${PUERTO_HTTP}/gcode_upload`
  };
}

async function subir(sesion, nombre, contenido) {
  const form = new FormData();
  form.append('filename', nombre);
  form.append('gcode', new Blob([contenido], { type: 'application/octet-stream' }), nombre);
  const r = await fetch(sesion.urlSubida, {
    method: 'POST',
    body: form,
    headers: { 'X-File-Length': String(contenido.length) },
    signal: AbortSignal.timeout(10 * 60 * 1000)
  });
  if (!r.ok) throw new Error(`La impresora rechazó el archivo (HTTP ${r.status}).`);
  const respuesta = await r.json();
  if (respuesta.code !== 200) throw new Error(`La impresora rechazó el archivo: ${respuesta.message || respuesta.code}`);
  return respuesta.data?.gcode || nombre;
}

// Colores y materiales del archivo (los escribe el laminador al final del
// G-code), para mapear cada color a un lugar del ACE en el mismo orden.
function filamentosDelGcode(contenido) {
  const cola = Buffer.from(contenido.subarray(Math.max(0, contenido.length - 400 * 1024))).toString('utf8');
  const valor = (clave) => (cola.match(new RegExp(`^; ${clave} = (.*)$`, 'm'))?.[1] || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const colores = valor('filament_colour');
  const tipos = valor('filament_type');
  const cantidad = Math.max(colores.length, tipos.length, 1);
  return Array.from({ length: cantidad }, (_, i) => ({ color: colores[i] || '#FFFFFF', tipo: tipos[i] || tipos[0] || 'PLA' }));
}

const rgb = (hex) => {
  const h = String(hex).replace('#', '').padEnd(6, 'F').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
};

function publicarYEsperar(sesion, host, tema, mensaje, temaRespuesta) {
  return new Promise((resolve, reject) => {
    const cliente = mqtt.connect(`mqtts://${host}:${PUERTO_MQTT}`, {
      username: sesion.usuario,
      password: sesion.password,
      cert: sesion.certificado || undefined,
      key: sesion.clave || undefined,
      rejectUnauthorized: false, // la impresora usa un certificado propio
      clientId: `manager3d-${crypto.randomBytes(4).toString('hex')}`,
      connectTimeout: 10000,
      reconnectPeriod: 0
    });
    const terminar = (error, valor) => {
      clearTimeout(reloj);
      cliente.end(true);
      if (error) reject(error); else resolve(valor);
    };
    const reloj = setTimeout(() => terminar(null, { confirmado: false }), 20000);
    cliente.on('error', (e) => terminar(new Error(`No se pudo conectar al MQTT de la impresora: ${e.message}`)));
    cliente.on('connect', () => {
      cliente.subscribe(temaRespuesta, () => cliente.publish(tema, JSON.stringify(mensaje)));
    });
    cliente.on('message', (_t, buf) => {
      try {
        const r = JSON.parse(buf.toString());
        if (r.action === mensaje.action || r.msgid === mensaje.msgid) {
          if (r.code && r.code !== 200) terminar(new Error(`La impresora no arrancó: ${r.msg || r.message || r.code}`));
          else terminar(null, { confirmado: true, estado: r.state });
        }
      } catch {
        // Mensajes que no son JSON: se ignoran.
      }
    });
  });
}

export const anycubicLan = {
  tipo: 'anycubic-lan',
  nombre: 'Anycubic Kobra 3 / S1 (modo LAN)',
  formatos: ['gcode', '3mf'],
  puedeImprimir: true,
  campos: ['host', 'tieneAce'],

  async probar(impresora) {
    const s = await conectarAnycubic(impresora.host);
    return `${s.modelo} conectada (modo LAN).`;
  },

  async enviar(impresora, { nombre, contenido, accion }) {
    const sesion = await conectarAnycubic(impresora.host);
    const nombreEnImpresora = await subir(sesion, nombre, contenido);
    if (accion !== 'imprimir') return { estado: 'enviado', mensaje: `Subido a ${impresora.nombre}: elegilo en su pantalla para imprimir.` };

    const filamentos = filamentosDelGcode(contenido);
    const usarAce = !!impresora.tieneAce;
    const mensaje = {
      type: 'print',
      action: 'start',
      msgid: crypto.randomUUID(),
      timestamp: Date.now(),
      data: {
        taskid: '-1',
        url: '',
        filename: nombreEnImpresora,
        md5: crypto.createHash('md5').update(contenido).digest('hex'),
        filepath: null,
        filetype: 1,
        project_type: 1,
        filesize: contenido.length,
        ams_settings: {
          use_ams: usarAce,
          // Cada color del archivo al lugar del ACE en el mismo orden (1.º color → lugar 1).
          ams_box_mapping: usarAce ? filamentos.map((f, i) => ({
            paint_index: i, ams_index: i, paint_color: [...rgb(f.color), 255], ams_color: rgb(f.color), material_type: f.tipo
          })) : []
        },
        task_settings: { auto_leveling: 1, vibration_compensation: 0, flow_calibration: 0, dry_mode: 0, timelapse: { status: 0, count: 0, type: 0 } }
      }
    };
    const base = `anycubic/anycubicCloud/v1`;
    const r = await publicarYEsperar(
      sesion, impresora.host,
      `${base}/slicer/printer/${sesion.modelId}/${sesion.deviceId}/print`,
      mensaje,
      `${base}/printer/public/${sesion.modelId}/${sesion.deviceId}/print/report`
    );
    return r.confirmado
      ? { estado: 'imprimiendo', mensaje: `Imprimiendo en ${impresora.nombre}.` }
      : { estado: 'enviado', mensaje: `Subido y orden de impresión enviada a ${impresora.nombre} (la impresora no confirmó: revisá su pantalla).` };
  }
};
