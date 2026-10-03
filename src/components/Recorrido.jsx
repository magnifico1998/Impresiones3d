import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { iniciarRecorrido } from '../utils/recorrido';
import { fijarEstadoRecorrido } from '../utils/estadoRecorrido';

// Recorrido guiado (utils/recorrido.js), montado una vez en App.
//   - Se ofrece solo a quien nunca lo hizo: en prueba, recién con el perfil
//     completo (antes se ofrece completar el perfil para el plan Boceto).
//   - Si lo cerró antes del final, se vuelve a ofrecer una sola vez, al
//     día siguiente o después.
//   - Se repite con el evento 'iniciar-recorrido' (Soporte, Preguntas frecuentes).
// Lo hecho se guarda por usuario en recorridos/{uid} (así vale en todos sus
// dispositivos): { estado: 'hecho' | 'salteado', veces, actualizadoEl }.

const DIA_MS = 24 * 60 * 60 * 1000;
const DEMORA_INICIO_MS = 1200; // que la app termine de mostrarse

export default function Recorrido() {
  const { user, datosCargadosOk, suscripcion, esMiembro, setActivePage } = useApp();
  const enCurso = useRef(false);
  const registro = useRef(null);

  const empezar = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    const desde = registro.current;
    await iniciarRecorrido({
      setActivePage,
      alTerminar: async (completo) => {
        enCurso.current = false;
        fijarEstadoRecorrido('listo');
        if (!user?.uid) return;
        const nuevo = {
          estado: completo || desde?.estado === 'hecho' ? 'hecho' : 'salteado',
          veces: (desde?.veces || 0) + 1,
          actualizadoEl: Timestamp.now()
        };
        registro.current = nuevo;
        try {
          await setDoc(doc(db, 'recorridos', user.uid), nuevo);
        } catch (e) {
          console.error('No se pudo guardar el recorrido:', e);
        }
      }
    });
  };

  // Al entrar: ¿corresponde ofrecerlo?
  const perfilPendiente = !esMiembro && suscripcion?.estado === 'trial' && !suscripcion?.perfilCompleto;
  useEffect(() => {
    if (!user?.uid || !datosCargadosOk) return undefined;
    let cancelado = false;
    let timer = null;
    getDoc(doc(db, 'recorridos', user.uid))
      .then((snap) => {
        if (cancelado) return;
        const r = snap.exists() ? snap.data() : null;
        registro.current = r;
        const ofrecerDeNuevo = r?.estado === 'salteado' && (r.veces || 0) < 2 && Date.now() - (r.actualizadoEl?.toMillis?.() || 0) > DIA_MS;
        const corresponde = (!r || ofrecerDeNuevo) && !perfilPendiente;
        fijarEstadoRecorrido(corresponde || (!r && perfilPendiente) ? 'pendiente' : 'listo');
        if (corresponde) timer = setTimeout(empezar, DEMORA_INICIO_MS);
      })
      .catch((e) => {
        console.error('No se pudo leer el recorrido:', e);
        fijarEstadoRecorrido('listo');
      });
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, datosCargadosOk, perfilPendiente]);

  useEffect(() => {
    const repetir = () => empezar();
    window.addEventListener('iniciar-recorrido', repetir);
    return () => window.removeEventListener('iniciar-recorrido', repetir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return null;
}
