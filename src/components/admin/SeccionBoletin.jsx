import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { confirmar } from '../Dialogos';
import ModalPlantillaEmail from '../modals/ModalPlantillaEmail';
import TarjetaColapsable from '../TarjetaColapsable';

// Panel admin → Negocio → Boletín de novedades: edita el contenido de la
// plantilla "boletin", manda una prueba y lo envía a los suscriptores de
// los estados elegidos (functions/http/boletin.js). El progreso de cada
// envío se ve en vivo (boletines/{id}); si queda pausado por el límite de
// Gmail, se reanuda otro día con el mismo contenido.

const ESTADOS = [
  { id: 'trial', nombre: 'En prueba' },
  { id: 'activa', nombre: 'Activas' },
  { id: 'lectura', nombre: 'Modo lectura' },
  { id: 'suspendida', nombre: 'Bloqueadas' }
];

const ETIQUETA_ESTADO_ENVIO = {
  enviando: { texto: 'Enviando…', clase: 'badge-progress' },
  pausado: { texto: 'Pausado', clase: 'badge-pending' },
  terminado: { texto: 'Enviado', clase: 'badge-ok' }
};

const fecha = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function SeccionBoletin({ showToast }) {
  const [resumen, setResumen] = useState(null);
  const [estados, setEstados] = useState(ESTADOS.map((e) => e.id));
  const [bajas, setBajas] = useState('');
  const [envios, setEnvios] = useState([]);
  const [plantilla, setPlantilla] = useState(null);
  const [ocupado, setOcupado] = useState(''); // acción en curso

  const llamar = (datos) => httpsCallable(functions, 'gestionarBoletin', { timeout: 560000 })(datos);

  const cargarResumen = async () => {
    try {
      const { data } = await llamar({ accion: 'resumen' });
      setResumen(data);
      setBajas((data.excluidos || []).join('\n'));
    } catch (e) {
      console.error('Error al cargar el resumen del boletín:', e);
      showToast('No se pudo cargar el resumen del boletín.', 'error');
    }
  };

  useEffect(() => {
    cargarResumen();
    return onSnapshot(
      query(collection(db, 'boletines'), orderBy('creadoEl', 'desc'), limit(5)),
      (snap) => setEnvios(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Error al listar los boletines:', err)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = resumen ? estados.reduce((s, e) => s + (resumen.porEstado[e] || 0), 0) : 0;

  const alternarEstado = (id) => setEstados((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const editarContenido = async () => {
    setOcupado('editar');
    try {
      const { data } = await httpsCallable(functions, 'listarPlantillasEmail')();
      setPlantilla((data.plantillas || []).find((p) => p.id === 'boletin') || null);
    } catch (e) {
      console.error('Error al cargar la plantilla del boletín:', e);
      showToast('No se pudo abrir la plantilla.', 'error');
    } finally {
      setOcupado('');
    }
  };

  const accion = async (nombre, datos, exito) => {
    setOcupado(nombre);
    try {
      const { data } = await llamar(datos);
      showToast(exito(data));
      return data;
    } catch (e) {
      console.error(`Error en el boletín (${nombre}):`, e);
      showToast(e?.message || 'No se pudo completar la acción.', 'error');
      return null;
    } finally {
      setOcupado('');
    }
  };

  const resultadoEnvio = (d) => (d.quedan > 0
    ? `Se mandaron ${d.enviados}. Quedan ${d.quedan}: reanudalo más tarde.`
    : `Boletín enviado (${d.enviados}${d.fallidos ? `, ${d.fallidos} con error` : ''}).`);

  const enviar = async () => {
    if (!total) return;
    if (!(await confirmar(`Se va a mandar el contenido actual del boletín a ${total} suscriptor${total === 1 ? '' : 'es'}. ¿Mandaste antes una prueba para revisarlo?`, { titulo: 'Enviar boletín', textoConfirmar: `Enviar a ${total}` }))) return;
    await accion('enviar', { accion: 'enviar', estados }, resultadoEnvio);
  };

  const guardarBajas = () => accion(
    'bajas',
    { accion: 'guardarExcluidos', excluidos: bajas.split(/[\s,;]+/).filter(Boolean) },
    (d) => {
      setBajas(d.excluidos.join('\n'));
      cargarResumen();
      return `Bajas guardadas (${d.excluidos.length}).`;
    }
  );

  const ultimo = envios[0];
  const resumenTarjeta = ultimo
    ? `último envío ${fecha(ultimo.creadoEl)} · ${(ETIQUETA_ESTADO_ENVIO[ultimo.estado] || { texto: ultimo.estado }).texto.toLowerCase()}`
    : '';

  return (
    <>
    <TarjetaColapsable titulo="Boletín de novedades" resumen={resumenTarjeta} clave="admin.boletin">
      <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.5 }}>
        Un mail a todos los suscriptores con las novedades. Editá el contenido para cada campaña, mandate una prueba y después envialo.
        Gmail manda unos 500 por día: si hay más, el envío queda pausado y se reanuda al día siguiente.
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button className="btn btn-sm" disabled={!!ocupado} onClick={editarContenido}>{ocupado === 'editar' ? 'Abriendo…' : 'Editar contenido'}</button>
        <button className="btn btn-sm" disabled={!!ocupado} onClick={() => accion('prueba', { accion: 'prueba' }, (d) => `Prueba enviada a ${d.a}.`)}>
          {ocupado === 'prueba' ? 'Enviando prueba…' : 'Enviarme una prueba'}
        </button>
      </div>

      <label className="fl">Destinatarios</label>
      {!resumen && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Contando suscriptores…</div>}
      {resumen && (
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '13px', marginBottom: '10px' }}>
          {ESTADOS.map((e) => (
            <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={estados.includes(e.id)} onChange={() => alternarEstado(e.id)} />
              {e.nombre} <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>({resumen.porEstado[e.id] || 0})</span>
            </label>
          ))}
        </div>
      )}
      <button className="btn btn-primary" disabled={!!ocupado || !total} onClick={enviar}>
        {ocupado === 'enviar' ? 'Enviando…' : `Enviar a ${total} suscriptor${total === 1 ? '' : 'es'}`}
      </button>

      <details style={{ marginTop: '14px' }}>
        <summary style={{ fontSize: '12px', color: 'var(--text2)', cursor: 'pointer' }}>
          Bajas ({resumen?.excluidos?.length || 0}): emails que no reciben el boletín
        </summary>
        <textarea
          rows={4}
          value={bajas}
          onChange={(e) => setBajas(e.target.value)}
          placeholder="Un email por línea (los que respondieron BAJA)"
          style={{ marginTop: '8px', fontFamily: 'var(--mono)', fontSize: '12px' }}
        />
        <button className="btn btn-sm" style={{ marginTop: '6px' }} disabled={!!ocupado} onClick={guardarBajas}>
          {ocupado === 'bajas' ? 'Guardando…' : 'Guardar bajas'}
        </button>
      </details>

      {envios.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <label className="fl">Últimos envíos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {envios.map((b) => {
              const enviados = b.enviados?.length || 0;
              const fallidos = b.fallidos?.length || 0;
              const etiqueta = ETIQUETA_ESTADO_ENVIO[b.estado] || { texto: b.estado, clase: '' };
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '12px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', background: 'var(--bg)' }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fecha(b.creadoEl)}</span>
                  <span style={{ flex: 1, minWidth: '160px' }}>{b.subject}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>
                    {enviados}/{b.destinatarios?.length || 0}{fallidos ? <span style={{ color: 'var(--danger)' }} title={(b.fallidos || []).map((f) => `${f.email}: ${f.error}`).join('\n')}> · {fallidos} con error</span> : ''}
                  </span>
                  <span className={`badge ${etiqueta.clase}`} title={b.motivoPausa || ''}>{etiqueta.texto}</span>
                  {b.estado === 'pausado' && (
                    <button className="btn btn-sm" disabled={!!ocupado} onClick={() => accion('reanudar', { accion: 'reanudar', boletinId: b.id }, resultadoEnvio)}>
                      {ocupado === 'reanudar' ? 'Enviando…' : 'Reanudar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </TarjetaColapsable>

    <ModalPlantillaEmail
      isOpen={!!plantilla}
      onClose={() => setPlantilla(null)}
      plantilla={plantilla}
    />
    </>
  );
}
