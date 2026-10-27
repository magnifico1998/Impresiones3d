import React, { useMemo, useState } from 'react';
import { zipSync } from 'fflate';
import { useConfig, useUi } from '../../context/contextos';
import VisorPiezas from './VisorPiezas';
import {
  leerStl, leer3mf, resoldar, revisarCerrada, volumenMalla, cajaMalla, transformarMalla,
  matrizRotacion, matrizAlinear, partesSueltas, afinarMalla, stlBinario, crear3mf
} from '../../utils/mallas3d';
import {
  seleccionVarita, seleccionPincel, suavizarSeleccion, repararPuntas, separarZona, revisarResultado,
  topologia, normalApoyo, PERFILES_HOLGURA, TIPOS_ENCASTRE, ErrorCorte
} from '../../utils/separarPiezas';

// Colores para las piezas nuevas si la cuenta no tiene colores cargados.
const COLORES_RESPALDO = ['#f5f5f5', '#e53935', '#1e88e5', '#43a047', '#fdd835', '#1a1a1a', '#8e24aa', '#fb8c00'];
// Más que esto suele ser un modelo de escultura sin simplificar: anda, pero lento.
const TRIANGULOS_PESADO = 1500000;

const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
const cm3 = (mm3) => `${fmt(mm3 / 1000, 2)} cm³`;

let ultimoId = 0;
const nuevoId = () => `c${++ultimoId}`;

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

const nombreArchivo = (s) => (s || 'pieza').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'pieza';

// Todo el modelo apoyado en la cama (z = 0) y centrado en x/y.
function apoyarEnCama(cuerpos) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const c of cuerpos) {
    const b = cajaMalla(c.malla);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
  }
  const dx = -(min[0] + max[0]) / 2, dy = -(min[1] + max[1]) / 2, dz = -min[2];
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 && Math.abs(dz) < 1e-6) return cuerpos;
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1];
  return cuerpos.map((c) => ({ ...c, malla: transformarMalla(c.malla, m) }));
}

// Gira todas las piezas (la orientación es del modelo entero) y lo vuelve a
// apoyar en la cama. Las normales de apoyo de las piezas giran con ellas.
function rotarTodo(cuerpos, m) {
  const girar = (v) => v && [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  return apoyarEnCama(cuerpos.map((c) => ({ ...c, malla: transformarMalla(c.malla, m), normalApoyo: girar(c.normalApoyo), normalCierre: girar(c.normalCierre) })));
}

// Copia de las piezas lista para imprimir: cada una acostada sobre su tapa
// plana (si la tiene) y todas en fila sobre la cama.
function posicionImpresion(cuerpos) {
  let x = 0;
  return cuerpos.map((c) => {
    let m = c.malla;
    if (c.normalApoyo) m = transformarMalla(m, matrizAlinear(c.normalApoyo, [0, 0, -1]));
    const b = cajaMalla(m);
    const t = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x - b.min[0], -(b.min[1] + b.max[1]) / 2, -b.min[2], 1];
    x += b.max[0] - b.min[0] + 5;
    return { ...c, malla: transformarMalla(m, t) };
  });
}

export default function HerramientaSepararColores() {
  const { cfg } = useConfig();
  const { showToast } = useUi();
  const paleta = useMemo(() => {
    const deCuenta = (cfg?.colores || []).filter((c) => c?.hex).map((c) => ({ nombre: c.nombre, hex: c.hex }));
    return deCuenta.length ? deCuenta : COLORES_RESPALDO.map((hex) => ({ nombre: hex, hex }));
  }, [cfg?.colores]);

  const [cuerpos, setCuerpos] = useState([]);
  const [historial, setHistorial] = useState({ atras: [], adelante: [] });
  const [nombreModelo, setNombreModelo] = useState('');
  const [avisoModelo, setAvisoModelo] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [encuadre, setEncuadre] = useState(0);

  const [activoId, setActivoId] = useState(null);
  // La selección es un arreglo con un 1 por triángulo marcado. El pincel la
  // cambia en el lugar (copiarla en cada movimiento del mouse sería lento en
  // modelos grandes) y avisa subiendo `version`.
  const [sel, setSel] = useState({ datos: null, version: 0 });
  const refrescarSel = () => setSel((s) => ({ ...s, version: s.version + 1 }));
  const ponerSel = (datos) => setSel((s) => ({ datos, version: s.version + 1 }));
  const [herramienta, setHerramienta] = useState('varita');
  const [angulo, setAngulo] = useState(30);
  const [hastaValles, setHastaValles] = useState(true);
  const [radioPincel, setRadioPincel] = useState(3);
  const [largoAfinado, setLargoAfinado] = useState(1);

  const [cierre, setCierre] = useState('plano');
  const [profundidad, setProfundidad] = useState(2);
  const [encastre, setEncastre] = useState('perno');
  const [diametro, setDiametro] = useState(4);
  const [alto, setAlto] = useState(4);
  const [material, setMaterial] = useState('pla');
  const [holguraPropia, setHolguraPropia] = useState(0.15);
  const holgura = material === 'propia' ? Number(holguraPropia) || 0 : PERFILES_HOLGURA.find((p) => p.id === material).holgura;

  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [despiece, setDespiece] = useState(false);
  const [posicionExport, setPosicionExport] = useState('original');

  const activo = cuerpos.find((c) => c.id === activoId) || null;
  const cantidadSel = useMemo(() => {
    if (!sel.datos) return 0;
    let n = 0;
    for (let i = 0; i < sel.datos.length; i++) n += sel.datos[i];
    return n;
  }, [sel]);

  // Tareas pesadas: se deja pintar el "Procesando…" antes de bloquear.
  const trabajar = (texto, fn) => {
    setOcupado(texto);
    setTimeout(() => {
      try {
        fn();
      } catch (e) {
        if (!(e instanceof ErrorCorte)) console.error(e);
        showToast(e.message || 'Algo salió mal.', 'error');
      } finally {
        setOcupado('');
      }
    }, 30);
  };

  const cambiarCuerpos = (nuevos, { limpiarSeleccion = true } = {}) => {
    setHistorial((h) => ({ atras: [...h.atras.slice(-29), cuerpos], adelante: [] }));
    setCuerpos(nuevos);
    if (limpiarSeleccion) limpiar();
  };
  const deshacer = () => {
    if (!historial.atras.length) return;
    const anterior = historial.atras[historial.atras.length - 1];
    setHistorial({ atras: historial.atras.slice(0, -1), adelante: [cuerpos, ...historial.adelante] });
    setCuerpos(anterior);
    setVistaPrevia(null);
    limpiar();
  };
  const rehacer = () => {
    if (!historial.adelante.length) return;
    const [siguiente, ...resto] = historial.adelante;
    setHistorial({ atras: [...historial.atras, cuerpos], adelante: resto });
    setCuerpos(siguiente);
    setVistaPrevia(null);
    limpiar();
  };

  const limpiar = () => {
    if (sel.datos) sel.datos.fill(0);
    refrescarSel();
  };

  const colorLibre = (usados) => (paleta.find((p) => !usados.includes(p.hex)) || paleta[usados.length % paleta.length]).hex;

  // ---------- Cargar ----------
  const cargarArchivo = (archivo) => {
    if (!archivo) return;
    const es3mf = /\.3mf$/i.test(archivo.name);
    if (!es3mf && !/\.stl$/i.test(archivo.name)) { showToast('Elegí un archivo .stl o .3mf.', 'error'); return; }
    setOcupado('Leyendo el modelo…');
    archivo.arrayBuffer().then((buffer) => {
      trabajar('Preparando el modelo…', () => {
        const base = archivo.name.replace(/\.(stl|3mf)$/i, '');
        const partes = es3mf
          ? leer3mf(buffer).map((p, i, arr) => ({ nombre: p.nombre || (arr.length > 1 ? `${base} ${i + 1}` : base), malla: resoldar(p.malla) }))
          : [{ nombre: base, malla: leerStl(buffer) }];
        const usados = [];
        let nuevos = partes.map((p) => {
          const color = colorLibre(usados);
          usados.push(color);
          return { id: nuevoId(), nombre: p.nombre, color, malla: p.malla, normalApoyo: null, normalCierre: null };
        });
        nuevos = apoyarEnCama(nuevos);
        const triangulos = nuevos.reduce((s, c) => s + c.malla.tri.length / 3, 0);
        const abiertas = nuevos.reduce((s, c) => { const r = revisarCerrada(c.malla); return s + r.abiertas + r.repetidas; }, 0);
        const avisos = [];
        if (abiertas) avisos.push(`El modelo no está del todo cerrado (${fmt(abiertas, 0)} aristas con problemas): las piezas que toquen esa zona pueden salir abiertas. Conviene repararlo antes (por ejemplo, con la reparación de tu slicer).`);
        if (triangulos > TRIANGULOS_PESADO) avisos.push(`Es un modelo pesado (${fmt(triangulos, 0)} triángulos): va a andar más lento.`);
        setNombreModelo(archivo.name);
        setHerramienta((h) => (h === 'apoyo' ? 'varita' : h));
        setAvisoModelo(avisos.join(' '));
        setHistorial({ atras: [], adelante: [] });
        setCuerpos(nuevos);
        setVistaPrevia(null);
        setActivoId(nuevos[0].id);
        ponerSel(new Uint8Array(nuevos[0].malla.tri.length / 3));
        setEncuadre((v) => v + 1);
        // Las vecindades se arman ahora para que el primer clic no espere.
        nuevos.forEach((c) => topologia(c.malla));
      });
    }).catch((e) => {
      setOcupado('');
      showToast(e.message || 'No se pudo leer el archivo.', 'error');
    });
  };

  const afinar = () => {
    if (!activo) return;
    trabajar('Afinando la malla…', () => {
      const largo = Math.max(0.5, Number(largoAfinado) || 1);
      const m = afinarMalla(activo.malla, largo, TRIANGULOS_PESADO);
      const antes = activo.malla.tri.length / 3, despues = m.tri.length / 3;
      if (despues === antes) { showToast(`Ningún triángulo tiene lados de más de ${fmt(largo)} mm: la malla ya está fina.`); return; }
      cambiarCuerpos(cuerpos.map((c) => (c.id === activo.id ? { ...c, malla: m } : c)));
      ponerSel(new Uint8Array(despues));
      topologia(m);
      showToast(`Malla afinada: de ${fmt(antes, 0)} a ${fmt(despues, 0)} triángulos.`);
    });
  };

  const separarSueltas = () => {
    if (!activo) return;
    trabajar('Separando partes sueltas…', () => {
      const partes = partesSueltas(activo.malla);
      if (partes.length < 2) { showToast('El modelo es una sola pieza: no hay partes sueltas.'); return; }
      const usados = cuerpos.map((c) => c.color);
      const nuevas = partes.map((m, i) => {
        const color = i === 0 ? activo.color : colorLibre(usados);
        usados.push(color);
        return { ...activo, id: nuevoId(), nombre: `${activo.nombre} ${i + 1}`, color, malla: m };
      });
      cambiarCuerpos(cuerpos.flatMap((c) => (c.id === activo.id ? nuevas : [c])));
      setActivoId(nuevas[0].id);
      ponerSel(new Uint8Array(nuevas[0].malla.tri.length / 3));
      showToast(`Se separó en ${partes.length} partes.`);
    });
  };

  // ---------- Orientar ----------
  const rotar = (eje) => trabajar('Girando…', () => { cambiarCuerpos(rotarTodo(cuerpos, matrizRotacion(eje, 90))); setEncuadre((v) => v + 1); });

  // ---------- Toques en el visor ----------
  const activar = (id) => {
    const c = cuerpos.find((x) => x.id === id);
    setActivoId(id);
    const datos = new Uint8Array(c.malla.tri.length / 3);
    ponerSel(datos);
    return { c, datos };
  };

  const alTocar = (t) => {
    if (vistaPrevia || ocupado) return;
    if (t.tipo === 'finPintar') { refrescarSel(); return; }
    const { c, datos } = t.cuerpoId === activoId ? { c: activo, datos: sel.datos } : activar(t.cuerpoId);
    if (!c || !datos) return;
    if (herramienta === 'apoyo' && t.tipo === 'clic') {
      const { normales } = topologia(c.malla);
      const n = [normales[t.triangulo * 3], normales[t.triangulo * 3 + 1], normales[t.triangulo * 3 + 2]];
      trabajar('Girando…', () => {
        cambiarCuerpos(rotarTodo(cuerpos, matrizAlinear(n, [0, 0, -1])));
        setEncuadre((v) => v + 1);
        setHerramienta('varita');
      });
      return;
    }
    if (herramienta === 'varita' && t.tipo === 'clic') {
      const sumar = t.ev.ctrlKey || t.ev.metaKey || t.ev.shiftKey;
      const quitar = t.ev.altKey;
      const zona = seleccionVarita(c.malla, t.triangulo, { anguloMax: angulo, hastaValles });
      if (!sumar && !quitar) datos.fill(0);
      for (const i of zona) datos[i] = quitar ? 0 : 1;
      refrescarSel();
      return;
    }
    if ((herramienta === 'pincel' || herramienta === 'borrar') && (t.tipo === 'pintar' || t.tipo === 'clic')) {
      const zona = seleccionPincel(c.malla, t.triangulo, t.punto, radioPincel);
      const valor = herramienta === 'pincel' ? 1 : 0;
      for (const i of zona) datos[i] = valor;
      refrescarSel();
    }
  };

  const emprolijar = () => {
    if (!activo || !sel.datos) return;
    trabajar('Emprolijando el borde…', () => {
      ponerSel(repararPuntas(activo.malla, suavizarSeleccion(activo.malla, sel.datos)));
    });
  };

  // ---------- Cortar ----------
  const calcularCorte = () => {
    if (!activo || !cantidadSel) { showToast('Primero marcá la zona a separar.', 'error'); return; }
    trabajar('Calculando el corte…', () => {
      // Las puntas donde la zona se toca a sí misma se resuelven solas (y se
      // ven en la selección) en vez de frenar el corte con un error.
      const datos = repararPuntas(activo.malla, sel.datos);
      if (datos.some((v, i) => v !== sel.datos[i])) ponerSel(datos);
      const r = separarZona(activo.malla, datos, {
        cierre, profundidad: Number(profundidad), encastre: cierre === 'plano' ? encastre : 'ninguno',
        diametro: Number(diametro), alto: Number(alto), holgura
      });
      const rev = revisarResultado(activo.malla, r);
      setVistaPrevia({ resultado: r, revision: rev });
      setDespiece(true);
    });
  };

  const aplicarCorte = () => {
    const { resultado } = vistaPrevia;
    const usados = cuerpos.map((c) => c.color);
    const numero = cuerpos.length + 1;
    const pieza = {
      id: nuevoId(), nombre: `Pieza ${numero}`, color: colorLibre(usados), malla: resultado.pieza,
      normalApoyo: cierre === 'plano' ? normalApoyo(resultado) : null, normalCierre: resultado.normalCierre
    };
    const resto = { ...activo, malla: resultado.resto };
    cambiarCuerpos(cuerpos.flatMap((c) => (c.id === activo.id ? [resto, pieza] : [c])));
    ponerSel(new Uint8Array(resto.malla.tri.length / 3));
    setVistaPrevia(null);
    showToast(`${pieza.nombre} separada. Podés marcar otra zona o exportar.`);
  };

  // ---------- Exportar ----------
  const paraExportar = () => (posicionExport === 'impresion' ? posicionImpresion(cuerpos) : cuerpos);
  const base = nombreArchivo(nombreModelo.replace(/\.(stl|3mf)$/i, ''));
  const exportarZip = () => trabajar('Armando el ZIP…', () => {
    const archivos = {};
    paraExportar().forEach((c, i) => { archivos[`${String(i + 1).padStart(2, '0')} ${nombreArchivo(c.nombre)}.stl`] = stlBinario(c.malla, c.nombre); });
    descargar(zipSync(archivos), `${base} - piezas.zip`, 'application/zip');
  });
  const exportar3mf = () => trabajar('Armando el 3MF…', () => {
    descargar(crear3mf(paraExportar(), { ensamblado: posicionExport === 'original' }), `${base} - colores.3mf`, 'model/3mf');
  });
  const exportarUna = (c) => {
    const lista = posicionExport === 'impresion' ? posicionImpresion([c]) : [c];
    descargar(stlBinario(lista[0].malla, c.nombre), `${nombreArchivo(c.nombre)}.stl`, 'model/stl');
  };

  const cambiarCuerpo = (id, cambios) => setCuerpos((cs) => cs.map((c) => (c.id === id ? { ...c, ...cambios } : c)));

  // Lo que se ve: con vista previa, el cuerpo activo se reemplaza por las dos
  // piezas resultantes.
  // Sólo las piezas separadas (las que tienen normal de cierre) se alejan en
  // la vista despiece; el cuerpo principal queda quieto.
  const cuerposVista = useMemo(() => {
    const conDespiece = (c) => ({ ...c, despiece: c.normalCierre || null });
    if (!vistaPrevia || !activo) return cuerpos.map(conDespiece);
    const { resultado } = vistaPrevia;
    return cuerpos.flatMap((c) => (c.id === activo.id
      ? [{ ...conDespiece(c), id: 'previa-resto', malla: resultado.resto }, { id: 'previa-pieza', color: '#ff7a00', malla: resultado.pieza, despiece: resultado.normalCierre }]
      : [conDespiece(c)]));
  }, [cuerpos, vistaPrevia, activo]);

  const marcadores = useMemo(() => (vistaPrevia ? vistaPrevia.revision.problemas.flatMap((p) => p.puntos || []) : []), [vistaPrevia]);
  const errores = vistaPrevia ? vistaPrevia.revision.problemas.filter((p) => p.tipo === 'error') : [];
  const noCerrada = errores.some((p) => !p.puntos?.length);

  const botonHerramienta = (id, texto, titulo) => (
    <button type="button" className={`btn btn-sm ${herramienta === id ? 'btn-primary' : ''}`} title={titulo} onClick={() => setHerramienta(id)}>{texto}</button>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '16px', alignItems: 'start' }} className="herr-separar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="card">
          <div className="card-title">1 · Modelo</div>
          <label className="drop-zone" style={{ padding: '14px', marginBottom: 0 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); cargarArchivo(e.dataTransfer.files?.[0]); }}>
            <input type="file" accept=".stl,.3mf" onChange={(e) => { cargarArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            <div style={{ fontSize: '13px', fontWeight: 500 }}>{nombreModelo ? `📦 ${nombreModelo}` : 'Elegí o soltá un STL o 3MF'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>El archivo no se sube: se procesa en tu computadora.</div>
          </label>
          {avisoModelo && <div style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '8px' }}>⚠ {avisoModelo}</div>}
          {activo && (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
                {activo.nombre}: {fmt(activo.malla.tri.length / 3, 0)} triángulos
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
                <button type="button" className="btn btn-sm" onClick={afinar} disabled={!!vistaPrevia} title="Parte los triángulos grandes para que la varita y el pincel marquen con más detalle. La forma no cambia.">Afinar malla a</button>
                <input type="number" min="0.5" step="0.5" value={largoAfinado} onChange={(e) => setLargoAfinado(e.target.value)} style={{ width: '64px', padding: '3px 6px', fontSize: '12px' }} />
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>mm</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={separarSueltas} disabled={!!vistaPrevia}>Separar partes sueltas</button>
              </div>
            </>
          )}
        </div>

        {cuerpos.length > 0 && (
          <>
            <div className="card">
              <div className="card-title">2 · Orientación</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>Dejá la base del modelo apoyada en la cama.</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={() => rotar('x')} disabled={!!vistaPrevia}>↻ X 90°</button>
                <button type="button" className="btn btn-sm" onClick={() => rotar('y')} disabled={!!vistaPrevia}>↻ Y 90°</button>
                <button type="button" className="btn btn-sm" onClick={() => rotar('z')} disabled={!!vistaPrevia}>↻ Z 90°</button>
                {botonHerramienta('apoyo', 'Elegir cara de apoyo', 'Hacé clic en la cara que va contra la cama')}
              </div>
            </div>

            <div className="card">
              <div className="card-title">3 · Marcar la zona de otro color</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {botonHerramienta('varita', '🪄 Varita', 'Clic: marca una zona entera siguiendo las formas. Ctrl+clic suma otra; Alt+clic la saca.')}
                {botonHerramienta('pincel', '🖌 Pincel', 'Arrastrá sobre el modelo para sumar a la zona')}
                {botonHerramienta('borrar', '⌫ Borrar', 'Arrastrá sobre el modelo para sacar de la zona')}
              </div>
              {herramienta === 'varita' && (
                <div>
                  <label className="fl">Sensibilidad: se frena en pliegues de más de {angulo}°</label>
                  <input type="range" min="5" max="80" value={angulo} onChange={(e) => setAngulo(Number(e.target.value))} style={{ width: '100%' }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', margin: '4px 0' }}>
                    <input type="checkbox" checked={hastaValles} onChange={(e) => setHastaValles(e.target.checked)} />
                    Frenar sólo en los valles (toma los cantos, como una letra en relieve entera)
                  </label>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Clic marca una zona · Ctrl+clic suma otra · Alt+clic la saca. Arrastrar gira la vista.</div>
                </div>
              )}
              {(herramienta === 'pincel' || herramienta === 'borrar') && (
                <div>
                  <label className="fl">Tamaño del pincel: {radioPincel} mm</label>
                  <input type="range" min="0.5" max="20" step="0.5" value={radioPincel} onChange={(e) => setRadioPincel(Number(e.target.value))} style={{ width: '100%' }} />
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Arrastrá sobre la pieza para pintar. Arrastrar fuera del modelo gira la vista.</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={emprolijar} disabled={!cantidadSel || !!vistaPrevia}>Emprolijar borde</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={limpiar} disabled={!cantidadSel || !!vistaPrevia}>Limpiar</button>
                <span style={{ fontSize: '12px', color: 'var(--text3)', marginLeft: 'auto' }}>{fmt(cantidadSel, 0)} triángulos</span>
              </div>
            </div>

            <div className="card">
              <div className="card-title">4 · Cierre y encastre</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <button type="button" className={`btn btn-sm ${cierre === 'plano' ? 'btn-primary' : ''}`} onClick={() => setCierre('plano')} disabled={!!vistaPrevia}>Cierre plano</button>
                <button type="button" className={`btn btn-sm ${cierre === 'curvo' ? 'btn-primary' : ''}`} onClick={() => setCierre('curvo')} disabled={!!vistaPrevia}>Cierre curvo</button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
                {cierre === 'plano'
                  ? 'La pieza queda con la espalda plana: se imprime apoyada sobre esa cara y lleva encastre.'
                  : 'La pieza copia la forma de la superficie hacia adentro: para uniones orgánicas, pegadas o con AMS.'}
              </div>
              <div className="grid2">
                <div>
                  <label className="fl">Profundidad (mm)</label>
                  <input type="number" min="0.4" step="0.2" value={profundidad} onChange={(e) => setProfundidad(e.target.value)} disabled={!!vistaPrevia} />
                </div>
                {cierre === 'plano' && (
                  <div>
                    <label className="fl">Encastre</label>
                    <select value={encastre} onChange={(e) => setEncastre(e.target.value)} disabled={!!vistaPrevia}>
                      {TIPOS_ENCASTRE.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {cierre === 'plano' && encastre !== 'ninguno' && (
                <div className="grid2" style={{ marginTop: '8px' }}>
                  <div>
                    <label className="fl">{encastre === 'llave' ? 'Lado' : 'Diámetro'} (mm)</label>
                    <input type="number" min="1.5" step="0.5" value={diametro} onChange={(e) => setDiametro(e.target.value)} disabled={!!vistaPrevia} />
                  </div>
                  <div>
                    <label className="fl">Alto máximo (mm)</label>
                    <input type="number" min="1" step="0.5" value={alto} onChange={(e) => setAlto(e.target.value)} disabled={!!vistaPrevia} />
                  </div>
                  <div>
                    <label className="fl">Material</label>
                    <select value={material} onChange={(e) => setMaterial(e.target.value)} disabled={!!vistaPrevia}>
                      {PERFILES_HOLGURA.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {fmt(p.holgura, 2)} mm</option>)}
                      <option value="propia">Holgura propia</option>
                    </select>
                  </div>
                  {material === 'propia' && (
                    <div>
                      <label className="fl">Holgura (mm)</label>
                      <input type="number" min="0" step="0.05" value={holguraPropia} onChange={(e) => setHolguraPropia(e.target.value)} disabled={!!vistaPrevia} />
                    </div>
                  )}
                </div>
              )}
              {!vistaPrevia ? (
                <button type="button" className="btn btn-primary" style={{ marginTop: '12px', width: '100%' }} onClick={calcularCorte} disabled={!cantidadSel || !!ocupado}>Revisar el corte</button>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '12px', marginBottom: '6px' }}>
                    Pieza {cm3(vistaPrevia.revision.volumenPieza)} · resto {cm3(vistaPrevia.revision.volumenResto)}
                  </div>
                  {vistaPrevia.revision.problemas.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--accent)' }}>✓ Las dos piezas son sólidos cerrados{vistaPrevia.resultado.normalCierre && cierre === 'plano' && encastre !== 'ninguno' ? ' y el encastre entra' : ''}.</div>
                  )}
                  {vistaPrevia.revision.problemas.map((p, i) => (
                    <div key={i} style={{ fontSize: '12px', color: p.tipo === 'error' ? 'var(--danger)' : 'var(--warn)', marginTop: '4px' }}>{p.tipo === 'error' ? '✕' : '⚠'} {p.texto}</div>
                  ))}
                  {vistaPrevia.resultado.avisos.map((a, i) => (
                    <div key={`a${i}`} style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>ℹ {a}</div>
                  ))}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={aplicarCorte} disabled={noCerrada}>{errores.length ? 'Aplicar igual' : 'Aplicar corte'}</button>
                    <button type="button" className="btn" onClick={() => setVistaPrevia(null)}>Volver</button>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <div className="card-title" style={{ margin: 0 }}>5 · Piezas</div>
                <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={deshacer} disabled={!historial.atras.length || !!vistaPrevia} title="Deshacer">↶</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={rehacer} disabled={!historial.adelante.length || !!vistaPrevia} title="Rehacer">↷</button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '8px' }}>
                <input type="checkbox" checked={despiece} onChange={(e) => setDespiece(e.target.checked)} /> Vista despiece
              </label>
              {cuerpos.map((c) => (
                <div key={c.id} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', background: c.id === activoId ? 'var(--accentDim2)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={c.visible !== false} title="Mostrar" onChange={(e) => cambiarCuerpo(c.id, { visible: e.target.checked })} />
                    <input type="text" value={c.nombre} onChange={(e) => cambiarCuerpo(c.id, { nombre: e.target.value })} style={{ flex: 1, minWidth: 0, padding: '3px 6px', fontSize: '12px' }} />
                    <button type="button" className="btn btn-sm btn-ghost" title="Descargar STL de esta pieza" onClick={() => exportarUna(c)}>⬇</button>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px', alignItems: 'center' }}>
                    {paleta.map((p) => (
                      <button key={p.hex + p.nombre} type="button" title={p.nombre} onClick={() => cambiarCuerpo(c.id, { color: p.hex })}
                        style={{ width: '18px', height: '18px', borderRadius: '50%', background: p.hex, border: c.color === p.hex ? '2px solid var(--accent)' : '1px solid var(--border2)', cursor: 'pointer', padding: 0 }} />
                    ))}
                    <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: 'auto' }}>{cm3(volumenMalla(c.malla))}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title">6 · Exportar</div>
              <label className="fl">Posición de las piezas</label>
              <select value={posicionExport} onChange={(e) => setPosicionExport(e.target.value)}>
                <option value="original">Original: se arman solas en el slicer (AMS)</option>
                <option value="impresion">Para imprimir: cada pieza acostada en la cama</option>
              </select>
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={exportar3mf} disabled={!!vistaPrevia || !!ocupado}>3MF a color</button>
                <button type="button" className="btn" onClick={exportarZip} disabled={!!vistaPrevia || !!ocupado}>ZIP de STL</button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
                En Bambu Studio u Orca, el 3MF en posición original se abre como un solo objeto con una parte por color: asignale el filamento a cada parte.
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ position: 'sticky', top: '84px', height: 'calc(100vh - 120px)', minHeight: '420px' }} className="herr-separar-visor">
        <VisorPiezas
          cuerpos={cuerposVista}
          activoId={vistaPrevia ? null : activoId}
          seleccion={sel.datos}
          versionSeleccion={sel.version}
          despiece={despiece}
          marcadores={marcadores}
          herramienta={herramienta}
          radioPincel={radioPincel}
          onTocar={alTocar}
          encuadre={encuadre}
        />
        {!cuerpos.length && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', pointerEvents: 'none' }}>
            Cargá un modelo para empezar
          </div>
        )}
        {ocupado && (
          <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '6px 14px', fontSize: '12px', boxShadow: 'var(--shadow)' }}>
            ⏳ {ocupado}
          </div>
        )}
        {herramienta === 'apoyo' && !ocupado && (
          <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '6px 14px', fontSize: '12px' }}>
            Hacé clic en la cara que va contra la cama
          </div>
        )}
      </div>
    </div>
  );
}
