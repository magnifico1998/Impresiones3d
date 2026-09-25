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
  const { showToast, suscripcion, user, empresa } = useApp();
  const [planes, setPlanes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [planId, setPlanId] = useState(null);
  const [redirigiendo, setRedirigiendo] = useState(false);
  // Dos pasos: 1) elegir el plan, 2) confirmar el email de la cuenta de
  // Mercado Pago. El email va en un paso propio y con confirmación explícita
  // porque Mercado Pago puede exigir que el débito lo autorice una cuenta de
  // MP con ese mismo email, que no siempre es el de la tienda ni el de Google.
  const [paso, setPaso] = useState(1);
  const [emailMP, setEmailMP] = useState('');
  const [emailConfirmado, setEmailConfirmado] = useState(false);

  // Cada vez que se abre arranca de cero, con el email de contacto de la
  // tienda (Mi emprendimiento) o, si no tiene, el de la cuenta de Google.
  useEffect(() => {
    if (!isOpen) return;
    setPaso(1);
    setEmailMP(empresa?.email || user?.email || '');
    setEmailConfirmado(false);
    // Sólo al abrir: no pisar lo que el usuario está editando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
  const planElegido = planes.find((p) => p.id === planId) || null;
  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailMP.trim());

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

  if (paso === 2) {
    return (
      <div className="modal-overlay open" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>Paso 2 de 2</div>
          <div className="modal-title">Confirmá tu email de Mercado Pago</div>

          {planElegido && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', gap: '8px', margin: '10px 0 14px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius2)', padding: '10px 12px', fontSize: '13px'
            }}>
              <span>Plan <strong>{planElegido.nombre}</strong></span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoneda(planElegido.precioMensual)}/mes</span>
            </div>
          )}

          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.5 }}>
            Mercado Pago te va a pedir que ingreses con <strong>esta cuenta</strong> para autorizar el débito. Si en Mercado Pago usás otro email, cambialo acá antes de seguir.
          </p>

          <label className="fl">Email de tu cuenta de Mercado Pago</label>
          <input
            type="email"
            value={emailMP}
            onChange={(e) => { setEmailMP(e.target.value); setEmailConfirmado(false); }}
            placeholder="tucuenta@email.com"
            autoFocus
          />
          {emailMP.trim() && !emailValido && (
            <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>El email no es válido.</div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '14px', fontSize: '13px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={emailConfirmado}
              onChange={(e) => setEmailConfirmado(e.target.checked)}
              disabled={!emailValido}
              style={{ width: 'auto', marginTop: '2px' }}
            />
            <span>Confirmo que <strong>{emailValido ? emailMP.trim() : 'este'}</strong> es el email con el que entro a Mercado Pago.</span>
          </label>

          <div className="modal-footer">
            <button className="btn" onClick={() => setPaso(1)} disabled={redirigiendo}>← Volver</button>
            <button
              className="btn btn-primary"
              onClick={handlePagar}
              disabled={!planId || redirigiendo || !emailValido || !emailConfirmado}
            >
              {redirigiendo ? 'Abriendo Mercado Pago...' : 'Pagar con Mercado Pago'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>Paso 1 de 2</div>
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

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={() => setPaso(2)}
            disabled={!planId || mismoPlanQueElDebito}
            title={mismoPlanQueElDebito ? 'Ya tenés débito automático de este plan.' : undefined}
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
