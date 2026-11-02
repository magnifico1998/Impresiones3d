import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useUi } from '../../context/contextos';
import CampoNumero from '../CampoNumero';
import VisorPiezas from './VisorPiezas';
import { descargar, nombreArchivo } from '../../utils/descargas';
import {
  leerStl, leer3mf, resoldar, revisarCerrada, cajaMalla, transformarMalla, matrizRotacion, matrizAlinear,
  afinarMalla, stlBinario, crear3mf
} from '../../utils/mallas3d';
import { seleccionVarita, seleccionPincel, topologia } from '../../utils/separarPiezas';
import { TEXTURAS, CATEGORIAS_TEXTURA, generarTextura, texturaDeImagen, resolucionSugerida } from '../../utils/texturasSuperficie';
import {
  estimarTriangulosCapas, leerObj, normalEnPunto, sanearSuperficie, PROYECCIONES, PARAMETROS_CAPA, MAX_CAPAS, LIMITES_SUPERFICIE
} from '../../utils/superficie';
import { crearLlamador } from '../../utils/trabajadorSuperficie';
import { crearUniformes, llenarUniformes, escribirMapas } from '../../utils/shaderSuperficie';

const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });
const MAX_ARCHIVO_MB = 80;
const TRIANGULOS_VISTA = 150000; // la vista exacta no pasa de esto para que responda
const TRIANGULOS_GPU = 250000; // lo mismo para la vista rápida, donde el relieve lo pone la GPU
const TRIANGULOS_INTERNOS = 3000000; // tope de lo que se genera antes de reducir
const TOLERANCIA_PLANAS = 0.005; // mm: lo que se puede colapsar sin que se note
const COLOR_MODELO = '#c9a46a';
const TEXTURAS_NUEVAS = ['carbono-sargaFina', 'madera-vetas', 'geo-hexagonos', 'geo-ladrillos'];
const GLOBALES = { resolucion: 0.5, protegerVoladizos: false, baseLisa: false, maxSalida: 1000000, quitarPlanas: true };

let ultimaCapa = 0;
const nuevaCapa = (indice, triangulos, texturaId) => ({
  id: `capa${++ultimaCapa}`,
  visible: true,
  texturaId: texturaId || TEXTURAS_NUEVAS[indice % TEXTURAS_NUEVAS.length],
  propia: null, // { nombre, textura }
  // Las capas de arriba empiezan sin cubrir nada: hay que pintar dónde van.
  p: { ...PARAMETROS_CAPA, modoMascara: indice > 0 ? 'incluir' : 'excluir', combinar: 'cubrir' },
  sel: new Uint8Array(triangulos || 0) // un 1 por triángulo pintado
});

// La selección se edita en el lugar (copiarla en cada movimiento del mouse sería
// lento en modelos grandes) y se avisa con un contador.
const marcar = (datos, zona, valor) => { for (const i of zona) datos[i] = valor; };
const rellenar = (datos, valor) => { datos.fill(valor); };
const invertir = (datos) => { for (let i = 0; i < datos.length; i++) datos[i] = datos[i] ? 0 : 1; };

const texturaDe = (c) => (c.texturaId === 'propia' ? c.propia?.textura : generarTextura(c.texturaId)) || null;
const nombreTextura = (c) => (c.texturaId === 'propia' ? c.propia?.nombre || 'imagen' : TEXTURAS.find((t) => t.id === c.texturaId)?.nombre || '');

// Todo el modelo apoyado en la cama (z = 0) y centrado en x/y.
function apoyarEnCama(malla) {
  const { min, max } = cajaMalla(malla);
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2], 1];
  return transformarMalla(malla, m);
}

// Miniatura de una textura (dos repeticiones) para la galería.
function Miniatura({ id, textura, activa, titulo, onClick }) {
  const lienzo = useRef(null);
  useEffect(() => {
    const t = textura || generarTextura(id, 64);
    const c = lienzo.current;
    if (!c) return;
    const T = 56;
    c.width = T; c.height = T;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(T, T);
    const m = t.alto || t.n;
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const h = t.datos[(Math.floor((y / T) * 2 * m) % m) * t.n + (Math.floor((x / T) * 2 * t.n) % t.n)];
        const g = Math.round(h * 255);
        const i = (y * T + x) * 4;
        img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [id, textura]);
  return (
    <button type="button" title={titulo} onClick={onClick} style={{ padding: 0, border: activa ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: '6px', background: 'none', cursor: 'pointer', overflow: 'hidden', lineHeight: 0 }}>
      <canvas ref={lienzo} style={{ width: '100%', aspectRatio: '1', display: 'block', borderRadius: '4px' }} />
    </button>
  );
}

export default function HerramientaSuperficie() {
  const { showToast } = useUi();
  const [capas, setCapas] = useState(() => [nuevaCapa(0, 0)]);
  const [activa, setActiva] = useState(0);
  const [g, setG] = useState(GLOBALES);
  const [versionSel, setVersionSel] = useState(0);
  const [modelo, setModelo] = useState(null); // { nombre, malla } ya afinada para pintar
  const [aviso, setAviso] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [proporcional, setProporcional] = useState(true);
  const [vista, setVista] = useState('resultado'); // 'resultado' o 'mascara'
  const [herramienta, setHerramienta] = useState(null); // 'pincel' | 'borrar' | 'varita' | 'apoyo'
  const [radioPincel, setRadioPincel] = useState(3);
  const [anguloVarita, setAnguloVarita] = useState(30);
  const [colocandoSello, setColocandoSello] = useState(false);
  const [resultado, setResultado] = useState(null); // { malla, avisos } (vista exacta)
  const [modoVista, setModoVista] = useState('rapida'); // 'rapida' (GPU, al instante) o 'exacta' (la CPU, como el archivo)
  const [uniformes] = useState(crearUniformes);
  const [gpu, setGpu] = useState(null); // { malla, normal, recibe, ids, avisos }
  const [calculando, setCalculando] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [encuadre, setEncuadre] = useState(0);
  const [llamadorVista] = useState(crearLlamador);
  const [llamadorFinal] = useState(crearLlamador);

  const capa = capas[Math.min(activa, capas.length - 1)];
  const p = capa.p;
  const refrescarSel = () => setVersionSel((v) => v + 1);

  // Cambios sobre la capa activa.
  const cambiarCapa = (cambios) => setCapas((cs) => cs.map((c, i) => (i === Math.min(activa, cs.length - 1) ? { ...c, ...cambios } : c)));
  const setP = (fn) => setCapas((cs) => cs.map((c, i) => (i === Math.min(activa, cs.length - 1) ? { ...c, p: typeof fn === 'function' ? fn(c.p) : fn } : c)));
  const cambiar = (clave, valor) => setP((a) => ({ ...a, [clave]: valor }));
  const num = (clave) => (e) => cambiar(clave, e.target.value === '' ? '' : Number(e.target.value));
  const cambiarG = (clave, valor) => setG((a) => ({ ...a, [clave]: valor }));

  const limpio = useMemo(() => sanearSuperficie(p), [p]);
  const resolucion = Math.min(LIMITES_SUPERFICIE.resolucion[1], Math.max(LIMITES_SUPERFICIE.resolucion[0], Number(g.resolucion) || GLOBALES.resolucion));
  const maxSalida = Math.max(0, Math.round(Number(g.maxSalida) || 0));
  const infoTextura = TEXTURAS.find((t) => t.id === capa.texturaId);

  const hayPintura = useMemo(() => capa.sel.some((x) => x), [capa, versionSel]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinZonas = limpio.modoMascara === 'incluir' && !hayPintura;

  // ---------- Cargar ----------
  const trabajar = (texto, fn) => {
    setOcupado(texto);
    setTimeout(() => {
      try { fn(); } catch (e) { console.error(e); showToast(e.message || 'Algo salió mal.', 'error'); } finally { setOcupado(''); }
    }, 30);
  };

  const ponerModelo = (nombre, malla, avisos) => {
    // Se afina para que el pincel y la varita marquen con detalle (y la máscara tenga dónde apoyarse).
    const fina = afinarMalla(apoyarEnCama(malla), 1.5, 300000);
    const m = { pos: fina.pos, tri: fina.tri };
    topologia(m);
    setModelo({ nombre, malla: m });
    setAviso(avisos.join(' '));
    setCapas([nuevaCapa(0, m.tri.length / 3)]);
    setActiva(0);
    setVersionSel(0);
    setResultado(null);
    setVista('resultado');
    setHerramienta(null);
    setColocandoSello(false);
    setEncuadre((v) => v + 1);
  };

  const cargarArchivo = (archivo) => {
    if (!archivo) return;
    const ext = (archivo.name.match(/\.(stl|obj|3mf)$/i) || [])[1]?.toLowerCase();
    if (!ext) { showToast('Elegí un archivo .stl, .obj o .3mf.', 'error'); return; }
    if (archivo.size > MAX_ARCHIVO_MB * 1024 * 1024) { showToast(`El archivo pesa más de ${MAX_ARCHIVO_MB} MB.`, 'error'); return; }
    setOcupado('Leyendo el modelo…');
    archivo.arrayBuffer().then((buffer) => {
      trabajar('Preparando el modelo…', () => {
        const base = archivo.name.replace(/\.(stl|obj|3mf)$/i, '');
        let malla;
        if (ext === 'stl') malla = leerStl(buffer);
        else if (ext === 'obj') malla = leerObj(new TextDecoder().decode(buffer));
        else {
          const partes = leer3mf(buffer).map((x) => resoldar(x.malla));
          // Un 3MF con varias piezas se junta en una sola malla.
          const nv = partes.reduce((s, m) => s + m.pos.length / 3, 0);
          const pos = new Float32Array(nv * 3), tri = [];
          let o = 0;
          for (const m of partes) {
            pos.set(m.pos, o * 3);
            for (const i of m.tri) tri.push(i + o);
            o += m.pos.length / 3;
          }
          malla = { pos, tri: Uint32Array.from(tri) };
        }
        const avisos = [];
        const r = revisarCerrada(malla);
        if (r.abiertas + r.repetidas) avisos.push(`El modelo no está del todo cerrado (${fmt(r.abiertas + r.repetidas, 0)} aristas con problemas): el resultado puede quedar abierto. Conviene repararlo antes.`);
        if (malla.tri.length / 3 > 1500000) avisos.push('Es un modelo pesado: va a andar lento.');
        ponerModelo(base, malla, avisos);
      });
    }).catch((e) => { setOcupado(''); showToast(e.message || 'No se pudo leer el archivo.', 'error'); });
  };

  // Con el modelo girado, lo pintado y los sellos ya no coinciden: se borran.
  const cambiarMalla = (malla) => {
    topologia(malla);
    setModelo((m) => ({ ...m, malla }));
    setCapas((cs) => cs.map((c) => ({ ...c, sel: new Uint8Array(malla.tri.length / 3), p: { ...c.p, sello: null } })));
    setVersionSel((v) => v + 1);
    setEncuadre((v) => v + 1);
  };

  const girar = (eje) => trabajar('Girando…', () => cambiarMalla(apoyarEnCama(transformarMalla(modelo.malla, matrizRotacion(eje, 90)))));

  const cargarImagen = async (archivo) => {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) { showToast('Elegí una imagen (PNG, JPG o WebP).', 'error'); return; }
    try {
      const bitmap = await createImageBitmap(archivo);
      const n = 256;
      const c = document.createElement('canvas');
      c.width = n; c.height = n;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, n, n);
      const { data } = ctx.getImageData(0, 0, n, n);
      cambiarCapa({ propia: { id: Date.now(), nombre: archivo.name.replace(/\.[^.]+$/, ''), textura: texturaDeImagen(data, n, n) }, texturaId: 'propia' });
    } catch {
      showToast('No se pudo leer esa imagen.', 'error');
    }
  };

  // ---------- Capas ----------
  const agregarCapa = () => {
    if (!modelo || capas.length >= MAX_CAPAS) return;
    const nueva = nuevaCapa(capas.length, modelo.malla.tri.length / 3);
    setCapas((cs) => [...cs, nueva]);
    setActiva(capas.length);
    // Una capa nueva no cubre nada hasta que se pinta: se deja lista la herramienta de relleno.
    setHerramienta('varita');
    setVista('mascara');
    setColocandoSello(false);
  };
  const quitarCapa = (i) => {
    if (capas.length <= 1) return;
    setCapas((cs) => cs.filter((_, k) => k !== i));
    setActiva((a) => Math.max(0, a > i || a === capas.length - 1 ? a - 1 : a));
    setHerramienta(null);
    refrescarSel();
  };
  const moverCapa = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= capas.length) return;
    setCapas((cs) => { const c = [...cs]; [c[i], c[j]] = [c[j], c[i]]; return c; });
    setActiva(j);
  };
  const alternarVisible = (i) => setCapas((cs) => cs.map((c, k) => (k === i ? { ...c, visible: !c.visible } : c)));

  // Lo que se le manda al cálculo: sólo las capas visibles y con textura.
  const capasDiferidas = useDeferredValue(capas);
  const globalesDif = useDeferredValue(g);
  const capasCalculo = useMemo(() => capasDiferidas
    .filter((c) => c.visible)
    .map((c) => {
      const op = sanearSuperficie(c.p);
      return { textura: texturaDe(c), op, mascara: c.sel.some((x) => x) || op.modoMascara === 'incluir' ? c.sel : null };
    })
    .filter((c) => c.textura), [capasDiferidas, versionSel]); // eslint-disable-line react-hooks/exhaustive-deps
  const resolucionDif = Math.min(3, Math.max(0.1, Number(globalesDif.resolucion) || GLOBALES.resolucion));
  const globalesCalculo = { resolucion: resolucionDif, protegerVoladizos: !!globalesDif.protegerVoladizos, baseLisa: !!globalesDif.baseLisa };

  // ---------- Vista previa ----------
  useEffect(() => {
    if (!modelo || vista !== 'resultado' || modoVista !== 'exacta') return undefined;
    if (!capasCalculo.length) { setResultado({ malla: modelo.malla, avisos: [] }); return undefined; }
    let cancelado = false;
    const espera = setTimeout(() => {
      setCalculando('Calculando el relieve…');
      llamadorVista.llamar({
        malla: { pos: modelo.malla.pos, tri: modelo.malla.tri }, capas: capasCalculo, globales: globalesCalculo,
        maxTriangulos: TRIANGULOS_VISTA, maxSalida: 0, tolerancia: 0
      }, (texto) => { if (!cancelado) setCalculando(texto); }).then((r) => {
        if (!cancelado) { setResultado({ malla: { pos: r.pos, tri: r.tri }, avisos: r.avisos }); setCalculando(''); }
      }).catch((e) => {
        if (e.cancelado || cancelado) return;
        console.error(e);
        setCalculando('');
        showToast(e.message || 'No se pudo aplicar la textura.', 'error');
      });
    }, 300);
    return () => { cancelado = true; clearTimeout(espera); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo, capasCalculo, globalesDif, vista, modoVista]);

  // ---------- Vista previa rápida (GPU) ----------
  // Capas visibles con textura, tal como están ahora (sin diferir: se mueven al instante).
  const capasVivas = useMemo(() => capas.filter((c) => c.visible && texturaDe(c)).map((c) => ({
    id: c.id, op: sanearSuperficie(c.p), textura: texturaDe(c), sel: c.sel, claveTextura: c.texturaId === 'propia' ? `propia${c.propia?.id}` : c.texturaId
  })), [capas]);

  // Lo que obliga a volver a partir la malla: cuáles capas hay, sus zonas, ángulos, sello y la resolución.
  const claveEstructura = useMemo(() => JSON.stringify([
    capasVivas.map(({ id, op }) => [id, op.modoMascara, op.anguloInferior, op.anguloSuperior, op.transicion, op.sello && [op.sello.centro, op.sello.normal, op.tamanoU, op.tamanoV, op.desfaseU, op.desfaseV, op.rotacion]]),
    resolucion, versionSel
  ]), [capasVivas, resolucion, versionSel]);

  useEffect(() => {
    if (!modelo || modoVista !== 'rapida') return undefined;
    if (!capasVivas.length) { setGpu(null); return undefined; }
    let cancelado = false;
    const espera = setTimeout(() => {
      setCalculando('Preparando la vista previa…');
      llamadorVista.llamar({
        tipo: 'preparar',
        malla: { pos: modelo.malla.pos, tri: modelo.malla.tri },
        capas: capasVivas.map(({ op, sel }) => ({ op, mascara: sel.some((x) => x) || op.modoMascara === 'incluir' ? sel : null })),
        globales: { resolucion }, maxTriangulos: TRIANGULOS_GPU
      }).then((r) => {
        if (cancelado) return;
        setGpu({ malla: { pos: r.pos, tri: r.tri }, normal: r.normal, recibe: r.recibe, ids: capasVivas.map((c) => c.id), avisos: r.avisos });
        setCalculando('');
      }).catch((e) => {
        if (e.cancelado || cancelado) return;
        console.error(e);
        setCalculando('');
        showToast(e.message || 'No se pudo preparar la vista previa.', 'error');
      });
    }, 250);
    return () => { cancelado = true; clearTimeout(espera); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo, claveEstructura, modoVista]);

  // Cada casilla de la GPU sigue a la capa con la que se preparó la malla.
  const capasPorSlot = useMemo(() => (gpu ? gpu.ids.map((id) => capasVivas.find((c) => c.id === id) || null) : []), [gpu, capasVivas]);
  const zMin = useMemo(() => (modelo ? cajaMalla(modelo.malla).min[2] : 0), [modelo]);
  useEffect(() => {
    if (modelo && gpu) llenarUniformes(uniformes, modelo.malla, capasPorSlot, { protegerVoladizos: g.protegerVoladizos, baseLisa: g.baseLisa }, zMin);
  }, [modelo, gpu, capasPorSlot, g.protegerVoladizos, g.baseLisa, zMin, uniformes]);
  const claveMapas = capasPorSlot.map((c) => (c ? `${c.id}|${c.claveTextura}|${c.op.invertirTextura}|${c.op.suavizadoTextura}` : '-')).join(';');
  useEffect(() => {
    if (gpu) escribirMapas(uniformes, capasPorSlot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpu, claveMapas, uniformes]);

  useEffect(() => () => { llamadorVista.cancelar(); llamadorFinal.cancelar(); }, [llamadorVista, llamadorFinal]);

  const triangulosFinal = useMemo(
    () => (modelo && capasCalculo.length ? estimarTriangulosCapas(modelo.malla, capasCalculo, resolucionDif) : 0),
    [modelo, capasCalculo, resolucionDif]
  );

  // ---------- Toques en el visor ----------
  const alTocar = (t) => {
    if (!modelo || ocupado) return;
    if (t.tipo === 'finPintar') { refrescarSel(); return; }
    if (colocandoSello && t.tipo === 'clic') {
      cambiar('sello', { centro: t.punto, normal: normalEnPunto(modelo.malla, t.punto) });
      setColocandoSello(false);
      return;
    }
    if (vista !== 'mascara' || !herramienta) return;
    const { malla } = modelo;
    if (herramienta === 'apoyo' && t.tipo === 'clic') {
      const { normales } = topologia(malla);
      const n = [normales[t.triangulo * 3], normales[t.triangulo * 3 + 1], normales[t.triangulo * 3 + 2]];
      trabajar('Girando…', () => { cambiarMalla(apoyarEnCama(transformarMalla(malla, matrizAlinear(n, [0, 0, -1])))); setHerramienta(null); });
      return;
    }
    if (herramienta === 'varita' && t.tipo === 'clic') {
      const zona = seleccionVarita(malla, t.triangulo, { anguloMax: anguloVarita });
      marcar(capa.sel, zona, t.ev.altKey || t.ev.shiftKey ? 0 : 1);
      refrescarSel();
      return;
    }
    if ((herramienta === 'pincel' || herramienta === 'borrar') && (t.tipo === 'pintar' || t.tipo === 'clic')) {
      const zona = seleccionPincel(malla, t.triangulo, t.punto, radioPincel);
      marcar(capa.sel, zona, herramienta === 'pincel' && !t.ev?.shiftKey ? 1 : 0);
      if (t.tipo === 'clic') refrescarSel();
    }
  };

  const elegirHerramienta = (id) => {
    const nueva = herramienta === id ? null : id;
    setHerramienta(nueva);
    if (nueva) { setVista('mascara'); setColocandoSello(false); }
  };

  const limpiarPintura = () => { rellenar(capa.sel, 0); refrescarSel(); };
  const invertirPintura = () => { invertir(capa.sel); refrescarSel(); };

  // ---------- Exportar ----------
  const nombreSalida = () => `${nombreArchivo(modelo.nombre, 'modelo')} - ${nombreArchivo(capasCalculo.length ? nombreTextura(capas.find((c) => c.visible) || capas[0]) : 'sin textura', 'textura')}`;
  const exportar = (formato) => {
    setOcupado('Armando el archivo final…');
    llamadorFinal.llamar({
      malla: { pos: modelo.malla.pos, tri: modelo.malla.tri }, capas: capasCalculo, globales: { resolucion, protegerVoladizos: !!g.protegerVoladizos, baseLisa: !!g.baseLisa },
      maxTriangulos: TRIANGULOS_INTERNOS, maxSalida, tolerancia: g.quitarPlanas ? TOLERANCIA_PLANAS : 0
    }, setOcupado).then((r) => {
      const malla = { pos: r.pos, tri: r.tri };
      if (formato === 'stl') descargar(stlBinario(malla, modelo.nombre), `${nombreSalida()}.stl`, 'model/stl');
      else descargar(crear3mf([{ nombre: modelo.nombre, color: COLOR_MODELO, malla }], { ensamblado: false }), `${nombreSalida()}.3mf`, 'model/3mf');
      showToast(`Listo: ${fmt(r.final, 0)} triángulos${r.generados !== r.final ? ` (se redujeron desde ${fmt(r.generados, 0)})` : ''}.${r.avisos.length ? ` ${r.avisos[0]}` : ''}`);
    }).catch((e) => {
      if (!e.cancelado) { console.error(e); showToast(e.message || 'No se pudo armar el archivo.', 'error'); }
    }).finally(() => setOcupado(''));
  };

  // ---------- Formulario ----------
  const campo = (clave, etiqueta, { min, step = 0.1, ayuda, alCambiar } = {}) => (
    <div style={{ flex: 1, minWidth: '100px' }}>
      <label className="fl">{etiqueta}</label>
      <CampoNumero min={min ?? 0} step={step} value={p[clave]} onChange={alCambiar || num(clave)} />
      {ayuda && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{ayuda}</div>}
    </div>
  );
  const campoG = (clave, etiqueta, { min, step = 0.1, ayuda } = {}) => (
    <div style={{ flex: 1, minWidth: '100px' }}>
      <label className="fl">{etiqueta}</label>
      <CampoNumero min={min ?? 0} step={step} value={g[clave]} onChange={(e) => cambiarG(clave, e.target.value === '' ? '' : Number(e.target.value))} />
      {ayuda && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{ayuda}</div>}
    </div>
  );
  const casillaGeneral = (valor, alCambiar, etiqueta, ayuda) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', marginTop: '8px', cursor: 'pointer' }} title={ayuda}>
      <input type="checkbox" checked={!!valor} onChange={(e) => alCambiar(e.target.checked)} style={{ width: 'auto', marginTop: '2px' }} />
      <span>{etiqueta}{ayuda && <span style={{ display: 'block', fontSize: '10px', color: 'var(--text3)' }}>{ayuda}</span>}</span>
    </label>
  );
  const casilla = (clave, etiqueta, ayuda) => casillaGeneral(p[clave], (v) => cambiar(clave, v), etiqueta, ayuda);
  const botonHerramienta = (id, texto, titulo) => (
    <button type="button" className={`btn btn-sm ${herramienta === id ? 'btn-primary' : ''}`} title={titulo} onClick={() => elegirHerramienta(id)}>{texto}</button>
  );

  const proy = PROYECCIONES.find((x) => x.id === p.proyeccion);
  const listado = TEXTURAS.filter((t) => categoria === 'todas' || t.categoria === categoria);
  const sugerida = resolucionSugerida(infoTextura, limpio.tamanoU);
  const textoCapa = capas.length > 1 ? `de la capa ${Math.min(activa, capas.length - 1) + 1}` : '';

  const usaGpu = vista === 'resultado' && modoVista === 'rapida' && !!gpu && capasVivas.length > 0;
  const cuerpos = useMemo(() => {
    if (!modelo) return [];
    if (usaGpu) return [{ id: 'modelo', nombre: modelo.nombre, color: COLOR_MODELO, gpu: { malla: gpu.malla, normal: gpu.normal, recibe: gpu.recibe, uniformes } }];
    const malla = vista === 'resultado' && modoVista === 'exacta' && resultado ? resultado.malla : modelo.malla;
    return [{ id: 'modelo', nombre: modelo.nombre, color: COLOR_MODELO, malla }];
  }, [modelo, resultado, vista, modoVista, usaGpu, gpu, uniformes]);

  const avisos = [...(vista === 'resultado' ? (modoVista === 'rapida' ? gpu?.avisos : resultado?.avisos) || [] : [])];
  const pasaDelLimite = maxSalida > 0 && triangulosFinal > maxSalida;
  const mallaVista = usaGpu ? gpu.malla : cuerpos[0]?.malla;
  const dimMin = modelo ? Math.min(...[0, 1, 2].map((k) => { const c = cajaMalla(modelo.malla); return c.max[k] - c.min[k]; })) : Infinity;

  return (
    <div className="herr-separar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="herr-separar-panel">
        <div className="card">
          <div className="card-title">1 · Modelo</div>
          <label className="drop-zone" style={{ padding: '14px', marginBottom: 0 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); cargarArchivo(e.dataTransfer.files?.[0]); }}>
            <input type="file" accept=".stl,.obj,.3mf" onChange={(e) => { cargarArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            <div style={{ fontSize: '13px', fontWeight: 500 }}>{modelo ? `📦 ${modelo.nombre}` : 'Elegí o soltá un STL, OBJ o 3MF'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>El archivo no se sube: se procesa en tu computadora.</div>
          </label>
          {aviso && <div style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '8px' }}>⚠ {aviso}</div>}
          {modelo && (() => {
            const c = cajaMalla(modelo.malla);
            return (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
                  {fmt(c.max[0] - c.min[0])} × {fmt(c.max[1] - c.min[1])} × {fmt(c.max[2] - c.min[2])} mm · {fmt(modelo.malla.tri.length / 3, 0)} triángulos
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Girar 90°:</span>
                  {['x', 'y', 'z'].map((e) => <button key={e} type="button" className="btn btn-sm" onClick={() => girar(e)}>{e.toUpperCase()}</button>)}
                  {botonHerramienta('apoyo', 'Apoyar en una cara', 'Tocá la cara del modelo que va contra la cama')}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>La orientación importa: "arriba" y "abajo" de las máscaras por ángulo son los del modelo apoyado en la cama. Al girar se borra lo pintado.</div>
              </>
            );
          })()}
        </div>

        <div className="card">
          <div className="card-title">2 · Capas</div>
          {capas.map((c, i) => (
            <div key={c.id} onClick={() => setActiva(i)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', marginBottom: '6px', border: i === activa ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', opacity: c.visible ? 1 : 0.55 }}>
              <input type="checkbox" checked={c.visible} title="Mostrar esta capa" style={{ width: 'auto' }} onClick={(e) => e.stopPropagation()} onChange={() => alternarVisible(i)} />
              <span style={{ flex: 1, fontSize: '12px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Capa {i + 1} · {nombreTextura(c)}</span>
              {i > 0 && (
                <select value={c.p.combinar} title="Cubrir: reemplaza lo de abajo donde se pinta. Sumar: le agrega su relieve." style={{ width: 'auto', fontSize: '11px', padding: '2px' }} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCapas((cs) => cs.map((x, k) => (k === i ? { ...x, p: { ...x.p, combinar: e.target.value } } : x)))}>
                  <option value="cubrir">Cubrir</option>
                  <option value="sumar">Sumar</option>
                </select>
              )}
              <button type="button" className="btn btn-sm" title="Subir (la de arriba se aplica después)" disabled={i === capas.length - 1} onClick={(e) => { e.stopPropagation(); moverCapa(i, 1); }}>↑</button>
              <button type="button" className="btn btn-sm" title="Bajar" disabled={i === 0} onClick={(e) => { e.stopPropagation(); moverCapa(i, -1); }}>↓</button>
              <button type="button" className="btn btn-sm" title="Quitar esta capa" disabled={capas.length <= 1} onClick={(e) => { e.stopPropagation(); quitarCapa(i); }}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" disabled={!modelo || capas.length >= MAX_CAPAS} onClick={agregarCapa}>+ Nueva capa ({capas.length}/{MAX_CAPAS})</button>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>
            Cada capa tiene su textura, su proyección, su tamaño y sus zonas. Se aplican de la 1 a la última: una capa que <strong>cubre</strong> reemplaza lo de abajo donde la pintás; una que <strong>suma</strong> le agrega su relieve. Las capas nuevas arrancan sin cubrir nada: pintá dónde van. Lo que ves abajo es de la capa marcada.
          </div>
        </div>

        <div className="card">
          <div className="card-title">3 · Textura {textoCapa}</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {[{ id: 'todas', nombre: 'Todas' }, ...CATEGORIAS_TEXTURA].map((c) => (
              <button key={c.id} type="button" className={`btn btn-sm ${categoria === c.id ? 'btn-primary' : ''}`} onClick={() => setCategoria(c.id)}>{c.nombre}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(54px, 1fr))', gap: '5px', maxHeight: '230px', overflowY: 'auto', padding: '2px' }}>
            {capa.propia && <Miniatura id="propia" textura={capa.propia.textura} activa={capa.texturaId === 'propia'} titulo={`Tu imagen: ${capa.propia.nombre}`} onClick={() => cambiarCapa({ texturaId: 'propia' })} />}
            {listado.map((t) => <Miniatura key={t.id} id={t.id} activa={capa.texturaId === t.id} titulo={t.nombre} onClick={() => cambiarCapa({ texturaId: t.id })} />)}
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text2)' }}>Elegida: <strong>{nombreTextura(capa)}</strong>. Lo claro sale y lo oscuro entra.</div>
          <label className="btn btn-sm" style={{ marginTop: '8px', display: 'inline-block', cursor: 'pointer' }}>
            Subir mi propia imagen
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { cargarImagen(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>Una imagen en gris: blanco = alto, negro = bajo. Conviene que empalme sin costuras al repetirse.</div>
          {casilla('invertirTextura', 'Invertir la textura', 'Intercambia lo claro y lo oscuro.')}
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            {campo('suavizadoTextura', 'Suavizado de la textura', { min: 0, step: 0.5, ayuda: 'Desenfoca el relieve (0 = nada).' })}
          </div>
        </div>

        <div className="card">
          <div className="card-title">4 · Proyección y tamaño {textoCapa}</div>
          <label className="fl">Proyección</label>
          <select value={p.proyeccion} onChange={(e) => cambiar('proyeccion', e.target.value)}>
            {PROYECCIONES.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
          {proy && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{proy.ayuda}</div>}
          {(p.proyeccion === 'triplanar' || p.proyeccion === 'cubica') && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              {campo('fusion', 'Fusión de uniones (0 a 1)', { min: 0, step: 0.1, ayuda: 'Más alto, más se mezclan las proyecciones donde se encuentran.' })}
            </div>
          )}
          {p.proyeccion === 'cilindrica' && (
            <>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Eje:</span>
                {['x', 'y', 'z'].map((e) => <button key={e} type="button" className={`btn btn-sm ${p.ejeCilindro === e ? 'btn-primary' : ''}`} onClick={() => cambiar('ejeCilindro', e)}>{e.toUpperCase()}</button>)}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {campo('anguloTapa', 'Ángulo de tapa (°)', { min: 1, step: 5, ayuda: 'Las tapas casi planas usan proyección plana.' })}
              </div>
            </>
          )}
          {(p.proyeccion === 'cilindrica' || p.proyeccion === 'esferica') && casilla('sinCostura', 'Ajustar para que cierre sin costura', 'Cambia un poco el tamaño para que la textura dé un número entero de vueltas.')}

          <div style={{ marginTop: '10px', padding: '8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', fontWeight: 500 }}>Sello</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', margin: '2px 0 6px' }}>Pone la textura una sola vez (un logo, una etiqueta) en vez de repetirla. Tocá el modelo para ubicarla; el tamaño es el de abajo.</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" className={`btn btn-sm ${colocandoSello ? 'btn-primary' : ''}`} disabled={!modelo} onClick={() => { setColocandoSello(!colocandoSello); setHerramienta(null); }}>{p.sello ? 'Mover el sello' : 'Colocar el sello'}</button>
              {p.sello && <button type="button" className="btn btn-sm" onClick={() => { cambiar('sello', null); setColocandoSello(false); }}>Quitar el sello (repetir en todo)</button>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'flex-end' }}>
            {campo('tamanoU', p.sello ? 'Ancho (mm)' : 'Tamaño U (mm)', { min: 0.5, step: 1, alCambiar: (e) => { const v = e.target.value === '' ? '' : Number(e.target.value); setP((a) => ({ ...a, tamanoU: v, ...(proporcional ? { tamanoV: v } : {}) })); } })}
            <button type="button" className={`btn btn-sm ${proporcional ? 'btn-primary' : ''}`} title="Mantener U = V" onClick={() => setProporcional(!proporcional)} style={{ marginBottom: '2px' }}>🔗</button>
            {campo('tamanoV', p.sello ? 'Alto (mm)' : 'Tamaño V (mm)', { min: 0.5, step: 1, alCambiar: (e) => { const v = e.target.value === '' ? '' : Number(e.target.value); setP((a) => ({ ...a, tamanoV: v, ...(proporcional ? { tamanoU: v } : {}) })); } })}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{p.sello ? 'Tamaño del sello.' : 'Lo que mide una repetición de la textura: con el mismo valor el dibujo sale del mismo tamaño en cualquier modelo.'}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {campo('desfaseU', 'Desfase U (mm)', { min: -200, step: 0.5 })}
            {campo('desfaseV', 'Desfase V (mm)', { min: -200, step: 0.5 })}
            {campo('rotacion', 'Rotación (°)', { min: -180, step: 5 })}
          </div>
        </div>

        <div className="card">
          <div className="card-title">5 · Relieve {textoCapa}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {campo('profundidad', 'Profundidad (mm)', { min: 0.02, step: 0.1, ayuda: 'Entre lo más hundido y lo más alto.' })}
          </div>
          {casilla('simetrico', 'Desplazamiento simétrico', 'El gris medio no mueve nada: lo claro sale y lo oscuro entra, y el tamaño de la pieza casi no cambia.')}
          {casilla('empujarAdentro', 'Empujar hacia adentro', 'Invierte el sentido: el relieve se hunde en la pieza en vez de salir.')}
          {limpio.profundidad > 0.1 * dimMin && (
            <div style={{ fontSize: '11px', color: 'var(--warn)', marginTop: '6px' }}>⚠ Es más del 10% de la dimensión más chica del modelo: puede superponerse.</div>
          )}
        </div>

        <div className="card">
          <div className="card-title">6 · Dónde va la textura {textoCapa}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {campo('anguloInferior', 'Sin textura abajo (°)', { min: 0, step: 5, ayuda: 'Caras que miran hacia abajo dentro de este ángulo. Sirve para que la base apoye lisa.' })}
            {campo('anguloSuperior', 'Sin textura arriba (°)', { min: 0, step: 5, ayuda: 'Lo mismo para las que miran hacia arriba.' })}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 500, margin: '12px 0 4px' }}>Pintar zonas</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
            <button type="button" className={`btn btn-sm ${p.modoMascara === 'excluir' ? 'btn-primary' : ''}`} onClick={() => cambiar('modoMascara', 'excluir')} title="Lo pintado queda liso">Excluir lo pintado</button>
            <button type="button" className={`btn btn-sm ${p.modoMascara === 'incluir' ? 'btn-primary' : ''}`} onClick={() => cambiar('modoMascara', 'incluir')} title="Sólo lo pintado recibe textura">Solo incluir lo pintado</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {botonHerramienta('pincel', '🖌 Pincel', 'Pintar arrastrando sobre el modelo (con Mayús, borra)')}
            {botonHerramienta('varita', '🪄 Relleno', 'Pinta toda la cara hasta donde cambia de ángulo (con Alt o Mayús, quita)')}
            {botonHerramienta('borrar', 'Borrador', 'Quita lo pintado')}
            <button type="button" className="btn btn-sm" disabled={!hayPintura} onClick={limpiarPintura}>Borrar todo</button>
            <button type="button" className="btn btn-sm" disabled={!modelo} onClick={invertirPintura} title="Lo pintado pasa a no estarlo y al revés">Invertir</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            {campo('transicion', 'Transición (mm)', { min: 0, step: 0.5, ayuda: 'Degradé del borde de las zonas.' })}
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label className="fl">Radio del pincel (mm)</label>
              <CampoNumero min={0.5} step={0.5} value={radioPincel} onChange={(e) => setRadioPincel(Number(e.target.value) || 3)} />
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label className="fl">Ángulo del relleno (°)</label>
              <CampoNumero min={1} step={5} value={anguloVarita} onChange={(e) => setAnguloVarita(Number(e.target.value) || 30)} />
            </div>
          </div>
          {sinZonas && <div style={{ fontSize: '11px', color: 'var(--warn)', marginTop: '6px' }}>⚠ En "solo incluir" esta capa no texturiza nada hasta que pintes alguna zona.</div>}
        </div>

        <div className="card">
          <div className="card-title">7 · Calidad</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            {campoG('resolucion', 'Resolución (mm)', { min: 0.1, step: 0.05, ayuda: 'Largo máximo de los lados en las zonas con textura: más chico, más detalle y más triángulos.' })}
            <button type="button" className="btn btn-sm" style={{ marginBottom: '2px' }} onClick={() => cambiarG('resolucion', sugerida)} title="Según el tamaño y el detalle de la textura de esta capa">Sugerir ({fmt(sugerida, 2)})</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            {campoG('maxSalida', 'Triángulos del archivo (máx.)', { min: 0, step: 50000, ayuda: 'Se reduce la malla hasta esta cantidad. 0 = sin límite.' })}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>
            Antes de reducir: unos <strong>{fmt(Math.min(triangulosFinal, 1e9), 0)}</strong> triángulos{pasaDelLimite ? ` → se reducen a ${fmt(maxSalida, 0)}` : ''}.
          </div>
          {casillaGeneral(g.quitarPlanas, (v) => cambiarG('quitarPlanas', v), 'Sacar triángulos de más en las caras planas', 'Colapsa lo que no cambia la forma (más de 0,005 mm), aunque ya se esté por debajo del límite.')}
          <details style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Opciones avanzadas</summary>
            {casillaGeneral(g.protegerVoladizos, (v) => cambiarG('protegerVoladizos', v), 'Proteger voladizos', 'Ningún punto baja en Z: la textura no crea voladizos nuevos. Los movimientos en X e Y no cambian.')}
            {casillaGeneral(g.baseLisa, (v) => cambiarG('baseLisa', v), 'Base lisa', 'Lo que está a menos de 0,1 mm de la cama queda justo en el plano, para que apoye perfecto.')}
          </details>
        </div>

        <div className="card">
          <div className="card-title">8 · Exportar</div>
          {avisos.map((a) => <div key={a} style={{ fontSize: '12px', marginBottom: '6px', color: 'var(--text2)' }}>⚠ {a}</div>)}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={!modelo || !!ocupado} onClick={() => exportar('stl')}>Exportar STL</button>
            <button type="button" className="btn" disabled={!modelo || !!ocupado} onClick={() => exportar('3mf')}>Exportar 3MF</button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
            Se exporta con la resolución elegida y reducido al límite de triángulos (la vista previa usa una resolución más gruesa si hace falta para responder rápido). Los archivos son de una sola pieza; el 3MF no trae configuración de impresora.
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            <button type="button" className="btn btn-sm" onClick={() => { setCapas([nuevaCapa(0, modelo ? modelo.malla.tri.length / 3 : 0)]); setActiva(0); setG(GLOBALES); setVersionSel((v) => v + 1); }}>Restablecer valores</button>
          </div>
        </div>
      </div>

      <div className="herr-separar-visor">
        <VisorPiezas
          cuerpos={cuerpos}
          activoId="modelo"
          seleccion={vista === 'mascara' ? capa.sel : null}
          versionSeleccion={versionSel}
          despiece={false}
          marcadores={[]}
          herramienta={vista === 'mascara' ? herramienta : null}
          radioPincel={radioPincel}
          onTocar={alTocar}
          encuadre={encuadre}
          mira={colocandoSello}
        />
        {modelo && (
          <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px' }}>
            <button type="button" className={`btn btn-sm ${vista === 'resultado' ? 'btn-primary' : ''}`} onClick={() => { setVista('resultado'); setHerramienta(null); }}>Ver resultado</button>
            <button type="button" className={`btn btn-sm ${vista === 'mascara' ? 'btn-primary' : ''}`} onClick={() => setVista('mascara')} title="Muestra el modelo sin textura y en naranja lo pintado de la capa marcada">Ver zonas pintadas</button>
            <button type="button" className="btn btn-sm" title={modoVista === 'rapida' ? 'Ahora el relieve lo pone la tarjeta de video y se mueve al instante. Tocá para calcularlo con la malla del archivo.' : 'Ahora se calcula igual que el archivo (tarda un poco). Tocá para volver a la vista rápida.'} onClick={() => { setModoVista(modoVista === 'rapida' ? 'exacta' : 'rapida'); setVista('resultado'); setHerramienta(null); }}>{modoVista === 'rapida' ? '⚡ Vista rápida' : '🎯 Vista exacta'}</button>
          </div>
        )}
        {mallaVista && vista === 'resultado' && (usaGpu || (modoVista === 'exacta' && resultado)) && (
          <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '11px', color: 'var(--text3)', background: 'var(--bg2)', padding: '3px 8px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            Vista previa {modoVista === 'rapida' ? 'rápida' : 'exacta'}: {fmt(mallaVista.tri.length / 3, 0)} triángulos
          </div>
        )}
        {colocandoSello && (
          <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '8px 14px', fontSize: '12px', boxShadow: 'var(--shadow)', display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '92%' }}>
            <span>Tocá el modelo donde va el sello (el centro)</span>
            <button type="button" className="btn btn-sm" onClick={() => setColocandoSello(false)}>Cancelar</button>
          </div>
        )}
        {(calculando || ocupado) && (
          <div style={{ position: 'absolute', bottom: '12px', right: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '6px 12px', fontSize: '12px', boxShadow: 'var(--shadow)' }}>⏳ {ocupado || calculando}</div>
        )}
        {!modelo && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', pointerEvents: 'none', textAlign: 'center', padding: '0 24px' }}>
            Cargá un modelo (STL, OBJ o 3MF) para ponerle una textura
          </div>
        )}
      </div>
    </div>
  );
}
