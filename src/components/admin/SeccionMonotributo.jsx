import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

// Panel admin → Negocio → Categorías de monotributo: la tabla de topes
// anuales que usa el totalizador de cada suscriptor
// (components/TotalizadorMonotributo.jsx). ARCA la actualiza cada
// semestre; se carga a mano desde la tabla oficial.

const leerNumero = (t) => parseFloat(String(t).replace(/\$|\s/g, '').replace(/\./g, '').replace(',', '.'));

export default function SeccionMonotributo({ showToast }) {
  const { user, fmt } = useApp();
  const [filas, setFilas] = useState([]);
  const [vigencia, setVigencia] = useState('');
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => onSnapshot(
    doc(db, 'monotributo', 'categorias'),
    (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setFilas((d.categorias || []).map((c) => ({ letra: c.letra, tope: String(c.topeAnual) })));
      setVigencia(d.vigencia || '');
      setCargado(true);
    },
    (err) => console.error('Error al leer las categorías de monotributo:', err)
  ), []);

  const cambiar = (i, campo, valor) => setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  const guardar = async () => {
    const categorias = filas
      .map((f) => ({ letra: String(f.letra || '').trim().toUpperCase(), topeAnual: leerNumero(f.tope) }))
      .filter((c) => c.letra && Number.isFinite(c.topeAnual) && c.topeAnual > 0)
      .sort((a, b) => a.topeAnual - b.topeAnual);
    if (!categorias.length) {
      showToast('Cargá al menos una categoría con su tope.', 'error');
      return;
    }
    setGuardando(true);
    try {
      await setDoc(doc(db, 'monotributo', 'categorias'), {
        categorias, vigencia: vigencia.trim(), actualizadoEl: Timestamp.now(), actualizadoPor: user?.email || null
      });
      showToast(`Categorías guardadas (${categorias.length}).`);
    } catch (e) {
      console.error('Error al guardar las categorías de monotributo:', e);
      showToast('No se pudieron guardar las categorías.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title" style={{ cursor: 'pointer', marginBottom: abierto ? undefined : 0 }} onClick={() => setAbierto((v) => !v)}>
        {abierto ? '▾' : '▸'} Categorías de monotributo
        {cargado && <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text3)', marginLeft: '8px' }}>{filas.length ? `${filas.length} categorías${vigencia ? ` · vigentes desde ${vigencia}` : ''}` : 'sin cargar'}</span>}
      </div>
      {abierto && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px', lineHeight: 1.5 }}>
            Topes de ingresos brutos anuales de cada categoría, según la tabla vigente de ARCA. Los usa el totalizador de cada suscriptor en Facturación ARCA.
            Actualizalos cuando ARCA publique la tabla nueva (cada semestre).
          </div>
          <label className="fl" style={{ marginTop: 0 }}>Vigentes desde</label>
          <input type="text" value={vigencia} onChange={(e) => setVigencia(e.target.value)} placeholder="Ej: 08/2026" style={{ maxWidth: '160px' }} />
          <div style={{ overflowX: 'auto', marginTop: '10px' }}>
            <table className="data-table" style={{ fontSize: '12px', maxWidth: '420px' }}>
              <thead>
                <tr><th>Categoría</th><th>Tope anual ($)</th><th></th></tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i}>
                    <td><input type="text" value={f.letra} maxLength={2} onChange={(e) => cambiar(i, 'letra', e.target.value)} style={{ width: '60px' }} /></td>
                    <td>
                      <input type="text" value={f.tope} onChange={(e) => cambiar(i, 'tope', e.target.value)} placeholder="Ej: 1.000.000" />
                      {Number.isFinite(leerNumero(f.tope)) && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{fmt(leerNumero(f.tope))}</div>}
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setFilas((prev) => prev.filter((_, j) => j !== i))} title="Quitar">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button className="btn btn-sm" onClick={() => setFilas((prev) => [...prev, { letra: String.fromCharCode(65 + prev.length), tope: '' }])}>+ Categoría</button>
            <button className="btn btn-primary btn-sm" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </>
      )}
    </div>
  );
}
