import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useApp } from '../../context/AppContext';

// Panel admin → Negocio → Categorías de monotributo: la tabla de topes
// anuales que usa el totalizador de cada suscriptor
// (components/TotalizadorMonotributo.jsx). ARCA la actualiza cada
// semestre: "Buscar en ARCA" la lee de la página oficial
// (functions/http/monotributo.js) y muestra los cambios para aplicarlos;
// también se puede cargar a mano.

const leerNumero = (t) => parseFloat(String(t).replace(/\$|\s/g, '').replace(/\./g, '').replace(',', '.'));
// Tope como se escribe a mano ("12.009.410,45"), para que leerNumero lo lea igual.
const textoTope = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SeccionMonotributo({ showToast }) {
  const { user, fmt } = useApp();
  const [filas, setFilas] = useState([]);
  const [vigencia, setVigencia] = useState('');
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [propuesta, setPropuesta] = useState(null); // lo leído de ARCA, para aplicar

  useEffect(() => onSnapshot(
    doc(db, 'monotributo', 'categorias'),
    (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setFilas((d.categorias || []).map((c) => ({ letra: c.letra, tope: textoTope(c.topeAnual) })));
      setVigencia(d.vigencia || '');
      setCargado(true);
    },
    (err) => console.error('Error al leer las categorías de monotributo:', err)
  ), []);

  const cambiar = (i, campo, valor) => setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  const buscarEnArca = async () => {
    setBuscando(true);
    try {
      const { data } = await httpsCallable(functions, 'buscarCategoriasMonotributo')();
      const actual = Object.fromEntries(filas.map((f) => [String(f.letra).toUpperCase(), leerNumero(f.tope)]));
      const cambios = data.categorias.filter((c) => Math.abs((actual[c.letra] || 0) - c.topeAnual) >= 0.01);
      const quitadas = Object.keys(actual).filter((l) => !data.categorias.some((c) => c.letra === l));
      if (!cambios.length && !quitadas.length && data.vigencia === vigencia.trim()) {
        showToast(`Las categorías están al día (vigentes desde ${data.vigenteDesde}).`);
        setPropuesta(null);
      } else {
        setPropuesta({ ...data, actual, quitadas });
        setAbierto(true);
      }
    } catch (e) {
      console.error('Error al buscar las categorías en ARCA:', e);
      showToast(e?.message || 'No se pudo leer la página de ARCA.', 'error');
    } finally {
      setBuscando(false);
    }
  };

  const aplicarPropuesta = async () => {
    setGuardando(true);
    try {
      await setDoc(doc(db, 'monotributo', 'categorias'), {
        categorias: propuesta.categorias, vigencia: propuesta.vigencia, fuente: propuesta.fuente,
        actualizadoEl: Timestamp.now(), actualizadoPor: user?.email || null
      });
      showToast(`Categorías actualizadas desde ARCA (vigentes desde ${propuesta.vigenteDesde}).`);
      setPropuesta(null);
    } catch (e) {
      console.error('Error al aplicar las categorías de ARCA:', e);
      showToast('No se pudieron guardar las categorías.', 'error');
    } finally {
      setGuardando(false);
    }
  };

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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
            <button className="btn btn-sm btn-primary" disabled={buscando || guardando} onClick={buscarEnArca}>
              {buscando ? 'Buscando…' : 'Buscar en ARCA'}
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Lee la tabla vigente de afip.gob.ar/monotributo/categorias.asp y te muestra los cambios antes de aplicarlos.</span>
          </div>

          {propuesta && (
            <div style={{ padding: '10px 12px', border: '1px solid var(--accent)', borderRadius: 'var(--radius2)', marginBottom: '12px', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>ARCA: valores vigentes desde el {propuesta.vigenteDesde}</div>
              <table className="data-table" style={{ fontSize: '12px', maxWidth: '460px' }}>
                <thead><tr><th>Cat.</th><th style={{ textAlign: 'right' }}>Cargado</th><th style={{ textAlign: 'right' }}>ARCA</th></tr></thead>
                <tbody>
                  {propuesta.categorias.map((c) => {
                    const antes = propuesta.actual[c.letra];
                    const cambia = !antes || Math.abs(antes - c.topeAnual) >= 0.01;
                    return (
                      <tr key={c.letra} style={cambia ? { fontWeight: 600 } : { color: 'var(--text3)' }}>
                        <td>{c.letra}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{antes ? fmt(antes) : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: cambia ? 'var(--accent)' : undefined }}>{fmt(c.topeAnual)}</td>
                      </tr>
                    );
                  })}
                  {propuesta.quitadas.map((l) => (
                    <tr key={l} style={{ color: 'var(--danger)' }}><td>{l}</td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(propuesta.actual[l])}</td><td style={{ textAlign: 'right' }}>se quita</td></tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button className="btn btn-sm btn-primary" disabled={guardando} onClick={aplicarPropuesta}>{guardando ? 'Aplicando…' : 'Aplicar'}</button>
                <button className="btn btn-sm" disabled={guardando} onClick={() => setPropuesta(null)}>Descartar</button>
              </div>
            </div>
          )}

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
