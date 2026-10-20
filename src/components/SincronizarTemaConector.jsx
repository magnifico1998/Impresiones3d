import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useCuenta, useConfig } from '../context/contextos';
import { escucharConectores } from '../utils/impresionDirecta';
import { paletaEfectiva } from '../utils/temaConector';

// Mantiene al día, en cada conector vinculado, los colores de la paleta que se usa en la app (campo `tema` de
// users/{cuenta}/conectores/{id}), para que el panel del conector se vea igual. No muestra nada. Si las reglas
// todavía no permiten escribir ese campo (o la cuenta está en modo lectura) deja de intentarlo en esa sesión.
export default function SincronizarTemaConector() {
  const { cuentaId } = useCuenta();
  const { cfg } = useConfig();
  const [conectores, setConectores] = useState([]);
  const sinPermiso = useRef(false);

  useEffect(() => (cuentaId ? escucharConectores(cuentaId, setConectores) : undefined), [cuentaId]);
  const tema = useMemo(() => paletaEfectiva(cfg), [cfg]);
  const firma = JSON.stringify(tema);

  useEffect(() => {
    if (!cuentaId || sinPermiso.current) return;
    conectores
      .filter((c) => JSON.stringify(c.tema || null) !== firma)
      .forEach((c) => {
        updateDoc(doc(db, 'users', cuentaId, 'conectores', c.id), { tema }).catch(() => { sinPermiso.current = true; });
      });
  }, [cuentaId, conectores, firma, tema]);

  return null;
}
