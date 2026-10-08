import { runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

// Escrituras de Firestore que SOLO se dan por hechas cuando la nube las confirmó.
//
// Con la copia local activada, setDoc/updateDoc/deleteDoc/batch.commit guardan el
// cambio en este equipo y lo mandan "cuando pueden": sin conexión quedan en cola y
// recién se aplican horas o días después, aunque la pantalla ya mostró el cambio como
// guardado (eso ya nos trajo problemas). Acá cada escritura va como una transacción de
// sólo escritura, que no se encola: o la nube la confirma, o falla en el momento y
// quien guardó se entera. Tope de espera: 20 segundos.
//
// Un fallo de conexión (sin red, microcorte, demora) llega como un Error con
// code 'conexion'; el resto de los errores (permisos, límites del plan) pasan tal cual.
// Si el corte llega justo en el instante del envío, la nube todavía puede aplicar ese
// cambio: el aviso lo dice.
//
// Se importan con los mismos nombres que Firestore: guardarDoc ≈ setDoc, actualizarDoc ≈
// updateDoc, borrarDoc ≈ deleteDoc, nuevoLote ≈ writeBatch (máx. 500 escrituras).

const ESPERA_CONFIRMACION_MS = 20000;
let avisos = {};

export const configurarEscrituraConfirmada = (callbacks) => { avisos = callbacks || {}; };

export const MENSAJE_SIN_CONEXION = 'La conexión con la nube es deficiente o se cortó y el cambio no se pudo confirmar. Verificá tu conexión y volvé a intentar; antes de repetirlo, revisá que no haya quedado cargado.';

const errorDeConexion = (causa) => Object.assign(new Error(MENSAJE_SIN_CONEXION), { code: 'conexion', causa });
const esErrorDeRed = (e) => ['unavailable', 'deadline-exceeded', 'cancelled', 'aborted'].includes(e?.code) || /offline|network|timeout/i.test(String(e?.message || ''));

function confirmada(escribir) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    avisos.falloDeRed?.();
    return Promise.reject(errorDeConexion());
  }
  return new Promise((resolve, reject) => {
    let terminada = false;
    const temporizador = setTimeout(() => {
      if (terminada) return;
      terminada = true;
      avisos.falloDeRed?.();
      reject(errorDeConexion());
    }, ESPERA_CONFIRMACION_MS);
    runTransaction(db, async (t) => { escribir(t); }).then(
      () => {
        if (terminada) return;
        terminada = true;
        clearTimeout(temporizador);
        avisos.confirmada?.();
        resolve();
      },
      (error) => {
        if (terminada) return;
        terminada = true;
        clearTimeout(temporizador);
        if (esErrorDeRed(error)) { avisos.falloDeRed?.(); reject(errorDeConexion(error)); return; }
        reject(error);
      }
    );
  });
}

export const guardarDoc = (ref, datos, opciones) => confirmada((t) => (opciones ? t.set(ref, datos, opciones) : t.set(ref, datos)));
export const actualizarDoc = (ref, cambios) => confirmada((t) => t.update(ref, cambios));
export const borrarDoc = (ref) => confirmada((t) => t.delete(ref));

// Lote con la misma interfaz que writeBatch (set / update / delete / commit).
export function nuevoLote() {
  const operaciones = [];
  const lote = {
    set(ref, datos, opciones) { operaciones.push((t) => (opciones ? t.set(ref, datos, opciones) : t.set(ref, datos))); return lote; },
    update(ref, cambios) { operaciones.push((t) => t.update(ref, cambios)); return lote; },
    delete(ref) { operaciones.push((t) => t.delete(ref)); return lote; },
    commit() {
      if (!operaciones.length) return Promise.resolve();
      return confirmada((t) => operaciones.forEach((op) => op(t)));
    }
  };
  return lote;
}
