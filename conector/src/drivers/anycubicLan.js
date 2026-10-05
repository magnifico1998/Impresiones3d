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
//   4. MQTT con TLS en el puerto 9883. Se manda a
//        anycubic/anycubicCloud/v1/slicer/printer/{modelId}/{deviceId}/{tipo}
//      y la impresora contesta en
//        anycubic/anycubicCloud/v1/printer/public/{modelId}/{deviceId}/{tipo}/report
//      Tipos que se usan: info (estado), multiColorBox (el ACE) y print
//      (start / stop).
//
// Para imprimir: se mira que la impresora esté libre, se lee qué hay cargado en
// cada lugar del ACE y cada color del archivo va a un lugar con ese material
// (si no hay, se avisa antes de mandar nada: la impresora rechaza una orden con
// "invalid filament id" y se queda calentando la cama). Si igual rechaza la
// orden, se cancela el trabajo para dejarla libre.

const PUERTO_HTTP = 18910;
const PUERTO_MQTT = 9883;
const BASE_MQTT = 'anycubic/anycubicCloud/v1';
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

async function subir(sesion, nombre, contenido, msMaximo = 5 * 60 * 1000) {
  const form = new FormData();
  form.append('filename', nombre);
  form.append('gcode', new Blob([contenido], { type: 'application/octet-stream' }), nombre);
  const r = await fetch(sesion.urlSubida, {
    method: 'POST',
    body: form,
    // Mismos encabezados que Anycubic Slicer Next: la impresora los mira para
    // saber quién le manda el archivo.
    headers: {
      'User-Agent': 'AnycubicSlicerNext/1.3.7.3',
      'X-BBL-Client-Name': 'AnycubicSlicerNext',
      'X-BBL-Client-Type': 'slicer',
      'X-BBL-Client-Version': '01.03.07.03',
      'X-BBL-Device-ID': ID_EQUIPO,
      'X-BBL-Language': 'en-US',
      'X-BBL-OS-Type': 'windows',
      'X-File-Length': String(contenido.length)
    },
    signal: AbortSignal.timeout(msMaximo)
  });
  if (!r.ok) throw new Error(`La impresora rechazó el archivo (HTTP ${r.status}).`);
  const respuesta = await r.json();
  if (respuesta.code !== 200) throw new Error(`La impresora rechazó el archivo: ${respuesta.message || respuesta.code}`);
  return respuesta.data?.gcode || nombre;
}

// ---- Filamentos del archivo y lugares del ACE ------------------------------

// Filamentos que el archivo realmente usa. Un proyecto trae configurados todos
// los filamentos que tenga el laminador (5, 8, 16…) aunque el modelo use uno
// solo; lo que se usó lo anota el laminador en "filament used" (gramos, o mm).
// Cada uno lleva su número original en el proyecto (indice), porque los cambios
// de herramienta del archivo (T0, T1…) se refieren a ese número.
export function filamentosDelGcode(contenido) {
  const cola = Buffer.from(contenido.subarray(Math.max(0, contenido.length - 400 * 1024))).toString('utf8');
  const cabecera = Buffer.from(contenido.subarray(0, 100 * 1024)).toString('utf8');
  const buscar = (clave) => {
    for (const texto of [cola, cabecera]) {
      const m = texto.match(new RegExp('^;\\s*' + clave + '\\s*[=:]\\s*(.*)$', 'm'));
      if (m) return m[1].split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    }
    return [];
  };
  const colores = buscar('filament_colour');
  const tipos = buscar('filament_type');
  const usados = ['filament used \\[g\\]', 'filament used \\[mm\\]', 'filament used \\[cm3\\]'].map(buscar).find((l) => l.length) || [];
  let indices = usados.map((v, i) => [Number(v), i]).filter(([v]) => v > 0).map(([, i]) => i);
  if (!indices.length) indices = [0]; // sin esos datos, se asume un solo filamento
  return indices.map((i) => ({ indice: i, color: colores[i] || '#FFFFFF', tipo: tipos[i] || tipos[0] || 'PLA' }));
}

const rgb = (hex) => {
  const h = String(hex).replace('#', '').padEnd(6, 'F').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
};
// "PLA", "PLA+", "PLA Basic" → "PLA"; "PETG-CF" → "PETG".
const materialBase = (t) => (String(t || '').toUpperCase().match(/^[A-Z]+/) || [''])[0];
const distanciaColor = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Lugares del ACE que tienen filamento cargado, según lo que informa la
// impresora (multiColorBox): [{ indice, tipo, color }].
export function lugaresDelAce(datos) {
  const cajas = datos?.multi_color_box || datos?.multiColorBox || [];
  const caja = cajas[0];
  if (!caja) return [];
  let crudos = caja.slots || [];
  if (!crudos.length && caja.box_info) crudos = caja.box_info.slot_info || [];
  return crudos
    .map((s, i) => ({
      indice: Number.isInteger(s.index) ? s.index : i,
      tipo: materialBase(s.type),
      tipoCompleto: String(s.type || ''),
      color: (Array.isArray(s.color) ? s.color : [255, 255, 255]).slice(0, 3).map(Number),
      cargado: [4, 5].includes(s.status) || (s.status > 0 && !!s.type)
    }))
    .filter((l) => l.cargado);
}

const nombreLugar = (l) => `lugar ${l.indice + 1}: ${l.tipoCompleto || 'sin tipo'}`;

// Asigna cada color del archivo a un lugar del ACE con el mismo material (el
// más parecido en color, sin repetir lugar). Si falta alguno, tira un Error
// que explica qué hay cargado y qué falta.
export function armarMapeoAce(filamentos, lugares) {
  if (!lugares.length) {
    throw new Error('El ACE no tiene ningún filamento cargado (o la impresora no informó su estado). Cargá el filamento en un lugar del ACE, o destildá "Tiene ACE" si la imprimís con el carrete externo.');
  }
  const libres = [...lugares];
  return filamentos.map((f, pos) => {
    const i = f.indice ?? pos;
    const material = materialBase(f.tipo);
    const colorArchivo = rgb(f.color);
    const candidatos = libres.filter((l) => l.tipo === material);
    if (!candidatos.length) {
      throw new Error(`El archivo usa ${f.tipo} (color ${i + 1}) y el ACE no tiene ${material} libre. Cargado: ${lugares.map(nombreLugar).join(' · ')}.`);
    }
    const elegido = candidatos.sort((a, b) => distanciaColor(a.color, colorArchivo) - distanciaColor(b.color, colorArchivo))[0];
    libres.splice(libres.indexOf(elegido), 1);
    return {
      paint_index: i,
      ams_index: elegido.indice,
      paint_color: [...colorArchivo, 255],
      ams_color: elegido.color,
      material_type: material
    };
  });
}

// ---- MQTT -------------------------------------------------------------------

// Sesión MQTT con la impresora: conecta, escucha sus informes y deja hacer
// pedidos que esperan la respuesta del mismo tipo.
function abrirMqtt(sesion, host) {
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
    const esperas = new Set(); // { tipo, filtro, resolver, reloj }
    const cerrar = () => {
      esperas.forEach((e) => clearTimeout(e.reloj));
      esperas.clear();
      cliente.end(true);
    };

    cliente.once('error', (e) => {
      cerrar();
      reject(new Error(`No se pudo conectar al MQTT de la impresora: ${e.message}`, { cause: e }));
    });
    cliente.on('message', (tema, buf) => {
      const tipo = tema.match(/\/([A-Za-z]+)\/report$/)?.[1];
      if (!tipo) return;
      let informe;
      try {
        informe = JSON.parse(buf.toString());
      } catch {
        return; // mensajes que no son JSON: se ignoran
      }
      for (const e of esperas) {
        if (e.tipo === tipo && e.filtro(informe)) {
          clearTimeout(e.reloj);
          esperas.delete(e);
          e.resolver(informe);
        }
      }
    });

    const api = {
      // Manda un pedido y espera el informe de ese tipo (null si no llega a tiempo).
      pedir(tipo, accion, data = null, { ms = 6000, filtro = () => true, espacio = 'slicer' } = {}) {
        return new Promise((resolver) => {
          const msgid = crypto.randomUUID();
          const espera = { tipo, filtro: (inf) => filtro(inf, msgid), resolver, reloj: setTimeout(() => { esperas.delete(espera); resolver(null); }, ms) };
          esperas.add(espera);
          cliente.publish(
            `${BASE_MQTT}/${espacio}/printer/${sesion.modelId}/${sesion.deviceId}/${tipo}`,
            JSON.stringify({ type: tipo, action: accion, timestamp: Date.now(), msgid, data })
          );
        });
      },
      cerrar
    };

    cliente.on('connect', () => {
      cliente.subscribe(`${BASE_MQTT}/printer/public/${sesion.modelId}/${sesion.deviceId}/#`, (err) => {
        if (err) { cerrar(); reject(err); } else resolve(api);
      });
    });
  });
}

// Estado de la impresora: { libre, texto }.
// Pasos de un trabajo que la impresora puede informar mientras lo prepara o lo
// hace (descargando el archivo, revisando, calentando, imprimiendo…). Cuando
// termina o se cancela, el trabajo en curso desaparece (project: null).
const PASOS_TERMINADOS = ['', 'finish', 'complete', 'completed', 'stoped', 'stopped', 'cancel', 'cancelled', 'canceled', 'failed', 'free', 'idle'];

async function estadoDe(mqttApi) {
  const r = await mqttApi.pedir('info', 'query', null, { ms: 5000 });
  const datos = r?.data || {};
  const estado = String(datos.state ?? '').toLowerCase();
  const actual = datos.project || null; // el trabajo en curso (el último terminado va en last_project)
  const pasoActual = String(actual?.state ?? '').toLowerCase();
  const temp = datos.temp ? { cama: Number(datos.temp.target_hotbed_temp) || 0, boquilla: Number(datos.temp.target_nozzle_temp) || 0 } : null;
  const trabajo = actual ? { taskid: String(actual.taskid ?? actual.task_id ?? '-1'), paso: pasoActual || 'sin paso' } : null;
  if (!r) return { libre: true, texto: 'no informó su estado', temp, trabajo: null };
  const enPausa = pasoActual === 'pause' || estado === 'pause';
  const conTrabajo = !!actual && !PASOS_TERMINADOS.includes(pasoActual);
  const ocupada = estado === 'busy' || conTrabajo || enPausa;
  const texto = !ocupada ? 'libre'
    : enPausa ? 'en pausa con un trabajo'
      : conTrabajo && pasoActual !== 'printing' ? `preparando un trabajo (${pasoActual})`
        : 'ocupada imprimiendo';
  return { libre: !ocupada, texto, temp, trabajo };
}

// Cancela el trabajo que la impresora tenga en curso o preparando. Usa el número
// de trabajo (taskid) que ella informa: con -1 sólo cancela una impresión, no una
// descarga a medias. Prueba "stop" y, si la impresora sigue ocupada, "cancel".
// Devuelve { libre, texto } con cómo quedó.
async function cancelarTrabajoEnImpresora(mqttApi) {
  let estado = await estadoDe(mqttApi);
  for (const accion of ['stop', 'cancel']) {
    const taskid = estado.trabajo?.taskid || '-1';
    await mqttApi.pedir('print', accion, { taskid }, { ms: 4000, filtro: (inf, msgid) => inf.msgid === msgid || inf.action === accion });
    await new Promise((resolver) => setTimeout(resolver, 2000));
    estado = await estadoDe(mqttApi);
    if (estado.libre) break;
  }
  return estado;
}

// Al preparar un trabajo la impresora sube las temperaturas objetivo (cama,
// boquilla) y, al cancelarlo, las deja así. Se vuelven a poner las que tenía
// antes de la subida (casi siempre 0, apagadas).
async function restaurarTemperaturas(mqttApi, antes) {
  if (!antes) return;
  const ahora = await estadoDe(mqttApi);
  if (!ahora.temp || (ahora.temp.cama === antes.cama && ahora.temp.boquilla === antes.boquilla)) return;
  await mqttApi.pedir('tempature', 'set', { type: 2, target_hotbed_temp: antes.cama, target_nozzle_temp: antes.boquilla }, { ms: 2500, espacio: 'web' });
}

// Sube el archivo. En esta impresora subir un archivo la deja "preparando un
// trabajo" (recibiendo, calentando la cama) esperando que alguien lo inicie o lo
// cancele; si no contesta la subida a tiempo, se cancela esa preparación por ella
// (el archivo queda guardado) y se sigue esperando la respuesta.
//   alColgarse: se llama una vez, cuando la subida tarda más de lo normal.
async function subirVigilando(sesion, nombre, contenido, alColgarse) {
  const inicio = Date.now();
  const MS_MAXIMO = 5 * 60 * 1000;
  // Una subida normal termina en segundos (más tiempo para archivos grandes).
  const msSospecha = Math.max(30000, (contenido.length / 1024 / 1024) * 3000);
  let resultado = null;
  let colgada = false;
  subir(sesion, nombre, contenido, MS_MAXIMO)
    .then((n) => { resultado = { nombre: n }; })
    .catch((e) => { resultado = { error: e }; });

  while (!resultado && Date.now() - inicio < MS_MAXIMO + 5000) {
    await new Promise((resolver) => setTimeout(resolver, 1500));
    if (!resultado && !colgada && Date.now() - inicio > msSospecha) {
      colgada = true;
      await alColgarse?.();
    }
  }
  if (resultado?.error) throw resultado.error;
  return { nombre: resultado?.nombre || nombre, colgada };
}

// Traduce los rechazos conocidos de la impresora.
function explicarRechazo(msg) {
  const t = String(msg || '').toLowerCase();
  if (t.includes('filament')) return `La impresora rechazó el filamento (${msg}): revisá que el lugar del ACE tenga cargado el material que pide el archivo, o destildá "Tiene ACE" si usás el carrete externo.`;
  if (t.includes('busy')) return `La impresora está ocupada (${msg}).`;
  return `La impresora no arrancó: ${msg}`;
}

export const anycubicLan = {
  tipo: 'anycubic-lan',
  nombre: 'Anycubic Kobra 3 / S1 (modo LAN)',
  formatos: ['gcode', '3mf'],
  puedeImprimir: true,
  puedeCancelar: true,
  puedeDiagnosticar: true,
  campos: ['host', 'tieneAce'],

  // Conecta, y cuenta cómo está la impresora (estado y, con ACE, qué hay en cada lugar).
  async probar(impresora) {
    const s = await conectarAnycubic(impresora.host);
    const m = await abrirMqtt(s, impresora.host);
    try {
      const est = await estadoDe(m);
      let ace = '';
      if (impresora.tieneAce) {
        const r = await m.pedir('multiColorBox', 'getInfo', null, { ms: 6000 });
        const lugares = lugaresDelAce(r?.data);
        ace = r
          ? ` ACE: ${lugares.length ? lugares.map(nombreLugar).join(' · ') : 'sin filamento cargado'}.`
          : ' El ACE no respondió (¿está bien conectado?).';
      }
      return `${s.modelo} conectada (modo LAN). Estado: ${est.texto}.${ace}`;
    } finally {
      m.cerrar();
    }
  },

  // Cancela lo que la impresora tenga en curso o preparando (por ejemplo, tras
  // un rechazo que la dejó calentando la cama sin imprimir).
  async cancelar(impresora) {
    const s = await conectarAnycubic(impresora.host);
    const m = await abrirMqtt(s, impresora.host);
    try {
      const antes = await estadoDe(m);
      const despues = await cancelarTrabajoEnImpresora(m);
      await restaurarTemperaturas(m, { cama: 0, boquilla: 0 });
      return despues.libre
        ? `Listo: la impresora quedó libre (antes: ${antes.texto}) y con la cama y la boquilla apagadas.`
        : `Se mandó la orden de cancelar, pero la impresora sigue ${despues.texto}: tocá Cancelar en su pantalla.`;
    } finally {
      m.cerrar();
    }
  },

  // Todo lo que informa la impresora, para entender qué contesta (se ve en el
  // panel del conector, botón Diagnóstico).
  async diagnosticar(impresora) {
    const corto = (x, n = 700) => { const t = JSON.stringify(x); return t === undefined ? '(sin datos)' : (t.length > n ? `${t.slice(0, n)}…` : t); };
    const lineas = [];
    const s = await conectarAnycubic(impresora.host);
    const infoSinToken = { ...s.info };
    delete infoSinToken.token;
    lineas.push(`/info: ${corto(infoSinToken, 600)}`);
    const m = await abrirMqtt(s, impresora.host);
    try {
      const informe = await m.pedir('info', 'query', null, { ms: 5000 });
      lineas.push(`estado (info): ${corto(informe?.data, 1800)}`);
      lineas.push(`trabajo en curso (project): ${corto(informe?.data?.project ?? null, 600)}`);
      const interpretado = await estadoDe(m);
      lineas.push(`el conector lo interpreta como: ${interpretado.texto}${interpretado.trabajo ? ` · trabajo ${interpretado.trabajo.taskid} en paso "${interpretado.trabajo.paso}"` : ''}`);
      if (impresora.tieneAce) lineas.push(`ACE (multiColorBox): ${corto((await m.pedir('multiColorBox', 'getInfo', null, { ms: 6000 }))?.data, 1200)}`);
      const r = await m.pedir('file', 'listLocal', { path: '/' }, { ms: 5000 });
      const registros = r?.data?.records;
      lineas.push(`archivos (listLocal "/"): ${Array.isArray(registros) ? `${registros.length} archivos; los últimos: ${corto(registros.slice(0, 3).map((x) => ({ filename: x.filename, size: x.size })), 500)}` : (r ? corto(r, 600) : 'no contestó')}`);
    } finally {
      m.cerrar();
    }
    return lineas.join('\n');
  },

  async enviar(impresora, { nombre, contenido, accion, avisar }) {
    const sesion = await conectarAnycubic(impresora.host);

    // Esta impresora sólo recibe para imprimir: subir el archivo la deja "preparando
    // un trabajo" (cama caliente) y habría que ir a su pantalla a cancelarlo.
    if (accion !== 'imprimir') throw new Error('Esta impresora sólo recibe envíos para imprimir. Volvé a mandarlo desde Manager3D (recargá la página si no te ofrece "Imprimir").');

    let mapeo = [];
    const mqttApi = await abrirMqtt(sesion, impresora.host);
    const cancelarPreparacion = () => cancelarTrabajoEnImpresora(mqttApi);

    try {
      // Antes de subir nada: la impresora tiene que estar libre (subir un archivo
      // la mete a preparar un trabajo: si estuviera imprimiendo, se lo interrumpiría)
      // y, con ACE, el material del archivo tiene que estar cargado.
      const est = await estadoDe(mqttApi);
      if (!est.libre) throw new Error(`La impresora está ${est.texto}: esperá a que termine o cancelala desde el panel, y volvé a mandarlo.`);
      if (impresora.tieneAce) {
        const r = await mqttApi.pedir('multiColorBox', 'getInfo', null, { ms: 6000 });
        if (!r) throw new Error('El ACE no respondió: revisá que esté bien conectado a la impresora, o destildá "Tiene ACE".');
        mapeo = armarMapeoAce(filamentosDelGcode(contenido), lugaresDelAce(r.data));
      }

      avisar?.('Subiendo el archivo a la impresora…');
      const { nombre: nombreEnImpresora } = await subirVigilando(sesion, nombre, contenido, async () => {
        avisar?.('La impresora no contesta la subida: cancelando su pantalla de descarga…');
        await cancelarPreparacion();
      });

      avisar?.('Archivo subido. Mandando la orden de imprimir…');
      const respuesta = await mqttApi.pedir('print', 'start', {
        taskid: '-1',
        // La misma url de relleno que usa el programa de referencia: la impresora
        // toma el archivo que ya subimos (por nombre), no lo descarga de ahí.
        url: 'https://anycubic.com/store/aaa.gcode',
        filename: nombreEnImpresora,
        md5: crypto.createHash('md5').update(contenido).digest('hex'),
        filepath: null,
        filetype: 1,
        project_type: 1,
        filesize: contenido.length,
        ams_settings: { use_ams: !!impresora.tieneAce, ams_box_mapping: impresora.tieneAce ? mapeo : [] },
        task_settings: { auto_leveling: 1, vibration_compensation: 0, flow_calibration: 0, dry_mode: 0, timelapse: { status: 0, count: 0, type: 0 } }
      }, { ms: 20000, filtro: (inf, msgid) => inf.msgid === msgid || inf.action === 'start' });

      if (respuesta && respuesta.code && respuesta.code !== 200) {
        // La impresora la rechazó: se cancela para que no quede con la cama
        // calentando y un trabajo a medio preparar.
        await cancelarPreparacion().catch(() => null);
        throw new Error(explicarRechazo(respuesta.msg || respuesta.message || respuesta.code));
      }
      const donde = mapeo.length ? ` (${mapeo.map((x) => `color ${x.paint_index + 1} → lugar ${x.ams_index + 1}`).join(', ')})` : '';
      return respuesta
        ? { estado: 'imprimiendo', mensaje: `Imprimiendo en ${impresora.nombre}${donde}.` }
        : { estado: 'enviado', mensaje: `Subido y orden de impresión enviada a ${impresora.nombre}, pero no confirmó: revisá su pantalla.` };
    } finally {
      mqttApi.cerrar();
    }
  }
};
