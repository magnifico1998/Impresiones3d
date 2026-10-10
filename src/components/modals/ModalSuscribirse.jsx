import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { db, functions } from '../../firebase';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { formatearMoneda, motivoTelefonoInvalido } from '../../utils/paises';
import SelectorCondicionImpositiva from '../SelectorCondicionImpositiva';
import { useCapaModal } from '../CapaModal';

const DATOS_VACIOS = {
  nombre: '', apellido: '', tipoDocumento: 'DNI', numeroDocumento: '',
  condicionImpositiva: '', telefono: '', localidad: ''
};

// Misma validación que hace crearSuscripcionMP en el servidor (que es la
// que manda); acá es para avisar antes de salir del paso.
function errorDatos(d, pais) {
  const digitosDoc = d.numeroDocumento.replace(/\D/g, '');
  if (!d.nombre.trim()) return 'Falta el nombre.';
  if (!d.apellido.trim()) return 'Falta el apellido.';
  if (d.tipoDocumento === 'CUIT' ? !/^\d{11}$/.test(digitosDoc) : !/^\d{7,8}$/.test(digitosDoc)) {
    return d.tipoDocumento === 'CUIT' ? 'El CUIT tiene que tener 11 dígitos.' : 'El DNI tiene que tener 7 u 8 dígitos.';
  }
  if (!d.condicionImpositiva.trim()) return 'Elegí la condición impositiva.';
  const motivoTel = motivoTelefonoInvalido(d.telefono, pais.id);
  if (motivoTel) return motivoTel;
  if (!d.localidad.trim()) return 'Falta la localidad.';
  return null;
}

// Precio del plan de Manager3D, siempre en pesos (mismo criterio que
// EmpresaPage.jsx).
const fmtMoneda = (n) => formatearMoneda(n, 'AR');

const limiteTexto = (valor, singular, plural) =>
  valor === null || valor === undefined ? `${plural} ilimitados` : `${valor.toLocaleString('es-AR')} ${valor === 1 ? singular : plural}`;

// Contratación de un plan con débito automático mensual de Mercado Pago (ver
// functions/http/pagosMercadoPago.js). Acá sólo se elige el plan y se
// redirige a Mercado Pago: el plan se activa recién cuando el primer cobro
// se acredita (lo aplica el webhook), y la app lo refleja sola porque
// escucha suscripcion/actual en vivo.
export default function ModalSuscribirse({ isOpen, onClose }) {
  const capaModal = useCapaModal({ onClose, activo: isOpen });
  const { showToast, suscripcion, user, empresa, cuentaId, paisActual } = useApp();
  const [planes, setPlanes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [planId, setPlanId] = useState(null);
  const [redirigiendo, setRedirigiendo] = useState(false);
  // Tres pasos: 1) elegir el plan, 2) datos de facturación, 3) confirmar el
  // email de la cuenta de Mercado Pago. Los datos son obligatorios porque
  // del login con Google la app sólo toma el email, y sin ellos no hay a
  // quién facturarle. El email va en un paso propio y con confirmación
  // explícita porque Mercado Pago puede exigir que el débito lo autorice una
  // cuenta de MP con ese mismo email, que no siempre es el de la tienda ni
  // el de Google.
  const [paso, setPaso] = useState(1);
  const [datos, setDatos] = useState(DATOS_VACIOS);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [avisoDatos, setAvisoDatos] = useState(false);
  const [emailMP, setEmailMP] = useState('');
  const [emailConfirmado, setEmailConfirmado] = useState(false);
  // Se prende si tocan "Pagar" sin haber confirmado el email: resalta la
  // casilla y explica qué falta.
  const [avisoConfirmar, setAvisoConfirmar] = useState(false);

  // Cada vez que se abre arranca de cero, con el email de contacto de la
  // tienda (Mi emprendimiento) o, si no tiene, el de la cuenta de Google.
  useEffect(() => {
    if (!isOpen) return;
    setPaso(1);
    setEmailMP(empresa?.email || user?.email || '');
    setEmailConfirmado(false);
    setAvisoConfirmar(false);
    setAvisoDatos(false);
    // Sólo al abrir: no pisar lo que el usuario está editando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Precarga los datos de facturación: primero la ficha del suscriptor
  // (datosSuscriptor, la que actualiza cada contratación y edita el admin) y,
  // campo por campo, lo que falte desde el formulario de contacto.
  useEffect(() => {
    if (!isOpen || !cuentaId) return;
    setCargandoDatos(true);
    const leer = (col) => getDoc(doc(db, col, cuentaId)).then((s) => (s.exists() ? s.data() : {})).catch(() => ({}));
    Promise.all([leer('datosSuscriptor'), leer('solicitudesContacto')])
      .then(([ficha, solicitud]) => {
        const valor = (campo) => ficha[campo] || solicitud[campo] || DATOS_VACIOS[campo];
        setDatos(Object.fromEntries(Object.keys(DATOS_VACIOS).map((campo) => [campo, String(valor(campo))])));
      })
      .finally(() => setCargandoDatos(false));
  }, [isOpen, cuentaId]);

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
  const listoParaPagar = Boolean(planId) && emailValido && emailConfirmado;
  const errorEnDatos = errorDatos(datos, paisActual);

  const handleCambioDato = (e) => {
    const { id, value } = e.target;
    const limpio = id === 'telefono' ? value.replace(/\D/g, '').slice(0, paisActual.longitudTelefono) : value;
    setDatos((prev) => ({ ...prev, [id]: limpio }));
  };

  const handlePagar = async () => {
    setRedirigiendo(true);
    try {
      const crear = httpsCallable(functions, 'crearSuscripcionMP');
      const { data } = await crear({ planId, emailMP: emailMP.trim(), datos });
      window.location.href = data.initPoint;
    } catch (e) {
      console.error('Error al iniciar el pago con Mercado Pago:', e);
      showToast(e?.message || 'No se pudo iniciar el pago.', 'error');
      setRedirigiendo(false);
    }
  };

  if (paso === 2) {
    return (
      <div className="modal-overlay open" {...capaModal}>
        <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>Paso 2 de 3</div>
          <div className="modal-title">Tus datos de facturación</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', margin: '6px 0 14px', lineHeight: 1.5 }}>
            Los necesitamos para emitirte la factura del plan. Si ya los habías cargado, revisá que estén al día.
          </p>

          {cargandoDatos ? (
            <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando tus datos...</div>
          ) : (
            <div className="grid2">
              <div>
                <label className="fl">Nombre</label>
                <input type="text" id="nombre" value={datos.nombre} onChange={handleCambioDato} autoFocus />
              </div>
              <div>
                <label className="fl">Apellido</label>
                <input type="text" id="apellido" value={datos.apellido} onChange={handleCambioDato} />
              </div>
              <div>
                <label className="fl">Tipo de documento</label>
                <select id="tipoDocumento" value={datos.tipoDocumento} onChange={handleCambioDato}>
                  <option value="DNI">DNI</option>
                  <option value="CUIT">CUIT</option>
                </select>
              </div>
              <div>
                <label className="fl">Número de {datos.tipoDocumento}</label>
                <input
                  type="text"
                  id="numeroDocumento"
                  inputMode="numeric"
                  placeholder={datos.tipoDocumento === 'CUIT' ? 'Ej: 20-12345678-9' : 'Ej: 30123456'}
                  value={datos.numeroDocumento}
                  onChange={handleCambioDato}
                />
              </div>
              <div>
                <label className="fl">Condición impositiva</label>
                <SelectorCondicionImpositiva value={datos.condicionImpositiva} onChange={handleCambioDato} />
              </div>
              <div>
                <label className="fl">Teléfono</label>
                <input type="text" id="telefono" inputMode="numeric" placeholder={paisActual.mensajeTelefono} value={datos.telefono} onChange={handleCambioDato} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="fl">Localidad</label>
                <input type="text" id="localidad" value={datos.localidad} onChange={handleCambioDato} />
              </div>
            </div>
          )}

          {avisoDatos && errorEnDatos && (
            <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '10px' }}>⚠ {errorEnDatos}</div>
          )}

          <div className="modal-footer">
            <button className="btn" onClick={() => setPaso(1)}>← Volver</button>
            {/* Mismo criterio que "Pagar" en el paso 3: se ve inactivo
                mientras falten datos, pero el click explica qué falta. */}
            <button
              className={`btn btn-primary${errorEnDatos ? ' btn-inactivo' : ''}`}
              aria-disabled={Boolean(errorEnDatos)}
              onClick={() => (errorEnDatos ? setAvisoDatos(true) : setPaso(3))}
              disabled={cargandoDatos}
            >
              Continuar →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (paso === 3) {
    return (
      <div className="modal-overlay open" {...capaModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>Paso 3 de 3</div>
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

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '14px', fontSize: '13px', cursor: 'pointer',
            padding: '8px 10px', borderRadius: 'var(--radius2)', transition: 'all .15s',
            border: `1px solid ${avisoConfirmar && !emailConfirmado ? 'var(--danger)' : 'transparent'}`,
            background: avisoConfirmar && !emailConfirmado ? 'var(--dangerDim)' : 'transparent'
          }}>
            <input
              type="checkbox"
              checked={emailConfirmado}
              onChange={(e) => { setEmailConfirmado(e.target.checked); if (e.target.checked) setAvisoConfirmar(false); }}
              disabled={!emailValido}
              style={{ width: 'auto', marginTop: '2px' }}
            />
            <span>Confirmo que <strong>{emailValido ? emailMP.trim() : 'este'}</strong> es el email con el que entro a Mercado Pago.</span>
          </label>

          {avisoConfirmar && !listoParaPagar && (
            <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>
              ⚠ {emailValido
                ? 'Para continuar, tildá la casilla confirmando que es el email de tu cuenta de Mercado Pago.'
                : 'Ingresá un email válido y confirmalo con la casilla para continuar.'}
            </div>
          )}

          <div className="modal-footer">
            <button className="btn" onClick={() => setPaso(2)} disabled={redirigiendo}>← Volver</button>
            {/* Se ve deshabilitado hasta confirmar el email, pero sigue
                escuchando el click para explicar qué falta (un botón
                disabled de verdad no recibe clicks). */}
            <button
              className={`btn btn-primary${listoParaPagar ? '' : ' btn-inactivo'}`}
              aria-disabled={!listoParaPagar}
              onClick={() => (listoParaPagar ? handlePagar() : setAvisoConfirmar(true))}
              disabled={redirigiendo}
            >
              {redirigiendo ? 'Abriendo Mercado Pago...' : 'Pagar con Mercado Pago'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>Paso 1 de 3</div>
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
                  {Number(p.limites?.gcodeGB) > 0 && ` · ${Number(p.limites.gcodeGB).toLocaleString('es-AR')} GB para archivos G-code`}
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
