import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../firebase';
import { doc, setDoc, collection } from 'firebase/firestore';

const FORM_VACIO = {
  nombre: '',
  precioMensual: '',
  orden: '1',
  activo: true,
  limites: { usuarios: '', pedidosMes: '', aperturasCatalogoMes: '', montoFacturadoMes: '' }
};

// Alta/edición de un plan. Un límite vacío significa "sin límite" para esa
// métrica (así queda reflejado en cuentaPuedeEscribir/dentroDelLimiteDePedidos
// de firestore.rules, que tratan null como "no hay tope").
export default function ModalPlan({ isOpen, onClose, plan }) {
  const { showToast } = useApp();
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (plan) {
      setForm({
        nombre: plan.nombre || '',
        precioMensual: plan.precioMensual ?? '',
        orden: plan.orden ?? '1',
        activo: plan.activo !== false,
        limites: {
          usuarios: plan.limites?.usuarios ?? '',
          pedidosMes: plan.limites?.pedidosMes ?? '',
          aperturasCatalogoMes: plan.limites?.aperturasCatalogoMes ?? '',
          montoFacturadoMes: plan.limites?.montoFacturadoMes ?? ''
        }
      });
    } else {
      setForm(FORM_VACIO);
    }
  }, [isOpen, plan]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const handleChangeLimite = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, limites: { ...prev.limites, [id]: value } }));
  };

  const aNumeroONull = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);

  const handleGuardar = async () => {
    if (!form.nombre.trim()) { showToast('Falta el nombre del plan.', 'error'); return; }
    if (form.precioMensual === '' || Number(form.precioMensual) < 0) { showToast('Precio mensual inválido.', 'error'); return; }

    setGuardando(true);
    try {
      const planId = plan?.id || doc(collection(db, 'planes')).id;
      await setDoc(doc(db, 'planes', planId), {
        nombre: form.nombre.trim(),
        precioMensual: Number(form.precioMensual),
        orden: Number(form.orden) || 1,
        activo: !!form.activo,
        limites: {
          usuarios: aNumeroONull(form.limites.usuarios),
          pedidosMes: aNumeroONull(form.limites.pedidosMes),
          aperturasCatalogoMes: aNumeroONull(form.limites.aperturasCatalogoMes),
          montoFacturadoMes: aNumeroONull(form.limites.montoFacturadoMes)
        }
      }, { merge: true });
      showToast(plan ? 'Plan actualizado' : 'Plan creado');
      onClose();
    } catch (e) {
      console.error('Error al guardar el plan:', e);
      showToast('No se pudo guardar el plan.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{plan ? 'Editar plan' : 'Nuevo plan'}</div>

        <div className="grid2">
          <div>
            <label className="fl">Nombre</label>
            <input type="text" id="nombre" value={form.nombre} onChange={handleChange} placeholder="Básico" />
          </div>
          <div>
            <label className="fl">Precio mensual ($)</label>
            <input type="number" id="precioMensual" value={form.precioMensual} onChange={handleChange} min="0" />
          </div>
          <div>
            <label className="fl">Orden (para mostrarlo en listas)</label>
            <input type="number" id="orden" value={form.orden} onChange={handleChange} min="1" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '22px' }}>
            <input type="checkbox" id="activo" checked={form.activo} onChange={(e) => setForm(prev => ({ ...prev, activo: e.target.checked }))} />
            <label htmlFor="activo" style={{ fontSize: '13px' }}>Plan activo (visible para contratar)</label>
          </div>
        </div>

        <div className="card-title" style={{ marginTop: '18px' }}>Límites (vacío = sin límite)</div>
        <div className="grid2">
          <div>
            <label className="fl">Usuarios</label>
            <input type="number" id="usuarios" value={form.limites.usuarios} onChange={handleChangeLimite} min="0" />
          </div>
          <div>
            <label className="fl">Pedidos / mes</label>
            <input type="number" id="pedidosMes" value={form.limites.pedidosMes} onChange={handleChangeLimite} min="0" />
          </div>
          <div>
            <label className="fl">Aperturas de catálogo / mes</label>
            <input type="number" id="aperturasCatalogoMes" value={form.limites.aperturasCatalogoMes} onChange={handleChangeLimite} min="0" />
          </div>
          <div>
            <label className="fl">Monto facturado / mes ($)</label>
            <input type="number" id="montoFacturadoMes" value={form.limites.montoFacturadoMes} onChange={handleChangeLimite} min="0" />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : (plan ? 'Guardar cambios' : 'Crear plan')}
          </button>
        </div>
      </div>
    </div>
  );
}
