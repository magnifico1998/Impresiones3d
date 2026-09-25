import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { db, functions } from '../../firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// Precio del plan de Manager3D, siempre en pesos (mismo criterio que
// EmpresaPage.jsx).
const fmtMoneda = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

const limiteTexto = (valor, singular, plural) =>
  valor === null || valor === undefined ? `${plural} ilimitados` : `${valor.toLocaleString('es-AR')} ${valor === 1 ? singular : plural}`;

// Contratación de un plan con débito automático mensual de Mercado Pago (ver
// functions/http/pagosMercadoPago.js). Acá sólo se elige el plan y se
// redirige a Mercado Pago: el plan se activa recién cuando el primer cobro
// se acredita (lo aplica el webhook), y la app lo refleja sola porque
// escucha suscripcion/actual en vivo.
export default function ModalSuscribirse({ isOpen, onClose }) {
  const { showToast, suscripcion, user } = useApp();
  const [planes, setPlanes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [planId, setPlanId] = useState(null);
  const [redirigiendo, setRedirigiendo] = useState(false);
  // Mercado Pago puede exigir que el débito lo autorice una cuenta de MP con
  // este mismo email, que no siempre es el de Google con el que se entra.
  const [emailMP, setEmailMP] = useState('');

  useEffect(() => {
    if (isOpen) setEmailMP((actual) => actual || user?.email || '');
  }, [isOpen, user?.email]);

  const debitoActivo = suscripcion?.cobro?.estado === 'authorized' ? suscripcion.cobro : null;

  useEffect(() => {
    if (!isOpen) return;
    setCargando(true);
    getDocs(query(collection(db, 'planes'), orderBy('orden')))
      .then((snap) => {
        const contratables = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.activo !== false && !p.gratuito && Number(p.precioMensual) > 0);
        setPlanes(contratables);
        setPlanId((actual) => actual || contratables.find((p) => p.id === suscripcion?.planId)?.id || contratables[0]?.id || null);
      })
      .catch((e) => {
        console.error('Error al listar planes:', e);
        showToast('No se pudieron cargar los planes.', 'error');
      })
      .finally(() => setCargando(false));
  }, [isOpen, suscripcion?.planId, showToast]);

  if (!isOpen) return null;

  const mismoPlanQueElDebito = debitoActivo && debitoActivo.planId === planId;

  const handlePagar = async () => {
    setRedirigiendo(true);
    try {
      const crear = httpsCallable(functions, 'crearSuscripcionMP');
      const { data } = await crear({ planId, emailMP: emailMP.trim() });
      window.location.href = data.initPoint;
    } catch (e) {
      console.error('Error al iniciar el pago con Mercado Pago:', e);
      showToast(e?.message || 'No se pudo iniciar el pago.', 'error');
      setRedirigiendo(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{debitoActivo ? 'Cambiar de plan' : 'Contratar un plan'}</div>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.5 }}>
          El pago es con <strong>débito automático mensual</strong> por Mercado Pago. Tu plan se activa apenas se acredita el primer pago, y si todavía te quedan días de prueba o de plan, se suman.
          {debitoActivo && ' Al autorizar el plan nuevo, el débito del plan actual se da de baja solo.'}
        </p>

        {cargando && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando planes...</div>}
        {!cargando && planes.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>No hay planes disponibles para contratar en este momento.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {planes.map((p) => (
            <label
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                border: `1px solid ${planId === p.id ? 'var(--accent)' : 'var(--border)'}`,
                background: planId === p.id ? 'var(--accentDim)' : 'transparent',
                borderRadius: 'var(--radius2)', padding: '10px 12px'
              }}
            >
              <input type="radio" name="plan" checked={planId === p.id} onChange={() => setPlanId(p.id)} style={{ width: 'auto' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>
                    {p.nombre}
                    {debitoActivo?.planId === p.id && <span className="badge badge-done" style={{ marginLeft: '6px' }}>actual</span>}
                  </span>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--mono)' }}>{fmtMoneda(p.precioMensual)}/mes</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
                  {limiteTexto(p.limites?.pedidosMes, 'pedido/mes', 'pedidos/mes')} · {limiteTexto(p.limites?.usuarios, 'usuario', 'usuarios')} · {limiteTexto(p.limites?.productosBiblioteca, 'producto', 'productos')}
                </div>
              </div>
            </label>
          ))}
        </div>

        {planes.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <label className="fl">Email de tu cuenta de Mercado Pago</label>
            <input
              type="email"
              value={emailMP}
              onChange={(e) => setEmailMP(e.target.value)}
              placeholder="tucuenta@email.com"
            />
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
              Tiene que ser el email con el que entrás a Mercado Pago para pagar, aunque sea distinto al de esta app.
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handlePagar}
            disabled={!planId || redirigiendo || mismoPlanQueElDebito || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailMP.trim())}
            title={mismoPlanQueElDebito ? 'Ya tenés débito automático de este plan.' : undefined}
          >
            {redirigiendo ? 'Abriendo Mercado Pago...' : 'Pagar con Mercado Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
