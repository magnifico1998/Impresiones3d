import { onSnapshot } from 'firebase/firestore';
import { auth } from '../firebase';

// onSnapshot que se reengancha solo. Cuando un listener de Firestore falla (por
// ejemplo permission-denied porque la sesión no llegó a renovarse en medio de un
// microcorte), el SDK lo da por terminado y la pantalla se queda sin datos hasta
// recargar. Acá se renueva la sesión y se vuelve a escuchar, con esperas
// crecientes (2, 4, 8, 16, 30 s) y hasta 5 intentos: más que eso ya no es un
// corte sino un problema real (cuenta suspendida, falta de permiso) y se deja
// de insistir. Mismos parámetros que onSnapshot(ref, alDato, alError).
//   → devuelve la función para dejar de escuchar, igual que onSnapshot.
export function escucharConReintento(ref, alDato, alError) {
  let cancelado = false;
  let baja = null;
  let temporizador = null;
  let intentos = 0;

  const iniciar = () => {
    baja = onSnapshot(
      ref,
      (snapshot) => {
        intentos = 0;
        alDato(snapshot);
      },
      (error) => {
        alError?.(error);
        if (cancelado || intentos >= 5) return;
        intentos += 1;
        const espera = Math.min(30000, 2000 * 2 ** (intentos - 1));
        temporizador = setTimeout(async () => {
          if (cancelado) return;
          try { await auth.currentUser?.getIdToken(true); } catch { /* sin red: se reintenta igual */ }
          if (!cancelado) iniciar();
        }, espera);
      }
    );
  };

  iniciar();
  return () => {
    cancelado = true;
    clearTimeout(temporizador);
    baja?.();
  };
}
