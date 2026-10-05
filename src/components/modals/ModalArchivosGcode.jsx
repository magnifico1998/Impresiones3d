import React, { useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { confirmar } from '../Dialogos';
import {
  EXTENSIONES_GCODE, borrarArchivoGcode, cambiarImpresoraGcode, cupoGcode, descargarArchivoGcode,
  esArchivoGcode, formatoBytes, subirArchivoGcode
} from '../../utils/archivosGcode';
import { PanelEnvio, ListaEnvios } from '../EnvioImpresora';

// Archivos G-code de un producto de la Biblioteca (utils/archivosGcode.js):
// se suben, se comprimen al máximo en el servidor y se bajan con su nombre
// original. Cada uno va con la impresora para la que se laminó.
//   archivos: las fichas de la cuenta (las escucha BibliotecaPage).

const ESTADO = {
  subiendo: { texto: 'Subiendo…', color: 'var(--text3)' },
  listo: { texto: 'Guardado', color: 'var(--accent)' },
  error: { texto: 'No se guardó', color: 'var(--danger)' }
};

export default function ModalArchivosGcode({ producto, archivos, onClose }) {
  const { cuentaId, cfg, planContratado, suscripcion, isAdmin, showToast } = useApp();
  const [impresora, setImpresora] = useState(producto?.impresoraNombre || '');
  const [subiendo, setSubiendo] = useState(null); // { nombre, progreso }
  const [bajando, setBajando] = useState(null);
  const inputRef = useRef(null);

  // Archivo que se está por mandar a una impresora (PanelEnvio, con el conector).
  const [mandando, setMandando] = useState(null);

  if (!producto) return null;

  const propios = archivos
    .filter((a) => a.productoId === String(producto.id))
    .sort((a, b) => (b.creadoEl?.toMillis?.() || 0) - (a.creadoEl?.toMillis?.() || 0));
  const cupo = cupoGcode(planContratado);
  const usado = suscripcion?.gcodeBytes || 0;
  const soloLectura = ['lectura', 'suspendida'].includes(suscripcion?.estado) && !isAdmin;
  const puedeSubir = cupo > 0 && usado < cupo && !soloLectura && !subiendo;
  const impresoras = (cfg.impresoras || []).map((i) => i.nombre).filter(Boolean);

  const subir = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (!esArchivoGcode(file.name)) {
        showToast(`${file.name}: sólo se aceptan archivos .gcode, .gco o .3mf.`, 'error');
        continue;
      }
      if (file.size > 300 * 1024 * 1024) {
        showToast(`${file.name} pesa más de 300 MB.`, 'error');
        continue;
      }
      setSubiendo({ nombre: file.name, progreso: 0 });
      try {
        await subirArchivoGcode({
          cuentaId, productoId: producto.id, file, impresora,
          alProgreso: (p) => setSubiendo({ nombre: file.name, progreso: p })
        });
      } catch (err) {
        console.error('No se pudo subir el G-code:', err);
        showToast(`No se pudo subir ${file.name}.`, 'error');
      }
    }
    setSubiendo(null);
  };

  const bajar = async (a) => {
    setBajando(a.id);
    try {
      await descargarArchivoGcode(cuentaId, a);
    } catch (err) {
      console.error('No se pudo bajar el G-code:', err);
      showToast('No se pudo bajar el archivo.', 'error');
    } finally {
      setBajando(null);
    }
  };

  const borrar = async (a) => {
    if (!(await confirmar(`Se borra "${a.nombre}" y se libera su espacio.`, { titulo: '¿Borrar el archivo?', textoConfirmar: 'Borrar', peligro: true }))) return;
    try {
      await borrarArchivoGcode(cuentaId, a);
    } catch (err) {
      console.error('No se pudo borrar el G-code:', err);
      showToast('No se pudo borrar el archivo.', 'error');
    }
  };

  const cambiarImpresora = async (a, valor) => {
    try {
      await cambiarImpresoraGcode(cuentaId, a.id, valor);
    } catch (err) {
      console.error('No se pudo cambiar la impresora del G-code:', err);
      showToast('No se pudo cambiar la impresora.', 'error');
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Archivos G-code · {producto.nombre}</div>
        <div className="modal-sub" style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' }}>
          El archivo laminado listo para imprimir (.gcode, o el .gcode.3mf de Bambu Studio). Se guarda comprimido al máximo y lo bajás tal cual lo subiste.
        </div>

        {/* Espacio del plan */}
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' }}>
          {cupo > 0
            ? <>Espacio usado: <b style={{ fontFamily: 'var(--mono)' }}>{formatoBytes(usado)}</b> de {formatoBytes(cupo)}{usado >= cupo && <span style={{ color: 'var(--danger)' }}> · no te queda espacio</span>}</>
            : <span style={{ color: 'var(--warn)' }}>Tu plan no incluye espacio para archivos G-code.</span>}
        </div>

        {!soloLectura && cupo > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ minWidth: '200px' }}>
              <label className="fl" style={{ marginTop: 0 }}>Impresora para la que se laminó</label>
              <select value={impresora} onChange={(e) => setImpresora(e.target.value)}>
                <option value="">— Sin especificar —</option>
                {impresoras.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <input ref={inputRef} type="file" accept={EXTENSIONES_GCODE} multiple style={{ display: 'none' }} onChange={subir} />
            <button className="btn btn-primary" disabled={!puedeSubir} onClick={() => inputRef.current?.click()}>
              {subiendo ? `Subiendo ${Math.round(subiendo.progreso * 100)}%…` : '+ Subir archivo'}
            </button>
          </div>
        )}

        {propios.length === 0 && !subiendo && (
          <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Este producto todavía no tiene archivos.</div>
        )}

        {propios.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Impresora</th>
                  <th style={{ textAlign: 'right' }}>Tamaño</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {propios.map((a) => {
                  const est = ESTADO[a.estado] || ESTADO.subiendo;
                  const procesando = a.estado === 'subiendo' && !(subiendo && subiendo.nombre === a.nombre);
                  return (
                    <tr key={a.id}>
                      <td style={{ wordBreak: 'break-word' }}>{a.nombre}</td>
                      <td>
                        <select
                          value={a.impresora || ''}
                          disabled={soloLectura}
                          onChange={(e) => cambiarImpresora(a, e.target.value)}
                          style={{ fontSize: '12px', minWidth: '130px' }}
                        >
                          <option value="">—</option>
                          {impresoras.map((n) => <option key={n} value={n}>{n}</option>)}
                          {a.impresora && !impresoras.includes(a.impresora) && <option value={a.impresora}>{a.impresora}</option>}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {a.estado === 'listo'
                          ? <span title={`Original: ${formatoBytes(a.bytesOriginal)} · guardado: ${formatoBytes(a.bytes)}`}>{formatoBytes(a.bytesOriginal)} → {formatoBytes(a.bytes)}</span>
                          : formatoBytes(a.bytesOriginal)}
                      </td>
                      <td style={{ fontSize: '12px', color: est.color }}>
                        {procesando ? 'Comprimiendo…' : est.texto}
                        {a.estado === 'error' && a.motivo && <div style={{ color: 'var(--text2)' }}>{a.motivo}</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {a.estado === 'listo' && (
                          <button className="btn btn-sm" disabled={bajando === a.id} onClick={() => bajar(a)}>
                            {bajando === a.id ? 'Preparando…' : 'Bajar'}
                          </button>
                        )}
                        {a.estado === 'listo' && !soloLectura && (
                          <button className="btn btn-sm" style={{ marginLeft: '6px' }} title="Mandar este archivo a una impresora (con el conector)" onClick={() => setMandando(a)}>🖨 Mandar</button>
                        )}
                        {!soloLectura && (
                          <button className="btn btn-danger btn-sm" style={{ marginLeft: '6px' }} onClick={() => borrar(a)} title="Borrar">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {mandando && (
          <div style={{ marginTop: '16px' }}>
            <PanelEnvio archivos={[mandando]} archivoInicialId={mandando.id} alTerminar={() => setMandando(null)} />
          </div>
        )}

        <ListaEnvios productoId={producto.id} soloLectura={soloLectura} />

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
