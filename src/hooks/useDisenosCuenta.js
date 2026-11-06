import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useCuenta, useUi } from '../context/contextos';
import { MAX_BYTES_MINIATURA, MAX_DISENOS, datosDeDiseno, limpiarNombreDiseno } from '../utils/jarrosDisenos';

// Diseños de jarro guardados en la cuenta (users/{uid}/disenosJarro): { nombre, datos (los parámetros del jarro en JSON), miniatura
// (foto chica o null), creadoPor, creadoEl }. Dueño y miembros comparten los diseños. Se escuchan sólo mientras se ve la lista.
export function useDisenosCuenta() {
  const { cuentaId, user } = useCuenta();
  const { showToast } = useUi();
  const [disenos, setDisenos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!cuentaId) { setDisenos([]); setCargando(false); return undefined; }
    return onSnapshot(
      collection(db, 'users', cuentaId, 'disenosJarro'),
      (snap) => {
        setDisenos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));
        setCargando(false);
      },
      (err) => { console.error('Error al escuchar los diseños de jarro:', err); setCargando(false); }
    );
  }, [cuentaId]);

  // Guarda un diseño; con `reemplazarId` pisa uno ya guardado. Devuelve true si se guardó.
  const guardarDiseno = async (nombre, parametros, miniatura, reemplazarId = null) => {
    const limpio = limpiarNombreDiseno(nombre);
    if (!limpio) { showToast('Poné un nombre para el diseño.', 'error'); return false; }
    if (!reemplazarId && disenos.length >= MAX_DISENOS) { showToast(`Podés guardar hasta ${MAX_DISENOS} diseños: borrá alguno para guardar otro.`, 'error'); return false; }
    let datos;
    try { datos = datosDeDiseno(parametros); } catch (e) { showToast(e.message, 'error'); return false; }
    const mini = miniatura && miniatura.length <= MAX_BYTES_MINIATURA ? miniatura : null;
    const campos = { nombre: limpio, datos, miniatura: mini, creadoPor: user?.email || null, creadoEl: Timestamp.now() };
    try {
      if (reemplazarId) await setDoc(doc(db, 'users', cuentaId, 'disenosJarro', reemplazarId), campos);
      else await addDoc(collection(db, 'users', cuentaId, 'disenosJarro'), campos);
      showToast(reemplazarId ? 'Diseño reemplazado.' : 'Diseño guardado en tu cuenta.');
      return true;
    } catch (e) {
      console.error('Error al guardar el diseño:', e);
      showToast('No se pudo guardar el diseño.', 'error');
      return false;
    }
  };

  const borrarDiseno = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', cuentaId, 'disenosJarro', id));
      return true;
    } catch (e) {
      console.error('Error al borrar el diseño:', e);
      showToast('No se pudo borrar el diseño.', 'error');
      return false;
    }
  };

  return { disenos, cargando, guardarDiseno, borrarDiseno };
}
