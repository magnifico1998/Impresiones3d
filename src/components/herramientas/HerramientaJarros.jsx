import React, { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { useConfig, useUi } from '../../context/contextos';
import { AJUSTES_IMPRESION, costearImpresion, estimarImpresion, formatoHoras, presupuestoParaBiblioteca } from '../../utils/jarrosImpresion';
import CampoNumero from '../CampoNumero';
import { CAMAS } from '../../utils/camasImpresion';
import { descargar, nombreArchivo } from '../../utils/descargas';
import VisorPiezas from './VisorPiezas';
import { stlBinario, crear3mf } from '../../utils/mallas3d';
import { crearBambu3mf } from '../../utils/bambu3mf';
import { unirMallas, IMPRESORAS } from '../../utils/llaveros';
import {
  ALINEACIONES, ASA_PROPIA, FORMAS, FORMAS_ASA, FORMAS_CARTEL, FORMA_PROPIA, LATAS, LATA_PROPIA, PARAMETROS_INICIALES,
  MAX_BYTES_SVG, RESPALDOS, SIMBOLOS, SIMBOLO_PROPIO, SIMBOLO_SVG, ESTILOS_ENVOLTURA, CATEGORIAS_TEXTURA, TEXTURAS, TEXTURA_DUELAS, TEXTURA_NINGUNA, armarJarro, armarPlaca, claveEncuadre, conForma, conFormaAsa, conLata, contornosDeSvg, entraArmado, estimarTriangulosTextura, profundidadMaxima, radioExteriorFn, nombreJarro, partesDe, sanearParametros
} from '../../utils/jarros';
import { EditorAsa, EditorForma } from './EditoresJarro';
import { iniciarMotor, motorListo } from '../../utils/motorBooleano';
import { FUENTES, cargarFuente, parsearFuente } from '../../utils/fuentesLlaveros';

import TarjetaColapsable from '../TarjetaColapsable';
import BotonArchivo from '../BotonArchivo';
import { contornosAJson, contornosDeJson, simplificarContornos } from '../../utils/simbolosPropios';
import { ESTILOS, aplicarEstilo, empaquetarDiseno, leerDiseno, MAX_BYTES_ARCHIVO, nombreArchivoDiseno } from '../../utils/jarrosDisenos';

// La biblioteca de símbolos (Firestore) y el editor con simetrías se traen recién cuando hay un emblema.
const BibliotecaSimbolos = lazy(() => import('./BibliotecaSimbolos'));
// Los diseños guardados en la cuenta (Firestore) se traen recién cuando se abre la lista.
const DisenosGuardados = lazy(() => import('./DisenosGuardados'));
// El modal de la Biblioteca (que usa el catálogo de la cuenta) se trae recién al guardar.
const ModalBibGuardar = lazy(() => import('../modals/ModalBibGuardar'));
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec });

// Modos de vista del visor (la lata y el despiece se activan aparte).
const MODOS_VISTA = [
  { id: 'liso', nombre: 'Liso' },
  { id: 'colores', nombre: 'Colores' },
  { id: 'alambre', nombre: 'Alambre' },
  { id: 'transparente', nombre: 'Transparente' }
];

// Jarro porta-lata: el cuerpo con el hueco de la lata y el asa (pegada o desmontable con encastre). El diseño es una
// lista de piezas: las desmontables se pueden imprimir sueltas (plan en docs/plan-generador-jarros.md).
export default function HerramientaJarros() {
  const { showToast } = useUi();
  const { cfg: cfgCuenta, fmt: fmtMoneda = (n) => String(Math.round(Number(n) || 0)) } = useConfig() || {};
  const [p, setP] = useState(() => ({ ...PARAMETROS_INICIALES, colores: { ...PARAMETROS_INICIALES.colores } }));
  const [cama, setCama] = useState('bambu');
  const [modoVista, setModoVista] = useState('colores');
  const [conLataVista, setConLataVista] = useState(false);
  const [despiece, setDespiece] = useState(false);
  const [encuadre, setEncuadre] = useState(0);
  const [historial, setHistorial] = useState([]);

  // Motor de operaciones booleanas (WebAssembly): carga en segundo plano y, cuando está, se rearma el jarro con él.
  const [motor, setMotor] = useState(motorListo());
  useEffect(() => {
    if (motor) return;
    iniciarMotor().then(() => setMotor(true)).catch(() => showToast('No se pudo cargar el motor 3D: las placas del asa desmontable pueden salir con pequeños defectos.', 'error'));
  }, [motor, showToast]);

  // Tipografía del cartel: se baja recién cuando hay un cartel (o se elige una propia, que se lee en la compu y no se sube).
  const [fuente, setFuente] = useState(null);
  const [fuentePropia, setFuentePropia] = useState(null); // { nombre, fuente }
  const [cargandoFuente, setCargandoFuente] = useState(false);

  const guardarHistorial = () => setHistorial((h) => [...h.slice(-29), p]);
  const cambiar = (clave, valor) => setP((a) => ({ ...a, [clave]: valor }));
  const cambiarConHistorial = (clave, valor) => { guardarHistorial(); cambiar(clave, valor); };
  const num = (clave) => (e) => cambiar(clave, e.target.value === '' ? '' : Number(e.target.value));

  // Elegir una lata fija el hueco (lata + holgura) y su alto; tocar el hueco a mano pasa a "Medida propia".
  const elegirLata = (id) => { guardarHistorial(); setP((a) => conLata(a, id)); };
  const cambiarHueco = (clave) => (e) => setP((a) => ({ ...a, [clave]: e.target.value === '' ? '' : Number(e.target.value), latId: LATA_PROPIA }));
  // Cambios que vienen de los editores (varios parámetros juntos); el historial se guarda al empezar a arrastrar.
  const cambiarVarios = (cambios) => setP((a) => ({ ...a, ...cambios }));
  const elegirForma = (id) => { guardarHistorial(); setP((a) => conForma(a, id)); };
  const elegirFormaAsa = (id) => { guardarHistorial(); setP((a) => conFormaAsa(a, id)); };
  const cambiarHolgura = (e) => setP((a) => {
    const b = { ...a, holgura: e.target.value === '' ? '' : Number(e.target.value) };
    return a.latId !== LATA_PROPIA ? conLata(b, a.latId) : b;
  });

  const idFuente = p.cartelFuente;
  useEffect(() => {
    if (!p.cartel) return undefined;
    if (fuentePropia) { setFuente(fuentePropia.fuente); return undefined; }
    let vivo = true;
    setCargandoFuente(true);
    cargarFuente(idFuente)
      .then((f) => { if (vivo) { setFuente(f); setCargandoFuente(false); } })
      .catch((e) => { if (vivo) { setCargandoFuente(false); showToast(e.message || 'No se pudo cargar la tipografía.', 'error'); } });
    return () => { vivo = false; };
  }, [p.cartel, idFuente, fuentePropia, showToast]);

  // Símbolo propio del emblema: un SVG de la compu (se lee acá, no se sube).
  const cargarSvg = (archivo) => {
    if (!archivo) return;
    if (!/\.svg$/i.test(archivo.name)) { showToast('Elegí un archivo .svg.', 'error'); return; }
    if (archivo.size > MAX_BYTES_SVG) { showToast('El SVG es demasiado pesado (más de 300 KB): simplificalo en el programa de dibujo.', 'error'); return; }
    const lector = new FileReader();
    lector.onload = () => {
      const texto = String(lector.result || '');
      try {
        contornosDeSvg(texto);
      } catch (e) {
        showToast(e.message || 'No se pudo leer ese SVG.', 'error');
        return;
      }
      guardarHistorial();
      setP((a) => ({ ...a, emblemaSvg: texto, emblemaSvgNombre: archivo.name, emblemaSimbolo: SIMBOLO_SVG }));
    };
    lector.readAsText(archivo);
  };

  // Símbolo propio (dibujado o de la biblioteca): sus contornos viajan en los parámetros.
  const usarContornos = (contornos, nombre) => {
    guardarHistorial();
    setP((a) => ({ ...a, emblemaForma: contornosAJson(contornos), emblemaFormaNombre: nombre || '', emblemaSimbolo: SIMBOLO_PROPIO }));
  };
  // Contornos del símbolo propio que se está usando (un SVG subido o uno propio), para guardarlo en la biblioteca.
  const contornosActuales = () => {
    try {
      if (p.emblemaSimbolo === SIMBOLO_SVG && p.emblemaSvg) return simplificarContornos(contornosDeSvg(p.emblemaSvg));
      if (p.emblemaSimbolo === SIMBOLO_PROPIO && p.emblemaForma) return contornosDeJson(p.emblemaForma);
    } catch { /* sin símbolo válido */ }
    return null;
  };

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
  const limpio = useMemo(() => sanearParametros(parametros), [parametros]);
  const { jarro, error } = useMemo(() => {
    try {
      return { jarro: armarJarro(limpio, { fuente, calidad: 'vista' }), error: null };
    } catch (e) {
      return { jarro: null, error: e.message || 'No se pudo armar el jarro.' };
    }
    // `motor` no se usa adentro, pero al terminar de cargar hay que rearmar el jarro (las placas pasan al motor nuevo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limpio, motor, fuente]);

  // El visor recibe las piezas y, si se pide, la lata como cuerpo translúcido (no se exporta).
  const cuerpos = useMemo(() => {
    if (!jarro) return [];
    const lista = jarro.piezas.flatMap((x) => partesDe(x).map((q) => ({ id: x.partes ? `${x.id}:${q.id}` : x.id, nombre: q.nombre, color: q.color, malla: q.malla, visible: true, despiece: x.despiece })));
    if (conLataVista) lista.push({ id: 'lata', nombre: 'Lata', color: '#9aa7b4', malla: jarro.lata, visible: true, despiece: [0, 0, 1.6], fantasma: true });
    return lista;
  }, [jarro, conLataVista]);

  // Mover el cartel agarrándolo en el visor: al soltar suma lo que se movió (giro alrededor y altura).
  const arrastre = useMemo(() => (p.cartel && !despiece ? {
    desde: (id) => typeof id === 'string' && /^cartel\d*:/.test(id),
    sobre: 'cuerpo',
    alTerminar: ({ dAngulo, dAltura }) => {
      guardarHistorial();
      setP((a) => {
        let ang = ((((Number(a.cartelAngulo) || 0) + dAngulo + 180) % 360) + 360) % 360 - 180;
        ang = Math.round(ang * 10) / 10;
        return { ...a, cartelAngulo: ang, cartelAltura: Math.round(((Number(a.cartelAltura) || 0) + dAltura) * 10) / 10 };
      });
    }
  } : null),
  // guardarHistorial toma el estado de esta vuelta: se rearma cuando cambian los parámetros.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [p, despiece]);

  // La cámara se reencuadra sólo al cambiar la lata, no al mover el cartel o el asa: así se puede ir ajustando sin que la
  // vista vuelva al principio.
  const tamano = jarro ? claveEncuadre(limpio) : '';
  useEffect(() => { setEncuadre((n) => n + 1); }, [tamano]);

  const camaActual = CAMAS.find((c) => c.id === cama) || CAMAS[0];
  const ajuste = jarro ? entraArmado(jarro, camaActual) : null;
  const hayDesmontables = !!jarro?.piezas.some((x) => x.desmontable);
  const placa = useMemo(() => (jarro && hayDesmontables ? armarPlaca(jarro.piezas, camaActual) : null), [jarro, hayDesmontables, camaActual]);

  // Estilos y diseños: un estilo reemplaza el diseño (se puede deshacer); un diseño guardado o compartido se abre entero.
  const [verMisDisenos, setVerMisDisenos] = useState(false);
  const elegirEstilo = (estilo) => {
    guardarHistorial();
    setP(aplicarEstilo(p, estilo.id));
    showToast(`Estilo "${estilo.nombre}" aplicado. Podés deshacerlo con "Deshacer".`);
  };
  const abrirDiseno = (parametrosDiseno, nombre) => {
    guardarHistorial();
    setP(parametrosDiseno);
    showToast(`Diseño${nombre ? ` "${nombre}"` : ''} abierto. Podés deshacerlo con "Deshacer".`);
  };
  const descargarDiseno = () => {
    const nombre = nombreJarro(limpio);
    descargar(empaquetarDiseno(limpio, nombre), nombreArchivoDiseno(nombre), 'application/json');
  };
  const abrirArchivoDiseno = (archivo) => {
    if (!archivo) return;
    if (archivo.size > MAX_BYTES_ARCHIVO) { showToast('Ese archivo es demasiado pesado para ser un diseño de jarro.', 'error'); return; }
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const { nombre, parametros: nuevos } = leerDiseno(String(lector.result || ''));
        abrirDiseno(nuevos, nombre);
      } catch (e) {
        showToast(e.message || 'No se pudo abrir ese diseño.', 'error');
      }
    };
    lector.readAsText(archivo);
  };

  // ---------- Impresión y costos ----------
  const filamentos = cfgCuenta?.filamentos || [];
  const impresorasCfg = cfgCuenta?.impresoras || [];
  const [impr, setImpr] = useState({ filamento: 0, impresora: 0, relleno: AJUSTES_IMPRESION.relleno, horasTrabajo: 0.5 });
  const cambiarImpr = (clave, valor) => setImpr((a) => ({ ...a, [clave]: valor }));
  const campoImpr = (clave, etiqueta, { min, max, step }) => (
    <div style={{ flex: 1 }}>
      <label className="fl">{etiqueta}</label>
      <CampoNumero value={impr[clave]} min={min} max={max} step={step} onChange={(e) => cambiarImpr(clave, e.target.value === '' ? '' : Number(e.target.value))} />
    </div>
  );
  const fmt1 = (n) => fmt(n, 1);
  const nombreDeColor = (hex) => (cfgCuenta?.colores || []).find((c) => String(c.hex).toUpperCase() === hex)?.nombre || hex;
  // Valores de costo: los de la Configuración de la cuenta (filamento, impresora, kWh, mano de obra, desperdicio y margen).
  const valoresCosto = () => {
    const fil = filamentos[impr.filamento] || filamentos[0] || null;
    const imp = impresorasCfg[impr.impresora] || impresorasCfg[0] || null;
    return {
      precioKg: fil?.precio ?? 18000, nombreFilamento: fil ? fil.nombre.replace(/\s+(blanco|negro|rojo|azul|verde|gris|amarillo|transparente)$/i, '') : 'PLA', desperdicio: cfgCuenta?.desperdicio ?? 5,
      watts: imp?.watts ?? 0, kwh: cfgCuenta?.kwh ?? 0, mantHora: imp?.mant ?? 0, moHora: cfgCuenta?.mo ?? 0, horasTrabajo: Number(impr.horasTrabajo) || 0, margen: cfgCuenta?.margen ?? 100, extras: 0
    };
  };
  const calcularImpresion = (piezas) => {
    const est = estimarImpresion(piezas, { relleno: Number(impr.relleno) || 0 });
    return { est, costos: costearImpresion(est, valoresCosto()) };
  };
  const estimacion = useMemo(
    () => (jarro ? calcularImpresion(jarro.piezas) : null),
    // calcularImpresion lee impr y la configuración de la cuenta (se rearma cuando cambian).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jarro, impr, cfgCuenta]
  );

  // ---------- Exportar ----------
  // Con textura la vista es liviana: lo que se exporta es el modelo FINAL, con todo el detalle, que se arma recién al exportar.
  const base = nombreArchivo(nombreJarro(limpio), 'Jarro');
  const [exportando, setExportando] = useState(false);
  const exportable = !!jarro && !exportando;
  const conModeloFinal = (accion) => () => {
    if (!jarro) return;
    if (limpio.textura === TEXTURA_NINGUNA) { accion(jarro); return; }
    setExportando(true);
    setTimeout(() => {
      try {
        accion(armarJarro(limpio, { fuente, calidad: 'final' }));
      } catch (e) {
        showToast(e.message || 'No se pudo armar el modelo final.', 'error');
      } finally {
        setExportando(false);
      }
    }, 30);
  };
  const piezasExport = (j) => j.piezas.flatMap((x) => partesDe(x).map((q) => ({ nombre: x.partes ? `${x.nombre} · ${q.nombre}` : x.nombre, color: q.color, malla: q.malla })));
  const exportarStl = (j) => descargar(stlBinario(unirMallas(j.piezas.map((x) => x.malla)), base), `${base}.stl`, 'model/stl');
  const exportar3mf = (j) => descargar(crear3mf(piezasExport(j), { ensamblado: true }), `${base}.3mf`, 'model/3mf');
  // Proyecto de Bambu Studio (plantilla de la A1): cada pieza con su filamento ya asignado.
  const exportarBambu = (j) => {
    try {
      descargar(crearBambu3mf(piezasExport(j), { nombre: base }), `${base} - Bambu A1.3mf`, 'model/3mf');
    } catch (e) {
      showToast(e.message || 'No se pudo armar el archivo para Bambu Studio.', 'error');
    }
  };
  // Cada pieza suelta, apoyada como se imprime (el asa, acostada).
  const exportarZip = (j) => {
    const archivos = {};
    j.piezas.forEach((x) => {
      archivos[`${nombreArchivo(x.nombre)}.stl`] = stlBinario(x.mallaImpresion, x.nombre);
      // Una pieza de varios colores trae además cada color suelto, para imprimirla a colores con cambios de filamento.
      if (x.partes && x.partes.length > 1) x.partes.forEach((q) => { archivos[`${nombreArchivo(x.nombre)} - por colores/${nombreArchivo(q.nombre)}.stl`] = stlBinario(q.mallaImpresion, q.nombre); });
    });
    descargar(zipSync(archivos), `${base} - por piezas.zip`, 'application/zip');
  };
  // Todas las piezas sueltas acomodadas en la cama, listas para imprimir.
  // Guardar en la Biblioteca: el modal de siempre, con los costos estimados, la foto del modelo y el 3MF a color.
  const capturaRef = useRef(null);
  const [guardarBib, setGuardarBib] = useState(null);
  const guardarEnBiblioteca = (j) => {
    const { est, costos } = calcularImpresion(j.piezas);
    const archivo = new File([crear3mf(piezasExport(j), { ensamblado: true })], `${base} (modelo).3mf`, { type: 'model/3mf' });
    const foto = (() => { try { return capturaRef.current?.() || null; } catch { return null; } })();
    const imp = impresorasCfg[impr.impresora] || impresorasCfg[0] || null;
    setGuardarBib(presupuestoParaBiblioteca({ nombre: nombreJarro(limpio), est, costos, v: valoresCosto(), impresoraNombre: imp?.nombre, archivos: [archivo], foto }));
  };
  const exportarPlaca = (j) => descargar(crear3mf(armarPlaca(j.piezas, camaActual).cuerpos, { ensamblado: false }), `${base} - placa de impresión.3mf`, 'model/3mf');

  const deshacer = () => {
    if (!historial.length) return;
    setP(historial[historial.length - 1]);
    setHistorial((h) => h.slice(0, -1));
  };
  const empezarDeNuevo = () => {
    guardarHistorial();
    setP({ ...PARAMETROS_INICIALES, colores: { ...PARAMETROS_INICIALES.colores } });
  };

  let paso = 0;
  const titulo = (texto) => `${++paso} · ${texto}`;
  const lataElegida = LATAS.find((l) => l.id === p.latId);
  const colorInput = (clave, etiqueta) => (
    <div style={{ flex: 1, minWidth: '90px' }}>
      <label className="fl">{etiqueta}</label>
      <input type="color" value={p.colores[clave]} style={{ width: '100%', height: '34px', padding: '2px' }}
        onChange={(e) => setP((a) => ({ ...a, colores: { ...a.colores, [clave]: e.target.value } }))} />
    </div>
  );
  const campo = (clave, etiqueta, { min, step = 0.1, ayuda, alCambiar } = {}) => (
    <div style={{ flex: 1, minWidth: '110px' }}>
      <label className="fl">{etiqueta}</label>
      <CampoNumero min={min ?? 0} step={step} value={p[clave]} onChange={alCambiar || num(clave)} />
      {ayuda && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{ayuda}</div>}
    </div>
  );
  const unColor = p.impresora === 'uno';
  const sinAsa = !p.asa;

  return (
    <div className="herr-separar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="herr-separar-panel">
        <TarjetaColapsable conservar titulo={titulo('Estilos y diseños')} resumen={`${ESTILOS.length} estilos · guardar y compartir`}>
          <label className="fl">Estilos listos para usar</label>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '6px' }}>
            Cambian la silueta, la textura, el asa, el cartel, los emblemas, los aros y los colores. Mantienen tu lata y tus ajustes de impresión, y se pueden deshacer.
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {ESTILOS.map((x) => (
              <button key={x.id} type="button" className="btn btn-sm" title={x.ayuda} onClick={() => elegirEstilo(x)}>{x.nombre}</button>
            ))}
          </div>
          <div style={{ marginTop: '12px' }}>
            <button type="button" className={`btn btn-sm ${verMisDisenos ? 'btn-primary' : ''}`} onClick={() => setVerMisDisenos((v) => !v)}>
              {verMisDisenos ? 'Cerrar mis diseños' : 'Mis diseños guardados'}
            </button>
          </div>
          {verMisDisenos && (
            <Suspense fallback={<div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>Cargando tus diseños…</div>}>
              <DisenosGuardados parametros={limpio} alAbrir={abrirDiseno} capturar={() => capturaRef.current?.()} />
            </Suspense>
          )}
          <label className="fl">Compartir</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" onClick={descargarDiseno}>⬇ Descargar este diseño</button>
            <BotonArchivo accept=".json,application/json" primario={false} etiqueta="📂 Abrir un diseño compartido" alElegir={abrirArchivoDiseno} />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
            El archivo (.jarro.json) lleva todo el diseño, también el símbolo propio o el SVG de los emblemas; quien lo abra lo ve igual. No incluye una tipografía propia que hayas cargado de tu compu.
          </div>
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Lata y hueco')} resumen={`${fmt(limpio.diametroHueco)} × ${fmt(limpio.altoHueco)} mm`}>
          <label className="fl">Lata</label>
          <select value={p.latId} onChange={(e) => (e.target.value === LATA_PROPIA ? cambiarConHistorial('latId', LATA_PROPIA) : elegirLata(e.target.value))}>
            {LATAS.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({fmt(l.diametro)} × {fmt(l.alto)} mm)</option>)}
            <option value={LATA_PROPIA}>Medida propia</option>
          </select>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {campo('diametroHueco', 'Diámetro del hueco (mm)', { min: 30, step: 0.1, alCambiar: cambiarHueco('diametroHueco') })}
            {campo('altoHueco', 'Alto del hueco (mm)', { min: 40, step: 1, alCambiar: cambiarHueco('altoHueco') })}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {campo('holgura', 'Holgura (mm)', { min: 0, step: 0.1, alCambiar: cambiarHolgura, ayuda: 'Es lo que sobra entre la lata y el hueco. Sumale unas décimas si tu impresora cierra los agujeros.' })}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
            {lataElegida
              ? `Lata de ${lataElegida.nombre.split(' · ')[0]}: ${fmt(lataElegida.diametro)} × ${fmt(lataElegida.alto)} mm. El hueco es la lata más la holgura.`
              : 'Medida propia: escribí el diámetro y el alto del hueco que necesitás.'}
          </div>
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Cuerpo')} resumen={`silueta: ${FORMAS.find((x) => x.id === p.forma)?.nombre || 'a tu gusto'}`}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {campo('pared', 'Pared (mm)', { min: 1.2, step: 0.2, ayuda: 'Desde 1,2 mm; con 3 mm queda firme.' })}
            {campo('fondo', 'Fondo (mm)', { min: 1.2, step: 0.2 })}
          </div>
          <label className="fl">Silueta</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {FORMAS.map((f) => (
              <button key={f.id} type="button" className={`btn btn-sm ${p.forma === f.id ? 'btn-primary' : ''}`} onClick={() => elegirForma(f.id)}>{f.nombre}</button>
            ))}
            {p.forma === FORMA_PROPIA && <button type="button" className="btn btn-sm btn-primary" disabled>A tu gusto</button>}
          </div>
          <EditorForma parametros={p} alCambiar={cambiarVarios} alEmpezar={guardarHistorial} />
          {jarro && jarro.aperturaPared > 45 && (
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>⚠ La pared se abre {fmt(jarro.aperturaPared, 0)}° hacia arriba: con más de 45° se imprime con soportes.</div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {campo('aberturaFondo', 'Abertura en el fondo (mm)', { min: 0, step: 1, ayuda: 'Un agujero abajo para empujar la lata hacia arriba y sacarla. 0 = sin abertura.' })}
          </div>
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Asa')} resumen={sinAsa ? 'sin asa' : `${FORMAS_ASA.find((x) => x.id === p.asaForma)?.nombre || 'a tu gusto'} · ${p.asaDesmontable ? 'desmontable' : 'pegada'}`}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
            <input type="checkbox" checked={p.asa} onChange={(e) => cambiarConHistorial('asa', e.target.checked)} style={{ width: 'auto' }} />
            Con asa
          </label>
          {!sinAsa && (
            <>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.asaDesmontable} onChange={(e) => cambiarConHistorial('asaDesmontable', e.target.checked)} style={{ width: 'auto' }} />
                Asa desmontable (con encastre)
              </label>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                {p.asaDesmontable
                  ? 'El cuerpo lleva dos placas con una ranura y el asa, una espiga en cada extremo. Se imprimen por separado (el asa, acostada, sin soportes) y se encastran o se pegan.'
                  : 'El asa va pegada al cuerpo: sus extremos se meten en la pared y sale todo en una sola impresión.'}
              </div>
              <label className="fl">Forma del asa</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {FORMAS_ASA.map((f) => (
                  <button key={f.id} type="button" className={`btn btn-sm ${p.asaForma === f.id ? 'btn-primary' : ''}`} onClick={() => elegirFormaAsa(f.id)}>{f.nombre}</button>
                ))}
                {p.asaForma === ASA_PROPIA && <button type="button" className="btn btn-sm btn-primary" disabled>A tu gusto</button>}
              </div>
              <EditorAsa parametros={p} alCambiar={cambiarVarios} alEmpezar={guardarHistorial} />
              {jarro && jarro.soportesAsa !== null && (
                <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--text2)' }}>
                  {jarro.soportesAsa > 12
                    ? `⚠ Unos ${fmt(jarro.soportesAsa, 0)} mm del asa tienen menos de 40° de inclinación${p.asaDesmontable ? ': imprimila acostada, sin soportes.' : ': necesitan soportes (forma "Sin soportes" o asa desmontable).'}`
                    : '✓ El asa se imprime parada sin soportes.'}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('asaSalida', 'Cuánto sobresale (mm)', { min: 15, step: 1 })}
                {campo('asaAncho', 'Ancho (mm)', { min: 6, step: 0.5 })}
                {campo('asaGrosor', 'Grosor (mm)', { min: 6, step: 0.5 })}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('asaDistTope', 'Del borde de arriba (mm)', { min: 8, step: 1, ayuda: 'Hasta el centro del extremo de arriba.' })}
                {campo('asaDistBase', 'De la base (mm)', { min: 8, step: 1, ayuda: 'Hasta el centro del extremo de abajo.' })}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('asaExtremos', 'Más gruesa en los extremos (%)', { min: 100, step: 5, ayuda: '100 = igual en todo el largo.' })}
                {campo('asaAngulo', 'Giro alrededor del jarro (°)', { min: -180, step: 5, ayuda: '0 = de frente; cambia de qué lado sale.' })}
              </div>
              <details style={{ marginTop: '12px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Opciones avanzadas</summary>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {campo('asaRedondez', 'Redonda ↔ cuadrada', { min: 2, step: 0.2, ayuda: '2 es elíptica; más alto, más cuadrada.' })}
                  {p.asaDesmontable && campo('holguraEncastre', 'Holgura del encastre (mm)', { min: 0.1, step: 0.05, ayuda: 'Se ajusta con una prueba de impresión.' })}
                  {p.asaDesmontable && campo('placa', 'Placas de montaje (mm)', { min: 3, step: 0.5, ayuda: 'Cuánto sobresalen de la pared.' })}
                </div>
              </details>
            </>
          )}
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Nombre y cartel')} resumen={p.cartel ? `“${String(p.cartelTexto).split('\n')[0]}”${String(p.cartelTexto).includes('\n') ? '…' : ''} · ${FORMAS_CARTEL.find((x) => x.id === p.cartelForma)?.nombre}` : 'sin cartel'}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
            <input type="checkbox" checked={p.cartel} onChange={(e) => cambiarConHistorial('cartel', e.target.checked)} style={{ width: 'auto' }} />
            Con cartel con el nombre
          </label>
          {p.cartel && (
            <>
              <label className="fl">Nombre (Enter = renglón nuevo)</label>
              <textarea
                rows={Math.min(4, Math.max(2, String(p.cartelTexto).split('\n').length))} maxLength={125} value={p.cartelTexto}
                placeholder={'Escribí un nombre\no varios renglones'} onChange={(e) => cambiar('cartelTexto', e.target.value)} style={{ width: '100%', resize: 'vertical' }}
              />
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>Hasta 4 renglones de 30 letras.</div>
              <label className="fl">Alineación del texto</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {ALINEACIONES.map((x) => (
                  <button key={x.id} type="button" className={`btn btn-sm ${p.cartelAlineacion === x.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('cartelAlineacion', x.id)}>{x.nombre}</button>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>
                "Ambos márgenes" reparte los espacios para que cada renglón llene el ancho del más largo y deja el último a la izquierda; "Ambos márgenes (todo)" también estira el último.
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label className="fl">Tipografía</label>
                  <select value={fuentePropia ? 'propia' : p.cartelFuente} onChange={(e) => { if (e.target.value !== 'propia') { setFuentePropia(null); cambiar('cartelFuente', e.target.value); } }}>
                    {FUENTES.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    {fuentePropia && <option value="propia">{fuentePropia.nombre}</option>}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '110px' }}>
                  <label className="fl">Mayúsculas</label>
                  <select value={p.cartelMayusculas} onChange={(e) => cambiar('cartelMayusculas', e.target.value)}>
                    <option value="como">Como lo escribo</option>
                    <option value="mayus">MAYÚSCULAS</option>
                    <option value="minus">minúsculas</option>
                  </select>
                </div>
              </div>
              <details style={{ marginTop: '6px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Usar una tipografía tuya</summary>
                <BotonArchivo accept=".ttf,.otf,.woff" etiqueta="📂 Elegir una tipografía (.ttf, .otf)" alElegir={cargarPropia} />
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>El archivo no se sube: se lee en tu computadora.</div>
              </details>
              {cargandoFuente && !fuente && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>Cargando la tipografía…</div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('cartelAlturaLetra', 'Alto de letra (mm)', { min: 5, step: 0.5 })}
                {String(p.cartelTexto).includes('\n') && campo('cartelInterlineado', 'Separación entre renglones', { min: 1, step: 0.05, ayuda: '1 = pegados; 1,35 de fábrica.' })}
                {campo('cartelEngrosar', 'Letras más gruesas (mm)', { min: 0, step: 0.1, ayuda: 'Con tipografías finas, 0,3 a 0,4 ayuda.' })}
              </div>

              <label className="fl">Cuántos carteles iguales, repartidos alrededor</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" className={`btn btn-sm ${p.cartelCantidad === n ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('cartelCantidad', n)}>{n}</button>
                ))}
              </div>
              <label className="fl">Forma del cartel</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {FORMAS_CARTEL.map((x) => (
                  <button key={x.id} type="button" className={`btn btn-sm ${p.cartelForma === x.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('cartelForma', x.id)}>{x.nombre}</button>
                ))}
              </div>
              <label className="fl">Tamaño</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" className={`btn btn-sm ${p.cartelTamano === 'ajustado' ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('cartelTamano', 'ajustado')}>Ajustado a las letras</button>
                <button type="button" className={`btn btn-sm ${p.cartelTamano === 'propio' ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('cartelTamano', 'propio')}>Medida propia</button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {p.cartelTamano === 'propio' && campo('cartelAncho', 'Ancho (mm)', { min: 20, step: 1 })}
                {p.cartelTamano === 'propio' && campo('cartelAlto', 'Alto (mm)', { min: 10, step: 1 })}
                {campo('cartelMargen', 'Espacio alrededor (mm)', { min: 1, step: 0.5 })}
              </div>

              <label className="fl">Dónde va</label>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '4px' }}>Podés agarrar el cartel en la vista 3D y arrastrarlo sobre el jarro (sin Despiece), o escribir los valores.</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('cartelAltura', 'Altura (mm)', { min: 10, step: 1, ayuda: 'Del fondo al centro del cartel.' })}
                {campo('cartelAngulo', 'Giro alrededor (°)', { min: -180, step: 5, ayuda: '0 = de frente; probá 180 para el lado de atrás.' })}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('cartelGrosor', 'Grosor (mm)', { min: 1.6, step: 0.2, ayuda: 'De la base, contando lo que se mete en la pared.' })}
                {campo('cartelRelieve', 'Relieve de las letras (mm)', { min: 0.4, step: 0.2 })}
                {campo('cartelBisel', 'Bisel (mm)', { min: 0, step: 0.2, ayuda: 'Borde en escalones.' })}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campo('cartelArco', 'Arco (mm)', { min: -15, step: 0.5, ayuda: 'Sube (o baja, con negativo) el centro.' })}
                {campo('cartelOnda', 'Onda (mm)', { min: 0, step: 0.5 })}
              </div>

              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.cartelBorde} onChange={(e) => cambiarConHistorial('cartelBorde', e.target.checked)} style={{ width: 'auto' }} />
                Con borde levantado
              </label>
              {p.cartelBorde && <div style={{ display: 'flex', gap: '8px' }}>{campo('cartelBordeAncho', 'Ancho del borde (mm)', { min: 0.8, step: 0.2 })}</div>}
              <label className="fl">Remaches</label>
              <select value={p.cartelRemaches} onChange={(e) => cambiarConHistorial('cartelRemaches', Number(e.target.value))}>
                <option value={0}>Sin remaches</option>
                <option value={2}>2 (a los costados)</option>
                <option value={4}>4 (costados, arriba y abajo)</option>
              </select>

              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.cartelDesmontable} onChange={(e) => cambiarConHistorial('cartelDesmontable', e.target.checked)} style={{ width: 'auto' }} />
                Cartel desmontable (se imprime aparte)
              </label>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                {p.cartelDesmontable
                  ? 'El cuerpo lleva una cavidad con la forma del cartel (con holgura) y el cartel se imprime parado, aparte, y se pega o encastra. Cada color es una parte del mismo objeto.'
                  : 'El cartel va pegado al cuerpo: apenas se mete en la pared y sale todo en la misma impresión.'}
              </div>
              {p.cartelDesmontable && (
                <details style={{ marginTop: '8px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Opciones avanzadas</summary>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('cartelEmpotrado', 'Cuánto se mete en la pared (mm)', { min: 0.4, step: 0.1, ayuda: 'Se limita para dejar al menos 1,4 mm de pared.' })}
                  </div>
                </details>
              )}
            </>
          )}
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Complementos del asa')} resumen={sinAsa ? 'sin asa' : [p.envoltura && `envoltura ${ESTILOS_ENVOLTURA.find((x) => x.id === p.envolturaEstilo)?.nombre.toLowerCase()}`, p.asaCollarines && 'collarines', p.pulgar && 'descanso del pulgar', p.asaSimbolo && 'símbolo', p.asaPlacas && 'placas'].filter(Boolean).join(' · ') || 'ninguno'}>
          {sinAsa ? (
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Activá el asa para agregarle una envoltura, collarines o un descanso para el pulgar.</div>
          ) : (
            <>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
                Son piezas aparte, que se imprimen sueltas y se pegan sobre el asa (la envoltura y los collarines en dos mitades que abrazan el asa, así entran aunque esté pegada al jarro).
              </div>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
                <input type="checkbox" checked={p.envoltura} onChange={(e) => cambiarConHistorial('envoltura', e.target.checked)} style={{ width: 'auto' }} />
                Envoltura del agarre
              </label>
              {p.envoltura && (
                <>
                  <label className="fl">Estilo</label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {ESTILOS_ENVOLTURA.map((x) => (
                      <button key={x.id} type="button" className={`btn btn-sm ${p.envolturaEstilo === x.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('envolturaEstilo', x.id)}>{x.nombre}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('envolturaLargo', 'Largo (mm)', { min: 15, step: 1 })}
                    {campo('envolturaCentro', 'Posición en el asa (%)', { min: 5, step: 1, ayuda: '50 = en el medio del asa.' })}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('envolturaEspesor', 'Cuánto sobresale (mm)', { min: 1, step: 0.1 })}
                    {(p.envolturaEstilo === 'cuerda' || p.envolturaEstilo === 'bandas') && campo('envolturaPaso', p.envolturaEstilo === 'cuerda' ? 'Paso de la cuerda (mm)' : 'Separación de bandas (mm)', { min: 3, step: 0.5 })}
                  </div>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                    <input type="checkbox" checked={p.envolturaRemate} onChange={(e) => cambiarConHistorial('envolturaRemate', e.target.checked)} style={{ width: 'auto' }} />
                    Collarines en las dos puntas de la envoltura
                  </label>
                </>
              )}
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.asaCollarines} onChange={(e) => cambiarConHistorial('asaCollarines', e.target.checked)} style={{ width: 'auto' }} />
                Collarines junto a la pared (uno en cada extremo del asa)
              </label>
              {(p.asaCollarines || (p.envoltura && p.envolturaRemate)) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {campo('collarinAncho', 'Ancho del collarín (mm)', { min: 3, step: 0.5 })}
                  {campo('collarinEspesor', 'Cuánto sobresale (mm)', { min: 0.8, step: 0.1 })}
                </div>
              )}
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.pulgar} onChange={(e) => cambiarConHistorial('pulgar', e.target.checked)} style={{ width: 'auto' }} />
                Descanso para el pulgar
              </label>
              {p.pulgar && (
                <>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('pulgarPosicion', 'Posición (% desde arriba)', { min: 5, step: 1 })}
                    {campo('pulgarLargo', 'Largo (mm)', { min: 12, step: 1 })}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('pulgarAlto', 'Altura (mm)', { min: 1, step: 0.5 })}
                    {campo('pulgarArco', 'Cuánto abraza el asa (°)', { min: 40, step: 5 })}
                  </div>
                </>
              )}
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.asaSimbolo} onChange={(e) => cambiarConHistorial('asaSimbolo', e.target.checked)} style={{ width: 'auto' }} />
                Símbolo sobre el asa
              </label>
              {p.asaSimbolo && (
                <>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>Usa el símbolo que elegiste en Emblemas (también uno propio o de tu biblioteca).</div>
                  <label className="fl">Respaldo</label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {RESPALDOS.map((x) => (
                      <button key={x.id} type="button" className={`btn btn-sm ${p.asaSimboloRespaldo === x.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('asaSimboloRespaldo', x.id)}>{x.nombre}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('asaSimboloTamano', 'Tamaño (mm)', { min: 6, step: 1, ayuda: 'No puede ser más ancho que el asa.' })}
                    {campo('asaSimboloPosicion', 'Posición (% desde arriba)', { min: 5, step: 1 })}
                    {campo('asaSimboloRelieve', 'Relieve (mm)', { min: 0.4, step: 0.2 })}
                  </div>
                </>
              )}
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.asaPlacas} onChange={(e) => cambiarConHistorial('asaPlacas', e.target.checked)} style={{ width: 'auto' }} />
                Placas de montaje decorativas (rosetón en cada extremo del asa)
              </label>
              {p.asaPlacas && (
                <>
                  <label className="fl">Forma</label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {RESPALDOS.filter((x) => x.id !== 'ninguno').map((x) => (
                      <button key={x.id} type="button" className={`btn btn-sm ${p.asaPlacaForma === x.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('asaPlacaForma', x.id)}>{x.nombre}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('asaPlacaLado', 'Tamaño (mm)', { min: 14, step: 1 })}
                    {campo('asaPlacaGrosor', 'Grosor (mm)', { min: 1, step: 0.2 })}
                  </div>
                </>
              )}
            </>
          )}
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Textura del cuerpo')} resumen={p.textura === TEXTURA_NINGUNA ? 'lisa' : p.textura === TEXTURA_DUELAS ? `duelas de madera × ${p.duelasCantidad}` : TEXTURAS.find((x) => x.id === p.textura)?.nombre}>
          <label className="fl">Textura</label>
          <select value={p.textura} onChange={(e) => cambiarConHistorial('textura', e.target.value)}>
            <option value={TEXTURA_NINGUNA}>Lisa (sin textura)</option>
            <option value={TEXTURA_DUELAS}>Duelas de madera (barril)</option>
            {CATEGORIAS_TEXTURA.map((c) => (
              <optgroup key={c.id} label={c.nombre}>
                {TEXTURAS.filter((t) => t.categoria === c.id).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </optgroup>
            ))}
          </select>
          {p.textura !== TEXTURA_NINGUNA && (
            <>
              {p.textura === TEXTURA_DUELAS ? (
                <>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('duelasCantidad', 'Cantidad de duelas', { min: 4, step: 1 })}
                    {campo('duelasSeparacion', 'Ancho de la ranura (mm)', { min: 0.4, step: 0.1 })}
                    {campo('duelasProfundidad', 'Profundidad de la ranura (mm)', { min: 0.3, step: 0.1 })}
                  </div>
                  <label className="fl">Irregularidad: {Math.round(p.duelasIrregularidad * 100)} %</label>
                  <input type="range" min="0" max="1" step="0.05" value={p.duelasIrregularidad} onChange={(e) => cambiar('duelasIrregularidad', Number(e.target.value))} onPointerDown={guardarHistorial} style={{ width: '100%' }} />
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Duelas de distinto ancho y algo más hundidas unas que otras.</div>
                  <label className="fl">Veta: {Math.round(p.duelasVeta * 100)} %</label>
                  <input type="range" min="0" max="1" step="0.05" value={p.duelasVeta} onChange={(e) => cambiar('duelasVeta', Number(e.target.value))} onPointerDown={guardarHistorial} style={{ width: '100%' }} />
                  <div style={{ marginTop: '8px' }}>
                    <button type="button" className="btn btn-sm" onClick={() => cambiarConHistorial('duelasSemilla', (Number(p.duelasSemilla) % 9999) + 1)}>Otra variante</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('texturaTamano', 'Tamaño de cada repetición (mm)', { min: 4, step: 1, ayuda: 'Se ajusta para que cierre sin costura alrededor del jarro.' })}
                    {campo('texturaProfundidad', 'Profundidad (mm)', { min: 0.1, step: 0.1 })}
                  </div>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                    <input type="checkbox" checked={p.texturaInvertir} onChange={(e) => cambiarConHistorial('texturaInvertir', e.target.checked)} style={{ width: 'auto' }} />
                    Invertir (lo alto pasa a ser hondo)
                  </label>
                </>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                {campo('texturaBorde', 'Borde liso arriba y abajo (mm)', { min: 0, step: 0.5 })}
                {campo('texturaResolucion', 'Detalle de la malla (mm, 0 = automático)', { min: 0, step: 0.1, ayuda: 'Menos mm = más detalle y más triángulos.' })}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
                La textura sólo <strong>hunde</strong> la pared (lo más alto toca la silueta de siempre), así el cartel, los emblemas y los aros siguen calzando; se limita a {fmt(profundidadMaxima(limpio))} mm para dejar 1,4 mm de pared.
                La vista es liviana: el modelo con todo el detalle se arma al exportar{limpio.textura !== TEXTURA_NINGUNA && jarro ? ` (unos ${fmt(estimarTriangulosTextura(limpio, radioExteriorFn(limpio), limpio.fondo + limpio.altoHueco, 'final') / 1000, 0)} mil triángulos en el cuerpo)` : ''}.
              </div>
            </>
          )}
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Emblemas')} resumen={p.emblema ? `${SIMBOLOS.find((x) => x.id === p.emblemaSimbolo)?.nombre}${p.emblemaCantidad > 1 ? ` × ${p.emblemaCantidad}` : ''}` : 'sin emblemas'}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
            <input type="checkbox" checked={p.emblema} onChange={(e) => cambiarConHistorial('emblema', e.target.checked)} style={{ width: 'auto' }} />
            Con emblema (símbolo sobre un respaldo)
          </label>
          {p.emblema && (
            <>
              <label className="fl">Símbolo</label>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {SIMBOLOS.map((x) => (
                  <button key={x.id} type="button" className={`btn btn-sm ${p.emblemaSimbolo === x.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('emblemaSimbolo', x.id)}>{x.nombre}</button>
                ))}
                {p.emblemaForma && (
                  <button type="button" className={`btn btn-sm ${p.emblemaSimbolo === SIMBOLO_PROPIO ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('emblemaSimbolo', SIMBOLO_PROPIO)}>
                    {p.emblemaFormaNombre || 'Mi símbolo'}
                  </button>
                )}
                {p.emblemaSvg && (
                  <button type="button" className={`btn btn-sm ${p.emblemaSimbolo === SIMBOLO_SVG ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('emblemaSimbolo', SIMBOLO_SVG)}>
                    Mi SVG{p.emblemaSvgNombre ? ` (${p.emblemaSvgNombre})` : ''}
                  </button>
                )}
              </div>
              <label className="fl">Subir tu propio símbolo (SVG)</label>
              <BotonArchivo accept=".svg,image/svg+xml" etiqueta="📂 Subir un archivo SVG" alElegir={cargarSvg} />
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                Se usan las formas rellenas, de un solo color (con sus huecos), y entra en el tamaño del símbolo manteniendo su proporción. Los dibujos de líneas hay que convertirlos a contorno antes. Se lee en tu compu: no se sube.
              </div>
              <Suspense fallback={<div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>Cargando tu biblioteca…</div>}>
                <BibliotecaSimbolos hayActual={p.emblemaSimbolo === SIMBOLO_SVG || p.emblemaSimbolo === SIMBOLO_PROPIO} actual={contornosActuales} alUsar={usarContornos} />
              </Suspense>
              <label className="fl">Respaldo</label>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {RESPALDOS.map((x) => (
                  <button key={x.id} type="button" className={`btn btn-sm ${p.emblemaRespaldo === x.id ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('emblemaRespaldo', x.id)}>{x.nombre}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {campo('emblemaTamano', 'Tamaño del símbolo (mm)', { min: 10, step: 1 })}
                {p.emblemaRespaldo !== 'ninguno' && campo('emblemaMargen', 'Espacio alrededor (mm)', { min: 1, step: 0.5 })}
              </div>
              <label className="fl">Cuántos, repartidos alrededor</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" className={`btn btn-sm ${p.emblemaCantidad === n ? 'btn-primary' : ''}`} onClick={() => cambiarConHistorial('emblemaCantidad', n)}>{n}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {campo('emblemaAltura', 'Altura (mm)', { min: 10, step: 1, ayuda: 'Del fondo al centro del emblema.' })}
                {campo('emblemaAngulo', 'Giro alrededor (°)', { min: -180, step: 5, ayuda: '0 = de frente, como el cartel; 180 = atrás.' })}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {campo('emblemaGrosor', 'Grosor (mm)', { min: 1.6, step: 0.2, ayuda: 'Del respaldo, contando lo que se mete en la pared.' })}
                {campo('emblemaRelieve', 'Relieve del símbolo (mm)', { min: 0.4, step: 0.2 })}
                {campo('emblemaBisel', 'Bisel (mm)', { min: 0, step: 0.2 })}
              </div>
              {p.emblemaRespaldo !== 'ninguno' && (
                <>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                    <input type="checkbox" checked={p.emblemaBorde} onChange={(e) => cambiarConHistorial('emblemaBorde', e.target.checked)} style={{ width: 'auto' }} />
                    Con borde
                  </label>
                  {p.emblemaBorde && <div style={{ display: 'flex', gap: '8px' }}>{campo('emblemaBordeAncho', 'Ancho del borde (mm)', { min: 0.8, step: 0.2 })}</div>}
                </>
              )}
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.emblemaDesmontable} onChange={(e) => cambiarConHistorial('emblemaDesmontable', e.target.checked)} style={{ width: 'auto' }} />
                Emblemas desmontables (se imprimen aparte)
              </label>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                {p.emblemaDesmontable
                  ? 'El cuerpo lleva una cavidad por emblema y cada emblema se imprime parado, aparte, y se pega o encastra. Cada color es una parte del mismo objeto.'
                  : 'Los emblemas van pegados al cuerpo: apenas se meten en la pared y salen en la misma impresión.'}
              </div>
              {p.emblemaDesmontable && (
                <details style={{ marginTop: '8px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Opciones avanzadas</summary>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('emblemaEmpotrado', 'Cuánto se mete en la pared (mm)', { min: 0.4, step: 0.1, ayuda: 'Se limita para dejar al menos 1,4 mm de pared.' })}
                  </div>
                </details>
              )}
            </>
          )}
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Aros decorativos')} resumen={p.aroArriba || p.aroAbajo ? [p.aroArriba && 'arriba', p.aroAbajo && 'abajo'].filter(Boolean).join(' y ') : 'sin aros'}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
            <input type="checkbox" checked={p.aroArriba} onChange={(e) => cambiarConHistorial('aroArriba', e.target.checked)} style={{ width: 'auto' }} />
            Aro arriba
          </label>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', fontSize: '12px' }}>
            <input type="checkbox" checked={p.aroAbajo} onChange={(e) => cambiarConHistorial('aroAbajo', e.target.checked)} style={{ width: 'auto' }} />
            Aro abajo
          </label>
          {(p.aroArriba || p.aroAbajo) && (
            <>
              <div style={{ display: 'flex', gap: '8px' }}>
                {campo('aroAlto', 'Alto del aro (mm)', { min: 3, step: 0.5 })}
                {campo('aroRelieve', 'Cuánto sobresale (mm)', { min: 0.6, step: 0.1 })}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {p.aroArriba && campo('aroDistBorde', 'Del borde de arriba (mm)', { min: 0, step: 1 })}
                {p.aroAbajo && campo('aroDistBase', 'Del fondo (mm)', { min: 0, step: 1 })}
              </div>
              <label className="fl">Remaches alrededor</label>
              <select value={p.aroRemaches} onChange={(e) => cambiarConHistorial('aroRemaches', Number(e.target.value))}>
                {[0, 6, 8, 10, 12, 16, 20, 24].map((n) => <option key={n} value={n}>{n === 0 ? 'Sin remaches' : `${n} remaches`}</option>)}
              </select>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                <input type="checkbox" checked={p.aroDesmontable} onChange={(e) => cambiarConHistorial('aroDesmontable', e.target.checked)} style={{ width: 'auto' }} />
                Aros desmontables (se imprimen aparte)
              </label>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                {p.aroDesmontable
                  ? 'El cuerpo lleva una ranura redonda y el aro se imprime parado, aparte, y se calza deslizándolo desde arriba (con silueta recta o más angosta arriba).'
                  : 'Los aros van pegados al cuerpo: apenas se meten en la pared y salen en la misma impresión.'}
              </div>
              {p.aroDesmontable && (
                <details style={{ marginTop: '8px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text2)' }}>Opciones avanzadas</summary>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {campo('aroEmpotrado', 'Cuánto se mete en la pared (mm)', { min: 0.4, step: 0.1, ayuda: 'Se limita para dejar al menos 1,4 mm de pared.' })}
                  </div>
                </details>
              )}
            </>
          )}
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Colores')}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {colorInput('cuerpo', 'Cuerpo')}
            {!sinAsa && colorInput('asa', 'Asa')}
            {p.cartel && colorInput('cartel', 'Cartel')}
            {p.cartel && colorInput('letras', 'Letras')}
            {p.cartel && p.cartelBorde && colorInput('borde', 'Borde')}
            {p.cartel && p.cartelRemaches > 0 && colorInput('remaches', 'Remaches')}
            {p.emblema && p.emblemaRespaldo !== 'ninguno' && colorInput('emblema', 'Respaldo del emblema')}
            {!sinAsa && p.envoltura && colorInput('envoltura', 'Envoltura del asa')}
            {!sinAsa && (p.asaCollarines || (p.envoltura && p.envolturaRemate)) && colorInput('collarin', 'Collarines')}
            {!sinAsa && p.pulgar && colorInput('pulgar', 'Descanso del pulgar')}
            {!sinAsa && p.asaPlacas && colorInput('placaAsa', 'Placas de montaje')}
            {!sinAsa && p.asaSimbolo && p.asaSimboloRespaldo !== 'ninguno' && !p.emblema && colorInput('emblema', 'Respaldo del símbolo del asa')}
            {!sinAsa && p.asaSimbolo && !p.emblema && colorInput('simbolo', 'Símbolo del asa')}
            {p.emblema && colorInput('simbolo', 'Símbolo')}
            {p.emblema && p.emblemaRespaldo !== 'ninguno' && p.emblemaBorde && colorInput('emblemaBorde', 'Borde del emblema')}
            {(p.aroArriba || p.aroAbajo) && colorInput('aro', 'Aros')}
            {(p.aroArriba || p.aroAbajo) && p.aroRemaches > 0 && colorInput('aroRemaches', 'Remaches de los aros')}
          </div>
          {unColor && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>Con un solo color, estos colores son sólo para la vista previa.</div>}
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Impresión y costos')} resumen={estimacion ? `${fmt1(estimacion.est.gramos)} g · ${formatoHoras(estimacion.est.horas)} · ${fmtMoneda(estimacion.costos.total)}` : ''}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
            Estimación a partir del volumen de las piezas, con los costos de tu Configuración y la misma fórmula de la Calculadora. Es orientativa: el laminador da el número final.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label className="fl">Filamento</label>
              <select value={impr.filamento} onChange={(e) => cambiarImpr('filamento', Number(e.target.value))}>
                {filamentos.map((f, i) => <option key={i} value={i}>{f.nombre} · {fmtMoneda(f.precio)}/kg</option>)}
                {!filamentos.length && <option value={0}>Sin filamentos cargados</option>}
              </select>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label className="fl">Impresora (consumo y mantenimiento)</label>
              <select value={impr.impresora} onChange={(e) => cambiarImpr('impresora', Number(e.target.value))}>
                {impresorasCfg.map((x, i) => <option key={i} value={i}>{x.nombre} · {x.watts} W</option>)}
                {!impresorasCfg.length && <option value={0}>Sin impresoras cargadas</option>}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {campoImpr('relleno', 'Relleno (%)', { min: 0, max: 100, step: 5 })}
            {campoImpr('horasTrabajo', 'Horas de trabajo tuyas', { min: 0, step: 0.25 })}
          </div>
          {estimacion && (
            <div style={{ marginTop: '10px', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Material por color</div>
              {estimacion.est.colores.map((c) => (
                <div key={c.color} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: c.color, border: '1px solid var(--border, #ccc)', display: 'inline-block' }} />
                  <span style={{ flex: 1 }}>{nombreDeColor(c.color)}</span>
                  <span>{fmt1(c.gramos)} g</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border, #ddd)', marginTop: '4px', paddingTop: '4px', fontWeight: 600 }}>
                <span>Total</span><span>{fmt1(estimacion.est.gramos)} g · {formatoHoras(estimacion.est.horas)}</span>
              </div>
              {estimacion.est.cambios > 0 && <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Incluye unos {estimacion.est.cambios} cambios de filamento en las piezas de varios colores.</div>}
              <div style={{ fontWeight: 600, margin: '10px 0 4px' }}>Costo</div>
              {[['Filamento', estimacion.costos.costeFil], ['Electricidad', estimacion.costos.costeElec], ['Mantenimiento', estimacion.costos.costeMant], ['Mano de obra', estimacion.costos.costeMO]].map(([n, v]) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{n}</span><span>{fmtMoneda(v)}</span></div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border, #ddd)', marginTop: '4px', paddingTop: '4px', fontWeight: 600 }}>
                <span>Costo total</span><span>{fmtMoneda(estimacion.costos.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Precio sugerido (margen {estimacion.costos.margen} %)</span><span>{fmtMoneda(estimacion.costos.precio)}</span>
              </div>
            </div>
          )}
          <div style={{ marginTop: '12px' }}>
            <button type="button" className="btn btn-primary" disabled={!exportable || !estimacion} onClick={() => conModeloFinal(guardarEnBiblioteca)()}>
              {exportando ? 'Armando el modelo…' : 'Guardar en la Biblioteca'}
            </button>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Crea el producto con estos costos, la foto del modelo tal como lo ves y el 3MF a color (sin laminar: lo abrís en tu laminador).
            </div>
          </div>
        </TarjetaColapsable>

        <TarjetaColapsable conservar titulo={titulo('Exportar')} resumen={IMPRESORAS.find((x) => x.id === p.impresora)?.nombre}>
          <label className="fl">Tu impresora</label>
          <select value={p.impresora} onChange={(e) => cambiar('impresora', e.target.value)}>
            {IMPRESORAS.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
          <label className="fl">Tu cama de impresión</label>
          <select value={cama} onChange={(e) => setCama(e.target.value)}>
            {CAMAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {jarro && (
            <>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '10px' }}>
                Piezas: {jarro.piezas.map((x) => `${x.nombre}${x.desmontable ? ' (desmontable)' : ''}`).join(' · ')}
              </div>
              <div style={{ fontSize: '12px', marginTop: '8px', color: ajuste?.entra ? 'var(--text2)' : 'var(--red, #c0392b)' }}>
                Tamaño armado: {fmt(jarro.ancho)} × {fmt(jarro.largo)} × {fmt(jarro.alto)} mm.{' '}
                {ajuste?.entra ? 'Entra parado en tu cama.' : ajuste?.rotar ? 'No entra así, pero sí girado 90°.' : 'No entra en tu cama: probá con un asa desmontable o un jarro más chico.'}
              </div>
              {placa && (
                <div style={{ fontSize: '12px', marginTop: '6px', color: placa.entra ? 'var(--text2)' : 'var(--red, #c0392b)' }}>
                  {placa.entra ? 'Las piezas sueltas entran en una placa de tu cama.' : 'Las piezas sueltas no entran juntas en tu cama: imprimilas en placas separadas (ZIP por piezas).'}
                </div>
              )}
              {jarro.avisos.map((a) => <div key={a} style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text2)' }}>⚠ {a}</div>)}
            </>
          )}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            {p.impresora === 'ams' && <button type="button" className="btn btn-primary" disabled={!exportable} onClick={conModeloFinal(exportar3mf)}>3MF a color</button>}
            {p.impresora === 'ams' && <button type="button" className="btn" disabled={!exportable} onClick={conModeloFinal(exportarBambu)}>3MF Bambu A1</button>}
            <button type="button" className={`btn ${p.impresora === 'ams' ? '' : 'btn-primary'}`} disabled={!exportable} onClick={conModeloFinal(exportarStl)}>STL armado</button>
            {jarro && jarro.piezas.length > 1 && <button type="button" className="btn" disabled={!exportable} onClick={conModeloFinal(exportarZip)}>ZIP por piezas</button>}
            {placa && <button type="button" className="btn btn-primary" disabled={!exportable} onClick={conModeloFinal(exportarPlaca)}>Placa de impresión (3MF)</button>}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
            {hayDesmontables
              ? 'Con piezas desmontables: la placa de impresión las acomoda sueltas en tu cama, cada una apoyada como se imprime; el ZIP por piezas trae un STL de cada una.'
              : 'El STL y el 3MF traen el jarro armado: el asa pegada se imprime junto con el cuerpo.'}
            {p.impresora === 'ams' && ' El 3MF se abre en Bambu Studio u Orca con una parte por pieza.'}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            <button type="button" className="btn btn-sm" disabled={!historial.length} onClick={deshacer}>↩ Deshacer</button>
            <button type="button" className="btn btn-sm" onClick={empezarDeNuevo}>Empezar de nuevo</button>
          </div>
        </TarjetaColapsable>
      </div>

      <div className="herr-separar-visor">
        <VisorPiezas cuerpos={cuerpos} activoId={null} seleccion={null} versionSeleccion={0} despiece={despiece} marcadores={[]} herramienta={null} radioPincel={3} onTocar={() => {}} encuadre={encuadre} modoVista={modoVista} arrastre={arrastre} alListo={(f) => { capturaRef.current = f; }} />
        {/* Barra de vista: liso, colores, alambre, transparente; y activar la lata y el despiece. */}
        <div style={{ position: 'absolute', top: '8px', left: '8px', right: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap', zIndex: 2, pointerEvents: 'none' }}>
          {MODOS_VISTA.map((m) => (
            <button key={m.id} type="button" style={{ pointerEvents: 'auto' }} className={`btn btn-sm ${modoVista === m.id ? 'btn-primary' : ''}`} onClick={() => setModoVista(m.id)}>{m.nombre}</button>
          ))}
          <span style={{ width: '8px' }} />
          <button type="button" style={{ pointerEvents: 'auto' }} className={`btn btn-sm ${conLataVista ? 'btn-primary' : ''}`} onClick={() => setConLataVista((v) => !v)}>Con lata</button>
          <button type="button" style={{ pointerEvents: 'auto' }} className={`btn btn-sm ${despiece ? 'btn-primary' : ''}`} onClick={() => setDespiece((v) => !v)}>Despiece</button>
        </div>
        {(error || !cuerpos.length) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', pointerEvents: 'none' }}>
            {error || 'Armando el jarro…'}
          </div>
        )}
      </div>
      {guardarBib && (
        <Suspense fallback={null}>
          <ModalBibGuardar isOpen presupuestoActual={guardarBib} onClose={() => setGuardarBib(null)} />
        </Suspense>
      )}
    </div>
  );
}
