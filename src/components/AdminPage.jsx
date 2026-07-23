import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { db, functions } from '../firebase';
import { collection, collectionGroup, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

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

  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true);

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

  const ejecutarAccion = async (uid, accion) => {
    setAccionEnCurso(`${uid}:${accion}`);
    try {
      const cambiarEstado = httpsCallable(functions, 'cambiarEstadoSuscripcion');
      await cambiarEstado({ uid, accion });
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
        <div className="card-title">Suscripciones</div>

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
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => {
                  const vence = c.estado === 'trial' ? fmtFecha(c.trialFin)
                    : c.estado === 'activa' ? fmtFecha(c.cicloFin)
                    : c.estado === 'lectura' ? fmtFecha(c.fechaLimiteLectura)
                    : '—';
                  return (
                    <tr key={c.uid}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{c.email || c.uid}</td>
                      <td>{badgeEstado(c.estado)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{vence}</td>
                      <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          disabled={accionEnCurso === `${c.uid}:activar`}
                          onClick={() => ejecutarAccion(c.uid, 'activar')}
                        >
                          Activar
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          disabled={accionEnCurso === `${c.uid}:extenderTrial`}
                          onClick={() => ejecutarAccion(c.uid, 'extenderTrial')}
                        >
                          +7 días trial
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
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

      {/* ---- Solicitudes de contacto ---- */}
      <div className="card">
        <div className="card-title">Solicitudes de contacto</div>

        {loadingSolicitudes && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}

        {!loadingSolicitudes && solicitudes.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>No hay solicitudes todavía.</div>
        )}

        {!loadingSolicitudes && solicitudes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {solicitudes.map((s) => (
              <div key={s.uid} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius2)', padding: '12px', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.nombre} {s.apellido}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{s.localidad} · {s.telefono} · {s.email}</div>
                    {s.resena && <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>{s.resena}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge ${s.estado === 'contactado' ? 'badge-done' : 'badge-pending'}`}>{s.estado || 'pendiente'}</span>
                    {s.estado !== 'contactado' && (
                      <button className="btn" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => marcarContactado(s.uid)}>
                        Marcar contactado
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}

