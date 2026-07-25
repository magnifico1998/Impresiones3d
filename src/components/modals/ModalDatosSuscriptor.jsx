import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const FORM_VACIO = {
  nombre: '', apellido: '', tipoDocumento: 'DNI', numeroDocumento: '', condicionImpositiva: '',
  localidad: '', telefono: '', email: ''
};

// Ver/editar, desde el panel de admin, los datos personales/impositivos de
// un suscriptor. Viven en su PROPIA colección (datosSuscriptor/{uid}),
// separada de solicitudesContacto/{uid} -- antes se guardaban ahí mismo, y
// como solicitudesContacto tiene su propio flujo de "pendiente/contactado"
// para leads entrantes, cada corrección que hacía el admin (ej: arreglar un
// teléfono mal tipeado) terminaba resucitando esa cuenta en la lista de
// "Solicitudes de contacto" como si fuera un pedido de contacto nuevo. Acá
// no pasa: esta colección no tiene estado ni se lista en ningún lado más
// que este modal.
//
// Para no obligar a retipear todo la primera vez, si todavía no existe un
// datosSuscriptor para ese uid se precarga (una sola vez, al abrir) con lo
// que el interesado haya cargado en su solicitud de contacto original
// (solicitudInicial) -- pero a partir de ahí guarda siempre acá, nunca en
// solicitudesContacto.
//
// A propósito NO se pide acá "¿Qué harías con la aplicación?" (resena):
// sirve para el primer contacto, pero una vez que el admin ya está
// gestionando al suscriptor no aporta nada.
export default function ModalDatosSuscriptor({ isOpen, onClose, uid, emailCuenta, solicitudInicial }) {
  const { showToast } = useApp();
  const [form, setForm] = useState(FORM_VACIO);
  const [cargando, setCargando] = useState(true);
  const [existeRegistro, setExisteRegistro] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!isOpen || !uid) return;
    setCargando(true);
    getDoc(doc(db, 'datosSuscriptor', uid))
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
            email: d.email || ''
          });
          setExisteRegistro(true);
        } else {
          // Primera vez: precarga con lo que ya había en la solicitud de
          // contacto original, sólo como punto de partida.
          setForm({
            nombre: solicitudInicial?.nombre || '',
            apellido: solicitudInicial?.apellido || '',
            tipoDocumento: 'DNI',
            numeroDocumento: '',
            condicionImpositiva: '',
            localidad: solicitudInicial?.localidad || '',
            telefono: solicitudInicial?.telefono || '',
            email: solicitudInicial?.email || emailCuenta || ''
          });
          setExisteRegistro(false);
        }
      })
      .catch(() => showToast('No se pudieron cargar los datos del suscriptor.', 'error'))
      .finally(() => setCargando(false));
  }, [isOpen, uid, solicitudInicial, emailCuenta, showToast]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    if (id === 'telefono') {
      setForm(prev => ({ ...prev, telefono: value.replace(/\D/g, '').slice(0, 10) }));
      return;
    }
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const validar = () => {
    if (!form.nombre.trim()) return 'Falta el nombre.';
    if (!form.apellido.trim()) return 'Falta el apellido.';
    if (form.telefono && !/^[0-9]{10}$/.test(form.telefono)) return 'El teléfono debe tener exactamente 10 dígitos, sin 0 ni 15 (ej: 3511234567).';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return 'El email no es válido.';
    return null;
  };

  const handleGuardar = async () => {
    const error = validar();
    if (error) { showToast(error, 'error'); return; }

    setGuardando(true);
    try {
      await setDoc(doc(db, 'datosSuscriptor', uid), {
        ...form,
        actualizadoEl: serverTimestamp(),
        ...(existeRegistro ? {} : { creadoEl: serverTimestamp() })
      }, { merge: true });
      showToast('✓ Datos del suscriptor actualizados.');
      onClose();
    } catch (e) {
      console.error('Error al guardar los datos del suscriptor:', e);
      showToast('No se pudo guardar. Probá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Datos del suscriptor</div>
        <p className="modal-sub">{emailCuenta || uid}</p>

        {cargando ? (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>
        ) : (
          <div className="grid2">
            <div>
              <label className="fl" style={{ marginTop: 0 }}>Nombre</label>
              <input type="text" id="nombre" value={form.nombre} onChange={handleChange} />
            </div>
            <div>
              <label className="fl" style={{ marginTop: 0 }}>Apellido</label>
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
              <label className="fl">Teléfono (10 dígitos, sin 0 ni 15)</label>
              <input type="text" id="telefono" inputMode="numeric" placeholder="3511234567" value={form.telefono} onChange={handleChange} />
            </div>
            <div>
              <label className="fl">Correo electrónico</label>
              <input type="email" id="email" value={form.email} onChange={handleChange} />
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando || cargando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
