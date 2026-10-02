import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { CATEGORIAS_TICKET, ESTADOS_TICKET, lineasLog, numeroTicket, textoParaAnalisis } from '../../utils/formatoTicket';
import { esError } from '../../utils/registroSoporte';
import { BADGE_ESTADO_TICKET, fechaTicket } from '../soporte/SoportePage';

// Panel admin → Tickets: todos los tickets de soporte, con el log de cada
// uno (tickets/{id}/adjuntos/log, sólo lo lee el admin), cambio de estado
// y respuesta por mail (functions/http/tickets.js → actualizarTicket).
// "Copiar para análisis" arma el texto completo (comentario, contexto y
// log) para pegarlo en Claude; lo mismo saca scripts/ticket.mjs.

const PENDIENTES = ['abierto', 'analisis'];

const aMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts || 0);

export default function SeccionTickets({ showToast }) {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('pendientes');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [logs, setLogs] = useState({}); // id → log cargado
  const [respuesta, setRespuesta] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => onSnapshot(
    query(collection(db, 'tickets'), orderBy('creadoEl', 'desc')),
    (snap) => {
      setTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCargando(false);
    },
    (err) => {
      console.error('Error al listar los tickets:', err);
      setCargando(false);
    }
  ), []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filtroEstado === 'pendientes' ? !PENDIENTES.includes(t.estado) : filtroEstado && t.estado !== filtroEstado) return false;
      if (filtroCategoria && t.categoria !== filtroCategoria) return false;
      if (!q) return true;
      return [numeroTicket(t.numero), t.asunto, t.email, t.comentario, t.cuentaId].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [tickets, filtroEstado, filtroCategoria, busqueda]);

  const pendientes = tickets.filter((t) => PENDIENTES.includes(t.estado)).length;

  const cargarLog = async (t) => {
    if (logs[t.id]) return logs[t.id];
    try {
      const snap = await getDoc(doc(db, 'tickets', t.id, 'adjuntos', 'log'));
      const log = snap.exists() ? snap.data() : { eventos: [], contexto: {} };
      setLogs((prev) => ({ ...prev, [t.id]: log }));
      return log;
    } catch (e) {
      console.error('Error al leer el log del ticket:', e);
      showToast('No se pudo leer el log.', 'error');
      return null;
    }
  };

  const alternar = (t) => {
    setRespuesta('');
    if (abierto === t.id) {
      setAbierto(null);
      return;
    }
    setAbierto(t.id);
    cargarLog(t);
  };

  const paraAnalisis = (t, log) => textoParaAnalisis({
    ...t,
    creadoEl: aMs(t.creadoEl),
    respuestas: (t.respuestas || []).map((r) => ({ ...r, fecha: aMs(r.fecha) }))
  }, log);

  const copiar = async (t) => {
    const log = await cargarLog(t);
    if (!log) return;
    try {
      await navigator.clipboard.writeText(paraAnalisis(t, log));
      showToast('Copiado. Pegalo en Claude para analizarlo.');
    } catch {
      showToast('El navegador no dejó copiar; usá "Descargar".', 'error');
    }
  };

  const descargar = async (t) => {
    const log = await cargarLog(t);
    if (!log) return;
    const blob = new Blob([paraAnalisis(t, log)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${numeroTicket(t.numero)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const actualizar = async (t, cambios) => {
    setGuardando(true);
    try {
      const { data } = await httpsCallable(functions, 'actualizarTicket')({ ticketId: t.id, ...cambios });
      if (cambios.respuesta) {
        setRespuesta('');
        showToast(data.mailEnviado ? 'Respuesta enviada por mail.' : 'Respuesta guardada, pero no se pudo mandar el mail.', data.mailEnviado ? 'success' : 'error');
      }
    } catch (e) {
      console.error('Error al actualizar el ticket:', e);
      showToast(e?.message || 'No se pudo actualizar el ticket.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Tickets de soporte {pendientes > 0 && <span className="badge badge-pending" style={{ marginLeft: '6px' }}>{pendientes} pendiente{pendientes === 1 ? '' : 's'}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: 'auto' }}>
            <option value="pendientes">Pendientes</option>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_TICKET).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas las categorías</option>
            {Object.entries(CATEGORIAS_TICKET).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar número, email, texto…" style={{ maxWidth: '220px' }} />
        </div>
      </div>

      {cargando && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Cargando…</div>}
      {!cargando && visibles.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>No hay tickets con este filtro.</div>}

      {visibles.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>Asunto</th>
                <th>Log</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => {
                const log = logs[t.id];
                return (
                  <React.Fragment key={t.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => alternar(t)}>
                      <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text3)', marginRight: '6px' }}>{abierto === t.id ? '▾' : '▸'}</span>
                        {numeroTicket(t.numero)}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '12px', whiteSpace: 'nowrap' }}>{fechaTicket(t.creadoEl)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{t.email || t.cuentaId}</td>
                      <td>
                        <span style={{ fontSize: '11px', color: 'var(--text3)', marginRight: '6px' }}>{CATEGORIAS_TICKET[t.categoria] || t.categoria}</span>
                        {t.asunto}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {t.resumen?.errores > 0
                          ? <span className="badge badge-cancelled" title={t.resumen.ultimoError || ''}>{t.resumen.errores} error{t.resumen.errores === 1 ? '' : 'es'}</span>
                          : <span style={{ color: 'var(--text3)' }}>sin errores</span>}
                        {t.resumen?.grabado && <span className="badge badge-ok" style={{ marginLeft: '4px' }} title="El usuario grabó el problema">● grabado</span>}
                      </td>
                      <td><span className={`badge ${BADGE_ESTADO_TICKET[t.estado] || ''}`}>{ESTADOS_TICKET[t.estado] || t.estado}</span></td>
                    </tr>
                    {abierto === t.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg3)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{t.comentario}</div>
                            {t.errorOrigen && <div style={{ fontSize: '12px', color: 'var(--danger)' }}>Reportado desde el aviso: “{t.errorOrigen}”</div>}
                            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                              Versión {t.resumen?.version || '—'} · sección {t.resumen?.seccion || '—'} · cuenta <span style={{ fontFamily: 'var(--mono)' }}>{t.cuentaId}</span>
                              {t.uid !== t.cuentaId && ' · lo creó un miembro del equipo'}
                            </div>

                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button className="btn btn-sm btn-primary" onClick={() => copiar(t)}>Copiar para análisis</button>
                              <button className="btn btn-sm" onClick={() => descargar(t)}>Descargar (.md)</button>
                              <span style={{ fontSize: '12px', color: 'var(--text3)', marginLeft: '8px' }}>Estado:</span>
                              <select value={t.estado} disabled={guardando} onChange={(e) => actualizar(t, { estado: e.target.value })} style={{ width: 'auto' }}>
                                {Object.entries(ESTADOS_TICKET).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                              </select>
                            </div>

                            {!log && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Cargando log…</div>}
                            {log && (
                              <div className="soporte-log-detalle" style={{ maxHeight: '320px' }}>
                                {lineasLog(log.eventos).map((linea, i) => (
                                  <div key={i} style={esError(log.eventos[i]) ? { color: 'var(--danger)' } : undefined}>{linea}</div>
                                ))}
                                {!log.eventos?.length && 'Sin eventos.'}
                              </div>
                            )}

                            {(t.respuestas || []).map((r, i) => (
                              <div key={i} className="soporte-respuesta">
                                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{r.autor} · {fechaTicket(r.fecha)}</div>
                                {r.texto}
                              </div>
                            ))}

                            <div>
                              <textarea rows={3} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder={`Respuesta a ${t.email || 'la cuenta'} (le llega por mail)`} />
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                <button className="btn btn-sm btn-primary" disabled={guardando || !respuesta.trim() || !t.email} onClick={() => actualizar(t, { respuesta })}>
                                  {guardando ? 'Enviando…' : 'Responder por mail'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
