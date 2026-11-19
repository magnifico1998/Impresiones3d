import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { colorDeTipo, gcodesDeArchivo, parsearVistaGcode } from '../utils/vistaGcode';

// Vista previa 3D del G-code de la calculadora: dibuja los trazos de
// extrusión y se puede girar, acercar y recorrer capa por capa. Se carga
// recién al abrirla (React.lazy en CalculadoraPage) para no sumar three.js
// al arranque de la app.

const VISTAS = [
  { id: 'iso', texto: 'Isométrica', dir: [1, -1.3, 1] },
  { id: 'arriba', texto: 'Arriba', dir: [0, -0.001, 1] },
  { id: 'frente', texto: 'Frente', dir: [0, -1, 0.15] },
  { id: 'lado', texto: 'Lateral', dir: [1, 0, 0.15] }
];

export default function VistaPreviaGcode({ archivo, onCerrar }) {
  const contenedor = useRef(null);
  const escena = useRef(null);
  const [gcodes, setGcodes] = useState(null);
  const [indice, setIndice] = useState(0);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [capa, setCapa] = useState(0);
  const [soloCapa, setSoloCapa] = useState(false);
  const [colorPor, setColorPor] = useState('tipo');

  // Qué G-codes trae el archivo (un .3mf de Bambu puede traer varias placas).
  useEffect(() => {
    let vivo = true;
    gcodesDeArchivo(archivo)
      .then((lista) => {
        if (!vivo) return;
        if (!lista.length) {
          setError('Este archivo no trae G-code para mostrar (sólo los datos de la placa).');
          setCargando(false);
        }
        setGcodes(lista);
      })
      .catch((err) => { if (vivo) { setError(err.message); setCargando(false); } });
    return () => { vivo = false; };
  }, [archivo]);

  // Lee y analiza el G-code elegido. El setTimeout deja pintar el "Leyendo..."
  // antes de que el análisis ocupe el hilo.
  useEffect(() => {
    if (!gcodes?.length) return undefined;
    let vivo = true;
    setCargando(true);
    setError('');
    setDatos(null);
    const t = setTimeout(async () => {
      try {
        const texto = await gcodes[indice].leer();
        const d = parsearVistaGcode(texto);
        if (!vivo) return;
        if (!d.nTrazos) setError('No se encontraron trazos de impresión en este archivo.');
        else { setDatos(d); setCapa(d.capas.length - 1); }
      } catch (err) {
        if (vivo) setError(err.message);
      } finally {
        if (vivo) setCargando(false);
      }
    }, 30);
    return () => { vivo = false; clearTimeout(t); };
  }, [gcodes, indice]);

  // Escena y cámara: se arma una vez por G-code.
  useEffect(() => {
    if (!datos) return undefined;
    const el = contenedor.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const esc = new THREE.Scene();
    esc.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--bg3').trim() || '#f3f4f1');
    const camara = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    camara.up.set(0, 0, 1);
    const controles = new OrbitControls(camara, renderer.domElement);

    const centro = new THREE.Vector3(
      (datos.min[0] + datos.max[0]) / 2,
      (datos.min[1] + datos.max[1]) / 2,
      (datos.min[2] + datos.max[2]) / 2
    );
    const tam = Math.max(datos.max[0] - datos.min[0], datos.max[1] - datos.min[1], datos.max[2] - datos.min[2], 10);

    // Los trazos se mueven al origen para que la cámara gire alrededor de la pieza.
    const pos = new Float32Array(datos.pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = datos.pos[i] - centro.x;
      pos[i + 1] = datos.pos[i + 1] - centro.y;
      pos[i + 2] = datos.pos[i + 2] - centro.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    const lineas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    lineas.frustumCulled = false;
    esc.add(lineas);

    // Cama bajo la pieza.
    const grilla = new THREE.GridHelper(Math.ceil((tam * 1.6) / 10) * 10, Math.ceil((tam * 1.6) / 10), 0x9aa39c, 0xc9cec8);
    grilla.rotation.x = Math.PI / 2;
    grilla.position.z = datos.min[2] - centro.z - 0.01;
    esc.add(grilla);

    const dibujar = () => renderer.render(esc, camara);
    controles.addEventListener('change', dibujar);
    const ajustar = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camara.aspect = w / Math.max(1, h);
      camara.updateProjectionMatrix();
      dibujar();
    };
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);

    const mirar = (dir) => {
      const d = new THREE.Vector3(...dir).normalize().multiplyScalar(tam * 2.1);
      camara.position.copy(d);
      controles.target.set(0, 0, 0);
      controles.update();
      dibujar();
    };

    escena.current = { geo, lineas, dibujar, mirar };
    mirar(VISTAS[0].dir);
    ajustar();

    return () => {
      ro.disconnect();
      controles.removeEventListener('change', dibujar);
      controles.dispose();
      geo.dispose();
      lineas.material.dispose();
      grilla.geometry.dispose();
      grilla.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      escena.current = null;
    };
  }, [datos]);

  // Colores: por parte de la pieza (pared, relleno...), por altura o uniforme.
  const coloresTipo = useMemo(() => datos?.tipos.map((t) => new THREE.Color(colorDeTipo(t))) || [], [datos]);
  useEffect(() => {
    const s = escena.current;
    if (!s || !datos) return;
    const col = s.geo.getAttribute('color');
    const arr = col.array;
    const hayTipos = datos.tipos.length > 0;
    const modo = colorPor === 'tipo' && !hayTipos ? 'altura' : colorPor;
    const zMin = datos.min[2];
    const alto = Math.max(datos.max[2] - zMin, 1e-6);
    const tmp = new THREE.Color();
    for (let i = 0; i < datos.nTrazos; i++) {
      if (modo === 'tipo') tmp.copy(coloresTipo[datos.tipo[i]] || coloresTipo[0]);
      else if (modo === 'altura') tmp.setHSL(0.66 - 0.66 * ((datos.pos[i * 6 + 2] - zMin) / alto), 0.8, 0.45);
      else tmp.set('#ff7a00');
      for (let k = 0; k < 2; k++) {
        arr[i * 6 + k * 3] = tmp.r;
        arr[i * 6 + k * 3 + 1] = tmp.g;
        arr[i * 6 + k * 3 + 2] = tmp.b;
      }
    }
    col.needsUpdate = true;
    s.dibujar();
  }, [datos, colorPor, coloresTipo]);

  // Capa visible: los trazos están en orden, así que alcanza con el rango.
  useEffect(() => {
    const s = escena.current;
    if (!s || !datos) return;
    const ultima = datos.capas.length - 1;
    const c = Math.min(capa, ultima);
    const desde = soloCapa ? datos.capas[c] : 0;
    const hasta = c < ultima ? datos.capas[c + 1] : datos.nTrazos;
    s.geo.setDrawRange(desde * 2, (hasta - desde) * 2);
    s.dibujar();
  }, [datos, capa, soloCapa]);

  const nCapas = datos?.capas.length || 0;
  const alto = datos ? datos.max[2] - datos.min[2] : 0;

  return (
    <div style={{ marginTop: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg3)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '12px', fontWeight: 600 }}>
          Vista previa 3D
          {gcodes && gcodes.length > 1 && (
            <select value={indice} onChange={(e) => setIndice(Number(e.target.value))} style={{ marginLeft: '8px', fontSize: '12px' }}>
              {gcodes.map((g, i) => <option key={g.nombre} value={i}>{g.nombre}</option>)}
            </select>
          )}
        </div>
        <button className="btn btn-sm" onClick={onCerrar}>Cerrar</button>
      </div>

      {cargando && <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>Leyendo el G-code…</div>}
      {error && !cargando && <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text2)' }}>{error}</div>}

      {datos && !cargando && (
        <>
          <div ref={contenedor} style={{ width: '100%', height: '380px', touchAction: 'none', cursor: 'grab' }} />
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {VISTAS.map((v) => (
                <button key={v.id} className="btn btn-sm" onClick={() => escena.current?.mirar(v.dir)}>{v.texto}</button>
              ))}
              <select value={colorPor} onChange={(e) => setColorPor(e.target.value)} style={{ fontSize: '12px', marginLeft: 'auto' }}>
                <option value="tipo">Color: parte de la pieza</option>
                <option value="altura">Color: altura</option>
                <option value="uniforme">Color: uniforme</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
              <span style={{ whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>Capa {Math.min(capa, nCapas - 1) + 1} / {nCapas}</span>
              <input type="range" min={0} max={nCapas - 1} value={Math.min(capa, nCapas - 1)} onChange={(e) => setCapa(Number(e.target.value))} style={{ flex: 1 }} />
              <label style={{ display: 'flex', gap: '4px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={soloCapa} onChange={(e) => setSoloCapa(e.target.checked)} /> Sólo esa capa
              </label>
            </div>
            {colorPor === 'tipo' && datos.tipos.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text2)' }}>
                {datos.tipos.map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: colorDeTipo(t) }} />{t}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
              Arrastrá para girar · rueda o pellizco para acercar · clic derecho para desplazar · {datos.max[0] - datos.min[0] > 0 ? `${(datos.max[0] - datos.min[0]).toFixed(0)} × ${(datos.max[1] - datos.min[1]).toFixed(0)} × ${alto.toFixed(0)} mm` : ''}
              {datos.parcial && ' · archivo muy grande: se muestra sólo la primera parte'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
