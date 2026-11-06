import React, { useState } from 'react';
import { confirmar } from '../Dialogos';
import { useSimbolosCuenta } from '../../hooks/useSimbolosCuenta';
import { useUi } from '../../context/contextos';
import { MAX_SIMBOLOS, contornosDeJson } from '../../utils/simbolosPropios';
import EditorSimbolo from './EditorSimbolo';

// Biblioteca de símbolos de la cuenta y editor con simetrías, para los emblemas de Jarros. Se carga recién cuando hay un
// emblema (usa Firestore). `actual()` devuelve los contornos del símbolo que se está usando si se puede guardar (un SVG
// subido o uno propio) y `alUsar(contornos, nombre)` lo pone como símbolo del emblema.
export default function BibliotecaSimbolos({ hayActual, actual, alUsar }) {
  const { showToast } = useUi();
  const { simbolos, cargando, guardarSimbolo, borrarSimbolo } = useSimbolosCuenta();
  const [editor, setEditor] = useState(false);
  const [nombre, setNombre] = useState('');

  const usar = (s) => {
    try {
      alUsar(contornosDeJson(s.datos), s.nombre);
    } catch (e) {
      showToast(e.message || 'No se pudo leer ese símbolo.', 'error');
    }
  };
  const borrar = async (s) => {
    if (await confirmar(`Se borra "${s.nombre}" de tu biblioteca de símbolos. No se puede deshacer.`, { titulo: 'Borrar símbolo', textoConfirmar: 'Borrar' })) borrarSimbolo(s.id);
  };
  const guardarActual = async () => {
    const contornos = actual();
    if (!contornos) { showToast('No hay un símbolo propio para guardar.', 'error'); return; }
    if (await guardarSimbolo(nombre, contornos)) setNombre('');
  };

  return (
    <div style={{ marginTop: '10px' }}>
      <label className="fl">Mis símbolos guardados ({simbolos.length}/{MAX_SIMBOLOS})</label>
      {cargando && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Cargando tu biblioteca…</div>}
      {!cargando && !simbolos.length && (
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Todavía no guardaste ninguno. Subí un SVG o dibujá uno y guardalo para reusarlo en otros jarros.</div>
      )}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {simbolos.map((s) => (
          <span key={s.id} style={{ display: 'inline-flex', gap: '2px' }}>
            <button type="button" className="btn btn-sm" onClick={() => usar(s)}>{s.nombre}</button>
            <button type="button" className="btn btn-sm" title="Borrar de la biblioteca" aria-label={`Borrar ${s.nombre}`} onClick={() => borrar(s)}>×</button>
          </span>
        ))}
      </div>
      {hayActual && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
          <input type="text" value={nombre} maxLength={40} placeholder="Nombre para el símbolo actual" onChange={(e) => setNombre(e.target.value)} style={{ flex: '1 1 140px', minWidth: 0 }} />
          <button type="button" className="btn btn-sm" disabled={!nombre.trim()} onClick={guardarActual}>Guardar el símbolo actual</button>
        </div>
      )}
      <div style={{ marginTop: '8px' }}>
        <button type="button" className={`btn btn-sm ${editor ? 'btn-primary' : ''}`} onClick={() => setEditor((v) => !v)}>
          {editor ? 'Cerrar el editor' : 'Dibujar un símbolo con simetría'}
        </button>
      </div>
      {editor && <EditorSimbolo alUsar={(c) => alUsar(c, 'Mi dibujo')} alGuardar={guardarSimbolo} alCerrar={() => setEditor(false)} />}
    </div>
  );
}
