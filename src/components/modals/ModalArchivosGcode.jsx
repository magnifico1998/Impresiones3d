import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { confirmar } from '../Dialogos';
import {
  EXTENSIONES_GCODE, borrarArchivoGcode, cambiarImpresoraGcode, cupoGcode, descargarArchivoGcode,
  esArchivoGcode, formatoBytes, subirArchivoGcode
} from '../../utils/archivosGcode';
import {
  ESTADOS_TRABAJO, MINUTOS_VENCE_IMPRIMIR, borrarTrabajo, cancelarTrabajo, escucharConectores, escucharTrabajos, impresorasPara, mandarAImpresora, trabajoVencido
} from '../../utils/impresionDirecta';

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
  const { cuentaId, user, cfg, planContratado, suscripcion, isAdmin, showToast } = useApp();
  const [impresora, setImpresora] = useState(producto?.impresoraNombre || '');
  const [subiendo, setSubiendo] = useState(null); // { nombre, progreso }
  const [bajando, setBajando] = useState(null);
  const inputRef = useRef(null);

  // Impresión directa (conector): impresoras disponibles y trabajos de este producto.
  const [conectores, setConectores] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [mandando, setMandando] = useState(null); // { archivo, destino, accion, libre }
  const [enviandoTrabajo, setEnviandoTrabajo] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => (cuentaId ? escucharConectores(cuentaId, setConectores) : undefined), [cuentaId]);
  useEffect(() => (cuentaId ? escucharTrabajos(cuentaId, setTrabajos) : undefined), [cuentaId]);

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

  const trabajosDelProducto = trabajos
    .filter((t) => t.productoId === String(producto.id))
    // Un envío recién creado todavía no tiene la hora del servidor: va primero.
    .sort((a, b) => (b.creadoEl?.toMillis?.() ?? Infinity) - (a.creadoEl?.toMillis?.() ?? Infinity))
    .slice(0, 6);

  const abrirEnvio = (archivo) => {
    const opciones = impresorasPara(archivo, conectores);
    if (!opciones.length) {
      showToast(conectores.length
        ? `Ninguna impresora cargada en tus conectores recibe archivos .${archivo.formato === '3mf' ? '3mf' : 'gcode'}.`
        : 'Primero vinculá un conector en Configuración → Impresión directa.', 'error');
      return;
    }
    // Arranca en la impresora del archivo si coincide por nombre, o en una activa.
    const preferida = opciones.find((o) => o.impresora.nombre === archivo.impresora) || opciones.find((o) => o.activo) || opciones[0];
    setMandando({ archivo, destino: `${preferida.conector.id}|${preferida.impresora.id}`, accion: 'subir', libre: false });
  };

  const enviar = async () => {
    const { archivo, destino, accion, libre } = mandando;
    const [conectorId, impresoraId] = destino.split('|');
    const conector = conectores.find((c) => c.id === conectorId);
    const impresora = conector?.impresoras?.find((i) => i.id === impresoraId);
    if (!conector || !impresora) return;
    if (accion === 'imprimir' && !libre) {
      showToast('Confirmá que la cama está libre antes de imprimir.', 'error');
      return;
    }
    setEnviandoTrabajo(true);
    try {
      await mandarAImpresora({ cuentaId, uid: user?.uid || null, archivo, conector, impresora, accion });
      showToast(`Trabajo en cola para ${impresora.nombre}.`, 'info');
      setMandando(null);
    } catch (err) {
      console.error('No se pudo mandar el trabajo a la impresora:', err);
      showToast('No se pudo poner el trabajo en la cola.', 'error');
    } finally {
      setEnviandoTrabajo(false);
    }
  };

  const quitarTrabajo = async (t) => {
    try {
      if (t.estado === 'pendiente') await cancelarTrabajo(cuentaId, t.id);
      else await borrarTrabajo(cuentaId, t.id);
    } catch (err) {
      console.error('No se pudo quitar el trabajo:', err);
      showToast('No se pudo quitar el trabajo.', 'error');
    }
  };

  const destinos = mandando ? impresorasPara(mandando.archivo, conectores) : [];
  const destinoElegido = mandando ? destinos.find((d) => `${d.conector.id}|${d.impresora.id}` === mandando.destino) : null;

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
                          <button className="btn btn-sm" style={{ marginLeft: '6px' }} title="Mandar este archivo a una impresora (con el conector)" onClick={() => abrirEnvio(a)}>🖨 Mandar</button>
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

        {/* Mandar a impresora */}
        {mandando && (
          <div style={{ marginTop: '16px', border: '1px solid var(--border2)', borderRadius: '8px', padding: '12px 14px', background: 'var(--bg3)' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Mandar "{mandando.archivo.nombre}" a una impresora</div>
            <label className="fl" style={{ marginTop: 0 }}>Impresora</label>
            <select value={mandando.destino} onChange={(e) => setMandando({ ...mandando, destino: e.target.value, accion: 'subir', libre: false })}>
              {destinos.map((d) => (
                <option key={`${d.conector.id}|${d.impresora.id}`} value={`${d.conector.id}|${d.impresora.id}`}>
                  {d.impresora.nombre} · {d.conector.equipo}{d.activo ? '' : ' (sin conexión)'}
                </option>
              ))}
            </select>
            {destinoElegido && !destinoElegido.activo && (
              <div style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '6px' }}>
                El conector de esa impresora está sin conexión: abrilo en esa PC. {mandando.accion === 'imprimir'
                  ? `Para imprimir, el envío vence si pasan ${MINUTOS_VENCE_IMPRIMIR} minutos sin que el conector lo tome.`
                  : 'Mientras tanto el archivo queda en cola y se sube cuando se abra.'}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px', fontSize: '13px' }}>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name="accion-gcode" checked={mandando.accion === 'subir'} onChange={() => setMandando({ ...mandando, accion: 'subir', libre: false })} style={{ marginTop: '3px' }} />
                <span>Solo subir el archivo <span style={{ color: 'var(--text3)' }}>· queda en la impresora y lo elegís en su pantalla</span></span>
              </label>
              {destinoElegido?.impresora.puedeImprimir && (
                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="radio" name="accion-gcode" checked={mandando.accion === 'imprimir'} onChange={() => setMandando({ ...mandando, accion: 'imprimir' })} style={{ marginTop: '3px' }} />
                  <span>Subir e imprimir ahora</span>
                </label>
              )}
              {mandando.accion === 'imprimir' && (
                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', marginLeft: '22px', color: 'var(--warn)' }}>
                  <input type="checkbox" checked={mandando.libre} onChange={(e) => setMandando({ ...mandando, libre: e.target.checked })} style={{ marginTop: '3px' }} />
                  <span>La cama está libre y el filamento es el correcto</span>
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button className="btn btn-primary btn-sm" disabled={enviandoTrabajo || (mandando.accion === 'imprimir' && !mandando.libre)} onClick={enviar}>
                {enviandoTrabajo ? 'Enviando…' : (mandando.accion === 'imprimir' ? 'Imprimir' : 'Subir a la impresora')}
              </button>
              <button className="btn btn-sm" onClick={() => setMandando(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {trabajosDelProducto.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>Envíos a impresoras</div>
            {trabajosDelProducto.map((t) => {
              const vencido = trabajoVencido(t, ahora);
              const est = vencido ? ESTADOS_TRABAJO.vencido : (ESTADOS_TRABAJO[t.estado] || ESTADOS_TRABAJO.pendiente);
              return (
                <div key={t.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: est.color, fontWeight: 600, minWidth: '90px' }}>{est.texto}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {t.nombre} → {t.impresoraNombre}{t.accion === 'imprimir' ? ' (imprimir)' : ''}
                    {vencido && <span style={{ display: 'block', color: 'var(--text3)' }}>Pasaron más de {MINUTOS_VENCE_IMPRIMIR} minutos sin que el conector lo tomara: no se imprime. Abrí el conector y volvé a mandarlo.</span>}
                    {t.mensaje && <span style={{ display: 'block', color: ['error', 'vencido'].includes(t.estado) ? 'var(--danger)' : 'var(--text3)' }}>{t.mensaje}</span>}
                  </span>
                  <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{t.creadoEl?.toDate?.().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  {!soloLectura && (
                    <button className="btn btn-ghost btn-sm" onClick={() => quitarTrabajo(t)} title={t.estado === 'pendiente' ? 'Cancelar' : 'Quitar de la lista'}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
