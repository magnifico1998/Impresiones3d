import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { version } from '../../../package.json';
import {
  MINUTOS_SIN_GRABAR, esError, estadoGrabacion, iniciarGrabacion, obtenerEventos, suscribirRegistro, terminarGrabacion
} from '../../utils/registroSoporte';
import { CATEGORIAS_TICKET, lineasLog, numeroTicket } from '../../utils/formatoTicket';

// Nuevo ticket de soporte, montado una vez en App. Se abre con el evento
// 'abrir-ticket' (Soporte → Nuevo ticket, o "Reportar" en un aviso de
// error, que manda { errorOrigen }). "Grabar el problema" esconde el modal
// y muestra un cartel mientras el usuario repite lo que falló; al terminar
// vuelve al ticket con el log de la grabación. Sin grabar, se adjuntan los
// eventos de los últimos minutos (ver utils/registroSoporte.js).

const FORM_VACIO = { categoria: 'error', asunto: '', comentario: '' };

export default function CentroSoporte() {
  const { user, cuentaId, esMiembro, suscripcion, cfg, activePage, showToast } = useApp();
  const grabando = useSyncExternalStore(suscribirRegistro, estadoGrabacion);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [errorOrigen, setErrorOrigen] = useState(null);
  const [log, setLog] = useState(null); // { eventos, grabado } fijado al grabar o al reportar un aviso
  const [verDetalle, setVerDetalle] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const abrir = (ev) => {
      const origen = ev.detail?.errorOrigen || null;
      if (origen) {
        // Desde un aviso de error: el log se toma ya, con lo que pasó justo antes.
        setForm({ categoria: 'error', asunto: `Error: ${origen.slice(0, 90)}`, comentario: '' });
        setErrorOrigen(origen);
        setLog({ eventos: obtenerEventos(), grabado: false });
      }
      setAbierto(true);
    };
    window.addEventListener('abrir-ticket', abrir);
    return () => window.removeEventListener('abrir-ticket', abrir);
  }, []);

  const reiniciar = () => {
    setForm(FORM_VACIO);
    setErrorOrigen(null);
    setLog(null);
    setVerDetalle(false);
  };

  const cerrar = () => {
    setAbierto(false);
    reiniciar();
  };

  const grabar = () => {
    iniciarGrabacion();
    setAbierto(false);
  };

  const terminar = () => {
    const inicio = terminarGrabacion();
    setLog({ eventos: obtenerEventos(inicio), grabado: true });
    setAbierto(true);
  };

  const cancelarGrabacion = () => {
    terminarGrabacion();
    setAbierto(true);
  };

  const enviar = async () => {
    if (!form.asunto.trim() || !form.comentario.trim()) {
      showToast('Completá el asunto y el comentario.', 'info');
      return;
    }
    setEnviando(true);
    const adjunto = log || { eventos: obtenerEventos(), grabado: false };
    const contexto = {
      version,
      seccion: activePage || '',
      url: window.location.pathname,
      email: user?.email || '',
      cuentaId: cuentaId || '',
      esMiembro: !!esMiembro,
      plan: suscripcion?.planId || '',
      estadoSuscripcion: suscripcion?.estado || '',
      inventario: !!cfg?.inventarioHabilitado,
      navegador: navigator.userAgent,
      pantalla: `${window.innerWidth}x${window.innerHeight}`,
      idioma: navigator.language,
      zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
      online: navigator.onLine
    };
    try {
      const { data } = await httpsCallable(functions, 'crearTicket')({
        ...form, errorOrigen, log: { ...adjunto, contexto }
      });
      showToast(`Ticket ${numeroTicket(data.numero)} creado. Te respondemos por mail.`);
      cerrar();
    } catch (e) {
      console.error('Error al crear el ticket:', e);
      showToast(e?.message || 'No se pudo crear el ticket.', 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (grabando) {
    return createPortal(
      <div className="soporte-grabando" role="status">
        <span className="soporte-grabando-punto" />
        <span>Grabando · repetí lo que falló y tocá <b>Terminar</b></span>
        <button type="button" className="btn btn-primary btn-sm" onClick={terminar}>Terminar</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancelarGrabacion}>Cancelar</button>
      </div>,
      document.body
    );
  }

  if (!abierto) return null;

  const eventos = log?.eventos || obtenerEventos();
  const errores = eventos.filter(esError).length;
  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return createPortal(
    <div className="modal-overlay open" onClick={enviando ? undefined : cerrar} style={{ zIndex: 130, padding: '20px 16px' }}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto' }}>
        <div className="modal-title">Nuevo ticket de soporte</div>
        <div className="modal-sub">
          Contanos qué pasó. Si algo falla, usá <b>Grabar el problema</b> y repetí la operación: así nos llega todo lo que necesitamos para analizarlo.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 180px) 1fr', gap: '10px' }}>
          <div>
            <label className="fl">Categoría</label>
            <select value={form.categoria} onChange={cambiar('categoria')}>
              {Object.entries(CATEGORIAS_TICKET).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="fl">Asunto</label>
            <input type="text" maxLength={120} value={form.asunto} onChange={cambiar('asunto')} placeholder="Ej: No puedo guardar un pedido" />
          </div>
        </div>
        <label className="fl">Comentario</label>
        <textarea
          rows={5}
          maxLength={5000}
          value={form.comentario}
          onChange={cambiar('comentario')}
          placeholder="Qué estabas haciendo, qué esperabas que pasara y qué pasó."
        />

        {errorOrigen && (
          <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>Reportado desde el aviso: “{errorOrigen}”</div>
        )}

        <div className="soporte-log">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{log?.grabado ? '● Log grabado' : 'Log de la sesión'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                {eventos.length} evento{eventos.length === 1 ? '' : 's'}
                {errores > 0 && <span style={{ color: 'var(--danger)' }}> · {errores} error{errores === 1 ? '' : 'es'}</span>}
                {' · '}{log?.grabado ? 'de la grabación' : `de los últimos ${MINUTOS_SIN_GRABAR} minutos`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={() => setVerDetalle((v) => !v)}>{verDetalle ? 'Ocultar' : 'Ver qué se envía'}</button>
              <button type="button" className={`btn btn-sm ${log?.grabado ? '' : 'btn-primary'}`} onClick={grabar}>
                {log?.grabado ? 'Volver a grabar' : '● Grabar el problema'}
              </button>
            </div>
          </div>
          {verDetalle && (
            <pre className="soporte-log-detalle">{lineasLog(eventos).join('\n') || 'Sin eventos.'}</pre>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
            Se envían los errores, las secciones y botones que tocaste, las llamadas al servidor y datos técnicos (versión, navegador, plan). No se envía lo que escribiste en los formularios.
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" disabled={enviando} onClick={cerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar ticket'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
