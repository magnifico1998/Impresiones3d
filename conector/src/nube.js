import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore, collection, doc, onSnapshot, query, where, runTransaction, updateDoc, Timestamp
} from 'firebase/firestore';
import { getStorage, ref, getBytes } from 'firebase/storage';
import { unzipSync, zipSync } from 'fflate';
import { driverDe, DRIVERS } from './drivers/index.js';
import { FIREBASE, URL_VINCULAR } from './entorno.js';

// Conexión con Manager3D (Firebase) usando el usuario técnico del conector
// (ver functions/http/conectores.js). Escucha la cola
// users/{cuenta}/trabajosImpresion de este conector, baja cada archivo,
// lo descomprime y se lo pasa al driver de la impresora.

// Proyecto de Firebase (producción o prueba): ver entorno.js.
const firebaseConfig = FIREBASE;
export { URL_VINCULAR };

const brotli = promisify(zlib.brotliDecompress);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const LATIDO_MS = 60 * 1000;
// Un envío para imprimir que lleva más de esto en cola no se manda (también lo
// hacen cumplir las reglas de Firestore): la impresión no arranca sola tarde.
const MINUTOS_VENCE_IMPRIMIR = 10;

// Explica una falla de red: "fetch failed" solo no dice nada; la causa (certificado,
// DNS, proxy, conexión rechazada) está en e.cause.
export function motivoDeRed(e) {
  const causa = e?.cause;
  const detalle = causa?.code || causa?.message || '';
  const pista = /CERT|SSL|TLS|issuer|self.signed/i.test(detalle)
    ? ' Esta PC parece usar un certificado de seguridad propio (red de empresa); avisá para ajustarlo.'
    : /ENOTFOUND|EAI_AGAIN/.test(detalle) ? ' No resuelve el nombre del servidor: revisá la conexión a internet.'
      : /ECONNREFUSED|ETIMEDOUT|ECONNRESET|UND_ERR/.test(detalle) ? ' No llega al servidor: revisá internet, el firewall o el proxy.' : '';
  return `${e?.message || e}${detalle ? ` (${detalle})` : ''}.${pista}`;
}

export async function vincular(codigo, equipo) {
  let r;
  try {
    r = await fetch(URL_VINCULAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, equipo }),
      signal: AbortSignal.timeout(20000)
    });
  } catch (e) {
    throw new Error(`No se pudo conectar con Manager3D: ${motivoDeRed(e)}`, { cause: e });
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `No se pudo vincular (HTTP ${r.status}).`);
  return { ...datos, equipo };
}

// Contenido original del archivo guardado (mismo formato que baja la app).
async function bajarArchivo(cuentaId, archivoId, formato) {
  const comprimido = Buffer.from(await getBytes(ref(storage, `users/${cuentaId}/gcode/${archivoId}.br`)));
  const contenido = await brotli(comprimido);
  if (formato !== '3mf') return contenido;
  return Buffer.from(zipSync(unzipSync(new Uint8Array(contenido)), { level: 6 }));
}

export function crearNube({ registrar, alCambiarEstado }) {
  let vinculo = null;
  let impresoras = [];
  let cortarCola = null;
  let latido = null;
  const enCurso = new Set();
  let conectado = false;

  const conectorRef = () => doc(db, 'users', vinculo.cuentaId, 'conectores', vinculo.conectorId);

  // Lista de impresoras que ve la app (sin IP ni códigos de acceso).
  async function informarImpresoras(estados = {}) {
    if (!vinculo || !conectado) return;
    try {
      await updateDoc(conectorRef(), {
        ultimaConexion: Timestamp.now(),
        version: '1.0.0',
        impresoras: impresoras.map((i) => {
          const d = DRIVERS[i.tipo];
          return {
            id: i.id, nombre: i.nombre, tipo: i.tipo,
            formatos: d?.formatos || [], puedeImprimir: !!d?.puedeImprimir, abre: !!d?.abre, guarda: !!d?.guarda,
            ...(estados[i.id] ? { estado: estados[i.id] } : {})
          };
        })
      });
    } catch (e) {
      registrar(`No se pudo informar a Manager3D: ${e.message}`);
    }
  }

  async function procesar(trabajoRef, trabajo) {
    if (enCurso.has(trabajoRef.id)) return;
    enCurso.add(trabajoRef.id);
    const actualizar = (cambios) => updateDoc(trabajoRef, { ...cambios, actualizadoEl: Timestamp.now() }).catch((e) => registrar(`No se pudo actualizar el trabajo: ${e.message}`));
    try {
      // Se toma con una transacción: si la app lo canceló justo, no se manda.
      const tomado = await runTransaction(db, async (tx) => {
        const s = await tx.get(trabajoRef);
        if (!s.exists() || s.data().estado !== 'pendiente') return 'no';
        const d = s.data();
        const enCola = Date.now() - (d.creadoEl?.toMillis?.() || Date.now());
        if (d.accion === 'imprimir' && enCola > MINUTOS_VENCE_IMPRIMIR * 60 * 1000) {
          tx.update(trabajoRef, {
            estado: 'vencido',
            mensaje: `Venció: estuvo más de ${MINUTOS_VENCE_IMPRIMIR} minutos en cola con el conector cerrado. No se imprimió; volvé a mandarlo con el conector abierto.`,
            actualizadoEl: Timestamp.now()
          });
          return 'vencido';
        }
        tx.update(trabajoRef, { estado: 'enviando', mensaje: 'Bajando el archivo…', actualizadoEl: Timestamp.now() });
        return 'ok';
      });
      if (tomado === 'vencido') registrar(`Envío vencido, no se imprime: ${trabajo.nombre} → ${trabajo.impresoraNombre}`);
      if (tomado !== 'ok') return;

      const impresora = impresoras.find((i) => i.id === trabajo.impresoraId);
      if (!impresora) throw new Error('Esa impresora ya no está cargada en el conector.');
      const driver = driverDe(impresora.tipo);
      if (!driver.formatos.includes(trabajo.formato)) throw new Error(`${impresora.nombre} no acepta archivos ${trabajo.formato === '3mf' ? '.3mf' : '.gcode'}.`);

      registrar(`Trabajo ${trabajo.nombre} → ${impresora.nombre} (${trabajo.accion})`);
      const contenido = await bajarArchivo(vinculo.cuentaId, trabajo.archivoId, trabajo.formato);
      await actualizar({ mensaje: `Mandando a ${impresora.nombre}…` });
      const resultado = await driver.enviar(impresora, {
        nombre: trabajo.nombre, contenido, accion: trabajo.accion, opciones: trabajo.opciones || {},
        // El driver va contando en qué paso está (se ve en la app).
        avisar: (mensaje) => actualizar({ mensaje })
      });
      await actualizar({ estado: resultado.estado, mensaje: resultado.mensaje });
      registrar(`✓ ${resultado.mensaje}`);
    } catch (e) {
      registrar(`✗ ${trabajo.nombre}: ${e.message}`);
      await actualizar({ estado: 'error', mensaje: String(e.message || e).slice(0, 300) });
    } finally {
      enCurso.delete(trabajoRef.id);
      alCambiarEstado?.();
    }
  }

  async function conectar(nuevoVinculo, nuevasImpresoras) {
    await desconectar();
    vinculo = nuevoVinculo;
    impresoras = nuevasImpresoras;
    if (!vinculo) return;
    try {
      await signInWithEmailAndPassword(auth, vinculo.email, vinculo.password);
    } catch (e) {
      conectado = false;
      registrar(`No se pudo entrar a Manager3D (${e.code || e.message}). Si desvinculaste este conector, vinculalo de nuevo.`);
      alCambiarEstado?.();
      return;
    }
    conectado = true;
    registrar(`Conectado a Manager3D como "${vinculo.equipo}".`);
    await informarImpresoras();
    latido = setInterval(() => informarImpresoras(), LATIDO_MS);

    cortarCola = onSnapshot(
      query(collection(db, 'users', vinculo.cuentaId, 'trabajosImpresion'),
        where('conectorId', '==', vinculo.conectorId), where('estado', '==', 'pendiente')),
      (snap) => snap.docs.forEach((d) => procesar(d.ref, d.data())),
      (e) => registrar(`Se cortó la cola de trabajos: ${e.message}`)
    );
    alCambiarEstado?.();
  }

  async function desconectar() {
    cortarCola?.();
    cortarCola = null;
    clearInterval(latido);
    if (conectado) await signOut(auth).catch(() => {});
    conectado = false;
  }

  return {
    conectar,
    desconectar,
    estaConectado: () => conectado,
    actualizarImpresoras: (lista) => {
      impresoras = lista;
      return informarImpresoras();
    }
  };
}
