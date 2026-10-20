import { useEffect } from 'react';
import { confirmar, pedirTexto } from '../components/Dialogos';
import { auth, db, googleProvider, functions } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// Sesión: ingreso con Google o con link al mail, salida, resolución de a qué
// cuenta entra la persona (propia o de un equipo) y carga inicial de los datos.
// El estado (user, cuentaId, loading, loadError...) lo tiene AppProvider; acá
// sólo están la lógica y los efectos que lo mueven.
export function useSesion({
  cuentaId, setUser, setCuentaId, setEsMiembro, setLoading, setDatosCargadosOk, setLoadError, setLoadErrorDetalle,
  cargarConfigDeFirestore, omitirProximoGuardadoConfig, showToast
}) {
  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Sesión iniciada con Google');
    } catch (error) {
      console.error("Error en autenticación:", error);
      showToast('Error al conectar con Google', 'error');
    }
  };

  // Login sin contraseña: le mandamos un link mágico al mail. Guardamos el
  // email en localStorage para poder completar el ingreso automáticamente
  // cuando vuelva a abrir la app en ESTE mismo dispositivo/navegador (ver
  // useEffect de completado más abajo). Si lo abre en otro dispositivo,
  // ese localStorage no va a estar y se le pide el mail de nuevo.
  const loginWithEmailLink = async (email) => {
    try {
      const actionCodeSettings = {
        url: window.location.href.split('?')[0],
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailParaLink', email);
      showToast('Te enviamos un link a tu correo. Abrilo desde este mismo dispositivo.');
    } catch (error) {
      console.error("Error al enviar el link de acceso:", error);
      showToast('No se pudo enviar el link. Revisá el email e intentá de nuevo.', 'error');
      throw error;
    }
  };

  const logout = async () => {
    if (await confirmar('Vas a tener que volver a ingresar para usar la app.', { titulo: '¿Cerrar sesión?', textoConfirmar: 'Cerrar sesión' })) {
      await signOut(auth);
      window.location.reload();
    }
  };

  // Load data from Firestore
  const cargarDatosDeFirestore = async (uid, reintento = false, estadoToken = '') => {
    try {
      console.log("Cargando datos desde Firebase...");
      // Cada sección vive en su propia subcolección (meta/config, clientes,
      // biblioteca, pedidos, compras). Las subcolecciones se crean solas en
      // el primer addCliente/addProducto/addPedido/addCompra; meta/config se
      // inicializa con sus valores default acá si no existe. (El documento
      // monolítico legacy users/{uid} y su migración Fase 1-5 se retiraron
      // cuando ya no quedaba ninguna cuenta sin migrar.)
      await cargarConfigDeFirestore(uid);

      // El próximo cambio de cfg/empresa/idCounter que dispare el efecto de
      // autosave de meta/config va a ser el "eco" de haber cargado datos de
      // la nube recién, no una edición real del usuario — no hace falta
      // volver a guardar lo que ya está guardado.
      omitirProximoGuardadoConfig();
      setLoadError(false);
      setLoadErrorDetalle('');
      setDatosCargadosOk(true);
    } catch (e) {
      // "permission-denied" con una cuenta que sí tiene acceso suele ser un token
      // de sesión vencido o que no llegó a renovarse (red inestable, equipo que
      // estuvo suspendido): se fuerza una renovación y se reintenta una vez antes
      // de mostrar el error.
      if (e?.code === 'permission-denied' && !reintento && auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
          await new Promise((r) => setTimeout(r, 600));
          return cargarDatosDeFirestore(uid, true, 'renovado');
        } catch (errToken) {
          console.error('No se pudo renovar la sesión:', errToken);
          estadoToken = `no se pudo renovar (${errToken?.code || errToken?.message || 'error'})`;
        }
      }
      console.error("Error al cargar datos de Firestore:", e);
      // Detalle para soporte: qué sesión y qué cuenta se estaban usando (sólo el
      // comienzo de cada id), por si no coinciden o la sesión no está verificada.
      const sesion = auth.currentUser;
      const quien = sesion ? ` · sesión ${String(sesion.uid).slice(0, 6)}, cuenta ${String(uid).slice(0, 6)}, email ${sesion.emailVerified ? 'verificado' : 'sin verificar'}${e?.code === 'permission-denied' ? ` · token ${estadoToken || 'sin renovar'}${typeof navigator !== 'undefined' && navigator.onLine === false ? ' · sin red' : ''}` : ''}` : ' · sin sesión';
      setLoadErrorDetalle(`${String(e?.code || e?.message || e).slice(0, 100)}${quien}`.slice(0, 220));

      // CRÍTICO: a propósito NO marcamos datosCargadosOk como true acá.
      // pedidos/compras/biblioteca/etc. siguen en sus valores default
      // (arrays vacíos) porque la carga falló. Si el autosave corriera
      // igual, el próximo guardado pisaría el documento completo en la nube
      // con ese estado vacío, borrando todo el historial real del usuario
      // por lo que puede ser un simple corte de red momentáneo.
      setLoadError(true);
      showToast(
        '⚠ No se pudieron cargar tus datos desde la nube. No seguimos para evitar sobrescribir tu información — probá reintentar.',
        'error',
        10000
      );
    }
  };

  // Permite reintentar la carga manualmente (botón "Reintentar" en la
  // pantalla de error) sin tener que recargar toda la página.
  const reintentarCargaDatos = async () => {
    // Sin cuentaId es que falló la resolución del vínculo de equipo: se repite
    // desde ahí (ver iniciarCuenta).
    if (!cuentaId) {
      if (!auth.currentUser) return;
      setLoading(true);
      await iniciarCuenta(auth.currentUser);
      setLoading(false);
      return;
    }
    setLoading(true);
    await cargarDatosDeFirestore(cuentaId);
    setLoading(false);
  };

  // Resuelve a qué cuenta entra la persona (propia o de un equipo) y carga sus
  // datos. Si no se pudo resolver el vínculo, muestra la pantalla de error con
  // "Reintentar" en vez de entrar a la cuenta propia por las dudas.
  const iniciarCuenta = async (currentUser) => {
    const { idEfectivo, miembro, error } = await resolverCuentaId(currentUser);
    if (error) {
      setCuentaId(null);
      setEsMiembro(false);
      setLoadErrorDetalle(`vínculo de equipo: ${String(error?.code || error?.message || error).slice(0, 100)}`);
      setLoadError(true);
      showToast('⚠ No se pudo verificar tu cuenta de equipo. Probá reintentar.', 'error', 10000);
      return;
    }
    setCuentaId(idEfectivo);
    setEsMiembro(miembro);
    // Una vez por sesión, para que el admin/revendedor pueda ver "hace
    // cuánto no entra" en su panel de consumo (ver
    // registrarUltimoAcceso.js -- no puede ser un write directo acá
    // porque suscripcion/actual tiene escritura cerrada para el
    // cliente). No bloquea el login si falla.
    httpsCallable(functions, 'registrarUltimoAcceso')().catch((e) => {
      console.error('Error al registrar el último acceso:', e);
    });
    await cargarDatosDeFirestore(idEfectivo);
  };

  // Resuelve, a partir del email de Google recién logueado, si esta persona
  // es dueña de su propia cuenta (caso normal) o fue agregada como usuario
  // de la cuenta de otra persona (ver invitacionesMiembro / EmpresaPage
  // "Usuarios con acceso"). El ID del doc es el email en minúsculas, así
  // que es un getDoc puntual, sin queries -- ver firestore.rules y
  // functions/http/gestionarMiembros.js para cómo se crea ese vínculo.
  //
  // Si la lectura del vínculo falla (típico: token vencido o sin renovar tras
  // un F5 -> permission-denied) NO se cae en silencio a la cuenta propia: un
  // miembro terminaría trabajando en una cuenta vacía, con otro plan y otro
  // cupo de G-code. Se renueva el token antes de leer, se reintenta una vez y,
  // si sigue fallando, se devuelve { error } para que se muestre la pantalla
  // de error con "Reintentar".
  const resolverCuentaId = async (currentUser) => {
    if (!currentUser.email) return { idEfectivo: currentUser.uid, miembro: false };
    let invSnap;
    try {
      // Sin red puede fallar: se sigue con el token que haya.
      await currentUser.getIdToken(true).catch(() => {});
      const ref = doc(db, 'invitacionesMiembro', currentUser.email.toLowerCase());
      try {
        invSnap = await getDoc(ref);
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        await currentUser.getIdToken(true);
        await new Promise((r) => setTimeout(r, 600));
        invSnap = await getDoc(ref);
      }
    } catch (e) {
      console.error('Error al resolver el vínculo de equipo:', e);
      return { idEfectivo: null, miembro: false, error: e };
    }
    try {
      if (invSnap.exists() && invSnap.data().estado === 'activo') {
        return { idEfectivo: invSnap.data().ownerUid, miembro: true };
      }
      // Invitación todavía sin aceptar (ver gestionarMiembros.js): se le
      // pregunta a la persona antes de pasarla a la cuenta ajena. "Ahora
      // no" la deja pendiente y entra a su propia cuenta; se le vuelve a
      // preguntar en el próximo ingreso.
      if (invSnap.exists() && invSnap.data().estado === 'pendiente') {
        const inv = invSnap.data();
        const acepta = await confirmar(
          `${inv.ownerEmail || 'Otra cuenta'} te invitó a administrar su emprendimiento en Manager3D. Si aceptás, vas a trabajar sobre SU cuenta (no la tuya) hasta que salgas desde "Mi emprendimiento".`,
          { titulo: 'Invitación a una cuenta compartida', textoConfirmar: 'Aceptar', textoCancelar: 'Ahora no' }
        );
        if (acepta) {
          const res = await httpsCallable(functions, 'responderInvitacion')({ aceptar: true });
          if (res.data?.estado === 'activo') {
            return { idEfectivo: inv.ownerUid, miembro: true };
          }
        }
      }
    } catch (e) {
      console.error('Error al resolver el vínculo de equipo:', e);
    }
    return { idEfectivo: currentUser.uid, miembro: false };
  };

  // Completa el login por link mágico cuando el usuario vuelve del mail.
  // Si el email no está en localStorage (abrió el link en otro dispositivo
  // o navegador distinto al que lo pidió), se lo pedimos manualmente.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    (async () => {
      let email = window.localStorage.getItem('emailParaLink');
      if (!email) {
        email = await pedirTexto('Abriste el link en otro navegador o dispositivo. Confirmá el email con el que pediste el ingreso:', {
          titulo: 'Completar el ingreso',
          tipoInput: 'email',
          placeholder: 'tu@email.com',
          textoConfirmar: 'Ingresar'
        });
      }
      if (!email) return;

      signInWithEmailLink(auth, email, window.location.href)
        .then(() => {
          window.localStorage.removeItem('emailParaLink');
          window.history.replaceState(null, '', window.location.pathname);
          showToast('Sesión iniciada');
        })
        .catch((error) => {
          console.error("Error al completar el login con el link:", error);
          showToast('El link no es válido o ya expiró. Pedí uno nuevo.', 'error');
        });
    })();
  // showToast cambia en cada render y sólo se usa al avisar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load from Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await iniciarCuenta(currentUser);
      } else {
        setCuentaId(null);
        setEsMiembro(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  // Se registra una sola vez al montar: las funciones de arriba se recrean en cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loginWithGoogle, loginWithEmailLink, logout, reintentarCargaDatos };
}
