import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { CATEGORIAS_TICKET, ESTADOS_TICKET, numeroTicket } from '../../utils/formatoTicket';
import { marcarTicketVisto, useTicketsSinVer } from './AvisosTicketsCuenta';

// Soporte: los tickets de la cuenta (de cualquier miembro del equipo) con
// su estado y las respuestas. El ticket nuevo se arma en CentroSoporte.

export const BADGE_ESTADO_TICKET = {
  abierto: 'badge-pending',
  analisis: 'badge-progress',
  respondido: 'badge-ok',
  cerrado: 'badge-cancelled'
};

export const fechaTicket = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const abrirNuevoTicket = () => window.dispatchEvent(new CustomEvent('abrir-ticket'));

export default function SoportePage() {
  const { cuentaId } = useApp();
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const { ids: sinVer } = useTicketsSinVer();

  useEffect(() => {
    if (!cuentaId) return undefined;
    // Sin orderBy: con el filtro por cuentaId pediría un índice compuesto;
    // son pocos tickets por cuenta, se ordenan acá.
    return onSnapshot(
      query(collection(db, 'tickets'), where('cuentaId', '==', cuentaId)),
      (snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lista.sort((a, b) => (b.creadoEl?.toMillis?.() || 0) - (a.creadoEl?.toMillis?.() || 0));
        setTickets(lista);
        setCargando(false);
      },
      (err) => {
        console.error('Error al listar los tickets:', err);
        setCargando(false);
      }
    );
  }, [cuentaId]);

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Soporte</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>Reportá un problema o hacé una consulta.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent('iniciar-recorrido'))}>Ver el recorrido</button>
          <button className="btn btn-primary" onClick={abrirNuevoTicket}>+ Nuevo ticket</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Cómo reportar un problema</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
          Creá un ticket, contanos qué pasó y tocá <b>Grabar el problema</b>: repetí la operación que falló y al terminar se adjunta un registro técnico
          para que podamos analizarlo. También podés tocar <b>Reportar</b> en cualquier aviso de error. Te respondemos por mail y la respuesta queda acá.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Mis tickets</div>
        {cargando && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Cargando…</div>}
        {!cargando && tickets.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Todavía no creaste tickets.</div>}
        {tickets.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Fecha</th>
                  <th>Asunto</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <React.Fragment key={t.id}>
                    <tr
                      style={{ cursor: 'pointer', ...(sinVer.has(t.id) ? { boxShadow: 'inset 3px 0 0 var(--danger)' } : {}) }}
                      onClick={() => {
                        // Abrirlo lo da por visto (saca el aviso del menú).
                        if (abierto !== t.id) marcarTicketVisto(t);
                        setAbierto(abierto === t.id ? null : t.id);
                      }}
                    >
                      <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text3)', marginRight: '6px' }}>{abierto === t.id ? '▾' : '▸'}</span>
                        {numeroTicket(t.numero)}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '12px', whiteSpace: 'nowrap' }}>{fechaTicket(t.creadoEl)}</td>
                      <td>
                        {t.asunto}
                        {t.respuestas?.length > 0 && <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '6px' }}>· {t.respuestas.length} respuesta{t.respuestas.length === 1 ? '' : 's'}</span>}
                      </td>
                      <td>{CATEGORIAS_TICKET[t.categoria] || t.categoria}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`badge ${BADGE_ESTADO_TICKET[t.estado] || ''}`}>{ESTADOS_TICKET[t.estado] || t.estado}</span>
                        {sinVer.has(t.id) && <span className="nav-contador" style={{ marginLeft: '6px' }} title="Tiene una respuesta o un cambio de estado que todavía no viste">Nuevo</span>}
                      </td>
                    </tr>
                    {abierto === t.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--bg3)' }}>
                          <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{t.comentario}</div>
                          {(t.respuestas || []).map((r, i) => (
                            <div key={i} className="soporte-respuesta">
                              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Respuesta de Manager3D · {fechaTicket(r.fecha)}</div>
                              {r.texto}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
