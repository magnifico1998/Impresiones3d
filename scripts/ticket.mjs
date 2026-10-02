// Lee tickets de soporte directo de Firestore, para analizarlos desde la
// terminal (o que los lea Claude) sin pasar por el panel.
//
//   node scripts/ticket.mjs          lista los tickets pendientes
//   node scripts/ticket.mjs 12       el ticket TKT-0012 completo, con el log
//
// Necesita una clave de cuenta de servicio de Firebase (ver "Tickets de
// soporte" en docs/operacion.md): la toma de GOOGLE_APPLICATION_CREDENTIALS
// o, si no está, de ~/.manager3d/service-account.json. Usa firebase-admin
// de functions/node_modules (correr antes `npm install` en functions/).

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { textoParaAnalisis, numeroTicket, ESTADOS_TICKET } from '../src/utils/formatoTicket.js';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const proyecto = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8')).projects.Manager3d;
const claveLocal = join(homedir(), '.manager3d', 'service-account.json');
const credencial = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? applicationDefault()
  : existsSync(claveLocal)
    ? cert(JSON.parse(readFileSync(claveLocal, 'utf8')))
    : null;
if (!credencial) {
  console.error(`Falta la clave de la cuenta de servicio: definí GOOGLE_APPLICATION_CREDENTIALS o guardala en ${claveLocal}`);
  process.exit(1);
}
initializeApp({ credential: credencial, projectId: proyecto });
const db = getFirestore();

const aMs = (ts) => (ts?.toMillis ? ts.toMillis() : 0);
const numero = Number(process.argv[2]);

if (!numero) {
  const snap = await db.collection('tickets').where('estado', 'in', ['abierto', 'analisis']).get();
  const lista = snap.docs.map((d) => d.data()).sort((a, b) => a.numero - b.numero);
  if (!lista.length) console.log('No hay tickets pendientes.');
  for (const t of lista) {
    const errores = t.resumen?.errores ? `${t.resumen.errores} errores` : 'sin errores';
    console.log(`${numeroTicket(t.numero)}  ${new Date(aMs(t.creadoEl)).toLocaleString('es-AR')}  ${ESTADOS_TICKET[t.estado]}  ${t.email || t.cuentaId}  ${t.asunto}  (${errores})`);
  }
} else {
  const snap = await db.collection('tickets').where('numero', '==', numero).limit(1).get();
  if (snap.empty) {
    console.error(`No existe ${numeroTicket(numero)}.`);
    process.exit(1);
  }
  const doc = snap.docs[0];
  const t = doc.data();
  const log = (await doc.ref.collection('adjuntos').doc('log').get()).data() || { eventos: [], contexto: {} };
  console.log(textoParaAnalisis({
    ...t,
    creadoEl: aMs(t.creadoEl),
    respuestas: (t.respuestas || []).map((r) => ({ ...r, fecha: aMs(r.fecha) }))
  }, log));
}
