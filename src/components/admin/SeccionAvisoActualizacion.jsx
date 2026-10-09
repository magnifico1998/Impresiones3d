import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import TarjetaColapsable from '../TarjetaColapsable';
import { aCamposArgentina, aIsoArgentina, diaCorto, horaCorta, textoPorDefecto } from '../../utils/avisoActualizacion';

// Panel admin → Negocio → Aviso de actualización: carga cuándo se va a actualizar
// Manager3D para que todos los suscriptores con la app abierta vean un cartel arriba
// (components/AvisoActualizacion.jsx). Se guarda en avisoSistema/actualizacion.

export default function SeccionAvisoActualizacion({ showToast }) {
  const [guardado, setGuardado] = useState(null);
  const [activo, setActivo] = useState(false);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('08:00');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => onSnapshot(
    doc(db, 'avisoSistema', 'actualizacion'),
    (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setGuardado(d);
      if (d) {
        const campos = aCamposArgentina(d.fechaHora);
        setActivo(!!d.activo);
        setFecha(campos.fecha);
        setHora(campos.hora || '08:00');
        setMensaje(d.mensaje || '');
      }
    },
    (err) => console.error('Error al leer el aviso de actualización:', err)
  ), []);

  const iso = aIsoArgentina(fecha, hora);
  const vistaPrevia = String(mensaje).trim() || textoPorDefecto(iso);

  const guardar = async (nuevoActivo) => {
    if (nuevoActivo && !iso) {
      showToast('Elegí la fecha y la hora de la actualización.', 'error');
      return;
    }
    setGuardando(true);
    try {
      await setDoc(doc(db, 'avisoSistema', 'actualizacion'), {
        activo: nuevoActivo,
        fechaHora: iso,
        mensaje: String(mensaje).trim().slice(0, 400),
        actualizadoEl: serverTimestamp(),
        actualizadoPor: auth.currentUser?.email || ''
      });
      setActivo(nuevoActivo);
      showToast(nuevoActivo ? '✓ Aviso publicado: lo ven todos los que tengan la app abierta.' : '✓ Aviso quitado.');
    } catch (e) {
      console.error('Error al guardar el aviso de actualización:', e);
      showToast('No se pudo guardar el aviso.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const ms = Date.parse(guardado?.fechaHora || '');
  const resumen = guardado?.activo && !Number.isNaN(ms) ? `activo · ${diaCorto(ms)} ${horaCorta(ms)} hs` : 'sin aviso';

  return (
    <TarjetaColapsable titulo="Aviso de actualización" resumen={resumen} clave="admin.avisoActualizacion">
      <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.5 }}>
        Avisa a todos los suscriptores que tengan la app abierta que Manager3D se va a actualizar a cierta hora, para que guarden y la cierren antes.
        El cartel aparece apenas lo publicás y se muestra hasta 2 horas después de la hora fijada (después cambia a "se actualizó, recargá si ves algo raro").
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', maxWidth: '420px' }}>
        <div>
          <label className="fl" style={{ marginTop: 0 }}>Fecha (hora de Argentina)</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className="fl" style={{ marginTop: 0 }}>Hora</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
      </div>

      <label className="fl">Mensaje (opcional: vacío usa el texto de abajo)</label>
      <textarea rows={2} maxLength={400} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej: El domingo 11/10 a las 08:00 hs vamos a sumar mejoras. Guardá tu trabajo antes." />

      <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg3)', fontSize: '12px', color: 'var(--text2)' }}>
        <b>Así lo van a ver:</b> {vistaPrevia || 'Elegí la fecha y la hora.'}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={guardando} onClick={() => guardar(true)}>
          {guardando ? 'Guardando…' : (activo ? 'Actualizar el aviso' : 'Publicar el aviso')}
        </button>
        {activo && <button className="btn btn-sm" disabled={guardando} onClick={() => guardar(false)}>Quitar el aviso</button>}
      </div>
    </TarjetaColapsable>
  );
}
