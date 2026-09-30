import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db, functions } from '../../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { validarTelefono } from '../../utils/paises';

// Formulario de contacto, que es también el "perfil" que da acceso al plan
// gratuito Boceto. Dos modos, mismo formulario:
//   - 'contacto': "Contactate con el área comercial".
//   - 'boceto': "Completá tu perfil y seguí gratis" (se abre desde los
//     carteles de prueba, modo lectura y cuenta bloqueada).
// En los dos se guarda:
//   - solicitudesContacto/{uid}: el lead comercial (un doc por cuenta; al
//     crearse le avisa al admin, ver onNuevaSolicitudContacto);
//   - la ficha del suscriptor, vía completarPerfil (functions/http/
//     perfil.js): deja el perfil completo y, según el estado de la cuenta,
//     la pasa al plan Boceto ahora o al vencer la prueba.

const COMO_NOS_CONOCISTE = ['Instagram', 'Facebook', 'Google', 'YouTube', 'Recomendación', 'Grupo o comunidad maker', 'Revendedor', 'Otro'];

const formVacio = {
  nombre: '', apellido: '', tipoDocumento: 'DNI', numeroDocumento: '', condicionImpositiva: '',
  localidad: '', telefono: '', email: '', emprendimiento: '', comoNosConociste: '', resena: '', codigoRevendedor: ''
};

export default function ModalContacto({ isOpen, onClose, modo = 'contacto' }) {
  const { user, cuentaId, showToast, paisActual, empresa, setEmpresa, suscripcion } = useApp();
  const esBoceto = modo === 'boceto';

  const [form, setForm] = useState(formVacio);
  const [yaEnviado, setYaEnviado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  // Validación en vivo del código de revendedor: 'idle' | 'validando' |
  // 'valido' | 'invalido'. Se dispara con debounce para no llamar a la
  // función en cada tecla, y muestra nombre/apellido/email de quien es
  // dueño del código para que el interesado confirme que lo tipeó bien.
  const [estadoCodigo, setEstadoCodigo] = useState('idle');
  const [contactoRevendedor, setContactoRevendedor] = useState(null);

  useEffect(() => {
    const codigo = form.codigoRevendedor.trim();
    if (!codigo || !/^[A-Z0-9]{4,12}$/.test(codigo)) {
      setEstadoCodigo('idle');
      setContactoRevendedor(null);
      return;
    }
    setEstadoCodigo('validando');
    const idTimeout = setTimeout(async () => {
      try {
        const validar = httpsCallable(functions, 'validarCodigoRevendedor');
        const { data } = await validar({ codigo });
        if (data.valido) {
          setEstadoCodigo('valido');
          setContactoRevendedor(data);
        } else {
          setEstadoCodigo('invalido');
          setContactoRevendedor(null);
        }
      } catch (e) {
        console.error('Error al validar el código de revendedor:', e);
        setEstadoCodigo('invalido');
        setContactoRevendedor(null);
      }
    }, 500);
    return () => clearTimeout(idTimeout);
  }, [form.codigoRevendedor]);

  // Precarga: la solicitud de contacto previa y la ficha del suscriptor
  // (datos del checkout o del admin). De cada campo, el primero que tenga
  // valor; así no se pide dos veces lo mismo.
  useEffect(() => {
    if (!isOpen || !cuentaId) return;
    setCargando(true);
    const leer = (ruta) => getDoc(doc(db, ...ruta)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
    Promise.all([leer(['solicitudesContacto', cuentaId]), leer(['datosSuscriptor', cuentaId])])
      .then(([solicitud, ficha]) => {
        const s = solicitud || {};
        const f = ficha || {};
        const primero = (...valores) => valores.find((v) => v) || '';
        setForm({
          nombre: primero(s.nombre, f.nombre),
          apellido: primero(s.apellido, f.apellido),
          tipoDocumento: primero(s.numeroDocumento && s.tipoDocumento, f.tipoDocumento, 'DNI'),
          numeroDocumento: primero(s.numeroDocumento, f.numeroDocumento),
          condicionImpositiva: primero(s.condicionImpositiva, f.condicionImpositiva),
          localidad: primero(s.localidad, f.localidad),
          telefono: primero(s.telefono, f.telefono),
          email: primero(s.email, f.email, user?.email),
          emprendimiento: primero(s.emprendimiento, f.emprendimiento, empresa?.nombre),
          comoNosConociste: primero(s.comoNosConociste, f.comoNosConociste),
          resena: s.resena || '',
          codigoRevendedor: s.codigoRevendedor || ''
        });
        setYaEnviado(!!solicitud);
      })
      .finally(() => setCargando(false));
    // A propósito sin empresa en las dependencias: sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cuentaId, user]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    // El teléfono sólo acepta dígitos, y como máximo los que tenga el país elegido.
    if (id === 'telefono') {
      setForm(prev => ({ ...prev, telefono: value.replace(/\D/g, '').slice(0, paisActual.longitudTelefono) }));
      return;
    }
    if (id === 'codigoRevendedor') {
      setForm(prev => ({ ...prev, codigoRevendedor: value.toUpperCase().slice(0, 12) }));
      return;
    }
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const validar = () => {
    if (!form.nombre.trim()) return 'Falta el nombre.';
    if (!form.apellido.trim()) return 'Falta el apellido.';
    if (!form.localidad.trim()) return 'Falta la localidad.';
    if (!validarTelefono(form.telefono, paisActual.id)) return paisActual.mensajeTelefono;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return 'El email no es válido.';
    const docLimpio = form.numeroDocumento.replace(/\D/g, '');
    if (docLimpio && !(form.tipoDocumento === 'CUIT' ? /^\d{11}$/.test(docLimpio) : /^\d{7,8}$/.test(docLimpio))) {
      return form.tipoDocumento === 'CUIT' ? 'El CUIT tiene que tener 11 dígitos.' : 'El DNI tiene que tener 7 u 8 dígitos.';
    }
    if (form.codigoRevendedor && !/^[A-Z0-9]{4,12}$/.test(form.codigoRevendedor)) {
      return 'El código de revendedor debe tener entre 4 y 12 letras/números.';
    }
    return null;
  };

  const handleGuardar = async () => {
    const error = validar();
    if (error) { showToast(error, 'error'); return; }

    setGuardando(true);
    try {
      const solicitudNueva = !yaEnviado;
      await setDoc(doc(db, 'solicitudesContacto', cuentaId), {
        ...form,
        codigoRevendedor: form.codigoRevendedor.trim() || null,
        estado: 'pendiente',
        origen: esBoceto ? 'boceto' : 'contacto',
        actualizadoEl: serverTimestamp(),
        ...(solicitudNueva ? { creadoEl: serverTimestamp() } : {})
      }, { merge: true });
      setYaEnviado(true);

      // Ficha del suscriptor y plan Boceto. Si la solicitud es nueva, el
      // admin ya recibe el aviso de contacto: no hace falta el de perfil.
      let resultado = null;
      try {
        const r = await httpsCallable(functions, 'completarPerfil')({ ...form, avisarAdmin: !solicitudNueva });
        resultado = r.data;
      } catch (e) {
        // Un miembro invitado puede escribir al área comercial pero no
        // completar el perfil del dueño: en modo contacto no es un error.
        if (esBoceto) throw e;
        console.warn('No se completó el perfil desde el contacto:', e?.message);
      }

      // El nombre del emprendimiento también completa "Mi emprendimiento".
      if (form.emprendimiento.trim() && !empresa?.nombre) {
        setEmpresa((prev) => ({ ...prev, nombre: form.emprendimiento.trim() }));
      }

      if (resultado?.pasoAPlanGratuito) {
        showToast('¡Listo! Tu cuenta pasó al plan Boceto: seguí usando Manager3D gratis.', 'success', 8000);
      } else if (esBoceto && resultado?.planGratuitoAlVencer) {
        showToast('¡Perfil completo! Cuando termine la prueba seguís gratis con el plan Boceto.', 'success', 8000);
      } else if (esBoceto) {
        showToast('Perfil guardado.');
      } else {
        showToast(solicitudNueva ? 'Solicitud enviada, pronto nos contactaremos' : 'Solicitud actualizada');
      }
      onClose();
    } catch (e) {
      console.error('Error al guardar el formulario de contacto:', e);
      showToast(e?.message || 'No se pudo enviar. Probá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!isOpen) return null;

  const enPrueba = suscripcion?.estado === 'trial';
  const titulo = esBoceto
    ? 'Completá tu perfil y seguí gratis'
    : (yaEnviado ? 'Tu solicitud de contratación' : 'Contactate con el área comercial');
  const textoBoton = esBoceto
    ? (enPrueba ? 'Completar perfil' : 'Completar y activar Boceto')
    : (yaEnviado ? 'Actualizar solicitud' : 'Enviar solicitud');

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{titulo}</div>

        {esBoceto ? (
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.5 }}>
            {enPrueba
              ? <>Tenés <strong>7 días con todas las funciones</strong>. Completá tu perfil y, cuando termine la prueba, seguís usando Manager3D <strong>gratis</strong> con el <strong>plan Boceto</strong>.</>
              : <>Completá tu perfil y tu cuenta pasa ahora mismo al <strong>plan Boceto</strong>: seguís usando Manager3D <strong>gratis</strong>, con tus datos de siempre.</>}
          </p>
        ) : yaEnviado && (
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.5 }}>
            Ya recibimos tu solicitud, pronto nos contactaremos. Si algún dato cambió, lo podés actualizar acá abajo.
          </p>
        )}

        {cargando ? (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>
        ) : (
          <div className="grid2">
            <div>
              <label className="fl">Nombre</label>
              <input type="text" id="nombre" value={form.nombre} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Apellido</label>
              <input type="text" id="apellido" value={form.apellido} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Nombre del emprendimiento (opcional)</label>
              <input type="text" id="emprendimiento" placeholder="Ej: Impresiones Juana" value={form.emprendimiento} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">¿Cómo nos conociste? (opcional)</label>
              <select id="comoNosConociste" value={form.comoNosConociste} onChange={handleChange}>
                <option value="">— Elegí una opción —</option>
                {COMO_NOS_CONOCISTE.map((o) => <option key={o} value={o}>{o}</option>)}
                {form.comoNosConociste && !COMO_NOS_CONOCISTE.includes(form.comoNosConociste) && (
                  <option value={form.comoNosConociste}>{form.comoNosConociste}</option>
                )}
              </select>
            </div>
            <div>
              <label className="fl">Tipo de documento</label>
              <select id="tipoDocumento" value={form.tipoDocumento} onChange={handleChange}>
                <option value="DNI">DNI</option>
                <option value="CUIT">CUIT</option>
              </select>
            </div>
            <div>
              <label className="fl">Número de documento</label>
              <input type="text" id="numeroDocumento" value={form.numeroDocumento} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Condición impositiva</label>
              <input type="text" id="condicionImpositiva" placeholder="Ej: Monotributo, Responsable Inscripto..." value={form.condicionImpositiva} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Localidad</label>
              <input type="text" id="localidad" value={form.localidad} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Teléfono</label>
              <input type="text" id="telefono" inputMode="numeric" placeholder={paisActual.mensajeTelefono} value={form.telefono} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Correo electrónico</label>
              <input type="email" id="email" value={form.email} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Código de revendedor (opcional)</label>
              <input
                type="text"
                id="codigoRevendedor"
                placeholder="Si te lo pasó un revendedor…"
                value={form.codigoRevendedor}
                onChange={handleChange}
              />
              {estadoCodigo === 'validando' && (
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>Comprobando código…</p>
              )}
              {estadoCodigo === 'valido' && contactoRevendedor && (
                <p style={{ fontSize: '12px', color: 'var(--success, #2a9d5c)', marginTop: '4px' }}>
                  ✓ Revendedor: {[contactoRevendedor.nombre, contactoRevendedor.apellido].filter(Boolean).join(' ') || contactoRevendedor.email}
                  {contactoRevendedor.email ? ` (${contactoRevendedor.email})` : ''}
                </p>
              )}
              {estadoCodigo === 'invalido' && (
                <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>No encontramos ningún revendedor con ese código.</p>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="fl">¿Qué harías con la aplicación?</label>
              <textarea
                id="resena"
                rows={3}
                maxLength={600}
                value={form.resena}
                onChange={handleChange}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{esBoceto ? 'Más tarde' : 'Cancelar'}</button>
          <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando || cargando}>
            {guardando ? 'Enviando...' : textoBoton}
          </button>
        </div>
      </div>
    </div>
  );
}
