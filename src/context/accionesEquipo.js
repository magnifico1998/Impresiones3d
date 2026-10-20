import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// Usuarios con acceso a la cuenta (equipo). ctx: { showToast }
export function crearAccionesEquipo({ showToast }) {
  // ---- Usuarios adicionales por cuenta ("equipo") ----
  // Sólo el dueño gestiona esto (ver EmpresaPage "Usuarios con acceso"); las
  // dos operaciones pasan por Cloud Functions porque son las únicas que
  // pueden escribir invitacionesMiembro (ver firestore.rules) — acá se
  // valida el límite de usuarios del plan contratado antes de crear el
  // vínculo. Mismo patrón que AdminPage.jsx con cambiarEstadoSuscripcion.
  const agregarMiembro = async (email) => {
    try {
      const fn = httpsCallable(functions, 'agregarMiembro');
      await fn({ email });
      showToast(`✓ Invitación enviada: ${email} va a poder administrar tu cuenta cuando la acepte al ingresar.`);
      return true;
    } catch (e) {
      console.error("Error al agregar usuario:", e);
      showToast(e.message || 'No se pudo agregar el usuario.', 'error');
      return false;
    }
  };

  const quitarMiembro = async (email) => {
    try {
      const fn = httpsCallable(functions, 'quitarMiembro');
      await fn({ email });
      showToast(`Se quitó el acceso de ${email}.`, 'info');
      return true;
    } catch (e) {
      console.error("Error al quitar usuario:", e);
      showToast(e.message || 'No se pudo quitar el usuario.', 'error');
      return false;
    }
  };

  // Un miembro deja la cuenta compartida (ver EmpresaPage). Se recarga la
  // página para que todo el estado (listeners, cuentaId) arranque de nuevo
  // sobre su cuenta propia.
  const salirDeCuentaCompartida = async () => {
    try {
      await httpsCallable(functions, 'responderInvitacion')({ aceptar: false });
      window.location.reload();
    } catch (e) {
      console.error('Error al salir de la cuenta compartida:', e);
      showToast(e.message || 'No se pudo salir de la cuenta.', 'error');
    }
  };

  return { agregarMiembro, quitarMiembro, salirDeCuentaCompartida };
}
