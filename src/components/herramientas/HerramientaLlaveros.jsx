import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { zipSync } from 'fflate';
import { useUi } from '../../context/contextos';
import CampoNumero from '../CampoNumero';
import VisorPiezas from './VisorPiezas';
import { cargarFuente, parsearFuente, FUENTES } from '../../utils/fuentesLlaveros';
import { stlBinario, crear3mf } from '../../utils/mallas3d';
import {
  armarConjunto, sanearParametros, infoPausa, coloresIniciales, estiloSigueLetras, entraEnCama, unirMallas, PARAMETROS_INICIALES,
  IMPRESORAS, ESTILOS_BORDE, FORMAS_LAPIZ, TIPOS_LAPIZ, TOPES_LAPIZ, FORMAS_AGUJERO_LAPIZ, ALTURAS_CAPA
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

// Valores con los que arranca cada herramienta: los toppers empiezan con las letras unidas.
const inicial = (modo) => {
  const estilo = modo === 'lapiz' ? 'letras' : PARAMETROS_INICIALES.estilo;
  return { ...PARAMETROS_INICIALES, modo, estilo, colores: coloresIniciales(modo, estilo) };
};

// modo: 'llavero' (llaveros) o 'lapiz' (toppers de nombres para lápices).
export default function HerramientaLlaveros({ modo = 'llavero' }) {
  const { showToast } = useUi();
  const [p, setP] = useState(() => inicial(modo));
  const [alturaCapa, setAlturaCapa] = useState(0.2);
  const [cama, setCama] = useState('bambu');
  const [fuenteId, setFuenteId] = useState(FUENTES[0].id);
  const [fuentePropia, setFuentePropia] = useState(null); // { nombre, fuente }
  const [fuente, setFuente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [encuadre, setEncuadre] = useState(0);
  const [historial, setHistorial] = useState([]);
  // Mientras no se elijan colores, cada forma usa los suyos por defecto.
  const [coloresPropios, setColoresPropios] = useState(false);

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
  const quitarNombre = (i) => {
    setHistorial((h) => [...h.slice(-29), p]);
    setP((a) => (a.nombres.length > 1
      ? { ...a, nombres: a.nombres.filter((_, k) => k !== i), coloresNombres: a.coloresNombres.filter((_, k) => k !== i) }
      : { ...a, nombres: [''], coloresNombres: [] }));
  };
  const coloresDe = (i) => p.coloresNombres[i] || p.colores;
  const elegirEstilo = (id) => {
    setHistorial((h) => [...h.slice(-29), p]);
    setP((a) => ({ ...a, estilo: id, colores: coloresPropios ? a.colores : coloresIniciales(a.modo, id) }));
  };
  const cambiarColorNombre = (i, clave, valor) => {
    setColoresPropios(true);
    cambiarColorNombreEn(i, clave, valor);
  };
  const cambiarColorNombreEn = (i, clave, valor) => setP((a) => {
    const lista = [...a.coloresNombres];
    while (lista.length <= i) lista.push(null);
    lista[i] = { ...(lista[i] || a.colores), [clave]: valor };
    return { ...a, coloresNombres: lista };
  });

  const deshacer = () => {
    if (!historial.length) return;
    setP(historial[historial.length - 1]);
    setHistorial((h) => h.slice(0, -1));
  };
  const empezarDeNuevo = () => {
    setHistorial((h) => [...h.slice(-29), p]);
    setP(inicial(modo));
    setColoresPropios(false);
    setAlturaCapa(0.2);
    setFuentePropia(null);
    setFuenteId(FUENTES[0].id);
  };

  const esLapiz = p.modo === 'lapiz';
  // Los pasos se numeran en el orden en que aparecen (el del lápiz sólo existe en lápiz).
  let paso = 0;
  const titulo = (texto) => `${++paso} · ${texto}`;
  const pausa = p.impresora === 'pausa';
  const unColor = p.impresora === 'uno';
  const colorPorNombre = p.colorPorNombre && !pausa && !unColor;
  const conBorde = !esLapiz && (p.estilo === 'marco' || p.estilo === 'doble');
  const sigueLetras = !esLapiz && estiloSigueLetras(p.estilo);
  // El lápiz tiene tres formas: tubo recto, cuerpo que sigue las letras o letras unidas.
  const lapizUnidas = esLapiz && p.estilo === 'letras';
  const lapizSigue = esLapiz && estiloSigueLetras(p.estilo);
  const formasEstilo = esLapiz ? FORMAS_LAPIZ : ESTILOS_BORDE;
  const estiloActivo = esLapiz ? (lapizUnidas ? 'letras' : lapizSigue ? 'contorno' : 'placa') : (p.estilo === 'letras' ? 'contorno' : p.estilo);
  const pausaInfo = infoPausa(limpio, alturaCapa);
  const colorInput = (clave, etiqueta) => (
    <div style={{ flex: 1, minWidth: '90px' }}>
      <label className="fl">{etiqueta}</label>
      <input type="color" value={p.colores[clave]} style={{ width: '100%', height: '34px', padding: '2px' }}
        onChange={(e) => { setColoresPropios(true); setP((a) => ({ ...a, colores: { ...a.colores, [clave]: e.target.value } })); }} />
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
    <div className="herr-separar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="herr-separar-panel">
        <div className="card">
          <div className="card-title">{titulo('Estilo y medidas')}</div>
          {(
            <>
              <label className="fl">{esLapiz ? 'Forma' : 'Borde'}</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {formasEstilo.map((e) => (
                  <button key={e.id} type="button" className={`btn btn-sm ${estiloActivo === e.id ? 'btn-primary' : ''}`} onClick={() => elegirEstilo(e.id)}>{e.nombre}</button>
                ))}
              </div>
              {conBorde && <div style={{ display: 'flex', gap: '8px' }}>{campo('grosorBorde', p.estilo === 'doble' ? 'Grosor de la banda (mm)' : 'Grosor del marco (mm)', { min: 0.4, step: 0.2 })}</div>}
              {(sigueLetras || lapizSigue) && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>La base sigue la forma de las letras: el margen de las opciones avanzadas define cuánto sobresale.{lapizSigue && ' El lápiz la atraviesa por el centro del texto.'}</div>}
              {lapizUnidas && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>Cada letra es un bloque, pegadas entre sí, y el lápiz las atraviesa por el medio. Todas tienen la altura del tubo para rodear al lápiz, y algunas salen más altas. Si las letras son bajas en planta, se agrandan lo necesario.</div>}
            </>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {campo('alturaLetra', 'Alto de letra (mm)', { min: 3, step: 0.5 })}
            {campo('engrosar', 'Letras más gruesas (mm)', { min: 0, step: 0.1, ayuda: 'Con tipografías finas o cursivas, 0,3 a 0,4 suele alcanzar.' })}
          </div>
          {lapizUnidas && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {campo('desnivel', 'Diferencia de altura entre letras (mm)', { min: 0, step: 0.5, ayuda: 'Las letras 1.ª, 3.ª, 5.ª… salen más altas (hacia arriba) que las demás.' })}
            </div>
          )}
          <details style={{ marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Opciones avanzadas</summary>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!lapizUnidas && campo('reliveLetras', 'Relieve de letras (mm)', { min: 0.2, step: 0.2 })}
              {!esLapiz && campo('grosorBase', 'Grosor de la placa (mm)', { min: 0.4, step: 0.2 })}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!lapizUnidas && campo('margen', 'Margen alrededor (mm)', { min: 0.5, step: 0.5 })}
              {!esLapiz && campo('esquinas', 'Esquinas redondeadas (mm)', { min: 0, step: 0.5 })}
            </div>
            {!esLapiz && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('agujero', 'Agujero argolla (mm)', { min: 2, step: 0.5 })}
                {!sigueLetras && campo('alturaFija', 'Alto fijo (mm, 0 = auto)', { min: 0, step: 1, ayuda: 'Mismo alto en todos los llaveros.' })}
              </div>
            )}
            <label className="fl">Altura de capa (ajusta los grosores)</label>
            <select value={alturaCapa} onChange={(e) => setAlturaCapa(Number(e.target.value))}>
              {ALTURAS_CAPA.map((c) => <option key={c} value={c}>{fmt(c, 2)} mm</option>)}
            </select>
          </details>
        </div>

        {esLapiz && (
          <div className="card">
            <div className="card-title">{titulo('Lápiz')}</div>
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
          </div>
        )}

        <div className="card">
          <div className="card-title">{titulo('Nombres')}</div>
          {p.nombres.map((n, i) => (
            <div key={i} style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="text" value={n} maxLength={40} placeholder="Escribí un nombre" onChange={(e) => cambiarNombre(i, e.target.value)} />
                <button type="button" className="btn btn-sm" title="Quitar" onClick={() => quitarNombre(i)}>✕</button>
              </div>
              {colorPorNombre && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', fontSize: '10px', color: 'var(--text3)' }}>
                  {[...(lapizUnidas ? [] : [['fondo', 'Fondo']]), ['letras', lapizUnidas ? 'Color' : 'Letras'], ...(conBorde ? [['borde', 'Borde']] : [])].map(([clave, etiqueta]) => (
                    <label key={clave} style={{ flex: 1 }}>{etiqueta}
                      <input type="color" value={coloresDe(i)[clave]} style={{ width: '100%', height: '26px', padding: '1px' }}
                        onChange={(e) => cambiarColorNombre(i, clave, e.target.value)} />
                    </label>
                  ))}
                </div>
              )}
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
          <div className="card-title">{titulo('Tipografía')}</div>
          <select value={fuentePropia ? 'propia' : fuenteId} onChange={(e) => { if (e.target.value !== 'propia') { setFuentePropia(null); setFuenteId(e.target.value); } }}>
            {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            {fuentePropia && <option value="propia">{fuentePropia.nombre}</option>}
          </select>
          <label className="fl">Usar una tipografía tuya</label>
          <input type="file" accept=".ttf,.otf,.woff" onChange={(e) => { cargarPropia(e.target.files?.[0]); e.target.value = ''; }} />
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>El archivo no se sube: se lee en tu computadora.</div>
        </div>

        <div className="card">
          <div className="card-title">{titulo('Colores')}</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!lapizUnidas && colorInput('fondo', 'Fondo')}
            {colorInput('letras', lapizUnidas ? 'Color' : pausa && p.estilo === 'marco' ? 'Letras y marco' : 'Letras')}
            {conBorde && !pausa && colorInput('borde', 'Borde')}
          </div>
          {p.nombres.length > 1 && !pausa && !unColor && (
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
              <input type="checkbox" checked={p.colorPorNombre} onChange={(e) => cambiar('colorPorNombre', e.target.checked)} style={{ width: 'auto' }} />
              Un color distinto por nombre
            </label>
          )}
          {colorPorNombre && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Elegí los colores de cada nombre debajo de su casilla, en el paso de los nombres. Cada color extra es un cambio de filamento más.</div>}
          {unColor && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>Con un solo color, estos colores son sólo para la vista previa.</div>}
        </div>

        <div className="card">
          <div className="card-title">{titulo('Exportar')}</div>
          <label className="fl">Tu impresora</label>
          <select value={p.impresora} onChange={(e) => cambiar('impresora', e.target.value)}>
            {IMPRESORAS.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
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
            {p.impresora === 'ams' && <button type="button" className="btn btn-primary" disabled={!exportable} onClick={exportar3mf}>3MF a color</button>}
            <button type="button" className={`btn ${p.impresora === 'ams' ? '' : 'btn-primary'}`} disabled={!exportable} onClick={exportarStl}>STL</button>
            {p.impresora !== 'uno' && <button type="button" className="btn" disabled={!exportable} onClick={exportarZip}>ZIP por colores</button>}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
            {p.impresora === 'ams' && 'El 3MF se abre en Bambu Studio u Orca con una parte por color: asignale el filamento a cada una.'}
            {unColor && 'Imprimí el STL en un solo color: las letras y el borde quedan en relieve sobre la placa.'}
            {pausa && `Imprimí el STL y pausá al terminar la placa: a ${fmt(pausaInfo.altura, 2)} mm de altura${pausaInfo.capasHechas ? ` (${pausaInfo.capasHechas} capas de ${fmt(alturaCapa, 2)} mm)` : ''}. Cambiá el filamento y seguí: las letras y el borde salen del segundo color.`}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            <button type="button" className="btn btn-sm" disabled={!historial.length} onClick={deshacer}>↩ Deshacer</button>
            <button type="button" className="btn btn-sm" onClick={empezarDeNuevo}>Empezar de nuevo</button>
          </div>
        </div>
      </div>

      <div className="herr-separar-visor">
        <VisorPiezas cuerpos={cuerpos} activoId={null} seleccion={null} versionSeleccion={0} despiece={false} marcadores={[]} herramienta={null} radioPincel={3} onTocar={() => {}} encuadre={encuadre} />
        {(cargando || error || !cuerpos.length) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', pointerEvents: 'none' }}>
            {cargando ? 'Cargando la tipografía…' : error || (esLapiz ? 'Escribí un nombre para ver el topper' : 'Escribí un nombre para ver el llavero')}
          </div>
        )}
      </div>
    </div>
  );
}
