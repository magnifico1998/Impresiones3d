import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { Client as Ftp } from 'basic-ftp';
import mqtt from 'mqtt';
import { unzipSync, strFromU8 } from 'fflate';

// Bambu Lab (A1, A1 mini, P1, X1) en "Modo LAN" + "Modo desarrollador"
// (en la impresora: Ajustes → LAN Only → Developer Mode). EXPERIMENTAL.
// Con ese modo la impresora deja de usar la nube y Bambu Handy; a cambio se
// puede mandar e imprimir directo:
//   - subida por FTPS implícito (puerto 990, usuario bblp, el código de acceso);
//   - orden de impresión por MQTT con TLS (puerto 8883, mismo usuario), tema
//     device/{número de serie}/request, comando project_file.
// Sólo .3mf laminados (.gcode.3mf de Bambu Studio u Orca).

async function subirFtp(impresora, nombre, contenido) {
  const ftp = new Ftp(60000);
  try {
    await ftp.access({
      host: impresora.host, port: 990, user: 'bblp', password: impresora.codigoAcceso,
      secure: 'implicit', secureOptions: { rejectUnauthorized: false }
    });
    await ftp.uploadFrom(Readable.from(contenido), `/${nombre}`);
  } catch (e) {
    throw new Error(`No se pudo subir a la impresora por FTPS: ${e.message}. Revisá la IP, el código de acceso y que esté en modo LAN + desarrollador.`, { cause: e });
  } finally {
    ftp.close();
  }
}

function conectarMqtt(impresora) {
  return mqtt.connect(`mqtts://${impresora.host}:8883`, {
    username: 'bblp', password: impresora.codigoAcceso, rejectUnauthorized: false,
    clientId: `manager3d-${crypto.randomBytes(4).toString('hex')}`, connectTimeout: 10000, reconnectPeriod: 0
  });
}

// Placas del .3mf y los filamentos de cada una (Metadata/slice_info.config).
function placasDel3mf(contenido) {
  const partes = unzipSync(new Uint8Array(contenido), { filter: (f) => f.name === 'Metadata/slice_info.config' || /^Metadata\/plate_\d+\.gcode$/.test(f.name) });
  const placas = Object.keys(partes).filter((n) => n.endsWith('.gcode')).map((n) => Number(n.match(/plate_(\d+)/)[1])).sort((a, b) => a - b);
  const info = partes['Metadata/slice_info.config'] ? strFromU8(partes['Metadata/slice_info.config']) : '';
  return { placas, info };
}

export const bambuLan = {
  tipo: 'bambu-lan',
  nombre: 'Bambu Lab (modo LAN + desarrollador, experimental)',
  formatos: ['3mf'],
  puedeImprimir: true,
  campos: ['host', 'codigoAcceso', 'serie'],

  probar(impresora) {
    return new Promise((resolve, reject) => {
      const cliente = conectarMqtt(impresora);
      const fin = (e, v) => { clearTimeout(reloj); cliente.end(true); if (e) reject(e); else resolve(v); };
      const reloj = setTimeout(() => fin(new Error('La impresora no respondió por MQTT.')), 12000);
      cliente.on('error', (e) => fin(new Error(`No se pudo conectar: ${e.message}. Revisá la IP, el código de acceso y el modo LAN + desarrollador.`)));
      cliente.on('connect', () => {
        cliente.subscribe(`device/${impresora.serie}/report`, () => {
          cliente.publish(`device/${impresora.serie}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
        });
      });
      cliente.on('message', () => fin(null, 'Bambu conectada (modo LAN).'));
    });
  },

  async enviar(impresora, { nombre, contenido, accion, opciones = {} }) {
    if (!/\.3mf$/i.test(nombre)) throw new Error('Por modo LAN la Bambu sólo recibe archivos .3mf laminados.');
    const { placas } = placasDel3mf(contenido);
    if (!placas.length) throw new Error('El .3mf no tiene ninguna placa laminada (guardalo desde Bambu Studio con "Exportar archivo de placa laminada").');
    await subirFtp(impresora, nombre, contenido);
    if (accion !== 'imprimir') return { estado: 'enviado', mensaje: `Subido a ${impresora.nombre}: elegilo en su pantalla para imprimir.` };

    const placa = placas.includes(Number(opciones.placa)) ? Number(opciones.placa) : placas[0];
    const orden = {
      print: {
        sequence_id: String(Date.now()),
        command: 'project_file',
        param: `Metadata/plate_${placa}.gcode`,
        url: `file:///sdcard/${nombre}`,
        subtask_name: nombre.replace(/\.gcode\.3mf$|\.3mf$/i, ''),
        project_id: '0', profile_id: '0', task_id: '0', subtask_id: '0',
        md5: crypto.createHash('md5').update(contenido).digest('hex'),
        timelapse: false, bed_type: 'auto', bed_levelling: true, flow_cali: false, vibration_cali: true, layer_inspect: false,
        use_ams: opciones.usarAms !== false,
        ams_mapping: Array.isArray(opciones.amsMapping) ? opciones.amsMapping : [0, 1, 2, 3]
      }
    };
    await new Promise((resolve, reject) => {
      const cliente = conectarMqtt(impresora);
      const fin = (e) => { clearTimeout(reloj); cliente.end(true); if (e) reject(e); else resolve(); };
      const reloj = setTimeout(() => fin(), 8000);
      cliente.on('error', (e) => fin(new Error(`Se subió, pero no se pudo mandar la orden por MQTT: ${e.message}`)));
      cliente.on('connect', () => cliente.publish(`device/${impresora.serie}/request`, JSON.stringify(orden), () => setTimeout(() => fin(), 1500)));
    });
    return { estado: 'imprimiendo', mensaje: `Orden de impresión enviada a ${impresora.nombre} (placa ${placa}).` };
  }
};
