import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, orderBy, where } from 'firebase/firestore';

// Escuchas en tiempo real de Firestore: las colecciones de la cuenta, el
// contenido compartido (FAQ), el estado de la suscripción y el plan, el equipo
// con acceso y lo del catálogo web. Sólo leen: las escrituras están en
// accionesDatos.js y en AppContext.jsx.
export function useDatosEnVivo({ user, cuentaId, esMiembro, datosCargadosOk }) {
  const [pedidos, setPedidos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [biblioteca, setBiblioteca] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [faq, setFaq] = useState([]);
  const [catalogoConfig, setCatalogoConfig] = useState(null);
  const [solicitudesWeb, setSolicitudesWeb] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [suscripcion, setSuscripcion] = useState(null);
  const [planContratado, setPlanContratado] = useState(null);
  const [consumoActual, setConsumoActual] = useState(null);

  // Chequeo de permisos de administrador: escuchamos en tiempo real el doc
  // admins/{email} (ID = email en minúsculas). Si existe, el usuario es
  // admin; si no, o si cambia (se lo quitan mientras tiene la app abierta),
  // se refleja al toque sin necesidad de recargar. Ver firestore.rules:
  // sólo puede leer su propio doc (o el listado completo si ya es admin),
  // y nadie puede escribir esta colección desde el cliente.
  useEffect(() => {
    if (!user || !user.email) {
      setIsAdmin(false);
      return;
    }
    const adminRef = doc(db, 'admins', user.email.toLowerCase());
    const unsubscribeAdmin = onSnapshot(
      adminRef,
      (snap) => setIsAdmin(snap.exists()),
      (err) => {
        console.error('Error verificando permisos de administrador:', err);
        setIsAdmin(false);
      }
    );
    return unsubscribeAdmin;
  }, [user]);

  // Estado de la suscripción propia: trial/activa/lectura/suspendida. Lo
  // escuchamos en tiempo real para que el cartel de Resumen (y cualquier
  // bloqueo de UI) reaccione al toque si un admin activa la cuenta o si
  // la función programada la pasa a modo lectura mientras la app está
  // abierta, sin necesidad de recargar.
  useEffect(() => {
    if (!cuentaId) {
      setSuscripcion(null);
      return;
    }
    const subRef = doc(db, 'users', cuentaId, 'suscripcion', 'actual');
    const unsubscribeSub = onSnapshot(
      subRef,
      (snap) => setSuscripcion(snap.exists() ? snap.data() : null),
      (err) => {
        console.error('Error al escuchar la suscripción:', err);
        setSuscripcion(null);
      }
    );
    return unsubscribeSub;
  }, [cuentaId]);

  // Plan contratado (para mostrar nombre/precio/límites en Resumen y en
  // "Mi emprendimiento"). Depende de suscripcion.planId, así que se
  // re-suscribe solo cuando cambia el plan asignado, no en cada cambio de
  // otra cosa dentro de suscripcion.
  useEffect(() => {
    if (!suscripcion?.planId) {
      setPlanContratado(null);
      return;
    }
    const planRef = doc(db, 'planes', suscripcion.planId);
    const unsubscribePlan = onSnapshot(
      planRef,
      (snap) => setPlanContratado(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => {
        console.error('Error al escuchar el plan contratado:', err);
        setPlanContratado(null);
      }
    );
    return unsubscribePlan;
  }, [suscripcion?.planId]);

  // Consumo del ciclo de facturación vigente (pedidos, aperturas de
  // catálogo, monto facturado) -- lo incrementan las Cloud Functions, acá
  // sólo lo leemos para mostrarlo. Depende de suscripcion.cicloId, así que
  // al arrancar un ciclo nuevo se cambia solo de documento.
  useEffect(() => {
    if (!cuentaId || !suscripcion?.cicloId) {
      setConsumoActual(null);
      return;
    }
    const contadorRef = doc(db, 'users', cuentaId, 'suscripcion', 'actual', 'contadores', suscripcion.cicloId);
    const unsubscribeContador = onSnapshot(
      contadorRef,
      (snap) => setConsumoActual(snap.exists() ? snap.data() : { pedidosCreados: 0, aperturasCatalogo: 0, montoFacturado: 0 }),
      (err) => {
        console.error('Error al escuchar el consumo del ciclo:', err);
        setConsumoActual(null);
      }
    );
    return unsubscribeContador;
  }, [cuentaId, suscripcion?.cicloId]);

  // Usuarios con acceso a esta cuenta (ver EmpresaPage "Usuarios con
  // acceso"). Sólo lo necesita el dueño para gestionar su equipo -- un
  // miembro no puede listar esto (ver firestore.rules: sólo el dueño puede
  // leer el conjunto completo vía la query ownerUid == cuentaId).
  useEffect(() => {
    if (!cuentaId || esMiembro) {
      setMiembros([]);
      return;
    }
    const q = query(collection(db, 'invitacionesMiembro'), where('ownerUid', '==', cuentaId));
    const unsubscribeMiembros = onSnapshot(
      q,
      (snapshot) => setMiembros(snapshot.docs.map(d => ({ ...d.data(), _docId: d.id }))),
      (err) => {
        console.error('Error al escuchar los usuarios con acceso:', err);
        setMiembros([]);
      }
    );
    return unsubscribeMiembros;
  }, [cuentaId, esMiembro]);

  // Listener en tiempo real para la subcolección de compras (Fase 5, la
  // última sección en migrar). Mismo criterio que clientes/biblioteca/
  // pedidos: sin detección de eco por timestamp global — cada documento de
  // compra es independiente, no hay riesgo de que se pisen entre sí.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const colRef = collection(db, "users", cuentaId, "compras");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setCompras(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de compras:", error);
      }
    );

    return () => unsubscribe();
  }, [cuentaId, datosCargadosOk]);

  // Listener en tiempo real para la subcolección de presupuestos, mismo
  // criterio que compras.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const colRef = collection(db, "users", cuentaId, "presupuestos");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setPresupuestos(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de presupuestos:", error);
      }
    );

    return () => unsubscribe();
  }, [cuentaId, datosCargadosOk]);

  // Listener en tiempo real para la subcolección de clientes (Fase 2).
  // A diferencia de los otros listeners, acá no hace falta el mecanismo de
  // "timestamp propio vs ajeno": cada documento de cliente se escribe y
  // sincroniza de forma independiente, así que no hay riesgo de que un
  // guardado pise el trabajo de otro cliente en simultáneo (el problema que
  // sí existía con el array monolítico). Simplificación a propósito: no
  // mostramos el toast de "actualizado desde otra sesión" acá porque con
  // documentos independientes sería ruidoso (se dispararía en cada
  // add/update/remove propio también); el estado local simplemente refleja
  // lo que hay en Firestore en todo momento, incluida la escritura local
  // optimista antes de la confirmación del servidor.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const colRef = collection(db, "users", cuentaId, "clientes");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setClientes(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de clientes:", error);
      }
    );

    return () => unsubscribe();
  }, [cuentaId, datosCargadosOk]);

  // Listener en tiempo real para la colección global "faq". A diferencia
  // de las demás colecciones de acá abajo, no depende de cuentaId ni de
  // datosCargadosOk -- no es dato de una cuenta, sino contenido compartido
  // que cualquier usuario logueado puede leer (ver firestore.rules).
  useEffect(() => {
    if (!user) {
      setFaq([]);
      return;
    }

    const colRef = collection(db, "faq");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setFaq(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de faq:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);


  // Listener en tiempo real para la subcolección de biblioteca (Fase 3).
  // Mismo criterio que clientes en Fase 2: sin detección de eco por
  // timestamp (cada producto es independiente), sin toast de "otra sesión"
  // por ser potencialmente ruidoso con muchos productos.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const colRef = collection(db, "users", cuentaId, "biblioteca");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setBiblioteca(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de biblioteca:", error);
      }
    );

    return () => unsubscribe();
  }, [cuentaId, datosCargadosOk]);

  // Listener en tiempo real para la subcolección de pedidos (Fase 4).
  // Mismo criterio que clientes/biblioteca: sin detección de eco por
  // timestamp global — acá es justamente donde más valía la pena, porque
  // era la sección que disparaba el bug de la race condition original.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const colRef = collection(db, "users", cuentaId, "pedidos");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setPedidos(snapshot.docs.map(d => d.data()));
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de pedidos:", error);
      }
    );

    return () => unsubscribe();
  }, [cuentaId, datosCargadosOk]);

  // Listener de la config pública del catálogo web de ESTA tienda (colores,
  // nombre, si está activo). Sólo se suscribe con sesión iniciada porque es
  // la pantalla de administración la que la necesita en vivo; el catálogo
  // público (/catalogo/{uid}, sin login) la lee por su cuenta con
  // getDoc/onSnapshot propio, sin pasar por este Context.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const ref = doc(db, "catalogoTiendas", cuentaId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setCatalogoConfig(snap.exists() ? snap.data() : null);
      },
      (error) => {
        console.error("Error en la suscripción de catalogoConfig:", error);
      }
    );

    return () => unsubscribe();
  }, [cuentaId, datosCargadosOk]);

  // Listener de las solicitudes que llegan desde el catálogo web de ESTA
  // tienda. Subcolección bajo catalogoTiendas/{uid} (no bajo users/{uid})
  // porque la escribe gente sin login; acá sólo leemos (requiere estar
  // autenticado como el dueño de esa tienda, ver reglas de Firestore).
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const colRef = query(collection(db, "catalogoTiendas", cuentaId, "solicitudes"), orderBy("creado", "desc"));
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        setSolicitudesWeb(snapshot.docs.map(d => ({ ...d.data(), _docId: d.id })));
      },
      (error) => {
        console.error("Error en la suscripción de catalogoSolicitudes:", error);
      }
    );

    return () => unsubscribe();
  }, [cuentaId, datosCargadosOk]);

  return { pedidos, compras, presupuestos, biblioteca, clientes, faq, catalogoConfig, solicitudesWeb, miembros, isAdmin, suscripcion, planContratado, consumoActual };
}
