import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useApp } from '../../context/AppContext';

// "Completá tu perfil": a cambio de los datos, la cuenta accede al plan
// gratuito Boceto (en prueba, al vencer; en modo lectura o bloqueada, en el
// momento). Lo guarda el servidor (completarPerfil, functions/http/perfil.js).

const COMO_NOS_CONOCISTE = ['Instagram', 'Facebook', 'Google', 'Recomendación', 'Grupo o comunidad maker', 'Revendedor', 'Otro'];

const vacio = { nombre: '', apellido: '', telefono: '', localidad: '', emprendimiento: '', comoNosConociste: '' };

export default function ModalCompletarPerfil({ isOpen, onClose }) {
  const { cuentaId, empresa, setEmpresa, suscripcion, showToast, paisActual } = useApp();
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);

  // Precarga con la ficha que ya tenga (datosSuscriptor) y los datos del
  // emprendimiento, para no pedir dos veces lo mismo.
  useEffect(() => {
    if (!isOpen || !cuentaId) return;
    let cancelado = false;
    getDoc(doc(db, 'datosSuscriptor', cuentaId))
      .then((s) => s.exists() ? s.data() : {})
      .catch(() => ({}))
      .then((d) => {
        if (cancelado) return;
        setForm({
          nombre: d.nombre || '',
          apellido: d.apellido || '',
          telefono: d.telefono || (empresa?.telefono || '').replace(/\D/g, ''),
          localidad: d.localidad || '',
          emprendimiento: d.emprendimiento || empresa?.nombre || '',
          comoNosConociste: d.comoNosConociste || ''
        });
      });
    return () => { cancelado = true; };
    // A propósito sin empresa en las dependencias: sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cuentaId]);

  if (!isOpen) return null;

  const cambiar = (campo) => (e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }));
  const enPrueba = suscripcion?.estado === 'trial';

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await httpsCallable(functions, 'completarPerfil')(form);
      // El nombre del emprendimiento también completa "Mi emprendimiento".
      if (form.emprendimiento.trim() && !empresa?.nombre) {
        setEmpresa((prev) => ({ ...prev, nombre: form.emprendimiento.trim() }));
      }
      if (r.data.pasoAPlanGratuito) showToast('¡Listo! Tu cuenta pasó al plan Boceto: seguí usando Manager3D gratis.', 'success', 8000);
      else if (r.data.planGratuitoAlVencer) showToast('¡Perfil completo! Cuando termine la prueba seguís gratis con el plan Boceto.', 'success', 8000);
      else showToast('Perfil guardado.');
      onClose();
    } catch (e) {
      showToast(e?.message || 'No se pudo guardar el perfil.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const completo = form.nombre.trim() && form.apellido.trim() && form.telefono.replace(/\D/g, '').length >= 6 && form.localidad.trim();

  return createPortal(
    <div className="modal-overlay open" onClick={guardando ? undefined : onClose} style={{ zIndex: 10000, padding: '20px 16px' }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto', maxWidth: '520px' }}>
        <div className="modal-title">Completá tu perfil y seguí gratis</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.55, marginBottom: '6px' }}>
          {enPrueba
            ? <>Tenés <strong>7 días con todas las funciones</strong>. Completá tu perfil y, cuando termine la prueba, seguís usando Manager3D <strong>gratis para siempre</strong> con el <strong>plan Boceto</strong>.</>
            : <>Completá tu perfil y tu cuenta pasa ahora mismo al <strong>plan Boceto</strong>: seguís usando Manager3D <strong>gratis</strong>, con tus datos de siempre.</>}
        </div>

        <div className="grid2">
          <div>
            <label className="fl">Nombre *</label>
            <input type="text" id="perfil-nombre" value={form.nombre} onChange={cambiar('nombre')} />
          </div>
          <div>
            <label className="fl">Apellido *</label>
            <input type="text" id="perfil-apellido" value={form.apellido} onChange={cambiar('apellido')} />
          </div>
          <div>
            <label className="fl">Teléfono (WhatsApp) *</label>
            <input type="text" id="perfil-telefono" inputMode="numeric" placeholder={paisActual?.mensajeTelefono || 'Ej: 3511234567'} value={form.telefono} onChange={cambiar('telefono')} />
          </div>
          <div>
            <label className="fl">Localidad *</label>
            <input type="text" id="perfil-localidad" value={form.localidad} onChange={cambiar('localidad')} />
          </div>
          <div>
            <label className="fl">Nombre del emprendimiento</label>
            <input type="text" id="perfil-emprendimiento" placeholder="Ej: Impresiones Juana" value={form.emprendimiento} onChange={cambiar('emprendimiento')} />
          </div>
          <div>
            <label className="fl">¿Cómo nos conociste?</label>
            <select id="perfil-como" value={form.comoNosConociste} onChange={cambiar('comoNosConociste')}>
              <option value="">— Elegí una opción —</option>
              {COMO_NOS_CONOCISTE.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '10px' }}>
          Usamos estos datos sólo para darte soporte y contarte novedades de Manager3D.
        </div>

        <div className="modal-footer">
          <button className="btn" disabled={guardando} onClick={onClose}>Más tarde</button>
          <button className="btn btn-primary" disabled={guardando || !completo} onClick={guardar}>
            {guardando ? 'Guardando…' : enPrueba ? 'Completar perfil' : 'Completar y activar Boceto'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
