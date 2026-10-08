import { setDoc as setDocFS, updateDoc as updateDocFS, deleteDoc as deleteDocFS } from 'firebase/firestore';

// Escrituras de Firestore que no dejan la pantalla colgada con una conexión mala.
//
// Con la copia local activada, Firestore guarda el cambio en este equipo al
// instante y lo manda a la nube apenas puede, pero la promesa de setDoc/updateDoc/
// deleteDoc recién se resuelve cuando la NUBE confirma. Con microcortes eso puede
// tardar minutos y el "Guardando…" no termina nunca. Estas versiones esperan hasta
// 6 segundos la confirmación; si no llega, dan el cambio por guardado en el equipo
// (se avisa que quedó pendiente) y el SDK lo sincroniza solo al volver la
// conexión. Si la nube lo rechaza (por ejemplo una regla o un límite del plan),
// el error llega igual: de inmediato si fue antes de los 6 s, o por el aviso de
// error tardío si fue después.
//
// El contexto registra los avisos con configurarEscrituraTolerante.

const ESPERA_CONFIRMACION_MS = 6000;
let avisos = {};

export const configurarEscrituraTolerante = (callbacks) => { avisos = callbacks || {}; };

export function tolerante(promesa) {
  return new Promise((resolve, reject) => {
    let resuelta = false;
    const temporizador = setTimeout(() => {
      if (resuelta) return;
      resuelta = true;
      avisos.pendiente?.();
      resolve();
    }, ESPERA_CONFIRMACION_MS);
    promesa.then(
      () => {
        if (resuelta) { avisos.sincronizado?.(); return; }
        resuelta = true;
        clearTimeout(temporizador);
        resolve();
      },
      (error) => {
        clearTimeout(temporizador);
        if (!resuelta) { resuelta = true; reject(error); return; }
        avisos.errorTardio?.(error);
      }
    );
  });
}

export const guardarDoc = (...args) => tolerante(setDocFS(...args));
export const actualizarDoc = (...args) => tolerante(updateDocFS(...args));
export const borrarDoc = (...args) => tolerante(deleteDocFS(...args));
export const confirmarLote = (lote) => tolerante(lote.commit());
