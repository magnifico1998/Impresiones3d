import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

// Panel de administración: sólo lo ven los emails presentes en la
// colección Firestore "admins" (ver App.jsx -> guard de isAdmin y
// firestore.rules -> match /admins/{email}).
//
// De acá en más es donde vamos a ir sumando lo de configuración de
// suscripciones (planes, estados de pago, límites por plan, etc.).
export default function AdminPage() {
  const { user } = useApp();
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [errorAdmins, setErrorAdmins] = useState(false);

  useEffect(() => {
    const colRef = collection(db, 'admins');
    const unsubscribe = onSnapshot(
      colRef,
      (snap) => {
        const lista = snap.docs.map(d => ({ email: d.id, ...d.data() }));
        setAdmins(lista);
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

  return (
    <div className="page active">
      <div className="page-title">Administrador</div>
      <div className="page-sub">Panel visible sólo para administradores. Acá vamos a ir sumando la configuración de suscripciones.</div>

      <div className="card">
        <div className="card-title">Administradores actuales</div>

        {loadingAdmins && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>
        )}

        {errorAdmins && (
          <div style={{ fontSize: '13px', color: 'var(--danger)' }}>
            No se pudo cargar el listado de administradores.
          </div>
        )}

        {!loadingAdmins && !errorAdmins && admins.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            No hay administradores cargados todavía.
          </div>
        )}

        {!loadingAdmins && admins.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {admins.map(a => (
              <div
                key={a.email}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius2)',
                  background: 'var(--bg)'
                }}
              >
                <span style={{ fontSize: '13px', fontFamily: 'var(--mono)' }}>{a.email}</span>
                {user?.email?.toLowerCase() === a.email && (
                  <span className="badge badge-done">vos</span>
                )}
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '14px', lineHeight: 1.5 }}>
          Por seguridad, agregar o quitar administradores no se hace desde acá:
          se gestiona directamente en Firebase Console → Firestore → colección{' '}
          <code>admins</code> (un documento por email, en minúsculas, como ID
          del documento). Así evitamos que un admin comprometido pueda
          escalar privilegios escribiendo esta colección desde la propia app.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Suscripciones</div>
        <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
          Próximamente: configuración de planes, estado de pago y límites por empresa.
        </p>
      </div>
    </div>
  );
}
