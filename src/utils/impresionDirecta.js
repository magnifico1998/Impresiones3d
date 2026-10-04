import { addDoc, collection, deleteDoc, doc, onSnapshot, Timestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

// Impresión directa: la app pone en una cola (users/{cuenta}/trabajosImpresion)
// lo que hay que mandar, y el "Manager3D Conector" (carpeta conector/), que
// corre en una PC del taller, lo manda a la impresora por la red local.
// Los conectores se ven en users/{cuenta}/conectores (los crea la función
// vincularConector, ver functions/http/conectores.js).

// Se considera conectado si hizo su latido (cada 60 s) en los últimos 3 minutos.
export const MS_CONECTOR_ACTIVO = 3 * 60 * 1000;

export const conectorActivo = (c, ahora = Date.now()) => (c?.ultimaConexion?.toMillis?.() || 0) > ahora - MS_CONECTOR_ACTIVO;

export const ESTADOS_TRABAJO = {
  pendiente: { texto: 'En cola', color: 'var(--text3)' },
  enviando: { texto: 'Enviando…', color: 'var(--text3)' },
  enviado: { texto: 'Enviado', color: 'var(--accent)' },
  imprimiendo: { texto: 'Imprimiendo', color: 'var(--accent)' },
  error: { texto: 'Error', color: 'var(--danger)' },
  cancelado: { texto: 'Cancelado', color: 'var(--text3)' }
};

export const escucharConectores = (cuentaId, alCambiar) => onSnapshot(
  collection(db, 'users', cuentaId, 'conectores'),
  (snap) => alCambiar(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  (err) => console.error('Error al escuchar los conectores:', err)
);

export const escucharTrabajos = (cuentaId, alCambiar) => onSnapshot(
  collection(db, 'users', cuentaId, 'trabajosImpresion'),
  (snap) => alCambiar(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  (err) => console.error('Error al escuchar los trabajos de impresión:', err)
);

export async function pedirCodigoConector() {
  const { data } = await httpsCallable(functions, 'crearCodigoConector')();
  return data; // { codigo, expira, minutos }
}

export const desvincularConector = (cuentaId, conectorId) => deleteDoc(doc(db, 'users', cuentaId, 'conectores', conectorId));
export const renombrarConector = (cuentaId, conectorId, equipo) => updateDoc(doc(db, 'users', cuentaId, 'conectores', conectorId), { equipo: String(equipo).trim().slice(0, 60) });

// Pone un trabajo en la cola. accion: 'subir' (queda en la impresora para
// elegirlo en su pantalla) o 'imprimir'.
export function mandarAImpresora({ cuentaId, uid, archivo, conector, impresora, accion }) {
  const ahora = Timestamp.now();
  return addDoc(collection(db, 'users', cuentaId, 'trabajosImpresion'), {
    archivoId: archivo.id,
    productoId: archivo.productoId,
    nombre: archivo.nombre,
    formato: archivo.formato,
    conectorId: conector.id,
    impresoraId: impresora.id,
    impresoraNombre: impresora.nombre,
    accion,
    opciones: {},
    estado: 'pendiente',
    creadoEl: ahora,
    creadoPor: uid,
    actualizadoEl: ahora
  });
}

export const cancelarTrabajo = (cuentaId, trabajoId) => updateDoc(doc(db, 'users', cuentaId, 'trabajosImpresion', trabajoId), { estado: 'cancelado', actualizadoEl: Timestamp.now() });
export const borrarTrabajo = (cuentaId, trabajoId) => deleteDoc(doc(db, 'users', cuentaId, 'trabajosImpresion', trabajoId));

// Impresoras que reciben este archivo, de todos los conectores activos.
export function impresorasPara(archivo, conectores) {
  const lista = [];
  conectores.forEach((c) => {
    (c.impresoras || []).forEach((i) => {
      if (!i.formatos || i.formatos.includes(archivo.formato)) lista.push({ conector: c, impresora: i, activo: conectorActivo(c) });
    });
  });
  return lista;
}
