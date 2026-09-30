import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, Timestamp, writeBatch } from 'firebase/firestore';
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

  // Varios movimientos de una vez (la carga inicial): en lotes, porque un
  // batch de Firestore admite hasta 500 escrituras. Si falla un lote, los
  // anteriores ya quedaron guardados: se avisa cuántos.
  const TAMANO_LOTE = 450;
  const agregarMovimientos = async (lista) => {
    let guardados = 0;
    try {
      for (let i = 0; i < lista.length; i += TAMANO_LOTE) {
        const batch = writeBatch(db);
        for (const mov of lista.slice(i, i + TAMANO_LOTE)) {
          batch.set(doc(collection(db, 'users', cuentaId, 'inventarioMovimientos')), {
            pedidoId: null, nota: '', ...mov, creadoPor: user?.email || null, creadoEl: Timestamp.now()
          });
        }
        await batch.commit();
        guardados = Math.min(lista.length, i + TAMANO_LOTE);
      }
      return true;
    } catch (e) {
      console.error('Error al guardar los movimientos de inventario:', e);
      showToast(guardados ? `Se guardaron ${guardados} de ${lista.length} movimientos; el resto falló.` : 'No se pudieron guardar los movimientos de inventario.', 'error');
      return false;
    }
  };

  const borrarMovimientos = async (ids) => {
    try {
      for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
        const batch = writeBatch(db);
        ids.slice(i, i + TAMANO_LOTE).forEach((id) => batch.delete(doc(db, 'users', cuentaId, 'inventarioMovimientos', id)));
        await batch.commit();
      }
      return true;
    } catch (e) {
      console.error('Error al borrar los movimientos de inventario:', e);
      showToast('No se pudieron borrar los movimientos.', 'error');
      return false;
    }
  };

  return { movimientos, agregarMovimiento, agregarMovimientos, borrarMovimiento, borrarMovimientos };
}
