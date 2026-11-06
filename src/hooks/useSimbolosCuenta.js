import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useCuenta, useUi } from '../context/contextos';
import { MAX_BYTES_SIMBOLO, MAX_SIMBOLOS, contornosAJson, limpiarNombreSimbolo } from '../utils/simbolosPropios';

// Biblioteca de símbolos de la cuenta (users/{uid}/simbolos), para los emblemas de Jarros. Cada símbolo es un doc
// { nombre, datos (contornos en JSON), creadoPor, creadoEl }. Dueño y miembros comparten la biblioteca. Los escucha sólo
// mientras la herramienta está abierta.
export function useSimbolosCuenta() {
  const { cuentaId, user } = useCuenta();
  const { showToast } = useUi();
  const [simbolos, setSimbolos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!cuentaId) { setSimbolos([]); setCargando(false); return undefined; }
    return onSnapshot(
      collection(db, 'users', cuentaId, 'simbolos'),
      (snap) => {
        setSimbolos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')));
        setCargando(false);
      },
      (err) => { console.error('Error al escuchar la biblioteca de símbolos:', err); setCargando(false); }
    );
  }, [cuentaId]);

  // Guarda un símbolo nuevo. Devuelve true si se guardó.
  const guardarSimbolo = async (nombre, contornos) => {
    const limpio = limpiarNombreSimbolo(nombre);
    if (!limpio) { showToast('Poné un nombre para el símbolo.', 'error'); return false; }
    if (simbolos.length >= MAX_SIMBOLOS) { showToast(`La biblioteca admite hasta ${MAX_SIMBOLOS} símbolos: borrá alguno para guardar otro.`, 'error'); return false; }
    if (simbolos.some((s) => String(s.nombre).toLowerCase() === limpio.toLowerCase())) { showToast('Ya hay un símbolo con ese nombre.', 'error'); return false; }
    const datos = contornosAJson(contornos);
    if (datos.length > MAX_BYTES_SIMBOLO) { showToast('El símbolo es demasiado complejo para guardarlo: simplificalo.', 'error'); return false; }
    try {
      await addDoc(collection(db, 'users', cuentaId, 'simbolos'), { nombre: limpio, datos, creadoPor: user?.email || null, creadoEl: Timestamp.now() });
      showToast('Símbolo guardado en tu biblioteca.');
      return true;
    } catch (e) {
      console.error('Error al guardar el símbolo:', e);
      showToast('No se pudo guardar el símbolo.', 'error');
      return false;
    }
  };

  const borrarSimbolo = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', cuentaId, 'simbolos', id));
      return true;
    } catch (e) {
      console.error('Error al borrar el símbolo:', e);
      showToast('No se pudo borrar el símbolo.', 'error');
      return false;
    }
  };

  return { simbolos, cargando, guardarSimbolo, borrarSimbolo };
}
