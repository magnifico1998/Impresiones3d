import React, { useEffect, useMemo, useState } from 'react';
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
export default function AdminPage() {
  const { user, showToast } = useApp();
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

  const [planes, setPlanes] = useState([]);
  const [loadingPlanes, setLoadingPlanes] = useState(true);
  const [modalPlanAbierto, setModalPlanAbierto] = useState(false);
  const [planEditando, setPlanEditando] = useState(null); // null = nuevo
  const [listaPlanesAbierta, setListaPlanesAbierta] = useState(false);
  const [listaSolicitudesAbierta, setListaSolicitudesAbierta] = useState(false);

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

  const ejecutarAccion = async (uid, accion, planId) => {
    setAccionEnCurso(`${uid}:${accion}`);
    try {
      const cambiarEstado = httpsCallable(functions, 'cambiarEstadoSuscripcion');
      await cambiarEstado({ uid, accion, planId });
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

  // Lookup rápido para saber si el uid de una solicitud ya tiene una
  // suscripción activa (osea, ya se convirtió en cliente pago).
  const cuentaPorUid = Object.fromEntries(cuentas.map(c => [c.uid, c]));

  // Sólo las solicitudes que TODAVÍA no se convirtieron en suscripción
  // activa se muestran en la lista y se incluyen en la exportación — una
  // vez que se activa, esa persona ya vive en la tabla de Suscripciones de
  // arriba, no tiene sentido seguir viéndola acá como "contacto pendiente".
  const solicitudesPendientes = solicitudes.filter(s => cuentaPorUid[s.uid]?.estado !== 'activa');

  // Datos personales del formulario de contacto, indexados por uid, para
  // mostrarlos junto a cada suscriptor (no sólo mientras está "pendiente"
  // de activar) — es la única fuente de nombre/teléfono/localidad real que
  // existe hoy, la cuenta en sí sólo tiene el email de Google.
  const solicitudPorUid = useMemo(
    () => Object.fromEntries(solicitudes.map(s => [s.uid, s])),
    [solicitudes]
  );

  const cuentasFiltradas = useMemo(() => {
    const q = busquedaSuscriptores.trim().toLowerCase();
    return cuentas.filter(c => {
      if (filtroEstadoSuscriptores !== 'todos' && c.estado !== filtroEstadoSuscriptores) return false;
      if (!q) return true;
      const s = solicitudPorUid[c.uid];
      const campos = [c.email, c.uid, s?.nombre, s?.apellido, s?.telefono, s?.localidad, s?.email]
        .filter(Boolean).join(' ').toLowerCase();
      return campos.includes(q);
    });
  }, [cuentas, busquedaSuscriptores, filtroEstadoSuscriptores, solicitudPorUid]);

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
      <div className="page-title">Administrador</div>
      <div className="page-sub">Panel visible sólo para administradores.</div>

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
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
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        disabled={!planSeleccionadoPorSolicitud[s.uid] || accionEnCurso === `${s.uid}:activar`}
                        onClick={() => ejecutarAccion(s.uid, 'activar', planSeleccionadoPorSolicitud[s.uid])}
                      >
                        {accionEnCurso === `${s.uid}:activar` ? 'Activando...' : 'Activar suscripción'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- Planes ---- */}
      <div className="card">
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
      </div>

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
                            <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                className="btn"
                                style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                disabled={accionEnCurso === `${c.uid}:activar`}
                                onClick={() => ejecutarAccion(c.uid, 'activar', planElegido || null)}
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
                                  <button
                                    className="btn btn-danger"
                                    style={{ fontSize: '11px', padding: '4px 8px', width: '130px', boxSizing: 'border-box' }}
                                    disabled={borrandoUid === c.uid}
                                    onClick={() => borrarCuentaDefinitivamente(c.uid, c.email)}
                                  >
                                    {borrandoUid === c.uid ? 'Borrando...' : '✕ Borrar cuenta'}
                                  </button>
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

      {/* ---- Plantillas de mail ---- */}
      <div className="card">
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
      </div>

      {/* ---- Administradores actuales ---- */}
      <div className="card">
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
      </div>

      <ModalPlan
        isOpen={modalPlanAbierto}
        onClose={() => setModalPlanAbierto(false)}
        plan={planEditando}
      />

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



