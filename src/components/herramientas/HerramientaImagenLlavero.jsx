import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { useUi } from '../../context/contextos';
import CampoNumero from '../CampoNumero';
import VisorPiezas from './VisorPiezas';
import { CAMAS } from '../../utils/camasImpresion';
import { descargar, nombreArchivo } from '../../utils/descargas';
import { stlBinario, crear3mf } from '../../utils/mallas3d';
import { crearBambu3mf } from '../../utils/bambu3mf';
import { unirMallas, entraEnCama } from '../../utils/llaveros';
import {
  prepararMascara, cuantizar, asignarAPaleta, colorEnPunto, limpiarIndices, fundirZonaEn, aplicarLimpiezas, pixelDeModelo, armarLlaveroImagen, sanearImagen, colorAHex, hexAColor,
  CANTIDADES_COLORES, POSICIONES_ARGOLLA, MODOS_IMAGEN, CARAS_IMAGEN, BOQUILLAS, PARAMETROS_IMAGEN, SIN_COLOR
} from '../../utils/imagenLlavero';

const MAX_ARCHIVO_MB = 15;
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });

export default function HerramientaImagenLlavero() {
  const { showToast } = useUi();
  const [p, setP] = useState(PARAMETROS_IMAGEN);
  const [imagen, setImagen] = useState(null); // { nombre, bitmap }
  const [muestra, setMuestra] = useState(null); // { rgba, w, h } a la resolución de trabajo
  const [coloresUsuario, setColoresUsuario] = useState([]); // hex elegido por color de la paleta
  const [excluidos, setExcluidos] = useState([]); // colores que no se imprimen
  // Paleta elegida a mano: null = la saca sola la herramienta; si no, lista de [r, g, b].
  const [paletaManual, setPaletaManual] = useState(null);
  // Elegir un color tocando la imagen: null, { tipo: 'agregar' } o { tipo: 'reemplazar', indice }.
  const [seleccion, setSeleccion] = useState(null);
  // Zonas que se borraron tocándolas ([x, y] en píxeles de trabajo) y si se está en ese modo.
  const [limpiezas, setLimpiezas] = useState([]);
  const [modoBorrar, setModoBorrar] = useState(false);
  const [vista, setVista] = useState('iso'); // 'iso' o 'arriba'
  const [cama, setCama] = useState('bambu');
  const [encuadre, setEncuadre] = useState(0);
  const lienzoOriginal = useRef(null);
  const lienzoAgrupado = useRef(null);

  const cambiar = (clave, valor) => setP((a) => ({ ...a, [clave]: valor }));
  const num = (clave) => (e) => cambiar(clave, e.target.value === '' ? '' : Number(e.target.value));

  const parametros = useDeferredValue(p);
  const limpio = useMemo(() => sanearImagen(parametros), [parametros]);

  // ---------- Imagen ----------
  const cargarArchivo = async (archivo) => {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) { showToast('Elegí una imagen (PNG, JPG o WebP).', 'error'); return; }
    if (archivo.size > MAX_ARCHIVO_MB * 1024 * 1024) { showToast(`La imagen pesa más de ${MAX_ARCHIVO_MB} MB.`, 'error'); return; }
    try {
      const bitmap = await createImageBitmap(archivo);
      setImagen({ nombre: archivo.name.replace(/\.[^.]+$/, ''), bitmap });
    } catch {
      showToast('No se pudo leer esa imagen.', 'error');
    }
  };

  // La imagen se achica al "detalle" elegido: con menos píxeles, el trabajo es más rápido.
  useEffect(() => {
    if (!imagen) { setMuestra(null); return; }
    const { bitmap } = imagen;
    const escala = Math.min(1, limpio.detalle / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const lienzo = document.createElement('canvas');
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    setMuestra({ rgba: ctx.getImageData(0, 0, w, h).data, w, h });
  }, [imagen, limpio.detalle]);

  const mascara = useMemo(() => (muestra
    ? prepararMascara(muestra.rgba, muestra.w, muestra.h, { quitarFondo: limpio.quitarFondo, tolerancia: limpio.toleranciaFondo })
    : null), [muestra, limpio.quitarFondo, limpio.toleranciaFondo]);

  const automatico = useMemo(() => (muestra && mascara
    ? cuantizar(muestra.rgba, mascara, muestra.w, muestra.h, limpio.colores, { fusion: limpio.fusion })
    : null), [muestra, mascara, limpio.colores, limpio.fusion]);

  // Con una paleta elegida a mano, cada píxel va al color más cercano de esa paleta.
  const agrupado = useMemo(() => (paletaManual && muestra && mascara
    ? asignarAPaleta(muestra.rgba, mascara, muestra.w, muestra.h, paletaManual)
    : automatico), [paletaManual, muestra, mascara, automatico]);

  const indicesAuto = useMemo(() => (agrupado
    ? limpiarIndices(agrupado.indices, muestra.w, muestra.h, { pasadas: limpio.suavizado, minPixeles: limpio.minPixeles })
    : null), [agrupado, muestra, limpio.suavizado, limpio.minPixeles]);

  // Después de la limpieza automática, se vuelven a aplicar las zonas que borraste tocándolas.
  const indices = useMemo(() => (indicesAuto
    ? aplicarLimpiezas(indicesAuto, muestra.w, muestra.h, limpiezas)
    : null), [indicesAuto, muestra, limpiezas]);

  // Si cambia lo que saca solo la herramienta (otra imagen, otra cantidad de colores), se empieza de cero.
  useEffect(() => { setColoresUsuario([]); setExcluidos([]); setPaletaManual(null); setSeleccion(null); setLimpiezas([]); setModoBorrar(false); }, [automatico]);

  const paleta = useMemo(() => (agrupado ? agrupado.paleta : []), [agrupado]);
  const colorDe = (c) => coloresUsuario[c] || colorAHex(paleta[c]);

  // ---------- Llavero ----------
  const { conjunto, error } = useMemo(() => {
    if (!indices) return { conjunto: null, error: null };
    try {
      return {
        conjunto: armarLlaveroImagen({ indices, w: muestra.w, h: muestra.h, paleta }, { ...limpio, colorBorde: p.colorBorde }, { colores: coloresUsuario, excluidos }),
        error: null
      };
    } catch (e) {
      return { conjunto: null, error: e.message || 'No se pudo armar el llavero.' };
    }
  }, [indices, muestra, paleta, limpio, p.colorBorde, coloresUsuario, excluidos]);

  const cuerpos = useMemo(() => (conjunto ? conjunto.cuerpos.map((c) => ({ ...c, visible: true })) : []), [conjunto]);
  const tamano = conjunto ? `${Math.round(conjunto.ancho)}x${Math.round(conjunto.alto)}` : '';
  useEffect(() => { setEncuadre((n) => n + 1); }, [tamano, imagen]);

  const camaActual = CAMAS.find((c) => c.id === cama) || CAMAS[0];
  const ajuste = conjunto && conjunto.cuerpos.length ? entraEnCama(conjunto.ancho, conjunto.alto, camaActual) : null;

  // ---------- Vistas de la imagen (original y agrupada) ----------
  useEffect(() => {
    const lienzo = lienzoOriginal.current;
    if (!lienzo || !muestra || !mascara) return;
    lienzo.width = muestra.w;
    lienzo.height = muestra.h;
    const datos = new ImageData(new Uint8ClampedArray(muestra.rgba), muestra.w, muestra.h);
    for (let i = 0; i < muestra.w * muestra.h; i++) datos.data[i * 4 + 3] = mascara[i] ? 255 : 0;
    lienzo.getContext('2d').putImageData(datos, 0, 0);
  }, [muestra, mascara]);

  useEffect(() => {
    const lienzo = lienzoAgrupado.current;
    if (!lienzo || !muestra || !indices) return;
    lienzo.width = muestra.w;
    lienzo.height = muestra.h;
    const ctx = lienzo.getContext('2d');
    const datos = ctx.createImageData(muestra.w, muestra.h);
    const colores = paleta.map((rgb, c) => hexAColor(coloresUsuario[c] || colorAHex(rgb)));
    for (let i = 0; i < indices.length; i++) {
      const c = indices[i];
      if (c === SIN_COLOR || !colores[c]) continue;
      datos.data.set([...colores[c], excluidos.includes(c) ? 40 : 255], i * 4);
    }
    ctx.putImageData(datos, 0, 0);
  }, [muestra, indices, paleta, coloresUsuario, excluidos]);

  // ---------- Exportar ----------
  const base = nombreArchivo(imagen?.nombre, 'llavero-imagen');
  const exportable = cuerpos.length > 0;
  const exportarStl = () => descargar(stlBinario(unirMallas(cuerpos.map((c) => c.malla)), base), `${base}.stl`, 'model/stl');
  // Proyecto de Bambu Studio: cada color es una pieza con su filamento ya asignado.
  const exportarBambu = () => {
    try {
      descargar(crearBambu3mf(cuerpos, { nombre: imagen?.nombre || 'Llavero' }), `${base} - Bambu A1.3mf`, 'model/3mf');
    } catch (e) {
      showToast(e.message || 'No se pudo armar el archivo para Bambu Studio.', 'error');
    }
  };
  const exportar3mf = () => descargar(crear3mf(cuerpos, { ensamblado: true }), `${base}.3mf`, 'model/3mf');
  const exportarZip = () => {
    const archivos = {};
    cuerpos.forEach((c, i) => { archivos[`${String(i + 1).padStart(2, '0')} ${nombreArchivo(c.nombre)}.stl`] = stlBinario(c.malla, c.nombre); });
    descargar(zipSync(archivos), `${base} - por colores.zip`, 'application/zip');
  };

  // Editar la paleta: la primera vez parte de la que sacó la herramienta.
  const editarPaleta = (cambio) => setPaletaManual((actual) => cambio(actual || automatico.paleta.map((c) => [...c])));
  const quitarColor = (indice) => {
    if (paleta.length <= 1) return;
    editarPaleta((l) => l.filter((_, i) => i !== indice));
    setColoresUsuario((a) => a.filter((_, i) => i !== indice));
    setExcluidos((a) => a.filter((i) => i !== indice).map((i) => (i > indice ? i - 1 : i)));
  };
  const volverAutomatico = () => { setPaletaManual(null); setColoresUsuario([]); setExcluidos([]); setSeleccion(null); };
  // Toque sobre la imagen original: toma el color de ahí.
  const MOTIVOS_BORRAR = {
    fuera: 'Tocá dentro de la imagen.',
    fondo: 'Ahí no hay color: tocá la zona que querés borrar.',
    grande: 'Esa zona es muy grande para borrarla. Para sacar un color entero, destildalo en el paso 2.',
    aislada: 'Esa zona no tiene otro color alrededor con el que unirse.'
  };
  // Se edita sobre el modelo 3D (con zoom y movimiento): se mira desde arriba.
  const entrarEdicion = () => { setVista('arriba'); setEncuadre((n) => n + 1); };
  // Toque sobre el modelo: según el modo, borra una zona o toma un color de la imagen original.
  const alTocarModelo = (t) => {
    if (t.tipo !== 'clic' || !conjunto?.mapa || !muestra || !indices || (!modoBorrar && !seleccion)) return;
    const { x, y } = pixelDeModelo(conjunto.mapa, t.punto[0], t.punto[1]);
    if (modoBorrar) {
      const r = fundirZonaEn(indices, muestra.w, muestra.h, x, y);
      if (!r.ok) { showToast(MOTIVOS_BORRAR[r.motivo] || 'No se pudo borrar esa zona.', 'error'); return; }
      setLimpiezas((l) => [...l, [x, y]]);
      return;
    }
    const color = colorEnPunto(muestra.rgba, mascara, muestra.w, muestra.h, x, y);
    if (!color) { showToast('Ahí no hay imagen: tocá una parte con color.', 'error'); return; }
    if (seleccion.tipo === 'agregar') editarPaleta((l) => (l.length >= 12 ? l : [...l, color]));
    else editarPaleta((l) => l.map((c, i) => (i === seleccion.indice ? color : c)));
    setSeleccion(null);
  };
  const alternarExcluido = (c) => setExcluidos((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]));
  const elegirColor = (c, hex) => setColoresUsuario((a) => { const l = [...a]; l[c] = hex; return l; });
  const campo = (clave, etiqueta, { min, step = 0.1, ayuda } = {}) => (
    <div style={{ flex: 1, minWidth: '110px' }}>
      <label className="fl">{etiqueta}</label>
      <CampoNumero min={min ?? 0} step={step} value={p[clave]} onChange={num(clave)} />
      {ayuda && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{ayuda}</div>}
    </div>
  );
  const total = agrupado ? agrupado.cuentas.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="herr-separar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="herr-separar-panel">
        <div className="card">
          <div className="card-title">1 · Imagen</div>
          <label className="drop-zone" style={{ padding: '14px', marginBottom: 0 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); cargarArchivo(e.dataTransfer.files?.[0]); }}>
            <input type="file" accept="image/*" onChange={(e) => { cargarArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            <div style={{ fontSize: '13px', fontWeight: 500 }}>{imagen ? `🖼️ ${imagen.nombre}` : 'Elegí o soltá una imagen'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>PNG, JPG o WebP. La imagen no se sube: se procesa en tu computadora. Andan mejor los dibujos y logos simples.</div>
          </label>

          {muestra && (
            <>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {[['Original', lienzoOriginal], ['Agrupada', lienzoAgrupado]].map(([titulo, ref]) => (
                  <div key={titulo} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '3px' }}>{titulo}</div>
                    <canvas ref={ref} style={{ width: '100%', height: '120px', objectFit: 'contain', imageRendering: 'pixelated', background: 'repeating-conic-gradient(var(--bg3) 0% 25%, var(--bg2) 0% 50%) 50% / 12px 12px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                <button type="button" className={`btn btn-sm ${modoBorrar ? 'btn-primary' : ''}`} title="Tocá una raya o mancha del modelo 3D para unirla con el color que la rodea" onClick={() => { const activar = !modoBorrar; setModoBorrar(activar); setSeleccion(null); if (activar) entrarEdicion(); }}>🧹 Borrar una zona</button>
                {limpiezas.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setLimpiezas((l) => l.slice(0, -1))}>↩ Deshacer</button>}
                {limpiezas.length > 1 && <button type="button" className="btn btn-sm" onClick={() => setLimpiezas([])}>Quitar todas ({limpiezas.length})</button>}
              </div>
              {modoBorrar && <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '6px' }}>Tocá en el modelo 3D, a la derecha, la raya o mancha que querés sacar: se une con el color que la rodea. Podés hacer zoom con la rueda y mover la vista arrastrando.</div>}
            </>
          )}

          <label className="fl">Cantidad de colores (hasta)</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {CANTIDADES_COLORES.map((n) => (
              <button key={n} type="button" className={`btn btn-sm ${p.colores === n ? 'btn-primary' : ''}`} onClick={() => { cambiar('colores', n); volverAutomatico(); }}>{n}</button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Son un máximo: si la imagen tiene menos colores distintos, se usan menos. Si falta alguno (un contorno, un detalle), elegilo vos en el paso 2.</div>

          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
            <input type="checkbox" checked={p.quitarFondo} onChange={(e) => cambiar('quitarFondo', e.target.checked)} style={{ width: 'auto' }} />
            Quitar el fondo liso de la imagen
          </label>
          <details style={{ marginTop: '10px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Opciones avanzadas de la imagen</summary>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {campo('detalle', 'Detalle (píxeles, máx. 512)', { min: 32, step: 32, ayuda: 'Más detalle, más lento. Con 256 alcanza para la mayoría.' })}
              {p.quitarFondo && campo('toleranciaFondo', 'Tolerancia del fondo', { min: 0, step: 5, ayuda: 'Cuánto puede variar el color del fondo.' })}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {campo('fusion', 'Unir colores parecidos', { min: 0, step: 1, ayuda: 'Más alto, menos tonos casi iguales.' })}
              {campo('suavizado', 'Quitar píxeles sueltos', { min: 0, step: 1, ayuda: 'Pasadas que borran píxeles aislados.' })}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {campo('minPixeles', 'Zona mínima (píxeles)', { min: 1, step: 1, ayuda: 'Las zonas más chicas se funden con su entorno.' })}
            </div>
          </details>
        </div>

        {paleta.length > 0 && (
          <div className="card">
            <div className="card-title">2 · Colores de la imagen</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
              {paletaManual ? 'Paleta elegida por vos: cada parte de la imagen va al color más parecido de esta lista.' : 'Cada color es un filamento.'} Izquierda, el color en la imagen; derecha, el color con el que se imprime. Destildalo para no imprimirlo.
            </div>
            {paleta.map((rgb, c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', opacity: excluidos.includes(c) ? 0.5 : 1 }}>
                <input type="checkbox" checked={!excluidos.includes(c)} onChange={() => alternarExcluido(c)} style={{ width: 'auto' }} title="Imprimir este color" />
                <div title="Color en la imagen" style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid var(--border)', background: colorAHex(rgb), flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>→</span>
                <input type="color" value={colorDe(c)} onChange={(e) => elegirColor(c, e.target.value)} title="Color con el que se imprime" style={{ width: '40px', height: '28px', padding: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', flex: 1, textAlign: 'right' }}>{fmt((agrupado.cuentas[c] / total) * 100, 0)}%</div>
                <button type="button" className={`btn btn-sm ${seleccion?.tipo === 'reemplazar' && seleccion.indice === c ? 'btn-primary' : ''}`} title="Cambiar el color de la imagen que representa: tocá el modelo 3D" onClick={() => { const nuevo = seleccion?.indice === c ? null : { tipo: 'reemplazar', indice: c }; setModoBorrar(false); setSeleccion(nuevo); if (nuevo) entrarEdicion(); }}>🎯</button>
                <button type="button" className="btn btn-sm" title="Quitar este color: sus partes pasan al más parecido" disabled={paleta.length <= 1} onClick={() => quitarColor(c)}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
              <button type="button" className={`btn btn-sm ${seleccion?.tipo === 'agregar' ? 'btn-primary' : ''}`} disabled={paleta.length >= 12} onClick={() => { const nuevo = seleccion?.tipo === 'agregar' ? null : { tipo: 'agregar' }; setModoBorrar(false); setSeleccion(nuevo); if (nuevo) entrarEdicion(); }}>+ Agregar un color de la imagen</button>
              {paletaManual && <button type="button" className="btn btn-sm" onClick={volverAutomatico}>Volver al automático</button>}
            </div>
            {seleccion && <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '8px' }}>Tocá el modelo 3D, a la derecha, en una parte del color que querés {seleccion.tipo === 'agregar' ? 'sumar' : 'usar en lugar de este'}.</div>}
            {paleta.length >= 12 && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>Ya hay 12 colores, el máximo. Quitá alguno para agregar otro.</div>}
          </div>
        )}

        <div className="card">
          <div className="card-title">{paleta.length > 0 ? '3' : '2'} · Llavero</div>
          <label className="fl">Estilo</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {MODOS_IMAGEN.map((m) => (
              <button key={m.id} type="button" className={`btn btn-sm ${p.modo === m.id ? 'btn-primary' : ''}`} onClick={() => setP((a) => ({ ...a, modo: m.id, caras: m.id === 'relieve' ? 'una' : 'ambas' }))}>{m.nombre}</button>
            ))}
          </div>
          <label className="fl">Tu boquilla</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {BOQUILLAS.map((b) => (
              <button key={b} type="button" className={`btn btn-sm ${p.boquilla === b ? 'btn-primary' : ''}`} onClick={() => setP((a) => ({ ...a, boquilla: b, anchoMinimo: b }))}>{fmt(b, 1)} mm</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {campo('anchoMinimo', 'Ancho mínimo de las líneas (mm)', { min: 0, step: 0.05, ayuda: 'Las líneas más finas se engrosan hasta este ancho para que la boquilla las pueda imprimir sin cortes. Se ajusta solo al elegir la boquilla; 0 = no forzar.' })}
          </div>
          <label className="fl">Colores en</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {CARAS_IMAGEN.map((c) => (
              <button key={c.id} type="button" className={`btn btn-sm ${p.caras === c.id ? 'btn-primary' : ''}`} onClick={() => cambiar('caras', c.id)}>{c.nombre}</button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
            {p.modo === 'plano'
              ? (p.caras === 'una' ? 'La imagen es una capa fina arriba, sobre una base lisa: el dorso queda de un solo color.' : 'Los colores atraviesan la placa y se ven de los dos lados (el dorso se ve espejado).')
              : (p.caras === 'una' ? 'Relieve de color sólo arriba.' : 'Relieve de color arriba y abajo (el de abajo se ve espejado).')}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {campo('anchoMm', 'Ancho del dibujo (mm)', { min: 10, step: 1 })}
            {campo('grosor', p.modo === 'relieve' ? 'Grosor de la base (mm)' : 'Grosor (mm)', { min: 0.8, step: 0.2 })}
          </div>
          {p.modo === 'relieve' && <div style={{ display: 'flex', gap: '8px' }}>{campo('relieve', 'Relieve de los colores (mm)', { min: 0.2, step: 0.2 })}</div>}
          {p.modo === 'plano' && p.caras === 'una' && <div style={{ display: 'flex', gap: '8px' }}>{campo('capaColor', 'Grosor de la capa de color (mm)', { min: 0.2, step: 0.2, ayuda: 'Con 0,8 mm la imagen tapa bien la base.' })}</div>}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {campo('suavizadoBordes', 'Suavizado de bordes (0 a 4)', { min: 0, step: 1, ayuda: 'Redondea el escalonado de los contornos. 0 = sin suavizar. Sin ancho mínimo, puede borrar líneas de 1 o 2 píxeles.' })}
            {campo('margen', 'Margen alrededor (mm)', { min: 0, step: 0.5, ayuda: 'La base sobresale este tanto de la imagen.' })}
            {campo('agujero', 'Agujero argolla (mm)', { min: 2, step: 0.5 })}
          </div>
          <label className="fl">Posición de la argolla</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {POSICIONES_ARGOLLA.map((a) => (
              <button key={a.id} type="button" className={`btn btn-sm ${p.argolla === a.id ? 'btn-primary' : ''}`} onClick={() => cambiar('argolla', a.id)}>{a.nombre}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, minWidth: '90px' }}>
              <label className="fl">{p.modo === 'relieve' ? 'Color de la base' : 'Color del borde'}</label>
              <input type="color" value={p.colorBorde} style={{ width: '100%', height: '34px', padding: '2px' }} onChange={(e) => cambiar('colorBorde', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">{paleta.length > 0 ? '4' : '3'} · Exportar</div>
          <label className="fl">Tu cama de impresión (sólo para avisar si entra)</label>
          <select value={cama} onChange={(e) => setCama(e.target.value)}>
            {CAMAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {conjunto && conjunto.cuerpos.length > 0 && (
            <div style={{ fontSize: '12px', marginTop: '8px', color: ajuste?.entra ? 'var(--text2)' : 'var(--red, #c0392b)' }}>
              Tamaño: {fmt(conjunto.ancho)} × {fmt(conjunto.alto)} mm. {conjunto.cuerpos.length} colores (filamentos).{' '}
              {ajuste?.entra ? 'Entra en tu cama.' : ajuste?.rotar ? 'No entra así, pero sí girado 90°.' : 'No entra en tu cama: bajá el ancho.'}
            </div>
          )}
          {conjunto?.avisos.map((a) => <div key={a} style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text2)' }}>⚠ {a}</div>)}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={!exportable} onClick={exportarBambu} title="Proyecto de Bambu Studio con cada color ya asignado a un filamento">3MF para Bambu Studio (A1)</button>
            <button type="button" className="btn" disabled={!exportable} onClick={exportar3mf}>3MF genérico</button>
            <button type="button" className="btn" disabled={!exportable} onClick={exportarStl}>STL</button>
            <button type="button" className="btn" disabled={!exportable} onClick={exportarZip}>ZIP por colores</button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
            El <strong>3MF para Bambu Studio</strong> es un proyecto con cada color como una pieza ya asignada a su filamento (hasta 16), con la configuración de una Bambu Lab A1 de 0,4 mm: se abre sin avisos y sin pintar nada. El <strong>3MF genérico</strong> sirve para otras impresoras u Orca: trae una pieza por color con su color, y Bambu Studio avisa que no es suyo, pero igual los carga. La cama que elegís arriba no cambia los archivos.
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            <button type="button" className="btn btn-sm" onClick={() => { setP(PARAMETROS_IMAGEN); setImagen(null); }}>Empezar de nuevo</button>
          </div>
        </div>
      </div>

      <div className="herr-separar-visor">
        <VisorPiezas cuerpos={cuerpos} activoId={null} seleccion={null} versionSeleccion={0} despiece={false} marcadores={[]} herramienta={null} radioPincel={3} onTocar={alTocarModelo} encuadre={encuadre} mira={modoBorrar || !!seleccion} vista={vista} />
        {cuerpos.length > 0 && (
          <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px' }}>
            <button type="button" className={`btn btn-sm ${vista === 'arriba' ? 'btn-primary' : ''}`} onClick={() => { setVista('arriba'); setEncuadre((n) => n + 1); }}>⬆ Desde arriba</button>
            <button type="button" className={`btn btn-sm ${vista === 'iso' ? 'btn-primary' : ''}`} onClick={() => { setVista('iso'); setEncuadre((n) => n + 1); }}>Vista 3D</button>
          </div>
        )}
        {(modoBorrar || seleccion) && (
          <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '8px 14px', fontSize: '12px', boxShadow: 'var(--shadow)', display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '92%' }}>
            <span>{modoBorrar ? '🧹 Tocá una zona del modelo para borrarla' : 'Tocá el modelo en el color que querés'}</span>
            <button type="button" className="btn btn-sm" onClick={() => { setModoBorrar(false); setSeleccion(null); }}>Listo</button>
          </div>
        )}
        {(!imagen || error || !cuerpos.length) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', pointerEvents: 'none', textAlign: 'center', padding: '0 24px' }}>
            {error || (!imagen ? 'Elegí una imagen para armar el llavero' : 'No quedó ningún color para imprimir')}
          </div>
        )}
      </div>
    </div>
  );
}
