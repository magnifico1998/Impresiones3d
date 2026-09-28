const forge = require('node-forge');
const { XMLParser } = require('fast-xml-parser');
const { defineSecret } = require('firebase-functions/params');
const { db, Timestamp } = require('./admin');

// Cliente de los web services de ARCA (ex AFIP) para factura electrónica:
//   - WSAA: autenticación. Se firma un pedido (TRA) con el certificado del
//     emisor y ARCA devuelve un ticket (token + sign) que dura 12 horas.
//   - WSFEv1: autorización de comprobantes (CAE), último número emitido y
//     consulta de un comprobante ya emitido.
// Son SOAP; se arman los sobres a mano (son pocos métodos) en vez de sumar
// una librería SOAP entera.

// Certificado (PEM) y clave privada (PEM) del emisor. Se cargan con:
//   firebase functions:secrets:set ARCA_CERT --data-file arca.crt
//   firebase functions:secrets:set ARCA_KEY --data-file arca.key
// El certificado de homologación y el de producción son distintos: al pasar
// a producción se reemplazan los dos secrets y se cambia el entorno en la
// configuración de facturación.
const arcaCert = defineSecret('ARCA_CERT');
const arcaKey = defineSecret('ARCA_KEY');

const URLS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
  }
};

// ARCA a veces tarda; más de esto se trata como "no se sabe si llegó" y
// quien llama tiene que consultar antes de reintentar (ver facturacion.js).
const TIMEOUT_MS = 30000;

// parseTagValue: false deja todo como texto: el CAE tiene 14 dígitos y el
// token/sign son base64, no conviene que el parser los convierta.
const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  ignoreAttributes: true,
  isArray: (nombre) => ['Err', 'Obs', 'Evt', 'FECAEDetResponse'].includes(nombre)
});

class ErrorArca extends Error {
  constructor(mensaje, { errores = [], incierto = false } = {}) {
    super(mensaje);
    this.errores = errores;
    // true = no se sabe si ARCA procesó el pedido (timeout, red caída).
    this.incierto = incierto;
  }
}

async function postSoap(url, soapAction, sobre) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: soapAction },
      body: sobre,
      signal: control.signal
    });
  } catch (e) {
    throw new ErrorArca(`No se pudo conectar con ARCA (${e.name === 'AbortError' ? 'timeout' : e.message}).`, { incierto: true });
  } finally {
    clearTimeout(timer);
  }
  const texto = await res.text();
  const xml = parser.parse(texto);
  const body = xml?.Envelope?.Body;
  if (!body) {
    throw new ErrorArca(`Respuesta inesperada de ARCA (HTTP ${res.status}).`, { incierto: res.status >= 500 });
  }
  if (body.Fault) {
    const e = new ErrorArca(`ARCA: ${body.Fault.faultstring || 'error SOAP'}`);
    e.codigo = String(body.Fault.faultcode || '');
    throw e;
  }
  return body;
}

function escaparXml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Objeto -> XML con prefijo "ar:". El orden de las claves importa: WSFEv1
// valida la secuencia de elementos del esquema.
function aXml(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (Array.isArray(v)) return v.map((item) => aXml({ [k]: item })).join('');
      const contenido = typeof v === 'object' ? aXml(v) : escaparXml(v);
      return `<ar:${k}>${contenido}</ar:${k}>`;
    })
    .join('');
}

// ---------------------------------------------------------------- WSAA

function firmarTra(servicio) {
  const ahora = Date.now();
  // Márgenes de 10 minutos por si el reloj del servidor y el de ARCA no
  // coinciden exacto.
  const tra = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(ahora / 1000)}</uniqueId>` +
    `<generationTime>${new Date(ahora - 10 * 60000).toISOString()}</generationTime>` +
    `<expirationTime>${new Date(ahora + 10 * 60000).toISOString()}</expirationTime>` +
    `</header><service>${servicio}</service></loginTicketRequest>`;

  const cert = forge.pki.certificateFromPem(arcaCert.value());
  const key = forge.pki.privateKeyFromPem(arcaKey.value());
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date(ahora) }
    ]
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

// Ticket en memoria (misma instancia) y en Firestore (entre instancias).
// Guardarlo es obligatorio, no una optimización: mientras haya un ticket
// vigente, WSAA rechaza pedir otro ("alreadyAuthenticated") hasta que venza.
const ticketsEnMemoria = new Map();

async function obtenerTicket(entorno, servicio = 'wsfe') {
  const clave = `${entorno}_${servicio}`;
  // 5 minutos de margen para no usar un ticket que vence en medio de la llamada.
  const vigente = (t) => t && t.expira > Date.now() + 5 * 60000;

  if (vigente(ticketsEnMemoria.get(clave))) return ticketsEnMemoria.get(clave);

  const ref = db.doc(`arcaTickets/${clave}`);
  const snap = await ref.get();
  if (snap.exists && vigente({ expira: snap.data().expira.toMillis() })) {
    const t = { token: snap.data().token, sign: snap.data().sign, expira: snap.data().expira.toMillis() };
    ticketsEnMemoria.set(clave, t);
    return t;
  }

  const sobre = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body>' +
    `<wsaa:loginCms><wsaa:in0>${firmarTra(servicio)}</wsaa:in0></wsaa:loginCms>` +
    '</soapenv:Body></soapenv:Envelope>';

  let body;
  try {
    body = await postSoap(URLS[entorno].wsaa, '', sobre);
  } catch (e) {
    if (e.codigo?.includes('alreadyAuthenticated')) {
      throw new ErrorArca('ARCA dice que ya hay un ticket vigente que no quedó guardado. Hay que esperar a que venza (hasta 12 horas) para volver a pedir uno.');
    }
    throw e;
  }
  const respuesta = parser.parse(body.loginCmsResponse.loginCmsReturn).loginTicketResponse;
  const t = {
    token: respuesta.credentials.token,
    sign: respuesta.credentials.sign,
    expira: new Date(respuesta.header.expirationTime).getTime()
  };
  await ref.set({ token: t.token, sign: t.sign, expira: Timestamp.fromMillis(t.expira), obtenidoEl: Timestamp.now() });
  ticketsEnMemoria.set(clave, t);
  return t;
}

// ---------------------------------------------------------------- WSFEv1

async function llamarWsfe(emisor, metodo, parametros) {
  const ticket = await obtenerTicket(emisor.entorno);
  const sobre = '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body>' +
    `<ar:${metodo}>` +
    aXml({ Auth: { Token: ticket.token, Sign: ticket.sign, Cuit: emisor.cuit }, ...parametros }) +
    `</ar:${metodo}></soap:Body></soap:Envelope>`;
  const body = await postSoap(URLS[emisor.entorno].wsfe, `http://ar.gov.afip.dif.FEV1/${metodo}`, sobre);
  return body[`${metodo}Response`][`${metodo}Result`];
}

const erroresDe = (resultado) => (resultado?.Errors?.Err || []).map((e) => ({ codigo: String(e.Code), mensaje: e.Msg }));

async function ultimoAutorizado(emisor, tipoCbte) {
  const r = await llamarWsfe(emisor, 'FECompUltimoAutorizado', { PtoVta: emisor.ptoVta, CbteTipo: tipoCbte });
  const errores = erroresDe(r);
  if (errores.length) throw new ErrorArca(`ARCA: ${errores[0].mensaje}`, { errores });
  return Number(r.CbteNro);
}

// Devuelve el comprobante emitido o null si ARCA no lo tiene (código 602).
async function consultarComprobante(emisor, tipoCbte, numero) {
  const r = await llamarWsfe(emisor, 'FECompConsultar', {
    FeCompConsReq: { CbteTipo: tipoCbte, CbteNro: numero, PtoVta: emisor.ptoVta }
  });
  const errores = erroresDe(r);
  if (errores.some((e) => e.codigo === '602')) return null;
  if (errores.length) throw new ErrorArca(`ARCA: ${errores[0].mensaje}`, { errores });
  const g = r.ResultGet;
  return {
    resultado: g.Resultado,
    cae: g.CodAutorizacion,
    caeVto: g.FchVto,
    fecha: g.CbteFch,
    docNro: g.DocNro,
    importeTotal: Number(g.ImpTotal)
  };
}

// Pide el CAE de un comprobante (un solo registro por pedido).
// `det` son los campos de FECAEDetRequest, en el orden del esquema.
async function solicitarCae(emisor, tipoCbte, det) {
  const r = await llamarWsfe(emisor, 'FECAESolicitar', {
    FeCAEReq: {
      FeCabReq: { CantReg: 1, PtoVta: emisor.ptoVta, CbteTipo: tipoCbte },
      FeDetReq: { FECAEDetRequest: det }
    }
  });
  const detResp = r.FeDetResp?.FECAEDetResponse?.[0];
  const observaciones = (detResp?.Observaciones?.Obs || []).map((o) => ({ codigo: String(o.Code), mensaje: o.Msg }));
  const errores = erroresDe(r);
  if (detResp?.Resultado === 'A') {
    return { aprobado: true, cae: detResp.CAE, caeVto: detResp.CAEFchVto, observaciones };
  }
  return { aprobado: false, errores: [...errores, ...observaciones] };
}

async function probarConexion(emisor) {
  const dummy = await (async () => {
    const sobre = '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ' +
      'xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:FEDummy/></soap:Body></soap:Envelope>';
    const body = await postSoap(URLS[emisor.entorno].wsfe, 'http://ar.gov.afip.dif.FEV1/FEDummy', sobre);
    return body.FEDummyResponse.FEDummyResult;
  })();
  return dummy;
}

module.exports = {
  arcaCert, arcaKey, ErrorArca,
  ultimoAutorizado, consultarComprobante, solicitarCae, probarConexion
};
