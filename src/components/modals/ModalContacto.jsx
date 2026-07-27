import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { validarTelefono } from '../../utils/paises';

// Formulario de "contactate con el admin". Se guarda en
// solicitudesContacto/{uid} — un doc por cuenta, así que enviarlo de nuevo
// simplemente actualiza el mismo registro (ver definición de Fase 0: se
// manda una vez, después se puede editar).
export default function ModalContacto({ isOpen, onClose }) {
  const { user, cuentaId, showToast, paisActual } = useApp();

  const [form, setForm] = useState({
    nombre: '', apellido: '', tipoDocumento: 'DNI', numeroDocumento: '', condicionImpositiva: '',
    localidad: '', telefono: '', email: '', resena: ''
  });
  const [yaEnviado, setYaEnviado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!isOpen || !cuentaId) return;
    setCargando(true);
    getDoc(doc(db, 'solicitudesContacto', cuentaId))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setForm({
            nombre: d.nombre || '',
            apellido: d.apellido || '',
            tipoDocumento: d.tipoDocumento || 'DNI',
            numeroDocumento: d.numeroDocumento || '',
            condicionImpositiva: d.condicionImpositiva || '',
            localidad: d.localidad || '',
            telefono: d.telefono || '',
            email: d.email || user.email || '',
            resena: d.resena || ''
          });
          setYaEnviado(true);
        } else {
          setForm(prev => ({ ...prev, email: user.email || '' }));
          setYaEnviado(false);
        }
      })
      .catch(() => showToast('No se pudo cargar tu solicitud previa.', 'error'))
      .finally(() => setCargando(false));
  }, [isOpen, cuentaId, user, showToast]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    // El teléfono sólo acepta dígitos, y como máximo los que tenga el país elegido.
    if (id === 'telefono') {
      setForm(prev => ({ ...prev, telefono: value.replace(/\D/g, '').slice(0, paisActual.longitudTelefono) }));
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
    return null;
  };

  const handleGuardar = async () => {
    const error = validar();
    if (error) { showToast(error, 'error'); return; }

    setGuardando(true);
    try {
      await setDoc(doc(db, 'solicitudesContacto', cuentaId), {
        ...form,
        estado: 'pendiente',
        actualizadoEl: serverTimestamp(),
        ...(yaEnviado ? {} : { creadoEl: serverTimestamp() })
      }, { merge: true });
      setYaEnviado(true);
      showToast(yaEnviado ? 'Solicitud actualizada' : 'Solicitud enviada, pronto nos contactaremos');
      onClose();
    } catch (e) {
      console.error('Error al guardar la solicitud de contacto:', e);
      showToast('No se pudo enviar la solicitud. Probá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {yaEnviado ? 'Tu solicitud de contratación' : 'Contactate con el área comercial'}
        </div>

        {yaEnviado && (
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
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando || cargando}>
            {guardando ? 'Enviando...' : (yaEnviado ? 'Actualizar solicitud' : 'Enviar solicitud')}
          </button>
        </div>
      </div>
    </div>
  );
}
