import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { db, functions } from '../firebase';
import { collection, collectionGroup, onSnapshot, doc, updateDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import ModalPlan from './modals/ModalPlan';

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
  const [inicializandoLegacy, setInicializandoLegacy] = useState(false);
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

  // Backfill de una sola vez para cuentas que se registraron antes de que
  // existiera el sistema de suscripciones (no tienen suscripcion/actual, y
  // por eso nunca aparecían en esta tabla). Las deja en estado "activa"
  // sin plan asignado -- de ahí en más se editan una por una con el
  // selector de plan de cada fila, como cualquier otra cuenta.
  const inicializarLegacy = async () => {
    setInicializandoLegacy(true);
    try {
      const inicializar = httpsCallable(functions, 'inicializarCuentasLegacy');
      const { data } = await inicializar();
      showToast(`Listo: se inicializaron ${data.creadas} de ${data.totalUsuarios} cuentas.`);
    } catch (e) {
      console.error('Error al inicializar cuentas legacy:', e);
      showToast(e?.message || 'No se pudo completar la inicialización.', 'error');
    } finally {
      setInicializandoLegacy(false);
    }
  };

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

      {/* ---- Suscripciones ---- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Suscripciones</div>
          <button
            className="btn"
            style={{ fontSize: '11px', padding: '5px 10px' }}
            disabled={inicializandoLegacy}
            onClick={inicializarLegacy}
            title="Da de alta en estado 'activa' a las cuentas viejas que todavía no tienen suscripción inicializada"
          >
            {inicializandoLegacy ? 'Inicializando...' : '⚙ Inicializar cuentas antiguas'}
          </button>
        </div>

        {loadingCuentas && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}

        {!loadingCuentas && cuentas.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Todavía no hay cuentas con suscripción.</div>
        )}

        {!loadingCuentas && cuentas.length > 0 && (
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
                {cuentas.map((c) => {
                  const vence = c.estado === 'trial' ? fmtFecha(c.trialFin)
                    : c.estado === 'activa' ? fmtFecha(c.cicloFin)
                    : c.estado === 'lectura' ? fmtFecha(c.fechaLimiteLectura)
                    : '—';
                  const planElegido = planSeleccionadoPorCuenta[c.uid] ?? c.planId ?? '';
                  const planDeLaCuenta = planes.find(p => p.id === c.planId);
                  const contador = contadoresPorUid[c.uid];
                  return (
                    <tr key={c.uid}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{c.email || c.uid}</td>
                      <td>{badgeEstado(c.estado)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{vence}</td>
                      <td>
                        <select
                          value={planElegido}
                          onChange={(e) => setPlanSeleccionadoPorCuenta(prev => ({ ...prev, [c.uid]: e.target.value }))}
                          style={{ fontSize: '12px', width: '150px' }}
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
                            style={{ fontSize: '11px', padding: '4px 8px', width: '110px' }}
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
                              style={{ fontSize: '10px', padding: '2px 6px', marginTop: '4px', width: '110px' }}
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
                          style={{ fontSize: '11px', padding: '4px 8px', width: '90px' }}
                          disabled={accionEnCurso === `${c.uid}:activar`}
                          onClick={() => ejecutarAccion(c.uid, 'activar', planElegido || null)}
                        >
                          Activar
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px', width: '90px' }}
                          disabled={accionEnCurso === `${c.uid}:extenderTrial`}
                          onClick={() => ejecutarAccion(c.uid, 'extenderTrial')}
                        >
                          +7 días trial
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px', width: '90px' }}
                          disabled={accionEnCurso === `${c.uid}:suspender`}
                          onClick={() => ejecutarAccion(c.uid, 'suspender')}
                        >
                          Suspender
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                        {p.limites?.usuarios ?? '∞'} usuarios · {p.limites?.pedidosMes ?? '∞'} pedidos/mes · {p.limites?.aperturasCatalogoMes ?? '∞'} aperturas/mes · ${Number(p.limites?.montoFacturadoMes ?? 0).toLocaleString('es-AR')}/mes facturado
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
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>No hay solicitudes pendientes — las que ya se activaron pasaron a Suscripciones.</div>
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
                        falta ir a buscarlo a la tabla de Suscripciones (y si es
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
    </div>
  );
}

