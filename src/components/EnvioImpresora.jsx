import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ESTADOS_TRABAJO, MINUTOS_VENCE_IMPRIMIR, borrarTrabajo, cancelarTrabajo, escucharConectores, escucharTrabajos,
  impresorasPara, mandarAImpresora, trabajoVencido
} from '../utils/impresionDirecta';

// Mandar un archivo G-code guardado a una impresora, con el conector
// (utils/impresionDirecta.js). Lo usan el modal de archivos de un producto de
// la Biblioteca y el detalle de un pedido.

const clave = (d) => `${d.conector.id}|${d.impresora.id}`;

// Panel para elegir archivo, impresora y qué hacer (subir o imprimir).
//   archivos: fichas del producto en estado 'listo'.
//   archivoInicialId: archivo que arranca elegido (si no, el primero).
//   alTerminar: se llama al mandar o al cancelar.
export function PanelEnvio({ archivos, archivoInicialId, alTerminar }) {
  const { cuentaId, user, showToast } = useApp();
  const [conectores, setConectores] = useState([]);
  const [archivoId, setArchivoId] = useState(archivoInicialId || archivos[0]?.id || '');
  const [destino, setDestino] = useState('');
  const [accion, setAccion] = useState('subir');
  const [libre, setLibre] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => (cuentaId ? escucharConectores(cuentaId, setConectores) : undefined), [cuentaId]);

  const archivo = archivos.find((a) => a.id === archivoId) || archivos[0];
  const destinos = archivo ? impresorasPara(archivo, conectores) : [];
  // Arranca en la impresora del archivo si coincide por nombre, o en una activa.
  const preferido = archivo && (destinos.find((d) => d.impresora.nombre === archivo.impresora) || destinos.find((d) => d.activo) || destinos[0]);
  const elegido = destinos.find((d) => clave(d) === destino) || preferido || null;

  if (!archivo) return null;

  if (!destinos.length) {
    return (
      <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', padding: '12px 14px', background: 'var(--bg3)', fontSize: '13px' }}>
        {conectores.length
          ? `Ninguna impresora cargada en tus conectores recibe archivos .${archivo.formato === '3mf' ? '3mf' : 'gcode'}.`
          : 'Para mandar a una impresora primero vinculá un conector en Configuración → Impresión directa.'}
        <div style={{ marginTop: '10px' }}><button className="btn btn-sm" onClick={() => alTerminar?.(false)}>Cerrar</button></div>
      </div>
    );
  }

  const enviar = async () => {
    if (!elegido) return;
    if (accion === 'imprimir' && !libre) {
      showToast('Confirmá que la cama está libre antes de imprimir.', 'error');
      return;
    }
    setEnviando(true);
    try {
      await mandarAImpresora({ cuentaId, uid: user?.uid || null, archivo, conector: elegido.conector, impresora: elegido.impresora, accion });
      showToast(`Trabajo en cola para ${elegido.impresora.nombre}.`, 'info');
      alTerminar?.(true);
    } catch (err) {
      console.error('No se pudo mandar el trabajo a la impresora:', err);
      showToast('No se pudo poner el trabajo en la cola.', 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', padding: '12px 14px', background: 'var(--bg3)' }}>
      {archivos.length > 1 ? (
        <>
          <label className="fl" style={{ marginTop: 0 }}>Archivo</label>
          <select value={archivo.id} onChange={(e) => { setArchivoId(e.target.value); setDestino(''); setAccion('subir'); setLibre(false); }}>
            {archivos.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.impresora ? ` · ${a.impresora}` : ''}</option>)}
          </select>
        </>
      ) : (
        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Mandar "{archivo.nombre}" a una impresora</div>
      )}
      <label className="fl" style={archivos.length > 1 ? undefined : { marginTop: 0 }}>Impresora</label>
      <select value={elegido ? clave(elegido) : ''} onChange={(e) => { setDestino(e.target.value); setAccion('subir'); setLibre(false); }}>
        {destinos.map((d) => (
          <option key={clave(d)} value={clave(d)}>{d.impresora.nombre} · {d.conector.equipo}{d.activo ? '' : ' (sin conexión)'}</option>
        ))}
      </select>
      {elegido && !elegido.activo && (
        <div style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '6px' }}>
          El conector de esa impresora está sin conexión: abrilo en esa PC. {accion === 'imprimir'
            ? `Para imprimir, el envío vence si pasan ${MINUTOS_VENCE_IMPRIMIR} minutos sin que el conector lo tome.`
            : 'Mientras tanto el archivo queda en cola y se sube cuando se abra.'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px', fontSize: '13px' }}>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="radio" name="accion-gcode" checked={accion === 'subir'} onChange={() => { setAccion('subir'); setLibre(false); }} style={{ marginTop: '3px' }} />
          <span>Solo subir el archivo <span style={{ color: 'var(--text3)' }}>· queda en la impresora y lo elegís en su pantalla</span></span>
        </label>
        {elegido?.impresora.puedeImprimir && (
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="accion-gcode" checked={accion === 'imprimir'} onChange={() => setAccion('imprimir')} style={{ marginTop: '3px' }} />
            <span>Subir e imprimir ahora</span>
          </label>
        )}
        {accion === 'imprimir' && (
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', marginLeft: '22px', color: 'var(--warn)' }}>
            <input type="checkbox" checked={libre} onChange={(e) => setLibre(e.target.checked)} style={{ marginTop: '3px' }} />
            <span>La cama está libre y el filamento es el correcto</span>
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button className="btn btn-primary btn-sm" disabled={enviando || (accion === 'imprimir' && !libre)} onClick={enviar}>
          {enviando ? 'Enviando…' : (accion === 'imprimir' ? 'Imprimir' : 'Subir a la impresora')}
        </button>
        <button className="btn btn-sm" onClick={() => alTerminar?.(false)}>Cancelar</button>
      </div>
    </div>
  );
}

// Últimos envíos de un producto, con su estado y la opción de cancelarlos o
// quitarlos de la lista.
export function ListaEnvios({ productoId, soloLectura }) {
  const { cuentaId, showToast } = useApp();
  const [trabajos, setTrabajos] = useState([]);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => (cuentaId ? escucharTrabajos(cuentaId, setTrabajos) : undefined), [cuentaId]);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const lista = trabajos
    .filter((t) => t.productoId === String(productoId))
    // Un envío recién creado todavía no tiene la hora del servidor: va primero.
    .sort((a, b) => (b.creadoEl?.toMillis?.() ?? Infinity) - (a.creadoEl?.toMillis?.() ?? Infinity))
    .slice(0, 6);
  if (!lista.length) return null;

  const quitar = async (t) => {
    try {
      if (t.estado === 'pendiente') await cancelarTrabajo(cuentaId, t.id);
      else await borrarTrabajo(cuentaId, t.id);
    } catch (err) {
      console.error('No se pudo quitar el trabajo:', err);
      showToast('No se pudo quitar el trabajo.', 'error');
    }
  };

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>Envíos a impresoras</div>
      {lista.map((t) => {
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
              <button className="btn btn-ghost btn-sm" onClick={() => quitar(t)} title={t.estado === 'pendiente' ? 'Cancelar' : 'Quitar de la lista'}>✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
