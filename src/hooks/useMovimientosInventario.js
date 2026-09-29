import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';

// Movimientos del inventario de la cuenta (users/{uid}/inventarioMovimientos):
// consumos, ajustes y bajas. Cada movimiento es un doc independiente; el
// stock se calcula sumándolos a lo comprado (ver utils/inventario.js).
export function useMovimientosInventario() {
  const { cuentaId, cfg, user, showToast } = useApp();
  const [movimientos, setMovimientos] = useState([]);
  const habilitado = !!cfg.inventarioHabilitado;

  useEffect(() => {
    if (!cuentaId || !habilitado) {
      setMovimientos([]);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'users', cuentaId, 'inventarioMovimientos'),
      (snap) => setMovimientos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Error al escuchar los movimientos de inventario:', err)
    );
  }, [cuentaId, habilitado]);

  // mov: { clave, nombre, tipo, cantidad (con signo), fecha, nota, pedidoId }
  const agregarMovimiento = async (mov) => {
    try {
      await addDoc(collection(db, 'users', cuentaId, 'inventarioMovimientos'), {
        pedidoId: null,
        nota: '',
        ...mov,
        creadoPor: user?.email || null,
        creadoEl: Timestamp.now()
      });
      return true;
    } catch (e) {
      console.error('Error al guardar el movimiento de inventario:', e);
      showToast('No se pudo guardar el movimiento de inventario.', 'error');
      return false;
    }
  };

  const borrarMovimiento = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', cuentaId, 'inventarioMovimientos', id));
      return true;
    } catch (e) {
      console.error('Error al borrar el movimiento de inventario:', e);
      showToast('No se pudo borrar el movimiento.', 'error');
      return false;
    }
  };

  return { movimientos, agregarMovimiento, borrarMovimiento };
}
