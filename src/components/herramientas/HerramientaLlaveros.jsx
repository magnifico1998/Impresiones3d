import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { zipSync } from 'fflate';
import { useUi } from '../../context/contextos';
import CampoNumero from '../CampoNumero';
import VisorPiezas from './VisorPiezas';
import { cargarFuente, parsearFuente, FUENTES } from '../../utils/fuentesLlaveros';
import { stlBinario, crear3mf } from '../../utils/mallas3d';
import {
  armarConjunto, sanearParametros, entraEnCama, unirMallas, PARAMETROS_INICIALES,
  MODOS, ESTILOS_BORDE, TIPOS_LAPIZ, TOPES_LAPIZ, FORMAS_AGUJERO_LAPIZ, ALTURAS_CAPA
} from '../../utils/llaveros';

// Camas más comunes (mm). "Otra" deja escribir las medidas.
const CAMAS = [
  { id: 'bambu', nombre: 'Bambu Lab / 256 × 256', x: 256, y: 256 },
  { id: 'ender', nombre: 'Ender / Creality 220 × 220', x: 220, y: 220 },
  { id: 'prusa', nombre: 'Prusa MK4 / 250 × 210', x: 250, y: 210 },
  { id: 'chica', nombre: 'Chica 180 × 180', x: 180, y: 180 }
];

function descargar(bytes, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const nombreArchivo = (s) => (s || 'llavero').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'llavero';
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });

export default function HerramientaLlaveros() {
  const { showToast } = useUi();
  const [p, setP] = useState(PARAMETROS_INICIALES);
  const [alturaCapa, setAlturaCapa] = useState(0.2);
  const [cama, setCama] = useState('bambu');
  const [fuenteId, setFuenteId] = useState(FUENTES[0].id);
  const [fuentePropia, setFuentePropia] = useState(null); // { nombre, fuente }
  const [fuente, setFuente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [encuadre, setEncuadre] = useState(0);
  const [historial, setHistorial] = useState([]);

  const cambiar = (clave, valor) => setP((a) => ({ ...a, [clave]: valor }));
  // Los cambios de a uno van al historial para el botón Deshacer.
  const cambiarConHistorial = (clave, valor) => {
    setHistorial((h) => [...h.slice(-29), p]);
    cambiar(clave, valor);
  };
  const num = (clave) => (e) => cambiar(clave, e.target.value === '' ? '' : Number(e.target.value));

  useEffect(() => {
    if (fuentePropia) { setFuente(fuentePropia.fuente); setCargando(false); return undefined; }
    let vivo = true;
    setCargando(true);
    cargarFuente(fuenteId)
      .then((f) => { if (vivo) { setFuente(f); setCargando(false); } })
      .catch((e) => { if (vivo) { setCargando(false); showToast(e.message || 'No se pudo cargar la tipografía.', 'error'); } });
    return () => { vivo = false; };
  }, [fuenteId, fuentePropia, showToast]);

  const cargarPropia = (archivo) => {
    if (!archivo) return;
    if (!/\.(ttf|otf|woff)$/i.test(archivo.name)) { showToast('Elegí una tipografía .ttf, .otf o .woff.', 'error'); return; }
    const lector = new FileReader();
    lector.onload = () => {
      try {
        setFuentePropia({ nombre: archivo.name, fuente: parsearFuente(lector.result) });
      } catch {
        showToast('No se pudo leer esa tipografía.', 'error');
      }
    };
    lector.readAsArrayBuffer(archivo);
  };

  const parametros = useDeferredValue(p);
  const capaDiferida = useDeferredValue(alturaCapa);
  const limpio = useMemo(() => sanearParametros(parametros, capaDiferida), [parametros, capaDiferida]);

  const { conjunto, error } = useMemo(() => {
    if (!fuente) return { conjunto: null, error: null };
    try {
      return { conjunto: armarConjunto(fuente, limpio), error: null };
    } catch (e) {
      return { conjunto: null, error: e.message || 'No se pudo armar la pieza.' };
    }
  }, [fuente, limpio]);

  const cuerpos = useMemo(() => (conjunto ? conjunto.cuerpos.map((c) => ({ ...c, visible: true })) : []), [conjunto]);
  // Cada vez que cambia lo que se arma, se vuelve a encuadrar sólo si cambió el tamaño general.
  const tamano = conjunto ? `${Math.round(conjunto.ancho)}x${Math.round(conjunto.alto)}` : '';
  useEffect(() => { setEncuadre((n) => n + 1); }, [tamano, p.modo]);

  const camaActual = CAMAS.find((c) => c.id === cama) || CAMAS[0];
  const ajuste = conjunto && conjunto.cuerpos.length ? entraEnCama(conjunto.ancho, conjunto.alto, camaActual) : null;

  // ---------- Exportar ----------
  const base = nombreArchivo(limpio.nombres.filter((n) => n.trim()).slice(0, 3).join(' ') || (limpio.modo === 'lapiz' ? 'nombre-lapiz' : 'llavero'));
  const exportable = !!cuerpos.length;
  const exportarStl = () => {
    const todo = unirMallas(cuerpos.map((c) => c.malla));
    descargar(stlBinario(todo, base), `${base}.stl`, 'model/stl');
  };
  const exportar3mf = () => descargar(crear3mf(cuerpos, { ensamblado: true }), `${base}.3mf`, 'model/3mf');
  const exportarZip = () => {
    const archivos = {};
    cuerpos.forEach((c) => { archivos[`${nombreArchivo(c.nombre)}.stl`] = stlBinario(c.malla, c.nombre); });
    descargar(zipSync(archivos), `${base} - por colores.zip`, 'application/zip');
  };

  // ---------- Nombres ----------
  const cambiarNombre = (i, v) => setP((a) => ({ ...a, nombres: a.nombres.map((n, k) => (k === i ? v : n)) }));
  const agregarNombre = () => cambiarConHistorial('nombres', [...p.nombres, '']);
  const quitarNombre = (i) => cambiarConHistorial('nombres', p.nombres.length > 1 ? p.nombres.filter((_, k) => k !== i) : ['']);

  const deshacer = () => {
    if (!historial.length) return;
    setP(historial[historial.length - 1]);
    setHistorial((h) => h.slice(0, -1));
  };
  const empezarDeNuevo = () => {
    setHistorial((h) => [...h.slice(-29), p]);
    setP(PARAMETROS_INICIALES);
    setAlturaCapa(0.2);
    setFuentePropia(null);
    setFuenteId(FUENTES[0].id);
  };

  const esLapiz = p.modo === 'lapiz';
  const colorInput = (clave, etiqueta) => (
    <div style={{ flex: 1, minWidth: '90px' }}>
      <label className="fl">{etiqueta}</label>
      <input type="color" value={p.colores[clave]} style={{ width: '100%', height: '34px', padding: '2px' }}
        onChange={(e) => setP((a) => ({ ...a, colores: { ...a.colores, [clave]: e.target.value } }))} />
    </div>
  );
  const campo = (clave, etiqueta, { min, step = 0.1, ayuda } = {}) => (
    <div style={{ flex: 1, minWidth: '110px' }}>
      <label className="fl">{etiqueta}</label>
      <CampoNumero min={min ?? 0} step={step} value={p[clave]} onChange={num(clave)} />
      {ayuda && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{ayuda}</div>}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '16px', alignItems: 'start' }} className="herr-separar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="card">
          <div className="card-title">1 · Qué vas a hacer</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {MODOS.map((m) => (
              <button key={m.id} type="button" className={`btn btn-sm ${p.modo === m.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('modo', m.id)}>{m.nombre}</button>
            ))}
          </div>
          {esLapiz && (
            <>
              <label className="fl">Tipo de lápiz</label>
              <select value={TIPOS_LAPIZ.find((t) => t.diametro === p.diametroLapiz)?.id || 'otro'}
                onChange={(e) => { const t = TIPOS_LAPIZ.find((x) => x.id === e.target.value); if (t) setP((a) => ({ ...a, tipoLapiz: t.id, diametroLapiz: t.diametro })); }}>
                {TIPOS_LAPIZ.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({fmt(t.diametro)} mm)</option>)}
                <option value="otro" disabled>Medida personalizada</option>
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                {campo('diametroLapiz', 'Diámetro interior (mm)', { min: 3, step: 0.1, ayuda: 'Sumale unas décimas si tu impresora cierra los agujeros.' })}
                {campo('paredLapiz', 'Pared (mm)', { min: 0.8, step: 0.2 })}
              </div>
              <label className="fl">Extremos</label>
              <select value={p.tope} onChange={(e) => cambiar('tope', e.target.value)}>
                {TOPES_LAPIZ.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <label className="fl">Forma del agujero</label>
              <select value={p.formaAgujero} onChange={(e) => cambiar('formaAgujero', e.target.value)}>
                {FORMAS_AGUJERO_LAPIZ.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.id === 'techo' ? ' (sin soportes)' : ''}</option>)}
              </select>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title">2 · Nombres</div>
          {p.nombres.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <input type="text" value={n} maxLength={40} placeholder="Escribí un nombre" onChange={(e) => cambiarNombre(i, e.target.value)} />
              <button type="button" className="btn btn-sm" title="Quitar" onClick={() => quitarNombre(i)}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={agregarNombre}>+ Añadir nombre</button>
          <label className="fl">Mayúsculas</label>
          <select value={p.mayusculas} onChange={(e) => cambiar('mayusculas', e.target.value)}>
            <option value="como">Como lo escribo</option>
            <option value="mayus">MAYÚSCULAS</option>
            <option value="minus">minúsculas</option>
          </select>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
            <input type="checkbox" checked={p.dividirLineas} onChange={(e) => cambiar('dividirLineas', e.target.checked)} style={{ width: 'auto' }} />
            Cada palabra en su línea
          </label>
          {p.nombres.length > 1 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {campo('columnas', 'Columnas', { min: 1, step: 1 })}
              {campo('separacion', 'Separación (mm)', { min: 0, step: 0.5 })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">3 · Tipografía</div>
          <select value={fuentePropia ? 'propia' : fuenteId} onChange={(e) => { if (e.target.value !== 'propia') { setFuentePropia(null); setFuenteId(e.target.value); } }}>
            {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            {fuentePropia && <option value="propia">{fuentePropia.nombre}</option>}
          </select>
          <label className="fl">Usar una tipografía tuya</label>
          <input type="file" accept=".ttf,.otf,.woff" onChange={(e) => { cargarPropia(e.target.files?.[0]); e.target.value = ''; }} />
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>El archivo no se sube: se lee en tu computadora.</div>
        </div>

        <div className="card">
          <div className="card-title">4 · Estilo y medidas</div>
          {!esLapiz && (
            <>
              <label className="fl">Borde</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {ESTILOS_BORDE.map((e) => (
                  <button key={e.id} type="button" className={`btn btn-sm ${p.estilo === e.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('estilo', e.id)}>{e.nombre}</button>
                ))}
              </div>
              {p.estilo !== 'placa' && <div style={{ display: 'flex', gap: '8px' }}>{campo('grosorBorde', 'Grosor del borde (mm)', { min: 0.4, step: 0.2 })}</div>}
            </>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {campo('alturaLetra', 'Alto de letra (mm)', { min: 3, step: 0.5 })}
            {campo('reliveLetras', 'Relieve de letras (mm)', { min: 0.2, step: 0.2 })}
          </div>
          {!esLapiz && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {campo('grosorBase', 'Grosor de la placa (mm)', { min: 0.4, step: 0.2 })}
              {campo('agujero', 'Agujero argolla (mm)', { min: 2, step: 0.5 })}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {campo('margen', 'Margen alrededor (mm)', { min: 0.5, step: 0.5 })}
            {!esLapiz && campo('esquinas', 'Esquinas redondeadas (mm)', { min: 0, step: 0.5 })}
          </div>
          {!esLapiz && <div style={{ display: 'flex', gap: '8px' }}>{campo('alturaFija', 'Alto fijo (mm, 0 = automático)', { min: 0, step: 1, ayuda: 'Para que todos los llaveros tengan el mismo alto.' })}</div>}
          <label className="fl">Altura de capa (ajusta los grosores)</label>
          <select value={alturaCapa} onChange={(e) => setAlturaCapa(Number(e.target.value))}>
            {ALTURAS_CAPA.map((c) => <option key={c} value={c}>{fmt(c, 2)} mm</option>)}
          </select>
        </div>

        <div className="card">
          <div className="card-title">5 · Colores</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {colorInput('fondo', 'Fondo')}
            {colorInput('letras', 'Letras')}
            {!esLapiz && p.estilo !== 'placa' && colorInput('borde', 'Borde')}
          </div>
        </div>

        <div className="card">
          <div className="card-title">6 · Exportar</div>
          <label className="fl">Tu cama de impresión</label>
          <select value={cama} onChange={(e) => setCama(e.target.value)}>
            {CAMAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {conjunto && conjunto.cuerpos.length > 0 && (
            <div style={{ fontSize: '12px', marginTop: '8px', color: ajuste?.entra ? 'var(--text2)' : 'var(--red, #c0392b)' }}>
              Tamaño: {fmt(conjunto.ancho)} × {fmt(conjunto.alto)} mm.{' '}
              {ajuste?.entra ? 'Entra en tu cama.' : ajuste?.rotar ? 'No entra así, pero sí girado 90°. Giralo en el slicer.' : 'No entra en tu cama: bajá columnas, tamaño o cantidad de nombres.'}
            </div>
          )}
          {conjunto?.avisos.map((a) => <div key={a} style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text2)' }}>⚠ {a}</div>)}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={!exportable} onClick={exportar3mf}>3MF a color</button>
            <button type="button" className="btn" disabled={!exportable} onClick={exportarStl}>STL</button>
            <button type="button" className="btn" disabled={!exportable} onClick={exportarZip}>ZIP por colores</button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
            El 3MF se abre en Bambu Studio u Orca con una parte por color: asignale el filamento a cada una. Con una impresora de un solo color, usá el STL, o el ZIP si querés cambiar de filamento a mano.
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            <button type="button" className="btn btn-sm" disabled={!historial.length} onClick={deshacer}>↩ Deshacer</button>
            <button type="button" className="btn btn-sm" onClick={empezarDeNuevo}>Empezar de nuevo</button>
          </div>
        </div>
      </div>

      <div style={{ position: 'sticky', top: '84px', height: 'calc(100vh - 120px)', minHeight: '420px' }} className="herr-separar-visor">
        <VisorPiezas cuerpos={cuerpos} activoId={null} seleccion={null} versionSeleccion={0} despiece={false} marcadores={[]} herramienta={null} radioPincel={3} onTocar={() => {}} encuadre={encuadre} />
        {(cargando || error || !cuerpos.length) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', pointerEvents: 'none' }}>
            {cargando ? 'Cargando la tipografía…' : error || 'Escribí un nombre para ver el llavero'}
          </div>
        )}
      </div>
    </div>
  );
}
