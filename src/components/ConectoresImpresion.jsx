import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { confirmar } from './Dialogos';
import {
  conectorActivo, datosDescargaConector, desvincularConector, escucharConectores, pedirCodigoConector, renombrarConector
} from '../utils/impresionDirecta';

// Configuración → "Impresión directa": vincula los conectores (el programa
// que corre en una PC del taller y manda los archivos a las impresoras) y
// muestra qué impresoras trae cada uno. Ver utils/impresionDirecta.js y la
// carpeta conector/.

export default function ConectoresImpresion() {
  const { cuentaId, showToast, suscripcion, isAdmin } = useApp();
  const [conectores, setConectores] = useState([]);
  const [codigo, setCodigo] = useState(null); // { codigo, expira }
  const [pidiendo, setPidiendo] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const soloLectura = ['lectura', 'suspendida'].includes(suscripcion?.estado) && !isAdmin;

  useEffect(() => (cuentaId ? escucharConectores(cuentaId, setConectores) : undefined), [cuentaId]);

  // Para que el código venza en pantalla y el "conectado" se refresque.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const vigente = codigo && codigo.expira > ahora;
  // Al vincularse un conector nuevo, el código ya no sirve.
  useEffect(() => { if (codigo && conectores.some((c) => (c.creadoEl?.toMillis?.() || 0) > codigo.pedidoEl)) setCodigo(null); }, [conectores, codigo]);

  const pedir = async () => {
    setPidiendo(true);
    try {
      const r = await pedirCodigoConector();
      setCodigo({ codigo: r.codigo, expira: r.expira, pedidoEl: Date.now() - 5000 });
    } catch (e) {
      console.error('No se pudo generar el código del conector:', e);
      showToast(e?.message?.replace(/^.*?:\s*/, '') || 'No se pudo generar el código.', 'error');
    } finally {
      setPidiendo(false);
    }
  };

  // Programa del conector: se baja directo de Storage.
  const descargar = async () => {
    setBajando(true);
    try {
      const { url } = await datosDescargaConector();
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Manager3D-Conector.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Descargando el conector. Abrí el .zip y ejecutá Manager3D-Conector.exe.', 'info');
    } catch (e) {
      console.error('No se pudo bajar el conector:', e);
      showToast('No se pudo preparar la descarga del conector. Probá de nuevo en un momento.', 'error');
    } finally {
      setBajando(false);
    }
  };

  const desvincular = async (c) => {
    if (!(await confirmar(`"${c.equipo}" deja de recibir trabajos. Para volver a usarlo hay que vincularlo de nuevo.`, { titulo: '¿Desvincular este conector?', textoConfirmar: 'Desvincular', peligro: true }))) return;
    try {
      await desvincularConector(cuentaId, c.id);
    } catch (e) {
      console.error('No se pudo desvincular el conector:', e);
      showToast('No se pudo desvincular.', 'error');
    }
  };

  const renombrar = async (c, valor) => {
    if (!valor.trim() || valor.trim() === c.equipo) return;
    try {
      await renombrarConector(cuentaId, c.id, valor);
    } catch (e) {
      console.error('No se pudo renombrar el conector:', e);
      showToast('No se pudo cambiar el nombre.', 'error');
    }
  };

  return (
    <div className="card">
      <div className="card-title">Impresión directa</div>
      <p style={{ fontSize: '12px', color: 'var(--text2)', marginTop: 0 }}>
        Mandá el G-code de un producto a tu impresora desde la Biblioteca (📄 → Mandar a impresora). Para eso instalás el <b>Manager3D Conector</b> en una PC de tu taller, que es la que está en la misma red que las impresoras.
      </p>

      {conectores.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '10px' }}>Todavía no vinculaste ningún conector.</div>}

      {conectores.map((c) => {
        const activo = conectorActivo(c, ahora);
        return (
          <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span title={activo ? 'Conectado' : 'Sin conexión (la PC o el conector están apagados)'} style={{ width: '9px', height: '9px', borderRadius: '50%', background: activo ? 'var(--accent)' : 'var(--text3)', flexShrink: 0 }} />
              <input
                defaultValue={c.equipo}
                disabled={soloLectura}
                onBlur={(e) => renombrar(c, e.target.value)}
                aria-label="Nombre del conector"
                style={{ flex: 1, minWidth: '140px', fontWeight: 600 }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{activo ? 'conectado' : 'sin conexión'}</span>
              <button className="btn btn-danger btn-sm" onClick={() => desvincular(c)} disabled={soloLectura}>Desvincular</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>
              {(c.impresoras || []).length
                ? (c.impresoras || []).map((i) => i.nombre).join(' · ')
                : 'Sin impresoras cargadas: abrí el panel del conector en esa PC y agregalas.'}
            </div>
          </div>
        );
      })}

      {vigente ? (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', marginTop: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Escribí este código en el panel del conector (vale hasta las {new Date(codigo.expira).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}):</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '26px', fontWeight: 700, letterSpacing: '4px', margin: '6px 0' }}>{codigo.codigo}</div>
          <button className="btn btn-sm" onClick={() => setCodigo(null)}>Cerrar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          <button className="btn" onClick={pedir} disabled={pidiendo || soloLectura}>
            {pidiendo ? 'Generando…' : '+ Vincular un conector'}
          </button>
          <button className="btn" onClick={descargar} disabled={bajando} title="Programa para Windows: se instala en la PC que está en la misma red que tus impresoras">
            {bajando ? 'Preparando…' : '⬇ Descargar el conector (Windows)'}
          </button>
        </div>
      )}
      <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '10px 0 0' }}>
        1) Descargá el conector y abrí el .zip. 2) Ejecutá <b>Manager3D-Conector.exe</b> en la PC del taller (si Windows muestra un aviso azul: "Más información" → "Ejecutar de todas formas"). 3) Tocá "Vincular un conector" y escribí el código en su panel.
      </p>
    </div>
  );
}
