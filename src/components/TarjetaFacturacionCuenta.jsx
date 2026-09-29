import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useApp } from '../context/AppContext';
import { avisar } from './Dialogos';
import { CUIT_MANAGER3D } from '../utils/facturacion';

// Tarjeta "Facturación electrónica" de "Mi emprendimiento": el dueño
// configura su CUIT y punto de venta, y el servidor verifica contra ARCA
// que la delegación y el punto de venta estén bien
// (configurarFacturacionCuenta). Sólo aparece si el plan la incluye.

const vacio = {
  cuit: '', ptoVta: '', razonSocial: '', nombreFantasia: '', domicilio: '', iibb: '', inicioActividades: '', emailRespuesta: ''
};

export default function TarjetaFacturacionCuenta() {
  const { cuentaId, esMiembro, empresa, planContratado, showToast } = useApp();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [instructivo, setInstructivo] = useState(false);

  const habilitada = !!planContratado?.facturacionElectronica;

  useEffect(() => {
    if (!cuentaId || !habilitada) return undefined;
    return onSnapshot(doc(db, 'users', cuentaId, 'facturacion', 'config'), (snap) => {
      setConfig(snap.exists() ? snap.data() : null);
    }, () => setConfig(null));
  }, [cuentaId, habilitada]);

  if (!habilitada) return null;

  const empezarEdicion = () => {
    // Si todavía no configuró nada, se precarga con los datos del emprendimiento.
    setForm(config ? { ...vacio, ...config, ptoVta: String(config.ptoVta || '') } : {
      ...vacio,
      cuit: (empresa?.cuit || '').replace(/\D/g, ''),
      nombreFantasia: empresa?.nombre || '',
      domicilio: empresa?.direccion || '',
      emailRespuesta: empresa?.email || ''
    });
    setEditando(true);
    setInstructivo(!config);
  };

  const cambiar = (campo) => (e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }));

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await httpsCallable(functions, 'configurarFacturacionCuenta', { timeout: 120000 })({
        ...form, ptoVta: Number(form.ptoVta)
      });
      if (r.data.ok) {
        showToast('Facturación configurada y verificada con ARCA.');
        setEditando(false);
      } else {
        await avisar(r.data.mensaje, { titulo: 'Se guardó, pero ARCA no la validó' });
      }
    } catch (e) {
      showToast(e?.message || 'No se pudo guardar la configuración.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const etiqueta = { marginTop: '10px' };

  return (
    <div className="card">
      <div className="card-title">Facturación electrónica (ARCA)</div>

      {!editando && (
        <>
          {!config && (
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' }}>
              Tu plan incluye facturación electrónica: podés emitir <strong>Factura C</strong> desde cada pedido, con tu CUIT de monotributista.
              Hay que configurarla una sola vez.
            </div>
          )}
          {config && (
            <div style={{ fontSize: '13px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>
                {config.verificado
                  ? <span className="badge badge-done">verificada con ARCA</span>
                  : <span className="badge badge-cancelled">sin verificar</span>}
              </div>
              <div style={{ color: 'var(--text2)' }}>
                CUIT {config.cuit} · Punto de venta {config.ptoVta} · {config.razonSocial}
              </div>
              {!config.verificado && config.errorVerificacion && (
                <div style={{ color: 'var(--danger)', fontSize: '12px' }}>{config.errorVerificacion}</div>
              )}
            </div>
          )}
          {esMiembro
            ? <div style={{ fontSize: '12px', color: 'var(--text3)' }}>La configura el dueño de la cuenta.</div>
            : <button className="btn btn-primary btn-sm" onClick={empezarEdicion}>{config ? 'Modificar / volver a verificar' : 'Configurar facturación'}</button>}
        </>
      )}

      {editando && (
        <>
          <div
            style={{ fontSize: '12px', color: 'var(--accent)', cursor: 'pointer', marginBottom: '8px' }}
            onClick={() => setInstructivo((v) => !v)}
          >
            {instructivo ? '▾' : '▸'} Qué hay que hacer en ARCA antes (una sola vez)
          </div>
          {instructivo && (
            <ol style={{ fontSize: '13px', color: 'var(--text2)', paddingLeft: '20px', margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>
                Entrá a <strong>arca.gob.ar</strong> con tu clave fiscal y abrí <strong>"Administrador de Relaciones de Clave Fiscal"</strong>.
                Tocá <strong>"Nueva relación"</strong> → Buscar → ARCA → WebServices → <strong>"Facturación Electrónica"</strong>.
                En <strong>Representante</strong> ingresá el CUIT <strong>{CUIT_MANAGER3D}</strong> (Manager3D) y confirmá.
              </li>
              <li>
                En <strong>"Administración de puntos de venta y domicilios"</strong> dá de alta un punto de venta nuevo con el sistema
                <strong> "Factura Electrónica - Monotributo - Web Services"</strong> (no sirve el del facturador online). Anotá el número.
              </li>
              <li>Completá los datos de abajo y tocá <strong>Guardar y verificar</strong>.</li>
            </ol>
          )}

          <div className="grid2">
            <div>
              <label className="fl" style={etiqueta}>CUIT</label>
              <input type="text" value={form.cuit} onChange={cambiar('cuit')} placeholder="20123456789" />
            </div>
            <div>
              <label className="fl" style={etiqueta}>Punto de venta (Web Services)</label>
              <input type="number" min="1" value={form.ptoVta} onChange={cambiar('ptoVta')} />
            </div>
            <div>
              <label className="fl" style={etiqueta}>Razón social / nombre (como figura en ARCA)</label>
              <input type="text" value={form.razonSocial} onChange={cambiar('razonSocial')} />
            </div>
            <div>
              <label className="fl" style={etiqueta}>Nombre del emprendimiento</label>
              <input type="text" value={form.nombreFantasia} onChange={cambiar('nombreFantasia')} />
            </div>
            <div>
              <label className="fl" style={etiqueta}>Domicilio comercial</label>
              <input type="text" value={form.domicilio} onChange={cambiar('domicilio')} />
            </div>
            <div>
              <label className="fl" style={etiqueta}>Ingresos Brutos</label>
              <input type="text" value={form.iibb} onChange={cambiar('iibb')} placeholder="Número o Exento" />
            </div>
            <div>
              <label className="fl" style={etiqueta}>Inicio de actividades</label>
              <input type="date" value={form.inicioActividades} onChange={cambiar('inicioActividades')} />
            </div>
            <div>
              <label className="fl" style={etiqueta}>Email para respuestas de clientes</label>
              <input type="email" value={form.emailRespuesta} onChange={cambiar('emailRespuesta')} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Verificando con ARCA…' : 'Guardar y verificar'}</button>
            <button className="btn" disabled={guardando} onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}
