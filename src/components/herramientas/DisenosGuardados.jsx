import React, { useState } from 'react';
import { confirmar } from '../Dialogos';
import { useDisenosCuenta } from '../../hooks/useDisenosCuenta';
import { useUi } from '../../context/contextos';
import { MAX_DISENOS, limpiarNombreDiseno, parametrosDeDatos } from '../../utils/jarrosDisenos';

// Foto chica del jarro (160 px) para la lista de diseños guardados.
async function miniaturaDe(dataUrl, lado = 160) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = lado; c.height = lado;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3f4f1';
  ctx.fillRect(0, 0, lado, lado);
  const k = Math.min(lado / img.width, lado / img.height);
  ctx.drawImage(img, (lado - img.width * k) / 2, (lado - img.height * k) / 2, img.width * k, img.height * k);
  return c.toDataURL('image/jpeg', 0.7);
}

// Diseños de jarro guardados en la cuenta: guardar el actual (con una foto) y reabrir o borrar los que hay. Se carga recién cuando se
// abre la lista (usa Firestore). `alAbrir(parametros, nombre)` pone el diseño en la herramienta; `capturar()` da la foto del visor.
export default function DisenosGuardados({ parametros, alAbrir, capturar }) {
  const { showToast } = useUi();
  const { disenos, cargando, guardarDiseno, borrarDiseno } = useDisenosCuenta();
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abrir = (d) => {
    try {
      alAbrir(parametrosDeDatos(d.datos), d.nombre);
    } catch (e) {
      showToast(e.message || 'No se pudo abrir ese diseño.', 'error');
    }
  };
  const borrar = async (d) => {
    if (await confirmar(`Se borra "${d.nombre}" de tu cuenta. No se puede deshacer.`, { titulo: 'Borrar diseño', textoConfirmar: 'Borrar' })) borrarDiseno(d.id);
  };
  const guardar = async () => {
    const limpio = limpiarNombreDiseno(nombre);
    if (!limpio) { showToast('Poné un nombre para el diseño.', 'error'); return; }
    const igual = disenos.find((d) => String(d.nombre).toLowerCase() === limpio.toLowerCase());
    if (igual && !(await confirmar(`Ya tenés un diseño llamado "${igual.nombre}". ¿Lo reemplazás con el actual?`, { titulo: 'Reemplazar diseño', textoConfirmar: 'Reemplazar' }))) return;
    setGuardando(true);
    const mini = await (async () => { try { const foto = capturar?.(); return foto ? await miniaturaDe(foto) : null; } catch { return null; } })();
    const ok = await guardarDiseno(limpio, parametros, mini, igual?.id || null);
    setGuardando(false);
    if (ok) setNombre('');
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" value={nombre} maxLength={60} placeholder="Nombre para guardar el diseño actual" onChange={(e) => setNombre(e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
        <button type="button" className="btn btn-sm btn-primary" disabled={guardando || !nombre.trim()} onClick={guardar}>Guardar en mi cuenta</button>
      </div>
      <label className="fl">Mis diseños ({disenos.length}/{MAX_DISENOS})</label>
      {cargando && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Cargando tus diseños…</div>}
      {!cargando && !disenos.length && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Todavía no guardaste ninguno.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {disenos.map((d) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {d.miniatura
              ? <img src={d.miniatura} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flex: 'none' }} />
              : <span style={{ width: '48px', height: '48px', borderRadius: '6px', background: 'var(--bg3, #eee)', flex: 'none' }} />}
            <span style={{ flex: 1, fontSize: '13px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nombre}</span>
            <button type="button" className="btn btn-sm" onClick={() => abrir(d)}>Abrir</button>
            <button type="button" className="btn btn-sm" title="Borrar" aria-label={`Borrar ${d.nombre}`} onClick={() => borrar(d)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
