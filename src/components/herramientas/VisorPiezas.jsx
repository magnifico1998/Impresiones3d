import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Con el BVH un clic sobre un modelo de 800.000 triángulos responde al
// instante; sin él, three.js recorre todos los triángulos en cada rayo.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const COLOR_SELECCION = new THREE.Color('#ff7a00');
const DESPIECE_MM = 18;

// Geometría sin índices (cada triángulo con sus propios vértices) para poder
// pintar triángulo por triángulo la selección.
function geometriaDe(malla) {
  const nt = malla.tri.length / 3;
  const pos = new Float32Array(nt * 9);
  for (let i = 0; i < malla.tri.length; i++) {
    const v = malla.tri[i] * 3;
    pos[i * 3] = malla.pos[v];
    pos[i * 3 + 1] = malla.pos[v + 1];
    pos[i * 3 + 2] = malla.pos[v + 2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nt * 9), 3));
  g.computeVertexNormals();
  g.computeBoundsTree();
  return g;
}

function pintar(geometria, colorBase, seleccion) {
  const col = geometria.getAttribute('color');
  const base = new THREE.Color(colorBase);
  const arr = col.array;
  const nt = arr.length / 9;
  for (let t = 0; t < nt; t++) {
    const c = seleccion && seleccion[t] ? COLOR_SELECCION : base;
    for (let k = 0; k < 3; k++) {
      arr[t * 9 + k * 3] = c.r;
      arr[t * 9 + k * 3 + 1] = c.g;
      arr[t * 9 + k * 3 + 2] = c.b;
    }
  }
  col.needsUpdate = true;
}

// Visor 3D de las piezas. Es "tonto": dibuja lo que le pasan y avisa los
// toques sobre la superficie (onTocar) con el cuerpo, el triángulo y el
// punto; las herramientas deciden qué hacer con eso.
//   cuerpos: [{ id, malla, color, visible, despiece: [x,y,z] | null }]
export default function VisorPiezas({ cuerpos, activoId, seleccion, versionSeleccion, despiece, marcadores, herramienta, radioPincel, onTocar, encuadre }) {
  const contenedor = useRef(null);
  const estado = useRef(null);
  const props = useRef({});
  // Los manejadores del mouse se instalan una sola vez y leen de acá lo último.
  useEffect(() => {
    props.current = { herramienta, onTocar, activoId, radioPincel };
  });

  // Escena, cámara y controles: una sola vez.
  useEffect(() => {
    const el = contenedor.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const escena = new THREE.Scene();
    escena.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--bg3').trim() || '#f3f4f1');
    const camara = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    // El STL y la cama de la impresora usan Z hacia arriba.
    camara.up.set(0, 0, 1);
    camara.position.set(160, -220, 180);
    const controles = new OrbitControls(camara, renderer.domElement);
    controles.enableDamping = true;
    escena.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const luz = new THREE.DirectionalLight(0xffffff, 1.6);
    luz.position.set(1, -1.5, 2);
    camara.add(luz);
    escena.add(camara);
    const cama = new THREE.GridHelper(256, 26, 0x9aa39c, 0xc9cec8);
    cama.rotation.x = Math.PI / 2;
    escena.add(cama);
    const grupo = new THREE.Group();
    escena.add(grupo);
    const grupoMarcas = new THREE.Group();
    escena.add(grupoMarcas);
    const cursor = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff7a00, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 }));
    cursor.visible = false;
    cursor.renderOrder = 10;
    escena.add(cursor);

    const ajustar = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camara.aspect = w / Math.max(1, h);
      camara.updateProjectionMatrix();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(el);
    ajustar();

    let animando = true;
    const ciclo = () => {
      if (!animando) return;
      controles.update();
      renderer.render(escena, camara);
      requestAnimationFrame(ciclo);
    };
    ciclo();

    // ---- Toques ----
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    const tocar = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camara);
      const visibles = grupo.children.filter((m) => m.visible);
      const hit = raycaster.intersectObjects(visibles, false)[0];
      if (!hit) return null;
      // El BVH reordena el índice: el triángulo original sale del vértice.
      const triangulo = Math.floor(hit.face.a / 3);
      const p = hit.point.clone().sub(hit.object.position);
      return { cuerpoId: hit.object.userData.id, triangulo, punto: [p.x, p.y, p.z], normal: hit.face.normal, puntoMundo: hit.point };
    };
    let pintando = false;
    let inicio = null;
    const usaPincel = () => ['pincel', 'borrar'].includes(props.current.herramienta);
    const moverCursor = (t) => {
      if (!t || !usaPincel()) { cursor.visible = false; return; }
      cursor.visible = true;
      cursor.position.copy(t.puntoMundo);
      cursor.scale.setScalar(props.current.radioPincel || 3);
      cursor.lookAt(t.puntoMundo.clone().add(t.normal));
    };
    const abajo = (ev) => {
      if (ev.button !== 0) return;
      inicio = { x: ev.clientX, y: ev.clientY };
      if (usaPincel()) {
        const t = tocar(ev);
        if (t && t.cuerpoId === props.current.activoId) {
          pintando = true;
          controles.enabled = false;
          renderer.domElement.setPointerCapture(ev.pointerId);
          props.current.onTocar?.({ ...t, tipo: 'pintar', ev });
        }
      }
    };
    const mover = (ev) => {
      const t = usaPincel() ? tocar(ev) : null;
      moverCursor(t);
      if (pintando && t && t.cuerpoId === props.current.activoId) props.current.onTocar?.({ ...t, tipo: 'pintar', ev });
    };
    const arriba = (ev) => {
      if (pintando) {
        pintando = false;
        controles.enabled = true;
        props.current.onTocar?.({ tipo: 'finPintar' });
        return;
      }
      // Un clic (sin arrastrar) usa la herramienta; arrastrar gira la vista.
      if (ev.button === 0 && inicio && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 5) {
        const t = tocar(ev);
        if (t) props.current.onTocar?.({ ...t, tipo: 'clic', ev });
      }
      inicio = null;
    };
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', abajo);
    dom.addEventListener('pointermove', mover);
    dom.addEventListener('pointerup', arriba);
    dom.addEventListener('pointerleave', () => { cursor.visible = false; });

    estado.current = { escena, camara, controles, grupo, grupoMarcas, mallas: new Map(), renderer };
    return () => {
      animando = false;
      observador.disconnect();
      for (const m of estado.current.mallas.values()) { m.geometry.disposeBoundsTree(); m.geometry.dispose(); m.material.dispose(); }
      controles.dispose();
      renderer.dispose();
      el.removeChild(dom);
      estado.current = null;
    };
  }, []);

  // Cuerpos: se rearma la geometría sólo de los que cambiaron de malla.
  useEffect(() => {
    const s = estado.current;
    if (!s) return;
    const vivos = new Set();
    for (const c of cuerpos) {
      vivos.add(c.id);
      let m = s.mallas.get(c.id);
      if (m && m.userData.malla !== c.malla) {
        s.grupo.remove(m);
        m.geometry.disposeBoundsTree();
        m.geometry.dispose();
        m = null;
      }
      if (!m) {
        m = new THREE.Mesh(geometriaDe(c.malla), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide }));
        m.userData = { id: c.id, malla: c.malla };
        s.mallas.set(c.id, m);
        s.grupo.add(m);
      }
      m.visible = c.visible !== false;
      const d = despiece && c.despiece ? c.despiece : [0, 0, 0];
      m.position.set(d[0] * DESPIECE_MM, d[1] * DESPIECE_MM, d[2] * DESPIECE_MM);
      pintar(m.geometry, c.color, c.id === activoId ? seleccion : null);
    }
    for (const [id, m] of s.mallas) {
      if (vivos.has(id)) continue;
      s.grupo.remove(m);
      m.geometry.disposeBoundsTree();
      m.geometry.dispose();
      m.material.dispose();
      s.mallas.delete(id);
    }
  // versionSeleccion: el pincel cambia la selección en el lugar (sin copiarla
  // en cada movimiento del mouse) y avisa con este contador.
  }, [cuerpos, activoId, seleccion, versionSeleccion, despiece]);

  // Puntos con problemas, en rojo.
  useEffect(() => {
    const s = estado.current;
    if (!s) return;
    s.grupoMarcas.clear();
    const geo = new THREE.SphereGeometry(0.7, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe02020, depthTest: false });
    for (const p of marcadores || []) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p[0], p[1], p[2]);
      m.renderOrder = 5;
      s.grupoMarcas.add(m);
    }
  }, [marcadores]);

  // Encuadrar la cámara cuando cambia el modelo (encuadre es un contador).
  useEffect(() => {
    const s = estado.current;
    if (!s || !s.grupo.children.length) return;
    const caja = new THREE.Box3().setFromObject(s.grupo);
    const centro = caja.getCenter(new THREE.Vector3());
    const radio = caja.getSize(new THREE.Vector3()).length() / 2 || 50;
    const dist = radio / Math.sin((s.camara.fov * Math.PI) / 360) * 0.9;
    s.controles.target.copy(centro);
    s.camara.position.copy(centro.clone().add(new THREE.Vector3(0.55, -0.75, 0.6).normalize().multiplyScalar(dist)));
    s.camara.near = Math.max(0.1, dist / 200);
    s.camara.far = dist * 20;
    s.camara.updateProjectionMatrix();
  }, [encuadre]);

  return <div ref={contenedor} style={{ width: '100%', height: '100%', minHeight: '420px', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', touchAction: 'none', cursor: ['pincel', 'borrar'].includes(herramienta) ? 'crosshair' : 'default' }} />;
}
