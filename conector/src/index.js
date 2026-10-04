#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';
import tls from 'node:tls';
import { leerConfig, guardarConfig, nuevoId, carpetaDatos } from './config.js';
import { crearNube, vincular } from './nube.js';
import { DRIVERS, driverDe } from './drivers/index.js';
import { PAGINA } from './panel.js';

// Manager3D Conector: corre en una PC del taller. Se vincula a la cuenta con
// un código, toma los trabajos de "Mandar a impresora" y los manda a las
// impresoras de la red local (ver drivers/).
//
// Panel de configuración: http://127.0.0.1:18930 (sólo desde esta PC).

// Redes de empresa que revisan el tráfico (certificado propio, instalado en
// Windows): sin esto el .exe no confía en él y todo da "fetch failed" con
// SELF_SIGNED_CERT_IN_CHAIN. Se suman los certificados del sistema a los de Node.
try {
  if (typeof tls.setDefaultCACertificates === 'function') {
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), ...tls.getCACertificates('system')]);
  }
} catch {
  // Node más viejo o sin acceso al almacén: se sigue con los certificados de Node.
}

const PUERTO = Number(process.env.PUERTO_CONECTOR) || 18930;
const HOSTS_PERMITIDOS = new Set([`127.0.0.1:${PUERTO}`, `localhost:${PUERTO}`]);
const MAX_LOG = 200;

let config = leerConfig();
const log = [];
const registrar = (texto) => {
  const linea = `${new Date().toLocaleTimeString('es-AR')}  ${texto}`;
  log.push(linea);
  if (log.length > MAX_LOG) log.shift();
  console.log(linea);
};

const nube = crearNube({ registrar });

const impresoraPublica = (i) => ({ id: i.id, nombre: i.nombre, tipo: i.tipo, host: i.host || '', serie: i.serie || '', tieneAce: !!i.tieneAce, conCodigo: !!i.codigoAcceso });

function estado() {
  return {
    vinculado: !!config.vinculo,
    conectado: nube.estaConectado(),
    equipo: config.vinculo?.equipo || os.hostname(),
    impresoras: config.impresoras.map(impresoraPublica),
    tipos: Object.values(DRIVERS).map((d) => ({ tipo: d.tipo, nombre: d.nombre, campos: d.campos, puedeImprimir: d.puedeImprimir })),
    log: log.slice(-60),
    datos: carpetaDatos
  };
}

async function leerCuerpo(req) {
  let datos = '';
  for await (const parte of req) {
    datos += parte;
    if (datos.length > 100000) throw new Error('Pedido demasiado grande.');
  }
  return datos ? JSON.parse(datos) : {};
}

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

function datosImpresora(c, id) {
  const tipo = texto(c.tipo, 40);
  driverDe(tipo);
  const imp = { id, nombre: texto(c.nombre, 60) || 'Impresora', tipo, host: texto(c.host, 100), serie: texto(c.serie, 40), tieneAce: !!c.tieneAce };
  const anterior = config.impresoras.find((i) => i.id === id);
  imp.codigoAcceso = texto(c.codigoAcceso, 40) || anterior?.codigoAcceso || '';
  const faltan = driverDe(tipo).campos.filter((campo) => campo !== 'tieneAce' && !imp[campo]);
  if (faltan.length) throw new Error(`Falta completar: ${faltan.join(', ')}.`);
  return imp;
}

async function manejarApi(req, res, url) {
  const responder = (codigo, cuerpo) => {
    res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(cuerpo));
  };
  try {
    if (req.method === 'GET' && url.pathname === '/api/estado') return responder(200, estado());
    if (req.method !== 'POST') return responder(405, { error: 'Método no permitido.' });
    const c = await leerCuerpo(req);

    if (url.pathname === '/api/vincular') {
      const codigo = texto(c.codigo, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const vinculo = await vincular(codigo, texto(c.equipo, 60) || os.hostname());
      config = { ...config, vinculo };
      guardarConfig(config);
      registrar('Conector vinculado a la cuenta.');
      await nube.conectar(config.vinculo, config.impresoras);
      return responder(200, estado());
    }
    if (url.pathname === '/api/desvincular') {
      await nube.desconectar();
      config = { ...config, vinculo: null };
      guardarConfig(config);
      registrar('Conector desvinculado en esta PC (para quitarlo de la cuenta, borralo en Manager3D).');
      return responder(200, estado());
    }
    if (url.pathname === '/api/impresora') {
      const id = texto(c.id, 20) || nuevoId();
      const imp = datosImpresora(c, id);
      const resto = config.impresoras.filter((i) => i.id !== id);
      config = { ...config, impresoras: [...resto, imp] };
      guardarConfig(config);
      await nube.actualizarImpresoras(config.impresoras);
      registrar(`Impresora guardada: ${imp.nombre}.`);
      return responder(200, estado());
    }
    if (url.pathname === '/api/impresora/borrar') {
      config = { ...config, impresoras: config.impresoras.filter((i) => i.id !== c.id) };
      guardarConfig(config);
      await nube.actualizarImpresoras(config.impresoras);
      return responder(200, estado());
    }
    if (url.pathname === '/api/impresora/probar') {
      const imp = config.impresoras.find((i) => i.id === c.id);
      if (!imp) return responder(404, { error: 'No existe esa impresora.' });
      const resultado = await driverDe(imp.tipo).probar(imp);
      registrar(`Prueba ${imp.nombre}: ${resultado}`);
      return responder(200, { ok: true, mensaje: resultado });
    }
    return responder(404, { error: 'No existe.' });
  } catch (e) {
    registrar(`Error: ${e.message}`);
    return responder(400, { error: e.message });
  }
}

const servidor = http.createServer(async (req, res) => {
  // Sólo desde esta PC, y con el Host esperado (evita que una página web
  // ajena le hable al panel a través del navegador).
  if (!HOSTS_PERMITIDOS.has(req.headers.host || '')) {
    res.writeHead(403);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'POST' && req.headers.origin && !HOSTS_PERMITIDOS.has(req.headers.origin.replace(/^https?:\/\//, ''))) {
      res.writeHead(403);
      res.end();
      return;
    }
    await manejarApi(req, res, url);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(PAGINA);
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`El conector ya está abierto: http://127.0.0.1:${PUERTO}`);
    process.exit(0);
  }
  throw e;
});

servidor.listen(PUERTO, '127.0.0.1', async () => {
  const direccion = `http://127.0.0.1:${PUERTO}`;
  registrar(`Manager3D Conector abierto. Panel: ${direccion}`);
  if (!process.argv.includes('--sin-navegador') && process.platform === 'win32') {
    execFile('rundll32', ['url.dll,FileProtocolHandler', direccion], () => {});
  }
  if (config.vinculo) await nube.conectar(config.vinculo, config.impresoras);
  else registrar('Todavía no está vinculado: generá un código en Manager3D (Configuración → Impresión directa).');
});
