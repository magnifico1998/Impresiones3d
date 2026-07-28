import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useApp } from '../context/AppContext';
import { db, functions } from '../firebase';
import { collection, collectionGroup, onSnapshot, doc, updateDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import ModalPlan from './modals/ModalPlan';
import ModalDatosSuscriptor from './modals/ModalDatosSuscriptor';
import ModalPlantillaEmail from './modals/ModalPlantillaEmail';

// Panel de administración: sólo lo ven los emails presentes en la
// colección Firestore "admins" (ver App.jsx -> guard de isAdmin y
// firestore.rules -> match /admins/{email}).
//
// Con modoRevendedor=true (ver App.jsx, ruta 'revendedor') este mismo
// componente se reusa para el panel acotado de un suscriptor habilitado
// como revendedor: mismas acciones (ejecutarAccion / cambiarEstadoSuscripcion,
// que ya valida server-side que sólo pueda tocar SUS suscriptores), pero
// sólo ve su propia cartera y no las secciones de gestión general (Planes,
// Revendedores, Plantillas, Administradores, Borrar cuenta).
export default function AdminPage({ modoRevendedor = false }) {
  const { user, showToast, suscripcion } = useApp();
  // Código propio si esta cuenta es un revendedor (independientemente de
  // si además es admin) -- lo usamos para filtrar "mi cartera" en modo
  // revendedor y para prellenar el formulario de habilitar/editar en el
  // panel admin.
  const miCodigoRevendedor = suscripcion?.codigoRevendedor || null;
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [errorAdmins, setErrorAdmins] = useState(false);

  const [cuentas, setCuentas] = useState([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);
  const [accionEnCurso, setAccionEnCurso] = useState(null); // uid+accion en curso, para deshabilitar el botón
  const [contadoresPorUid, setContadoresPorUid] = useState({});
  const [cargandoConsumoUid, setCargandoConsumoUid] = useState(null);

  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true);

  // Plan elegido en el <select> de cada solicitud de contacto, para poder
  // activar directamente a un cliente nuevo sin esperar a que aparezca en
  // la tabla de Suscripciones (lo cual, para una cuenta legacy sin
  // suscripcion/actual, nunca iba a pasar antes de este fix).
  const [planSeleccionadoPorSolicitud, setPlanSeleccionadoPorSolicitud] = useState({});

  // % de descuento (ganancia del revendedor) para la próxima activación de
  // cada solicitud/cuenta -- sólo importa cuando esa venta se atribuye a un
  // revendedor (ver cambiarEstadoSuscripcion.js). Se prellena con el
  // default del revendedor para ese plan (revendedores/{codigo}.descuentosPorPlan)
  // apenas se conoce, pero queda editable por venta.
  const [descuentoPorSolicitud, setDescuentoPorSolicitud] = useState({});
  const [descuentoPorCuenta, setDescuentoPorCuenta] = useState({});
  // Código de revendedor cargado a mano por el admin en una solicitud que
  // no lo trajo del formulario de contacto.
  const [codigoManualPorSolicitud, setCodigoManualPorSolicitud] = useState({});
  const [guardandoCodigoUid, setGuardandoCodigoUid] = useState(null);

  const [planes, setPlanes] = useState([]);
  const [loadingPlanes, setLoadingPlanes] = useState(true);
  const [modalPlanAbierto, setModalPlanAbierto] = useState(false);
  const [planEditando, setPlanEditando] = useState(null); // null = nuevo
  const [listaPlanesAbierta, setListaPlanesAbierta] = useState(false);
  const [listaSolicitudesAbierta, setListaSolicitudesAbierta] = useState(false);

  // ---- Revendedores (sólo admin principal, ver más abajo) ----
  const [revendedores, setRevendedores] = useState([]);
  const [loadingRevendedores, setLoadingRevendedores] = useState(true);
  const [listaRevendedoresAbierta, setListaRevendedoresAbierta] = useState(false);
  const [uidNuevoRevendedor, setUidNuevoRevendedor] = useState('');
  const [codigoNuevoRevendedor, setCodigoNuevoRevendedor] = useState('');
  const [habilitandoRevendedor, setHabilitandoRevendedor] = useState(false);
  const [descuentosPorPlanEditando, setDescuentosPorPlanEditando] = useState({}); // { [codigo]: { [planId]: pct } }
  const [ventasDelMesPorCodigo, setVentasDelMesPorCodigo] = useState({});
  const [mesSeleccionadoPorCodigo, setMesSeleccionadoPorCodigo] = useState({}); // { [codigo]: 'YYYY-MM' }
  const [cargandoVentasCodigo, setCargandoVentasCodigo] = useState(null);
  const [generandoCierreCodigo, setGenerandoCierreCodigo] = useState(null);

  // Plan elegido en el <select> de cada fila de la tabla de cuentas, para
  // pasárselo a la acción "Activar". Empieza vacío; se inicializa con el
  // planId actual de la cuenta la primera vez que llegan los datos (ver
  // más abajo, dentro del map de la tabla).
  const [planSeleccionadoPorCuenta, setPlanSeleccionadoPorCuenta] = useState({});

  // Suscriptores agrupados por plan (colapsados por defecto, para no tener
  // que scrollear una tabla larga): cada grupo se abre individualmente, o
  // todos juntos con el botón "Expandir todo". La búsqueda filtra por email
  // de la cuenta o por los datos de contacto (nombre/apellido/teléfono/
  // localidad) que dejó esa persona en el formulario, y auto-expande los
  // grupos que tengan resultados para no pedir un clic de más.
  const [busquedaSuscriptores, setBusquedaSuscriptores] = useState('');
  const [filtroEstadoSuscriptores, setFiltroEstadoSuscriptores] = useState('todos');
  const [gruposAbiertos, setGruposAbiertos] = useState(() => new Set());

  // Cuenta cuyos datos de contacto se están viendo/editando desde el botón
  // "Consultar datos" de cada fila (ver más abajo).
  const [cuentaDatosAbierta, setCuentaDatosAbierta] = useState(null);

  // Plantillas de mail transaccional (ver functions/emailTemplates.js y
  // functions/http/plantillasEmail.js): no viven en una colección propia
  // con onSnapshot como el resto del panel, se piden por callable porque
  // hace falta combinar el default hardcodeado en las Cloud Functions con
  // el override guardado en Firestore, y esa combinación la arma el server.
  const [plantillasEmail, setPlantillasEmail] = useState([]);
  const [loadingPlantillasEmail, setLoadingPlantillasEmail] = useState(true);
  const [listaPlantillasAbierta, setListaPlantillasAbierta] = useState(false);
  const [plantillaEditando, setPlantillaEditando] = useState(null);

  const cargarPlantillasEmail = async () => {
    setLoadingPlantillasEmail(true);
    try {
      const listar = httpsCallable(functions, 'listarPlantillasEmail');
      const { data } = await listar();
      setPlantillasEmail(data.plantillas || []);
    } catch (e) {
      console.error('Error al listar plantillas de mail:', e);
      showToast('No se pudieron cargar las plantillas de mail.', 'error');
    } finally {
      setLoadingPlantillasEmail(false);
    }
  };

  useEffect(() => {
    if (listaPlantillasAbierta && plantillasEmail.length === 0) cargarPlantillasEmail();
  }, [listaPlantillasAbierta]);

  const toggleGrupo = (key) => {
    setGruposAbiertos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const colRef = collection(db, 'admins');
    const unsubscribe = onSnapshot(
      colRef,
      (snap) => {
        setAdmins(snap.docs.map(d => ({ email: d.id, ...d.data() })));
        setLoadingAdmins(false);
      },
      (err) => {
        console.error('Error al listar admins:', err);
        setErrorAdmins(true);
        setLoadingAdmins(false);
      }
    );
    return unsubscribe;
  }, []);

  // Listado de todas las suscripciones (una por cuenta) vía collectionGroup:
  // como cada cuenta guarda la suya en users/{uid}/suscripcion/actual, no
  // hay una colección raíz única para consultarlas todas juntas — por eso
  // se usa collectionGroup('suscripcion'), que las trae sin importar bajo
  // qué uid estén. Las reglas ya permiten esto para cualquier admin.
  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, 'suscripcion'),
      (snap) => {
        const lista = snap.docs
          .filter(d => d.id === 'actual') // por si en el futuro se agregan otras subcolecciones bajo "suscripcion"
          .map(d => ({ uid: d.ref.parent.parent.id, ...d.data() }));
        setCuentas(lista);
        setLoadingCuentas(false);
      },
      (err) => {
        console.error('Error al listar suscripciones:', err);
        setLoadingCuentas(false);
      }
    );
    return unsub;
  }, []);

  // planSeleccionadoPorCuenta (el <select> de plan de cada fila) guarda una
  // elección LOCAL para poder elegir un plan distinto antes de tocar
  // "Renovar suscripción" -- pero si el planId real de la cuenta cambia por
  // otra vía (el revendedor la renovó con otro plan, otra pestaña del
  // mismo admin, etc.) esa elección local queda vieja y el <select> sigue
  // mostrando el plan de antes en vez del real. Acá comparamos el planId
  // que trae cada snapshot contra el último que vimos: si cambió y había
  // una elección local pendiente para esa cuenta, la descartamos para que
  // el <select> vuelva a reflejar el dato real.
  const planIdVistoPorCuenta = useRef({});
  useEffect(() => {
    setPlanSeleccionadoPorCuenta(prev => {
      let huboCambios = false;
      const siguiente = { ...prev };
      cuentas.forEach(c => {
        const planIdVisto = planIdVistoPorCuenta.current[c.uid];
        if (planIdVisto !== undefined && planIdVisto !== c.planId && siguiente[c.uid] !== undefined) {
          delete siguiente[c.uid];
          huboCambios = true;
        }
        planIdVistoPorCuenta.current[c.uid] = c.planId;
      });
      return huboCambios ? siguiente : prev;
    });
  }, [cuentas]);

  // Trae el contador de consumo de UNA cuenta puntual, sólo cuando el admin
  // lo pide con el botón "Ver consumo" -- pedirlos todos de una para toda
  // la tabla de golpe (como hacíamos antes) ralentiza el panel a medida
  // que crecen los suscriptores.
  const verConsumo = async (uid, cicloId) => {
    if (!cicloId) return;
    setCargandoConsumoUid(uid);
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'suscripcion', 'actual', 'contadores', cicloId));
      setContadoresPorUid(prev => ({
        ...prev,
        [uid]: snap.exists() ? snap.data() : { pedidosCreados: 0, aperturasCatalogo: 0, montoFacturado: 0 }
      }));
    } catch (e) {
      console.error(`Error al leer el consumo de ${uid}:`, e);
      showToast('No se pudo leer el consumo de esa cuenta.', 'error');
    } finally {
      setCargandoConsumoUid(null);
    }
  };

  useEffect(() => {
    const colRef = collection(db, 'solicitudesContacto');
    const unsubscribe = onSnapshot(
      colRef,
      (snap) => {
        setSolicitudes(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
        setLoadingSolicitudes(false);
      },
      (err) => {
        console.error('Error al listar solicitudes de contacto:', err);
        setLoadingSolicitudes(false);
      }
    );
    return unsubscribe;
  }, []);

  // Listado de revendedores -- sólo el admin principal puede leer esta
  // colección entera (ver firestore.rules), así que directamente no la
  // pedimos en modoRevendedor (evita un error de permisos en consola).
  useEffect(() => {
    if (modoRevendedor) { setLoadingRevendedores(false); return; }
    const unsubscribe = onSnapshot(
      collection(db, 'revendedores'),
      (snap) => {
        setRevendedores(snap.docs.map(d => ({ codigo: d.id, ...d.data() })));
        setLoadingRevendedores(false);
      },
      (err) => {
        console.error('Error al listar revendedores:', err);
        setLoadingRevendedores(false);
      }
    );
    return unsubscribe;
  }, [modoRevendedor]);

  useEffect(() => {
    const q = query(collection(db, 'planes'), orderBy('orden'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setPlanes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadingPlanes(false);
      },
      (err) => {
        console.error('Error al listar planes:', err);
        setLoadingPlanes(false);
      }
    );
    return unsubscribe;
  }, []);

  const ejecutarAccion = async (uid, accion, planId, descuentoPct) => {
    setAccionEnCurso(`${uid}:${accion}`);
    try {
      const cambiarEstado = httpsCallable(functions, 'cambiarEstadoSuscripcion');
      await cambiarEstado({ uid, accion, planId, descuentoPct: descuentoPct ?? null });
      showToast('Listo, se actualizó la suscripción.');
    } catch (e) {
      console.error('Error al cambiar el estado de la suscripción:', e);
      showToast(e?.message || 'No se pudo actualizar la suscripción.', 'error');
    } finally {
      setAccionEnCurso(null);
    }
  };

  // Purga total de una cuenta suspendida que nunca se reactivó -- sin
  // vuelta atrás, ver functions/http/borrarCuenta.js (ahí también se
  // revalida server-side que esté "suspendida", por si acá se coló algo).
  const [borrandoUid, setBorrandoUid] = useState(null);

  const borrarCuentaDefinitivamente = async (uid, emailCuenta) => {
    const etiqueta = emailCuenta || uid;
    const confirmacion = window.prompt(
      `Esto borra TODO lo de "${etiqueta}" (pedidos, biblioteca, clientes, catálogo web, la cuenta de Google) sin posibilidad de recuperarlo.\n\nPara confirmar, escribí "${etiqueta}":`
    );
    if (confirmacion === null) return;
    if (confirmacion.trim().toLowerCase() !== etiqueta.toLowerCase()) {
      showToast('No coincide, no se borró nada.', 'error');
      return;
    }

    setBorrandoUid(uid);
    try {
      const borrar = httpsCallable(functions, 'borrarCuenta');
      await borrar({ uid });
      showToast('Cuenta borrada por completo.');
    } catch (e) {
      console.error('Error al borrar la cuenta:', e);
      showToast(e?.message || 'No se pudo borrar la cuenta.', 'error');
    } finally {
      setBorrandoUid(null);
    }
  };

  const marcarContactado = async (uid) => {
    try {
      await updateDoc(doc(db, 'solicitudesContacto', uid), { estado: 'contactado' });
      showToast('Marcada como contactada');
    } catch (e) {
      console.error('Error al marcar la solicitud como contactada:', e);
      showToast('No se pudo actualizar la solicitud.', 'error');
    }
  };

  // Completa a mano el código de revendedor de una solicitud que no lo
  // trajo del formulario de contacto -- permitido por firestore.rules sólo
  // para el campo "codigoRevendedor" (nunca los datos de contacto, esos
  // van por datosSuscriptor). No valida contra revendedores/{codigo} acá:
  // si el código no existe, cambiarEstadoSuscripcion simplemente no atribuye
  // la venta a nadie al activar.
  const guardarCodigoRevendedorManual = async (uid) => {
    const codigo = (codigoManualPorSolicitud[uid] || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(codigo)) {
      showToast('El código debe tener entre 4 y 12 letras/números.', 'error');
      return;
    }
    setGuardandoCodigoUid(uid);
    try {
      await updateDoc(doc(db, 'solicitudesContacto', uid), { codigoRevendedor: codigo });
      showToast('Código de revendedor guardado.');
    } catch (e) {
      console.error('Error al guardar el código de revendedor:', e);
      showToast('No se pudo guardar el código.', 'error');
    } finally {
      setGuardandoCodigoUid(null);
    }
  };

  // ---- Gestión de revendedores (admin principal) ----
  const habilitarRevendedor = async () => {
    if (!uidNuevoRevendedor.trim() || !codigoNuevoRevendedor.trim()) {
      showToast('Elegí la cuenta y el código.', 'error');
      return;
    }
    setHabilitandoRevendedor(true);
    try {
      const habilitar = httpsCallable(functions, 'habilitarRevendedor');
      await habilitar({ uid: uidNuevoRevendedor.trim(), codigo: codigoNuevoRevendedor.trim() });
      showToast('Revendedor habilitado.');
      setUidNuevoRevendedor('');
      setCodigoNuevoRevendedor('');
    } catch (e) {
      console.error('Error al habilitar revendedor:', e);
      showToast(e?.message || 'No se pudo habilitar el revendedor.', 'error');
    } finally {
      setHabilitandoRevendedor(false);
    }
  };

  const deshabilitarRevendedor = async (uid) => {
    if (!window.confirm('¿Deshabilitar a este revendedor? Deja de poder operar sus suscriptores, pero no se toca nada de lo ya vendido.')) return;
    try {
      const deshabilitar = httpsCallable(functions, 'deshabilitarRevendedor');
      await deshabilitar({ uid });
      showToast('Revendedor deshabilitado.');
    } catch (e) {
      console.error('Error al deshabilitar revendedor:', e);
      showToast(e?.message || 'No se pudo deshabilitar.', 'error');
    }
  };

  // Reactivar es simplemente volver a habilitar con el mismo uid+código:
  // habilitarRevendedor ya es idempotente para ese caso (si el código
  // sigue apuntando a la misma cuenta, lo marca activo:true de nuevo y le
  // vuelve a poner codigoRevendedor). No hace falta una función aparte.
  const reactivarRevendedor = async (rev) => {
    try {
      const habilitar = httpsCallable(functions, 'habilitarRevendedor');
      await habilitar({ uid: rev.uid, codigo: rev.codigo });
      showToast('Revendedor reactivado.');
    } catch (e) {
      console.error('Error al reactivar revendedor:', e);
      showToast(e?.message || 'No se pudo reactivar.', 'error');
    }
  };

  const [borrandoRevendedorCodigo, setBorrandoRevendedorCodigo] = useState(null);

  const borrarRevendedor = async (rev) => {
    if (!window.confirm(`¿Borrar definitivamente el código ${rev.codigo}? Esto no se puede deshacer. Si todavía tiene suscriptores con suscripción vigente, se va a rechazar.`)) return;
    setBorrandoRevendedorCodigo(rev.codigo);
    try {
      const borrar = httpsCallable(functions, 'borrarRevendedor');
      await borrar({ codigo: rev.codigo });
      showToast('Revendedor borrado.');
    } catch (e) {
      console.error('Error al borrar revendedor:', e);
      showToast(e?.message || 'No se pudo borrar el revendedor.', 'error');
    } finally {
      setBorrandoRevendedorCodigo(null);
    }
  };

  // Vincula (o desvincula, con codigo='') una cuenta EXISTENTE a un
  // revendedor -- para suscriptores que el revendedor ya traía de antes de
  // que existiera este sistema de códigos (nunca van a tener una solicitud
  // de contacto con el código cargado, así que activar/renovar nunca los
  // habría vinculado solo).
  const vincularRevendedorACuenta = async (uid, codigo) => {
    try {
      const vincular = httpsCallable(functions, 'vincularRevendedor');
      await vincular({ uid, codigo: codigo || null });
      // Al desvincular, además limpiamos el código en la solicitud de
      // contacto original (si la tiene) -- si no se hace esto, la próxima
      // renovación vuelve a atribuírsela sola al mismo revendedor (activar
      // resuelve el código desde la solicitud cuando la cuenta todavía no
      // tiene revendedorUid), y el "Sin revendedor" de acá arriba parecería
      // no haber servido de nada.
      if (!codigo && solicitudPorUid[uid]?.codigoRevendedor) {
        await updateDoc(doc(db, 'solicitudesContacto', uid), { codigoRevendedor: null });
      }
      showToast(codigo ? 'Cuenta vinculada al revendedor.' : 'Cuenta desvinculada.');
    } catch (e) {
      console.error('Error al vincular la cuenta a un revendedor:', e);
      showToast(e?.message || 'No se pudo vincular la cuenta.', 'error');
    }
  };

  const guardarDescuentosRevendedor = async (uid, codigo) => {
    try {
      const actualizar = httpsCallable(functions, 'actualizarDescuentosRevendedor');
      await actualizar({ uid, descuentosPorPlan: descuentosPorPlanEditando[codigo] || {} });
      showToast('Descuentos por plan guardados.');
    } catch (e) {
      console.error('Error al guardar descuentos del revendedor:', e);
      showToast(e?.message || 'No se pudieron guardar los descuentos.', 'error');
    }
  };

  const mesActual = () => new Date().toISOString().slice(0, 7);

  const verVentasDelMes = async (uid, codigo, anioMes) => {
    setCargandoVentasCodigo(codigo);
    try {
      const snap = await getDoc(doc(db, 'revendedores', codigo, 'ventas', anioMes));
      const base = { items: [], totalPlan: 0, totalDescuento: 0, totalFacturable: 0 };
      setVentasDelMesPorCodigo(prev => ({
        ...prev,
        [`${codigo}:${anioMes}`]: snap.exists() ? { ...base, ...snap.data() } : base
      }));
    } catch (e) {
      console.error(`Error al leer las ventas de ${codigo}:`, e);
      showToast('No se pudieron leer las ventas de este revendedor.', 'error');
    } finally {
      setCargandoVentasCodigo(null);
    }
  };

  // Arma el PDF de cierre client-side con jsPDF, mismo criterio visual que
  // el PDF de pedido (ver ModalPedidoDetalle.jsx): header simple + tabla +
  // total, sin depender de nada que exija ida y vuelta al servidor más
  // allá de la llamada que marca el mes como cerrado.
  const generarPdfCierre = (rev, anioMes, datos) => {
    const doc2 = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, marginX = 15, contentW = pageW - marginX * 2;
    const navy = [40, 48, 61], lightGray = [235, 237, 240];
    let y = 18;

    doc2.setFont('helvetica', 'bold'); doc2.setFontSize(20); doc2.setTextColor(30, 33, 40);
    doc2.text('CIERRE DE REVENDEDOR', marginX, y);
    y += 8;
    doc2.setFontSize(10); doc2.setFont('helvetica', 'normal');
    doc2.text(`Revendedor: ${rev.email || rev.uid}  ·  Código: ${rev.codigo}`, marginX, y);
    y += 5;
    doc2.text(`Período: ${anioMes}`, marginX, y);
    y += 10;

    const colFecha = 24, colEmail = 62, colPlan = 30, colMonto = 24, colDto = 18, colFact = 24;
    const xFecha = marginX, xEmail = xFecha + colFecha, xPlan = xEmail + colEmail, xMonto = xPlan + colPlan, xDto = xMonto + colMonto, xFact = xDto + colDto;
    doc2.setFillColor(...navy);
    doc2.rect(marginX, y, contentW, 7, 'F');
    doc2.setTextColor(255, 255, 255); doc2.setFont('helvetica', 'bold'); doc2.setFontSize(8.5);
    doc2.text('FECHA', xFecha + 2, y + 5);
    doc2.text('SUSCRIPTOR', xEmail + 2, y + 5);
    doc2.text('PLAN', xPlan + 2, y + 5);
    doc2.text('LISTA', xMonto + colMonto - 2, y + 5, { align: 'right' });
    doc2.text('DTO %', xDto + colDto - 2, y + 5, { align: 'right' });
    doc2.text('A FACTURAR', xFact + colFact - 2, y + 5, { align: 'right' });
    y += 7;

    doc2.setTextColor(40, 40, 40); doc2.setFont('helvetica', 'normal'); doc2.setFontSize(8.2);
    const planNombrePorId = Object.fromEntries(planes.map(p => [p.id, p.nombre]));
    (datos.items || []).forEach((item, i) => {
      if (y > 270) { doc2.addPage(); y = 20; }
      if (i % 2 === 0) { doc2.setFillColor(...lightGray); doc2.rect(marginX, y, contentW, 6, 'F'); }
      const fecha = item.fecha?.toDate ? item.fecha.toDate().toLocaleDateString('es-AR') : '—';
      doc2.text(fecha, xFecha + 2, y + 4.2);
      doc2.text(String(item.email || item.uid || ''), xEmail + 2, y + 4.2, { maxWidth: colEmail - 4 });
      doc2.text(planNombrePorId[item.planId] || '—', xPlan + 2, y + 4.2, { maxWidth: colPlan - 4 });
      doc2.text(`$${Number(item.montoPlan || 0).toLocaleString('es-AR')}`, xMonto + colMonto - 2, y + 4.2, { align: 'right' });
      doc2.text(`${item.descuentoPct || 0}%`, xDto + colDto - 2, y + 4.2, { align: 'right' });
      doc2.text(`$${Number(item.montoFacturable || 0).toLocaleString('es-AR')}`, xFact + colFact - 2, y + 4.2, { align: 'right' });
      y += 6;
    });

    y += 4;
    doc2.setDrawColor(210); doc2.line(marginX, y, pageW - marginX, y);
    y += 7;
    doc2.setFont('helvetica', 'bold'); doc2.setFontSize(11);
    doc2.text(`Total a facturar: $${Number(datos.totalFacturable || 0).toLocaleString('es-AR')}`, pageW - marginX, y, { align: 'right' });

    doc2.save(`cierre-${rev.codigo}-${anioMes}.pdf`);
  };

  const generarCierre = async (rev, anioMes) => {
    setGenerandoCierreCodigo(rev.codigo);
    try {
      const generar = httpsCallable(functions, 'generarCierreRevendedor');
      const { data } = await generar({ uid: rev.uid, anioMes });
      generarPdfCierre(rev, anioMes, data);
      showToast('Cierre generado.');
    } catch (e) {
      console.error('Error al generar el cierre del revendedor:', e);
      showToast(e?.message || 'No se pudo generar el cierre.', 'error');
    } finally {
      setGenerandoCierreCodigo(null);
    }
  };

  // En modo revendedor, acotamos todo a "mi cartera": cuentas que ya
  // activé/renové yo (revendedorUid == mi uid) y leads que todavía no se
  // activaron pero ya traen mi propio código cargado en el formulario de
  // contacto. Las reglas de Firestore ya podan estos listados del lado del
  // servidor (ver firestore.rules), esto es sólo un filtro extra explícito
  // para que el componente no dependa de ese detalle para comportarse bien.
  const cuentasVisibles = useMemo(() => {
    if (!modoRevendedor) return cuentas;
    return cuentas.filter(c => c.revendedorUid === user?.uid);
  }, [cuentas, modoRevendedor, user?.uid]);

  const solicitudesVisibles = useMemo(() => {
    if (!modoRevendedor) return solicitudes;
    return solicitudes.filter(s => miCodigoRevendedor && s.codigoRevendedor === miCodigoRevendedor);
  }, [solicitudes, modoRevendedor, miCodigoRevendedor]);

  // Lookup rápido para saber si el uid de una solicitud ya tiene una
  // suscripción activa (osea, ya se convirtió en cliente pago).
  const cuentaPorUid = Object.fromEntries(cuentasVisibles.map(c => [c.uid, c]));

  // Sólo las solicitudes que TODAVÍA no se convirtieron en suscripción
  // activa se muestran en la lista y se incluyen en la exportación — una
  // vez que se activa, esa persona ya vive en la tabla de Suscripciones de
  // arriba, no tiene sentido seguir viéndola acá como "contacto pendiente".
  const solicitudesPendientes = solicitudesVisibles.filter(s => cuentaPorUid[s.uid]?.estado !== 'activa');

  // Datos personales del formulario de contacto, indexados por uid, para
  // mostrarlos junto a cada suscriptor (no sólo mientras está "pendiente"
  // de activar) — es la única fuente de nombre/teléfono/localidad real que
  // existe hoy, la cuenta en sí sólo tiene el email de Google.
  const solicitudPorUid = useMemo(
    () => Object.fromEntries(solicitudesVisibles.map(s => [s.uid, s])),
    [solicitudesVisibles]
  );

  const cuentasFiltradas = useMemo(() => {
    const q = busquedaSuscriptores.trim().toLowerCase();
    return cuentasVisibles.filter(c => {
      if (filtroEstadoSuscriptores !== 'todos' && c.estado !== filtroEstadoSuscriptores) return false;
      if (!q) return true;
      const s = solicitudPorUid[c.uid];
      const campos = [c.email, c.uid, s?.nombre, s?.apellido, s?.telefono, s?.localidad, s?.email]
        .filter(Boolean).join(' ').toLowerCase();
      return campos.includes(q);
    });
  }, [cuentasVisibles, busquedaSuscriptores, filtroEstadoSuscriptores, solicitudPorUid]);

  // Agrupa por plan, respetando el orden de "planes" (ya viene ordenado por
  // el campo "orden") y dejando las cuentas sin plan asignado al final.
  const gruposDeSuscriptores = useMemo(() => {
    const SIN_PLAN = '__sin_plan__';
    const map = new Map();
    cuentasFiltradas.forEach(c => {
      const key = c.planId || SIN_PLAN;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    const ordenados = [];
    planes.forEach(p => {
      if (map.has(p.id)) {
        ordenados.push({ key: p.id, nombre: p.nombre, cuentas: map.get(p.id) });
        map.delete(p.id);
      }
    });
    if (map.has(SIN_PLAN)) {
      ordenados.push({ key: SIN_PLAN, nombre: 'Sin plan', cuentas: map.get(SIN_PLAN) });
    }
    return ordenados;
  }, [cuentasFiltradas, planes]);

  const hayBusquedaActiva = busquedaSuscriptores.trim() !== '' || filtroEstadoSuscriptores !== 'todos';

  const expandirTodo = () => setGruposAbiertos(new Set(gruposDeSuscriptores.map(g => g.key)));
  const colapsarTodo = () => setGruposAbiertos(new Set());

  const exportarContactosTxt = () => {
    if (solicitudesPendientes.length === 0) {
      showToast('No hay contactos sin suscripción para exportar.', 'info');
      return;
    }
    const contenido = solicitudesPendientes
      .map(s => `${s.nombre || ''} ${s.apellido || ''}`.trim() + ' - ' + (s.email || ''))
      .join('\n');
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contactos-sin-suscripcion-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Exporta email + nombre/apellido (si existe, del formulario de
  // contacto) de los suscriptores que queden después del filtro de estado
  // y la búsqueda vigentes -- así se puede sacar, por ejemplo, sólo los
  // "trial" o sólo los "suspendida" para armar una campaña de contacto
  // puntual, en vez de exportar la base entera siempre.
  const exportarSuscriptoresTxt = () => {
    if (cuentasFiltradas.length === 0) {
      showToast('No hay suscriptores para exportar con este filtro.', 'info');
      return;
    }
    const contenido = cuentasFiltradas
      .map(c => {
        const s = solicitudPorUid[c.uid];
        const nombreCompleto = `${s?.nombre || ''} ${s?.apellido || ''}`.trim();
        return (nombreCompleto || 'Sin nombre') + ' - ' + (c.email || c.uid);
      })
      .join('\n');
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sufijoEstado = filtroEstadoSuscriptores !== 'todos' ? `-${filtroEstadoSuscriptores}` : '';
    a.download = `suscriptores${sufijoEstado}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const badgeEstado = (estado) => {
    const clases = {
      trial: 'badge-progress',
      activa: 'badge-done',
      lectura: 'badge-pending',
      suspendida: 'badge-cancelled'
    };
    return <span className={`badge ${clases[estado] || 'badge-pending'}`}>{estado || '—'}</span>;
  };

  const fmtFecha = (ts) => ts?.toDate ? ts.toDate().toLocaleDateString('es-AR') : '—';

  return (
    <div className="page active">
      <div className="page-title">{modoRevendedor ? 'Mis suscriptores' : 'Administrador'}</div>
      <div className="page-sub">
        {modoRevendedor
          ? `Panel de revendedor · código ${miCodigoRevendedor || '—'}.`
          : 'Panel visible sólo para administradores.'}
      </div>

      {/* ---- Solicitudes de contacto ---- */}
      <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: listaSolicitudesAbierta ? '14px' : 0, cursor: 'pointer' }}
          onClick={() => setListaSolicitudesAbierta(v => !v)}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            {listaSolicitudesAbierta ? '▾' : '▸'} Solicitudes de contacto {!loadingSolicitudes && `(${solicitudesPendientes.length})`}
          </div>
          <button
            className="btn"
            style={{ fontSize: '11px', padding: '5px 10px' }}
            onClick={(e) => { e.stopPropagation(); exportarContactosTxt(); }}
          >
            ⬇ Exportar contactos (.txt)
          </button>
        </div>

        {listaSolicitudesAbierta && (
          <>
            {loadingSolicitudes && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}

            {!loadingSolicitudes && solicitudesPendientes.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>No hay solicitudes pendientes — las que ya se activaron pasaron a Suscriptores.</div>
            )}

            {!loadingSolicitudes && solicitudesPendientes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {solicitudesPendientes.map((s) => (
                  <div key={s.uid} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius2)', padding: '12px', background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.nombre} {s.apellido}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{s.localidad} · {s.telefono} · {s.email}</div>
                        {s.resena && <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>{s.resena}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className={`badge ${s.estado === 'contactado' ? 'badge-done' : 'badge-pending'}`}>{s.estado || 'pendiente'}</span>
                        {s.estado !== 'contactado' && (
                          <button className="btn" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => marcarContactado(s.uid)}>
                            Marcar contactado
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Activar la suscripción de este solicitante directo desde acá:
                        su "uid" es el mismo ID de este documento, así no hace
                        falta ir a buscarlo a la tabla de Suscriptores (y si es
                        una cuenta vieja sin suscripcion/actual, esto se la crea). */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <select
                        value={planSeleccionadoPorSolicitud[s.uid] || ''}
                        onChange={(e) => setPlanSeleccionadoPorSolicitud(prev => ({ ...prev, [s.uid]: e.target.value }))}
                        style={{ fontSize: '12px' }}
                      >
                        <option value="">Elegir plan…</option>
                        {planes.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                      {s.codigoRevendedor && (
                        <>
                          <span className="badge badge-progress" title="Código de revendedor de esta solicitud">
                            {s.codigoRevendedor}
                          </span>
                          <input
                            type="number" min="0" max="100"
                            value={descuentoPorSolicitud[s.uid] ?? ''}
                            onChange={(e) => setDescuentoPorSolicitud(prev => ({ ...prev, [s.uid]: e.target.value }))}
                            placeholder="% dto."
                            title="Descuento (ganancia del revendedor) para esta venta"
                            style={{ fontSize: '12px', width: '70px' }}
                          />
                        </>
                      )}
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        disabled={!planSeleccionadoPorSolicitud[s.uid] || accionEnCurso === `${s.uid}:activar`}
                        onClick={() => ejecutarAccion(s.uid, 'activar', planSeleccionadoPorSolicitud[s.uid], Number(descuentoPorSolicitud[s.uid]) || 0)}
                      >
                        {accionEnCurso === `${s.uid}:activar` ? 'Activando...' : 'Activar suscripción'}
                      </button>
                      {!modoRevendedor && !s.codigoRevendedor && (
                        <>
                          <input
                            type="text"
                            value={codigoManualPorSolicitud[s.uid] || ''}
                            onChange={(e) => setCodigoManualPorSolicitud(prev => ({ ...prev, [s.uid]: e.target.value.toUpperCase() }))}
                            placeholder="Código revendedor…"
                            style={{ fontSize: '12px', width: '130px' }}
                          />
                          <button
                            className="btn"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            disabled={!codigoManualPorSolicitud[s.uid] || guardandoCodigoUid === s.uid}
                            onClick={() => guardarCodigoRevendedorManual(s.uid)}
                          >
                            {guardandoCodigoUid === s.uid ? 'Guardando...' : 'Guardar código'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- Planes (sólo admin principal: un revendedor no gestiona planes) ---- */}
      {!modoRevendedor && <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: listaPlanesAbierta ? '14px' : 0, cursor: 'pointer' }}
          onClick={() => setListaPlanesAbierta(v => !v)}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            {listaPlanesAbierta ? '▾' : '▸'} Planes {!loadingPlanes && `(${planes.length})`}
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: '11px', padding: '5px 10px' }}
            onClick={(e) => { e.stopPropagation(); setPlanEditando(null); setModalPlanAbierto(true); }}
          >
            + Nuevo plan
          </button>
        </div>

        {listaPlanesAbierta && (
          <>
            {loadingPlanes && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}
            {!loadingPlanes && planes.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Todavía no creaste ningún plan.</div>
            )}

            {!loadingPlanes && planes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {planes.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                      padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', background: 'var(--bg)'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        {p.nombre} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>— ${Number(p.precioMensual || 0).toLocaleString('es-AR')}/mes</span>
                        {p.activo === false && <span className="badge badge-cancelled" style={{ marginLeft: '8px' }}>inactivo</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                        {p.limites?.usuarios ?? '∞'} usuarios · {p.limites?.productosBiblioteca ?? '∞'} productos en biblioteca · {p.limites?.pedidosMes ?? '∞'} pedidos/mes · {p.limites?.aperturasCatalogoMes ?? '∞'} aperturas/mes · ${Number(p.limites?.montoFacturadoMes ?? 0).toLocaleString('es-AR')}/mes facturado
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        onClick={() => { setPlanEditando(p); setModalPlanAbierto(true); }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        onClick={() => updateDoc(doc(db, 'planes', p.id), { activo: p.activo === false })}
                      >
                        {p.activo === false ? 'Activar' : 'Desactivar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>}

      {/* ---- Suscriptores (agrupados por plan, colapsados por defecto) ---- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Suscriptores {!loadingCuentas && `(${cuentasFiltradas.length})`}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={expandirTodo}>
              Expandir todo
            </button>
            <button className="btn" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={colapsarTodo}>
              Colapsar todo
            </button>
            <button
              className="btn"
              style={{ fontSize: '11px', padding: '5px 10px' }}
              onClick={exportarSuscriptoresTxt}
              title="Exporta email + nombre/apellido de los suscriptores que queden con el filtro actual"
            >
              ⬇ Exportar suscriptores (.txt)
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <input
            type="text"
            value={busquedaSuscriptores}
            onChange={(e) => setBusquedaSuscriptores(e.target.value)}
            placeholder="Buscar por email, nombre, teléfono o localidad..."
            style={{ fontSize: '13px', flex: 1, minWidth: '220px' }}
          />
          <select
            value={filtroEstadoSuscriptores}
            onChange={(e) => setFiltroEstadoSuscriptores(e.target.value)}
            style={{ fontSize: '13px', width: '160px' }}
          >
            <option value="todos">Todos los estados</option>
            <option value="trial">Trial</option>
            <option value="activa">Activa</option>
            <option value="lectura">Modo lectura</option>
            <option value="suspendida">Suspendida</option>
          </select>
        </div>

        {loadingCuentas && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}

        {!loadingCuentas && cuentasFiltradas.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            {hayBusquedaActiva ? 'Ningún suscriptor coincide con la búsqueda.' : 'Todavía no hay cuentas con suscripción.'}
          </div>
        )}

        {!loadingCuentas && gruposDeSuscriptores.map((grupo) => {
          const abierto = hayBusquedaActiva || gruposAbiertos.has(grupo.key);
          return (
            <div key={grupo.key} style={{ marginBottom: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', cursor: 'pointer', background: 'var(--bg)' }}
                onClick={() => toggleGrupo(grupo.key)}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{abierto ? '−' : '+'}</span>
                  {grupo.nombre}
                  <span style={{ color: 'var(--text3)', fontWeight: 400, fontFamily: 'var(--mono)' }}>({grupo.cuentas.length})</span>
                </div>
              </div>

              {abierto && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Cuenta</th>
                        <th>Estado</th>
                        <th>Vence</th>
                        <th>Plan</th>
                        <th>Consumo del ciclo</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.cuentas.map((c) => {
                        const vence = c.estado === 'trial' ? fmtFecha(c.trialFin)
                          : c.estado === 'activa' ? fmtFecha(c.cicloFin)
                          : c.estado === 'lectura' ? fmtFecha(c.fechaLimiteLectura)
                          : c.estado === 'suspendida' ? `Bloqueada: ${fmtFecha(c.fechaLimiteLectura)}`
                          : '—';
                        const planElegido = planSeleccionadoPorCuenta[c.uid] ?? c.planId ?? '';
                        const planDeLaCuenta = planes.find(p => p.id === c.planId);
                        const contador = contadoresPorUid[c.uid];
                        const solicitud = solicitudPorUid[c.uid];
                        return (
                          <tr key={c.uid}>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{c.email || c.uid}</td>
                            <td>{badgeEstado(c.estado)}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{vence}</td>
                            <td>
                              <select
                                value={planElegido}
                                onChange={(e) => setPlanSeleccionadoPorCuenta(prev => ({ ...prev, [c.uid]: e.target.value }))}
                                style={{ fontSize: '12px', width: '130px', boxSizing: 'border-box' }}
                              >
                                <option value="">Sin plan</option>
                                {planes.map(p => (
                                  <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                              </select>
                            </td>
                            <td style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text2)', whiteSpace: 'nowrap', width: '160px' }}>
                              {!c.cicloId && <span>—</span>}
                              {c.cicloId && !contador && (
                                <button
                                  className="btn"
                                  style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                  disabled={cargandoConsumoUid === c.uid}
                                  onClick={() => verConsumo(c.uid, c.cicloId)}
                                >
                                  {cargandoConsumoUid === c.uid ? 'Cargando...' : 'Ver consumo'}
                                </button>
                              )}
                              {c.cicloId && contador && (
                                <div>
                                  <div>pedidos: {contador.pedidosCreados || 0}{planDeLaCuenta?.limites?.pedidosMes != null ? `/${planDeLaCuenta.limites.pedidosMes}` : ''}</div>
                                  <div>catálogo: {contador.aperturasCatalogo || 0}{planDeLaCuenta?.limites?.aperturasCatalogoMes != null ? `/${planDeLaCuenta.limites.aperturasCatalogoMes}` : ''}</div>
                                  <div>facturado: ${Math.round(contador.montoFacturado || 0).toLocaleString('es-AR')}{planDeLaCuenta?.limites?.montoFacturadoMes != null ? ` / $${Number(planDeLaCuenta.limites.montoFacturadoMes).toLocaleString('es-AR')}` : ''}</div>
                                  <button
                                    className="btn"
                                    style={{ fontSize: '10px', padding: '2px 6px', marginTop: '4px', width: '130px', boxSizing: 'border-box' }}
                                    disabled={cargandoConsumoUid === c.uid}
                                    onClick={() => verConsumo(c.uid, c.cicloId)}
                                  >
                                    ↻ actualizar
                                  </button>
                                </div>
                              )}
                            </td>
                            <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {(c.revendedorCodigo || solicitud?.codigoRevendedor) && (
                                <>
                                  <span className="badge badge-progress" title="Código de revendedor de esta cuenta">
                                    {c.revendedorCodigo || solicitud.codigoRevendedor}
                                  </span>
                                  <input
                                    type="number" min="0" max="100"
                                    value={descuentoPorCuenta[c.uid] ?? ''}
                                    onChange={(e) => setDescuentoPorCuenta(prev => ({ ...prev, [c.uid]: e.target.value }))}
                                    placeholder="% dto."
                                    title="Descuento (ganancia del revendedor) para esta renovación"
                                    style={{ fontSize: '12px', width: '60px' }}
                                  />
                                </>
                              )}
                              {/* Vincular a mano una cuenta ya existente a un revendedor --
                                  para suscriptores que el revendedor ya traía de antes de
                                  este sistema de códigos (nunca van a pasar por una
                                  solicitud de contacto con el código cargado). Sólo
                                  admin: un revendedor no puede reasignarse suscriptores. */}
                              {!modoRevendedor && (
                                <select
                                  value={c.revendedorCodigo || ''}
                                  onChange={(e) => vincularRevendedorACuenta(c.uid, e.target.value)}
                                  title="Vincular esta cuenta a un revendedor (o desvincularla)"
                                  style={{ fontSize: '12px', width: '130px', boxSizing: 'border-box' }}
                                >
                                  <option value="">— Sin revendedor —</option>
                                  {revendedores.map(rev => (
                                    <option key={rev.codigo} value={rev.codigo}>{rev.codigo}</option>
                                  ))}
                                </select>
                              )}
                              <button
                                className="btn"
                                style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                disabled={accionEnCurso === `${c.uid}:activar`}
                                onClick={() => ejecutarAccion(c.uid, 'activar', planElegido || null, Number(descuentoPorCuenta[c.uid]) || 0)}
                                title="Si la cuenta ya venció (lectura/suspendida), la reactiva desde hoy. Si todavía está vigente, prorroga un ciclo desde el vencimiento actual."
                              >
                                Renovar suscripción
                              </button>
                              <button
                                className="btn"
                                style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                disabled={accionEnCurso === `${c.uid}:extenderTrial`}
                                onClick={() => ejecutarAccion(c.uid, 'extenderTrial')}
                              >
                                +7 días trial
                              </button>
                              <button
                                className="btn"
                                style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                onClick={() => setCuentaDatosAbierta({ uid: c.uid, email: c.email, solicitudInicial: solicitud || null })}
                              >
                                Consultar datos
                              </button>
                              <button
                                className="btn"
                                style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                disabled={accionEnCurso === `${c.uid}:suspender`}
                                onClick={() => ejecutarAccion(c.uid, 'suspender')}
                                title="Pasa la cuenta a modo lectura por 30 días. Recién si no se reactiva en ese plazo queda bloqueada del todo (automático)."
                              >
                                Modo Lectura (30 ds)
                              </button>

                              {c.estado === 'suspendida' && (
                                <>
                                  <button
                                    className="btn"
                                    style={{
                                      fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box',
                                      color: c.contactadoPostBloqueo ? 'var(--accent)' : undefined,
                                      borderColor: c.contactadoPostBloqueo ? 'var(--accent)' : undefined
                                    }}
                                    disabled={accionEnCurso === `${c.uid}:toggleContactadoPostBloqueo`}
                                    onClick={() => ejecutarAccion(c.uid, 'toggleContactadoPostBloqueo')}
                                    title={c.contactadoPostBloqueoFecha ? `Marcado el ${fmtFecha(c.contactadoPostBloqueoFecha)}` : 'Todavía no se marcó'}
                                  >
                                    {c.contactadoPostBloqueo ? '✓ Contactado' : 'Marcar contactado'}
                                  </button>
                                  {!modoRevendedor && (
                                    <button
                                      className="btn btn-danger"
                                      style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                      disabled={borrandoUid === c.uid}
                                      onClick={() => borrarCuentaDefinitivamente(c.uid, c.email)}
                                    >
                                      {borrandoUid === c.uid ? 'Borrando...' : '✕ Borrar cuenta'}
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Revendedores (sólo admin principal) ---- */}
      {!modoRevendedor && <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: listaRevendedoresAbierta ? '14px' : 0, cursor: 'pointer' }}
          onClick={() => setListaRevendedoresAbierta(v => !v)}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            {listaRevendedoresAbierta ? '▾' : '▸'} Revendedores {!loadingRevendedores && `(${revendedores.length})`}
          </div>
        </div>

        {listaRevendedoresAbierta && (
          <>
            {/* Habilitar un suscriptor existente como revendedor: se elige
                por uid (copiado de la fila de Suscriptores de arriba) y se
                le asigna un código propio. */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 'var(--radius2)' }}>
              <input
                type="text"
                value={uidNuevoRevendedor}
                onChange={(e) => setUidNuevoRevendedor(e.target.value)}
                placeholder="uid o email de la cuenta a habilitar…"
                style={{ fontSize: '12px', flex: 1, minWidth: '200px' }}
              />
              <input
                type="text"
                value={codigoNuevoRevendedor}
                onChange={(e) => setCodigoNuevoRevendedor(e.target.value.toUpperCase())}
                placeholder="Código (ej JUAN20)"
                style={{ fontSize: '12px', width: '150px' }}
              />
              <button
                className="btn btn-primary"
                style={{ fontSize: '11px', padding: '5px 10px' }}
                disabled={habilitandoRevendedor}
                onClick={habilitarRevendedor}
              >
                {habilitandoRevendedor ? 'Habilitando...' : 'Habilitar revendedor'}
              </button>
            </div>

            {loadingRevendedores && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}
            {!loadingRevendedores && revendedores.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Todavía no hay ningún revendedor habilitado.</div>
            )}

            {!loadingRevendedores && revendedores.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {revendedores.map((rev) => {
                  const anioMes = mesSeleccionadoPorCodigo[rev.codigo] || mesActual();
                  const ventas = ventasDelMesPorCodigo[`${rev.codigo}:${anioMes}`];
                  return (
                    <div key={rev.codigo} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius2)', padding: '12px', background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            {rev.codigo} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>— {rev.email || rev.uid}</span>
                            {!rev.activo && <span className="badge badge-cancelled" style={{ marginLeft: '8px' }}>inactivo</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            type="month"
                            value={anioMes}
                            onChange={(e) => setMesSeleccionadoPorCodigo(prev => ({ ...prev, [rev.codigo]: e.target.value }))}
                            style={{ fontSize: '12px', padding: '3px 4px' }}
                            title="Mes a consultar/cerrar"
                          />
                          <button
                            className="btn"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            disabled={cargandoVentasCodigo === rev.codigo}
                            onClick={() => verVentasDelMes(rev.uid, rev.codigo, anioMes)}
                          >
                            {cargandoVentasCodigo === rev.codigo ? 'Cargando...' : 'Ver ventas'}
                          </button>
                          <button
                            className="btn"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            disabled={generandoCierreCodigo === rev.codigo}
                            onClick={() => generarCierre(rev, anioMes)}
                            title="Marca el mes elegido como cerrado y descarga el PDF con el detalle y el total a facturar"
                          >
                            {generandoCierreCodigo === rev.codigo ? 'Generando...' : '📄 Generar cierre del mes'}
                          </button>
                          {rev.activo ? (
                            <button
                              className="btn"
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                              onClick={() => deshabilitarRevendedor(rev.uid)}
                            >
                              Deshabilitar
                            </button>
                          ) : (
                            <button
                              className="btn"
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                              onClick={() => reactivarRevendedor(rev)}
                            >
                              Reactivar
                            </button>
                          )}
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            disabled={borrandoRevendedorCodigo === rev.codigo}
                            onClick={() => borrarRevendedor(rev)}
                            title="Borra el código definitivamente. Se rechaza si todavía tiene suscriptores con suscripción vigente (trial o activa)."
                          >
                            {borrandoRevendedorCodigo === rev.codigo ? 'Borrando...' : '✕ Borrar'}
                          </button>
                        </div>
                      </div>

                      {ventas && (
                        <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text2)', marginTop: '8px' }}>
                          {ventas.items.length} venta(s) en {anioMes} · lista ${Number(ventas.totalPlan || 0).toLocaleString('es-AR')} ·
                          {' '}descuento ${Number(ventas.totalDescuento || 0).toLocaleString('es-AR')} ·
                          {' '}a facturar ${Number(ventas.totalFacturable || 0).toLocaleString('es-AR')}
                          {ventas.cerrado && <span className="badge badge-done" style={{ marginLeft: '8px' }}>cerrado</span>}
                        </div>
                      )}

                      {/* Default de descuento por plan -- se prellena con lo que ya
                          esté guardado y se guarda entero al tocar "Guardar". */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                        {planes.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{p.nombre}</span>
                            <input
                              type="number" min="0" max="100"
                              defaultValue={rev.descuentosPorPlan?.[p.id] ?? ''}
                              onChange={(e) => setDescuentosPorPlanEditando(prev => ({
                                ...prev,
                                [rev.codigo]: { ...(prev[rev.codigo] || rev.descuentosPorPlan || {}), [p.id]: Number(e.target.value) || 0 }
                              }))}
                              placeholder="%"
                              style={{ fontSize: '11px', width: '55px' }}
                            />
                          </div>
                        ))}
                        <button
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => guardarDescuentosRevendedor(rev.uid, rev.codigo)}
                        >
                          Guardar % default
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>}

      {/* ---- Plantillas de mail (sólo admin principal) ---- */}
      {!modoRevendedor && <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: listaPlantillasAbierta ? '14px' : 0, cursor: 'pointer' }}
          onClick={() => setListaPlantillasAbierta(v => !v)}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            {listaPlantillasAbierta ? '▾' : '▸'} Plantillas de mail
          </div>
        </div>

        {listaPlantillasAbierta && (
          <>
            {loadingPlantillasEmail && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}

            {!loadingPlantillasEmail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {plantillasEmail.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                      padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', background: 'var(--bg)'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        {p.label}
                        {p.personalizado && <span className="badge badge-progress" style={{ marginLeft: '8px' }}>personalizada</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>{p.subject}</div>
                    </div>
                    <button
                      className="btn"
                      style={{ fontSize: '11px', padding: '5px 10px' }}
                      onClick={() => setPlantillaEditando(p)}
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>}

      {/* ---- Administradores actuales (sólo admin principal) ---- */}
      {!modoRevendedor && <div className="card">
        <div className="card-title">Administradores actuales</div>

        {loadingAdmins && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}
        {errorAdmins && <div style={{ fontSize: '13px', color: 'var(--danger)' }}>No se pudo cargar el listado de administradores.</div>}

        {!loadingAdmins && !errorAdmins && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {admins.map(a => (
              <div
                key={a.email}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', background: 'var(--bg)'
                }}
              >
                <span style={{ fontSize: '13px', fontFamily: 'var(--mono)' }}>{a.email}</span>
                {user?.email?.toLowerCase() === a.email && <span className="badge badge-done">vos</span>}
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '14px', lineHeight: 1.5 }}>
          Agregar o quitar administradores se gestiona desde Firebase Console → Firestore → colección <code>admins</code> (documento con ID = email en minúsculas).
        </p>
      </div>}

      {!modoRevendedor && <ModalPlan
        isOpen={modalPlanAbierto}
        onClose={() => setModalPlanAbierto(false)}
        plan={planEditando}
      />}

      <ModalDatosSuscriptor
        isOpen={!!cuentaDatosAbierta}
        onClose={() => setCuentaDatosAbierta(null)}
        uid={cuentaDatosAbierta?.uid}
        emailCuenta={cuentaDatosAbierta?.email}
        solicitudInicial={cuentaDatosAbierta?.solicitudInicial}
      />

      <ModalPlantillaEmail
        isOpen={!!plantillaEditando}
        onClose={() => setPlantillaEditando(null)}
        plantilla={plantillaEditando}
        onGuardado={cargarPlantillasEmail}
      />
    </div>
  );
}



