// Generador de llaveros y nombres para lápiz. Arma las piezas (fondo, letras y
// borde, una por color) como mallas { pos, tri } en milímetros, con Z hacia
// arriba y la cara de abajo apoyada en z = 0, listas para exportar.
// El texto se vuelve geometría con una fuente de opentype.js ya cargada; este
// módulo no toca el navegador, así que se prueba en Node.
import * as THREE from 'three';
import ClipperNs from 'clipper-lib';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { soldar } from './mallas3d';

// clipper-lib exporta distinto según el empaquetador.
const Clipper = ClipperNs.ClipperOffset ? ClipperNs : ClipperNs.ClipperLib || ClipperNs.default;

export const MODOS = [
  { id: 'llavero', nombre: 'Llavero' },
  { id: 'lapiz', nombre: 'Nombre para lápiz' }
];

// placa: rectángulo liso. marco: rectángulo con un borde levantado.
// contorno: la base sigue la silueta de las letras, con la argolla pegada.
// doble: como contorno, con una segunda banda de color alrededor.
export const ESTILOS_BORDE = [
  { id: 'placa', nombre: 'Placa' },
  { id: 'marco', nombre: 'Placa con marco' },
  { id: 'contorno', nombre: 'Contorno' },
  { id: 'doble', nombre: 'Doble contorno' }
];

// Formas del nombre para lápiz. 'letras': cada letra es un bloque y el lápiz
// las atraviesa; las letras van pegadas y alternan la altura.
export const FORMAS_LAPIZ = [
  { id: 'placa', nombre: 'Tubo recto' },
  { id: 'contorno', nombre: 'Sigue las letras' },
  { id: 'letras', nombre: 'Letras unidas' }
];

export const estiloSigueLetras = (estilo) => estilo === 'contorno' || estilo === 'doble';

export const TIPOS_LAPIZ = [
  { id: 'escolar', nombre: 'Escolar al punto', diametro: 8.1 },
  { id: 'firme', nombre: 'Muy firme', diametro: 7.7 },
  { id: 'jumbo', nombre: 'Jumbo grueso', diametro: 10.6 }
];

export const TOPES_LAPIZ = [
  { id: 'final', nombre: 'Tope al final' },
  { id: 'abierto', nombre: 'Abierto' },
  { id: 'inicio', nombre: 'Tope al inicio' }
];

export const FORMAS_AGUJERO_LAPIZ = [
  { id: 'redondo', nombre: 'Redondo' },
  { id: 'techo', nombre: 'Techo 45°' }
];

export const IMPRESORAS = [
  { id: 'uno', nombre: 'Un solo color' },
  { id: 'pausa', nombre: 'Cambio de filamento a mano (pausa)' },
  { id: 'ams', nombre: 'Multicolor (AMS / varios filamentos)' }
];

// Colores con los que arranca cada forma mientras no se elijan otros: las
// letras unidas son de un solo color (naranja); el resto, fondo naranja con
// letras negras en el lápiz.
export function coloresIniciales(modo, estilo) {
  const base = { fondo: '#2f6fdb', letras: '#ff7a00', borde: '#f2b705' };
  if (modo === 'lapiz' && estilo !== 'letras') return { ...base, fondo: '#ff7a00', letras: '#111111' };
  return base;
}

export const PARAMETROS_INICIALES = Object.freeze({
  modo: 'llavero',
  nombres: ['Valentina'],
  mayusculas: 'como', // como | mayus | minus
  dividirLineas: false,
  columnas: 1,
  separacion: 4,
  alturaFija: 0,
  engrosar: 0,
  // Estilo "letras unidas" del lápiz: cuántos mm más altas (en Z) son las
  // letras impares que las pares.
  desnivel: 1.5,
  impresora: 'ams',
  // Medidas (mm)
  alturaLetra: 12,
  grosorBase: 2.4,
  reliveLetras: 1.2,
  margen: 3,
  esquinas: 2.5,
  agujero: 4.5,
  // Borde
  estilo: 'contorno',
  grosorBorde: 1.2,
  // Lápiz
  tipoLapiz: 'escolar',
  diametroLapiz: 8.1,
  paredLapiz: 2,
  tope: 'final',
  formaAgujero: 'redondo',
  // Colores
  colores: { fondo: '#2f6fdb', letras: '#ff7a00', borde: '#f2b705' },
  // Un color distinto por nombre: coloresNombres[i] = { fondo, letras, borde }
  // (los que faltan usan los colores generales).
  colorPorNombre: false,
  coloresNombres: []
});

// ---------- Utilidades de malla ----------

function geometriaAMalla(geometria) {
  const g = geometria.index ? geometria.toNonIndexed() : geometria;
  const malla = soldar(g.getAttribute('position').array);
  geometria.dispose();
  return malla;
}

// Suelda los vértices que quedan a menos de `tol` mm uno de otro. Hace falta
// después de una resta 3D: los puntos nuevos de un mismo corte se calculan por
// separado y difieren en una millonésima, justo la diferencia que el soldado
// por redondeo de `soldar` no une si cae a los dos lados de un redondeo.
function soldarCercanos(sopa, tol = 5e-4) {
  const celdas = new Map();
  const pos = [];
  const clave = (i, j, k) => `${i},${j},${k}`;
  const idDe = (x, y, z) => {
    const ci = Math.floor(x / tol), cj = Math.floor(y / tol), ck = Math.floor(z / tol);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
      const lista = celdas.get(clave(i, j, k));
      if (!lista) continue;
      for (const id of lista) {
        const dx = pos[id * 3] - x, dy = pos[id * 3 + 1] - y, dz = pos[id * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz <= tol * tol) return id;
      }
    }
    const id = pos.length / 3;
    pos.push(x, y, z);
    const c = clave(ci, cj, ck);
    if (!celdas.has(c)) celdas.set(c, []);
    celdas.get(c).push(id);
    return id;
  };
  const tri = [];
  for (let i = 0; i < sopa.length; i += 9) {
    const a = idDe(sopa[i], sopa[i + 1], sopa[i + 2]);
    const b = idDe(sopa[i + 3], sopa[i + 4], sopa[i + 5]);
    const c = idDe(sopa[i + 6], sopa[i + 7], sopa[i + 8]);
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  return { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
}

export function unirMallas(lista) {
  let np = 0, nt = 0;
  for (const m of lista) { np += m.pos.length; nt += m.tri.length; }
  const pos = new Float32Array(np);
  const tri = new Uint32Array(nt);
  let op = 0, ot = 0;
  for (const m of lista) {
    const base = op / 3;
    pos.set(m.pos, op);
    for (let i = 0; i < m.tri.length; i++) tri[ot + i] = m.tri[i] + base;
    op += m.pos.length;
    ot += m.tri.length;
  }
  return { pos, tri };
}

export function moverMalla(malla, dx, dy, dz) {
  const pos = new Float32Array(malla.pos);
  for (let i = 0; i < pos.length; i += 3) { pos[i] += dx; pos[i + 1] += dy; pos[i + 2] += dz; }
  return { pos, tri: malla.tri };
}

export function cajaDeMalla(malla) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < malla.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = malla.pos[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

// ---------- Formas 2D ----------

// Rectángulo con esquinas redondeadas, centrado en (cx, cy).
export function rectRedondeado(ancho, alto, radio, cx = 0, cy = 0) {
  const r = Math.max(0, Math.min(radio, ancho / 2 - 1e-3, alto / 2 - 1e-3));
  const x0 = cx - ancho / 2, x1 = cx + ancho / 2, y0 = cy - alto / 2, y1 = cy + alto / 2;
  const s = new THREE.Shape();
  if (r <= 0) {
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    return s;
  }
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r);
  s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1);
  s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r);
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function agujeroCircular(cx, cy, radio) {
  const p = new THREE.Path();
  p.absarc(cx, cy, radio, 0, Math.PI * 2, true);
  return p;
}

// Extruye una forma de z0 a z1.
export function extruir(formas, z0, z1, segmentos = 10) {
  const lista = Array.isArray(formas) ? formas : [formas];
  if (!lista.length || z1 - z0 <= 0) return { pos: new Float32Array(0), tri: new Uint32Array(0) };
  const g = new THREE.ExtrudeGeometry(lista, { depth: z1 - z0, bevelEnabled: false, curveSegments: segmentos, steps: 1 });
  g.translate(0, 0, z0);
  return geometriaAMalla(g);
}

// ---------- Texto ----------

export function aplicarMayusculas(texto, modo) {
  if (modo === 'mayus') return texto.toLocaleUpperCase('es-AR');
  if (modo === 'minus') return texto.toLocaleLowerCase('es-AR');
  return texto;
}

// Pasa los comandos de un camino de opentype (Y hacia abajo) a formas de
// three (Y hacia arriba), corridas (dx, dy).
function formasDeCamino(camino, dx, dy) {
  const sp = new THREE.ShapePath();
  for (const c of camino.commands) {
    const x = c.x + dx, y = -c.y + dy;
    if (c.type === 'M') sp.moveTo(x, y);
    else if (c.type === 'L') sp.lineTo(x, y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1 + dx, -c.y1 + dy, x, y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1 + dx, -c.y1 + dy, c.x2 + dx, -c.y2 + dy, x, y);
    else if (c.type === 'Z') sp.currentPath?.closePath();
  }
  // Al invertir Y los contornos externos de TrueType quedan antihorarios.
  return sp.toShapes(false);
}

// ---------- Polígonos (Clipper) ----------

const E = 1000; // Clipper trabaja con enteros: 1 unidad = 0,001 mm.
export const ESCALA_CLIPPER = E;
const aClipper = (pts) => pts.map((q) => ({ X: Math.round(q.x * E), Y: Math.round(q.y * E) }));
const aPuntos = (camino) => camino.map((q) => new THREE.Vector2(q.X / E, q.Y / E));

// Formas de three como caminos de Clipper: contornos externos antihorarios y
// huecos horarios.
function formasACaminos(formas) {
  const caminos = [];
  for (const f of formas) {
    const { shape, holes } = f.extractPoints(12);
    const ext = aClipper(shape);
    if (!Clipper.Clipper.Orientation(ext)) ext.reverse();
    caminos.push(ext);
    for (const h of holes) {
      const hu = aClipper(h);
      if (Clipper.Clipper.Orientation(hu)) hu.reverse();
      caminos.push(hu);
    }
  }
  return caminos;
}

// Desplaza los contornos `delta` mm hacia afuera (o adentro, si es negativo).
// Une de paso los que se pisan.
export function desplazarCaminos(caminos, delta) {
  const co = new Clipper.ClipperOffset(2, 0.025 * E);
  co.AddPaths(caminos, Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
  const resultado = [];
  co.Execute(resultado, delta * E);
  return resultado;
}

function operarCaminos(tipo, sujeto, recorte) {
  const c = new Clipper.Clipper();
  c.AddPaths(sujeto, Clipper.PolyType.ptSubject, true);
  c.AddPaths(recorte, Clipper.PolyType.ptClip, true);
  const arbol = new Clipper.PolyTree();
  c.Execute(tipo, arbol, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
  return Clipper.Clipper.PolyTreeToPaths(arbol);
}

export const unirCaminos = (a, b) => operarCaminos(Clipper.ClipType.ctUnion, a, b);
export const restarCaminos = (a, b) => operarCaminos(Clipper.ClipType.ctDifference, a, b);
export const interseccionCaminos = (a, b) => operarCaminos(Clipper.ClipType.ctIntersection, a, b);
export const areaCamino = (c) => Clipper.Clipper.Area(c);
export const esHueco = (c) => !Clipper.Clipper.Orientation(c);
export const areaInterseccion = (a, b) => operarCaminos(Clipper.ClipType.ctIntersection, a, b)
  .reduce((suma, c) => suma + Math.abs(Clipper.Clipper.Area(c)), 0);

// Caminos de Clipper de vuelta a formas de three (con sus huecos).
export function caminosAFormas(caminos) {
  const c = new Clipper.Clipper();
  // Polígonos estrictamente simples (sin vértices que se toquen): si no, el
  // triangulado de three puede dejar triángulos sin dibujar en piezas con muchos huecos.
  c.StrictlySimple = true;
  c.AddPaths(caminos, Clipper.PolyType.ptSubject, true);
  const arbol = new Clipper.PolyTree();
  c.Execute(Clipper.ClipType.ctUnion, arbol, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
  const resultado = [];
  const recorrer = (nodo) => {
    const forma = new THREE.Shape(aPuntos(nodo.Contour()));
    for (const hueco of nodo.Childs()) {
      forma.holes.push(new THREE.Path(aPuntos(hueco.Contour())));
      hueco.Childs().forEach(recorrer);
    }
    resultado.push(forma);
  };
  arbol.Childs().forEach(recorrer);
  return resultado;
}

// Quita los puntos que quedan a menos de 0,02 mm de otro: la unión de curvas
// deja tramos diminutos que, al extruir, hacen triángulos casi sin ancho y
// complican la resta 3D.
export const limpiarCaminos = (caminos) => Clipper.Clipper.CleanPolygons(caminos, 0.02 * E);

export function cajaDeCaminos(caminos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of caminos) for (const q of c) {
    if (q.X < x0) x0 = q.X;
    if (q.X > x1) x1 = q.X;
    if (q.Y < y0) y0 = q.Y;
    if (q.Y > y1) y1 = q.Y;
  }
  return { x0: x0 / E, y0: y0 / E, x1: x1 / E, y1: y1 / E };
}

export function discoCamino(cx, cy, radio, lados = 64) {
  const pts = [];
  for (let i = 0; i < lados; i++) {
    const a = (Math.PI * 2 * i) / lados;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * radio, cy + Math.sin(a) * radio));
  }
  return aClipper(pts);
}

// Engrosa (o afina, con valor negativo) las formas `delta` mm hacia cada lado.
export function engrosarFormas(formas, delta) {
  if (!formas.length || !delta) return formas;
  return caminosAFormas(desplazarCaminos(formasACaminos(formas), delta));
}

// Texto de un nombre como formas centradas en (0, 0). Devuelve también el
// tamaño que ocupa. Si `dividir`, cada palabra va en su línea.
export function textoAFormas(fuente, texto, alturaLetra, engrosar = 0) {
  const upm = fuente.unitsPerEm || 1000;
  const alturaMayus = (fuente.tables?.os2?.sCapHeight || upm * 0.7) / upm;
  const tam = alturaLetra / alturaMayus;
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return { formas: [], ancho: 0, alto: 0 };
  const interlineado = alturaLetra * 1.35;
  const piezas = lineas.map((l) => {
    const camino = fuente.getPath(l, 0, 0, tam);
    return { camino, caja: camino.getBoundingBox() };
  });
  const altoTotal = alturaLetra + interlineado * (lineas.length - 1);
  const formas = [];
  let anchoMax = 0;
  piezas.forEach(({ camino, caja }, i) => {
    const w = caja.x2 - caja.x1;
    anchoMax = Math.max(anchoMax, w);
    const dx = -(caja.x1 + caja.x2) / 2;
    // Línea i: la primera arriba. Se centra por la altura de mayúscula.
    const yBase = altoTotal / 2 - alturaLetra - interlineado * i;
    formas.push(...formasDeCamino(camino, dx, yBase));
  });
  // Engrosar agranda el texto medio engrosar hacia cada lado.
  const e = Math.max(0, engrosar || 0);
  return { formas: engrosarFormas(formas, e / 2), ancho: anchoMax + e, alto: altoTotal + e };
}

// ---------- Llavero ----------

function textoDe(nombre, p) {
  let t = aplicarMayusculas(nombre, p.mayusculas).trim();
  if (p.dividirLineas) t = t.split(/\s+/).join('\n');
  return t;
}

// Un llavero: placa con agujero para la argolla, letras en relieve y borde
// levantado. Devuelve las mallas por color, centradas con la esquina
// inferior izquierda en (0, 0), y el tamaño de la placa.
// Llavero "contorno" / "doble": la base sigue la silueta de las letras
// (desplazada `margen`) con la argolla pegada del lado izquierdo, como un
// llavero troquelado. El texto queda en (0, 0) y todo se corre al final para
// que la esquina inferior izquierda sea (0, 0).
function armarLlaveroSilueta(formas, p) {
  const radioAg = p.agujero / 2;
  const radioAnillo = radioAg + Math.max(1.5, p.grosorBorde + 0.4);
  const letras = formasACaminos(formas);
  const silueta = desplazarCaminos(letras, p.margen);
  const cajaS = cajaDeCaminos(silueta);
  const cy = (cajaS.y0 + cajaS.y1) / 2;

  // La argolla se acerca desde la izquierda hasta pisar la silueta lo
  // bastante como para que quede bien unida (las letras tienen huecos
  // y puntas, así que no alcanza con pegarla a la caja).
  const areaDisco = Math.PI * radioAnillo * radioAnillo * E * E;
  let cx = cajaS.x0 - radioAnillo;
  while (cx < cajaS.x1) {
    if (areaInterseccion([discoCamino(cx, cy, radioAnillo)], silueta) >= areaDisco * 0.3) break;
    cx += 0.5;
  }
  if (cx >= cajaS.x1) cx = cajaS.x0;

  const conAnillo = unirCaminos(silueta, [discoCamino(cx, cy, radioAnillo)]);
  const base = restarCaminos(conAnillo, [discoCamino(cx, cy, radioAg, 48)]);
  const banda = p.estilo === 'doble' ? restarCaminos(desplazarCaminos(conAnillo, p.grosorBorde), conAnillo) : [];
  const caja = cajaDeCaminos(p.estilo === 'doble' ? [...conAnillo, ...banda] : conAnillo);
  const mover = (m) => moverMalla(m, -caja.x0, -caja.y0, 0);
  const vacia = { pos: new Float32Array(0), tri: new Uint32Array(0) };
  return {
    fondo: mover(extruir(caminosAFormas(base), 0, p.grosorBase)),
    letras: mover(extruir(formas, p.grosorBase, p.grosorBase + p.reliveLetras)),
    borde: banda.length ? mover(extruir(caminosAFormas(banda), 0, p.grosorBase)) : vacia,
    ancho: caja.x1 - caja.x0,
    alto: caja.y1 - caja.y0
  };
}

export function armarLlavero(fuente, nombre, p) {
  const { formas, ancho: aTexto, alto: hTexto } = textoAFormas(fuente, textoDe(nombre, p), p.alturaLetra, p.engrosar);
  if (estiloSigueLetras(p.estilo) && formas.length) return armarLlaveroSilueta(formas, p);
  const radioAg = p.agujero / 2;
  const pared = Math.max(1.2, p.grosorBorde + 0.6);
  const bordeTotal = p.estilo === 'marco' ? p.grosorBorde : 0;
  const anchoAnillo = p.agujero + pared * 2;
  const ancho = Math.max(aTexto + p.margen * 2 + bordeTotal * 2 + anchoAnillo, anchoAnillo + 6);
  const alto = Math.max(hTexto + p.margen * 2 + bordeTotal * 2, p.alturaFija || 0, p.agujero + pared * 2);
  // La placa va de (0,0) a (ancho,alto); el agujero queda a la izquierda.
  const cx = ancho / 2, cy = alto / 2;
  const placa = rectRedondeado(ancho, alto, p.esquinas, cx, cy);
  placa.holes.push(agujeroCircular(bordeTotal + pared + radioAg, cy, radioAg));
  const fondo = extruir(placa, 0, p.grosorBase);

  // Texto centrado en el área libre a la derecha del agujero.
  const x0 = bordeTotal + pared * 2 + p.agujero;
  const xt = x0 + (ancho - bordeTotal - x0) / 2;
  const letras = extruir(formas, p.grosorBase, p.grosorBase + p.reliveLetras);
  const letrasMovidas = moverMalla(letras, xt, cy, 0);

  const mallasBorde = [];
  const anillo = (retroceso, grosor) => {
    const ext = rectRedondeado(ancho - retroceso * 2, alto - retroceso * 2, Math.max(0.2, p.esquinas - retroceso), cx, cy);
    const inte = rectRedondeado(ancho - (retroceso + grosor) * 2, alto - (retroceso + grosor) * 2, Math.max(0.1, p.esquinas - retroceso - grosor), cx, cy);
    ext.holes.push(new THREE.Path(inte.getPoints(8).reverse()));
    // El agujero de la argolla no se tapa con el borde.
    return extruir(ext, p.grosorBase, p.grosorBase + p.reliveLetras);
  };
  if (p.estilo === 'marco') mallasBorde.push(anillo(0, p.grosorBorde));
  return {
    fondo,
    letras: letrasMovidas,
    borde: mallasBorde.length ? unirMallas(mallasBorde) : { pos: new Float32Array(0), tri: new Uint32Array(0) },
    ancho,
    alto
  };
}

// ---------- Nombre para lápiz ----------

// Sección del tubo vista de frente (Y ancho, Z alto): cuadrado de esquinas
// redondeadas con el agujero del lápiz.
// Contorno del agujero del lápiz visto de frente (Y ancho, Z alto), centrado
// en la altura lado / 2: círculo, o círculo con punta a 45° arriba (se imprime
// sin soportes; se recorre de 135° a 405° por abajo y se cierra en la punta).
function puntosAgujeroLapiz(p, lado) {
  const r = p.diametroLapiz / 2;
  const pts = [];
  if (p.formaAgujero === 'techo') {
    for (let i = 0; i <= 48; i++) {
      const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 48;
      pts.push(new THREE.Vector2(Math.cos(a) * r, lado / 2 + Math.sin(a) * r));
    }
    pts.push(new THREE.Vector2(0, lado / 2 + r * Math.SQRT2));
  } else {
    for (let i = 0; i < 64; i++) {
      const a = (Math.PI * 2 * i) / 64;
      pts.push(new THREE.Vector2(Math.cos(a) * r, lado / 2 + Math.sin(a) * r));
    }
  }
  return pts;
}

function seccionLapiz(p, conAgujero, radioEsquina = null) {
  const d = p.diametroLapiz;
  const lado = d + p.paredLapiz * 2;
  const radio = radioEsquina ?? Math.min(lado / 2 - 0.1, p.paredLapiz + 1.5);
  const s = rectRedondeado(lado, lado, radio, 0, lado / 2);
  if (conAgujero) s.holes.push(new THREE.Path(puntosAgujeroLapiz(p, lado)));
  return { s, lado };
}

// Extruye la sección a lo largo de X (de x0 a x1).
function tuboX(forma, x0, x1) {
  const m = extruir(forma, 0, x1 - x0);
  // La extrusión va por Z: se gira para que el largo quede en X.
  const pos = new Float32Array(m.pos.length);
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    pos[i] = x0 + z; pos[i + 1] = x; pos[i + 2] = y;
  }
  // El giro (x,y,z) -> (z,x,y) conserva el sentido de los triángulos.
  return { pos, tri: m.tri };
}

const rectCamino = (x0, y0, x1, y1) => aClipper([
  new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)
]);

// Pastilla (rectángulo con los extremos en semicírculo) de x0 a x1 y alto 2 × radio, centrada en y = 0.
function pastillaCamino(x0, x1, radio) {
  const r = Math.max(0.1, Math.min(radio, (x1 - x0) / 2));
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 24;
    pts.push(new THREE.Vector2(x1 - r + Math.cos(a) * r, Math.sin(a) * radio));
  }
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 24;
    pts.push(new THREE.Vector2(x0 + r + Math.cos(a) * r, Math.sin(a) * radio));
  }
  return aClipper(pts);
}

function geometriaDeMalla(malla) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(malla.pos), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(malla.tri), 1));
  g.computeVertexNormals();
  return g;
}

// Resta de mallas 3D (a menos b).
function restarMallas(a, b) {
  const evaluador = new Evaluator();
  evaluador.attributes = ['position', 'normal'];
  const ba = new Brush(geometriaDeMalla(a));
  const bb = new Brush(geometriaDeMalla(b));
  ba.updateMatrixWorld();
  bb.updateMatrixWorld();
  const resultado = evaluador.evaluate(ba, bb, SUBTRACTION);
  const g = resultado.geometry.index ? resultado.geometry.toNonIndexed() : resultado.geometry;
  const malla = soldarCercanos(g.getAttribute('position').array);
  resultado.geometry.dispose();
  return malla;
}

// Nombre para lápiz "contorno": el cuerpo sigue la silueta de las letras y el
// lápiz lo atraviesa a lo largo, por el centro del texto. Se arma con la
// silueta unida a una pastilla (para que siempre haya pared alrededor del
// lápiz) y se le resta el cilindro del lápiz.
function armarLapizSilueta(formas, p) {
  const lado = p.diametroLapiz + p.paredLapiz * 2;
  const mitad = lado / 2;
  const silueta = desplazarCaminos(formasACaminos(formas), p.margen);
  const cajaS = cajaDeCaminos(silueta);
  // La pastilla va de punta a punta de la silueta dentro de la franja del lápiz.
  const enFranja = operarCaminos(Clipper.ClipType.ctIntersection, silueta, [rectCamino(cajaS.x0 - 1, -mitad, cajaS.x1 + 1, mitad)]);
  const cajaF = enFranja.length ? cajaDeCaminos(enFranja) : cajaS;
  const x0 = cajaF.x0, x1 = cajaF.x1;
  const planta = limpiarCaminos(unirCaminos(silueta, [pastillaCamino(x0, x1, mitad)]));
  const caja = cajaDeCaminos(planta);

  const cuerpo = extruir(caminosAFormas(planta), 0, lado);
  // El cilindro del lápiz sobresale por los extremos, salvo el que lleva tope.
  const tapa = p.tope === 'abierto' ? 0 : Math.min(p.paredLapiz, (x1 - x0) / 3);
  const desde = p.tope === 'inicio' ? x0 + tapa : x0 - 1;
  const hasta = p.tope === 'final' ? x1 - tapa : x1 + 1;
  const agujero = tuboX(new THREE.Shape(puntosAgujeroLapiz(p, lado)), desde, hasta);
  const fondo = restarMallas(cuerpo, agujero);

  const mover = (m) => moverMalla(m, -caja.x0, -caja.y0, 0);
  return {
    fondo: mover(fondo),
    letras: mover(extruir(formas, lado, lado + p.reliveLetras)),
    borde: { pos: new Float32Array(0), tri: new Uint32Array(0) },
    ancho: caja.x1 - caja.x0,
    alto: caja.y1 - caja.y0,
    textoMasAltoQuePieza: false
  };
}

// Componentes (contornos externos) de un conjunto de polígonos.
function componentes(caminos) {
  const c = new Clipper.Clipper();
  c.AddPaths(caminos, Clipper.PolyType.ptSubject, true);
  const arbol = new Clipper.PolyTree();
  c.Execute(Clipper.ClipType.ctUnion, arbol, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
  return arbol.Childs().map((n) => ({ ...cajaDeCaminos([n.Contour()]), contorno: n.Contour() }));
}

// Une los bloques sueltos con puentes finos entre sus puntos más cercanos,
// de a uno, hasta que quede una sola pieza. Así se rellena lo mínimo (una
// franja entera taparía los huecos de las letras).
function unirConPuentes(planta, ancho, maxPuentes = 40) {
  let actual = planta;
  for (let i = 0; i < maxPuentes; i++) {
    const bloques = componentes(actual);
    if (bloques.length <= 1) break;
    const principal = bloques[0].contorno;
    let mejor = null;
    for (const otro of bloques.slice(1)) {
      for (const a of principal) {
        for (const b of otro.contorno) {
          const d = (a.X - b.X) ** 2 + (a.Y - b.Y) ** 2;
          if (!mejor || d < mejor.d) mejor = { d, a, b };
        }
      }
    }
    const co = new Clipper.ClipperOffset(2, 0.025 * E);
    co.AddPath([mejor.a, mejor.b], Clipper.JoinType.jtRound, Clipper.EndType.etOpenRound);
    const puente = [];
    co.Execute(puente, (ancho / 2) * E);
    actual = unirCaminos(actual, puente);
  }
  return actual;
}

// Área neta de un conjunto de polígonos (los huecos restan), en mm².
export function areaDeCaminos(caminos) {
  const c = new Clipper.Clipper();
  c.AddPaths(caminos, Clipper.PolyType.ptSubject, true);
  const resultado = [];
  c.Execute(Clipper.ClipType.ctUnion, resultado, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
  return resultado.reduce((suma, camino) => suma + Clipper.Clipper.Area(camino), 0) / (E * E);
}

// Letras del nombre una por una, todas del mismo tamaño y pegadas entre sí,
// centradas en altura sobre y = 0 (por donde pasa el lápiz). Cada letra se
// corre para que su borde izquierdo pise `solape` mm a la anterior. Devuelve
// una lista con las formas de cada letra.
export function letrasUnidas(fuente, texto, altura, solape) {
  const upm = fuente.unitsPerEm || 1000;
  const mayus = (fuente.tables?.os2?.sCapHeight || upm * 0.7) / upm;
  const tam = altura / mayus;
  const letras = [];
  let derecha = null; // borde derecho de la letra anterior
  for (const ch of Array.from(texto)) {
    if (/\s/.test(ch)) { // un espacio corta el pegado: avanza el ancho del espacio
      if (derecha !== null) derecha += fuente.getAdvanceWidth(' ', tam);
      continue;
    }
    const camino = fuente.getPath(ch, 0, 0, tam);
    if (!camino.commands.length) continue;
    const caja = camino.getBoundingBox();
    const izq = derecha === null ? 0 : derecha - solape;
    letras.push(formasDeCamino(camino, izq - caja.x1, -altura / 2));
    derecha = izq + (caja.x2 - caja.x1);
  }
  return letras;
}

// Planta (polígonos de Clipper) del cuerpo de letras unidas, o null si el
// nombre no tiene letras. `piezas` es cuántos bloques sueltos quedaron y
// `plantaAlta` es lo que ocupan las letras que sobresalen en altura (las 1.ª,
// 3.ª, 5.ª…).
// Las letras se engrosan poco, para no tapar los huecos de la E, la A, etc.;
// si quedan separadas, se las une con puentes finos entre los puntos más
// cercanos.
export function plantaLetrasUnidas(fuente, nombre, p) {
  const lado = p.diametroLapiz + p.paredLapiz * 2;
  const mitad = lado / 2;
  // Las letras tienen que ser lo bastante altas (en planta) para rodear al lápiz.
  const alturaMinima = lado + 1;
  // Sin elegir mayúsculas o minúsculas, van en mayúsculas: las minúsculas son
  // bajas y no alcanzan a rodear al lápiz.
  const texto = textoDe(nombre, { ...p, mayusculas: p.mayusculas === 'como' ? 'mayus' : p.mayusculas }).replace(/\n/g, ' ');
  const letras = letrasUnidas(fuente, texto, Math.max(p.alturaLetra, alturaMinima), 0.5);
  if (!letras.length) return null;
  const grosor = 0.4 + p.engrosar / 2;
  let planta = desplazarCaminos(formasACaminos(letras.flat()), grosor);
  const altas = letras.filter((_, i) => i % 2 === 0).flat();
  const plantaAlta = limpiarCaminos(desplazarCaminos(formasACaminos(altas), grosor));

  planta = unirConPuentes(planta, 3);
  // Si algo sigue suelto, una pastilla del ancho del tubo de punta a punta.
  if (componentes(planta).length > 1) {
    const caja = cajaDeCaminos(planta);
    planta = unirCaminos(planta, [pastillaCamino(caja.x0, caja.x1, mitad)]);
  }
  planta = limpiarCaminos(planta);
  return { planta, plantaAlta, piezas: componentes(planta).length };
}

// Nombre para lápiz "letras unidas": el cuerpo son las propias letras,
// gruesas y pegadas, de la altura del tubo, con el agujero del lápiz al medio.
// Si las letras son bajas para rodear al lápiz, se agrandan lo necesario.
function armarLapizLetras(fuente, nombre, p) {
  const lado = p.diametroLapiz + p.paredLapiz * 2;
  const mitad = lado / 2;
  const resultado = plantaLetrasUnidas(fuente, nombre, p);
  if (!resultado) return armarLapizSilueta(textoAFormas(fuente, textoDe(nombre, p), p.alturaLetra, p.engrosar).formas, p);
  const { planta, plantaAlta } = resultado;
  const caja = cajaDeCaminos(planta);
  const enFranja = operarCaminos(Clipper.ClipType.ctIntersection, planta, [rectCamino(caja.x0 - 1, -mitad, caja.x1 + 1, mitad)]);
  const cajaF = enFranja.length ? cajaDeCaminos(enFranja) : caja;
  const x0 = cajaF.x0, x1 = cajaF.x1;
  const tapa = p.tope === 'abierto' ? 0 : Math.min(p.paredLapiz, (x1 - x0) / 3);
  const desde = p.tope === 'inicio' ? x0 + tapa : x0 - 1;
  const hasta = p.tope === 'final' ? x1 - tapa : x1 + 1;
  const cuerpo = extruir(caminosAFormas(planta), 0, lado);
  const agujero = tuboX(new THREE.Shape(puntosAgujeroLapiz(p, lado)), desde, hasta);
  const vacia = { pos: new Float32Array(0), tri: new Uint32Array(0) };
  // Todas las letras tienen la altura del tubo (para rodear al lápiz); las
  // impares suman `desnivel` mm más arriba, en Z. El agujero no llega a esa
  // parte, así que se resta sólo de la base.
  const base = restarMallas(cuerpo, agujero);
  const tapas = p.desnivel > 0 && plantaAlta.length ? extruir(caminosAFormas(plantaAlta), lado, lado + p.desnivel) : vacia;
  return {
    fondo: vacia,
    letras: moverMalla(unirMallas([base, tapas]), -caja.x0, -caja.y0, 0),
    borde: vacia,
    ancho: caja.x1 - caja.x0,
    alto: caja.y1 - caja.y0,
    textoMasAltoQuePieza: false
  };
}

export function armarLapiz(fuente, nombre, p) {
  if (p.estilo === 'letras') return armarLapizLetras(fuente, nombre, p);
  const { formas, ancho: aTexto, alto: hTexto } = textoAFormas(fuente, textoDe(nombre, p), p.alturaLetra, p.engrosar);
  if (estiloSigueLetras(p.estilo) && formas.length) return armarLapizSilueta(formas, p);
  const { s: seccionHueca, lado } = seccionLapiz(p, true);
  const { s: seccionMaciza } = seccionLapiz(p, false);
  const margen = p.margen;
  const largo = Math.max(aTexto + margen * 2, 18);
  const tapa = p.tope === 'abierto' ? 0 : Math.min(p.paredLapiz, largo / 3);
  const partes = [];
  if (p.tope === 'final') {
    partes.push(tuboX(seccionHueca, 0, largo - tapa));
    partes.push(tuboX(seccionMaciza, largo - tapa, largo));
  } else if (p.tope === 'inicio') {
    partes.push(tuboX(seccionMaciza, 0, tapa));
    partes.push(tuboX(seccionHueca, tapa, largo));
  } else {
    partes.push(tuboX(seccionHueca, 0, largo));
  }
  // Se centra en Y (queda de -lado/2 a lado/2); lo llevamos a 0..lado.
  const fondo = moverMalla(unirMallas(partes), 0, lado / 2, 0);
  const letras = moverMalla(extruir(formas, lado, lado + p.reliveLetras), largo / 2, lado / 2, 0);
  // El texto es más alto que el lado plano? Se avisa en la interfaz.
  return {
    fondo,
    letras,
    borde: { pos: new Float32Array(0), tri: new Uint32Array(0) },
    ancho: largo,
    alto: lado,
    textoMasAltoQuePieza: hTexto > lado - 1
  };
}

// ---------- Conjunto ----------

// Arma todos los nombres, los acomoda en una grilla y devuelve un cuerpo por
// color: [{ id, nombre, color, malla }] (los vacíos se omiten).
export function armarConjunto(fuente, p) {
  const entradas = p.nombres.map((n, i) => ({ nombre: n.trim(), indice: i })).filter((e) => e.nombre);
  if (!entradas.length) return { cuerpos: [], ancho: 0, alto: 0, avisos: [] };
  const arma = p.modo === 'lapiz' ? armarLapiz : armarLlavero;
  const piezas = entradas.map((e) => arma(fuente, e.nombre, p));
  const columnas = Math.max(1, Math.min(p.columnas || 1, piezas.length));
  const filas = Math.ceil(piezas.length / columnas);
  const anchoCol = Array.from({ length: columnas }, (_, c) => Math.max(...piezas.filter((_, i) => i % columnas === c).map((x) => x.ancho)));
  const altoFila = Array.from({ length: filas }, (_, f) => Math.max(...piezas.slice(f * columnas, f * columnas + columnas).map((x) => x.alto)));
  const sep = p.separacion;
  // Una pieza por parte y color: con colores distintos por nombre, los
  // nombres que comparten color van juntos. Con cambio de filamento a mano el
  // borde se imprime junto con las letras.
  const grupos = new Map();
  piezas.forEach((pz, i) => {
    const c = i % columnas, f = Math.floor(i / columnas);
    const x = anchoCol.slice(0, c).reduce((a, b) => a + b + sep, 0);
    // La primera fila arriba.
    const y = altoFila.slice(f + 1).reduce((a, b) => a + b + sep, 0);
    const colores = (p.colorPorNombre && p.coloresNombres[entradas[i].indice]) || p.colores;
    for (const clave of ['fondo', 'letras', 'borde']) {
      if (!pz[clave].tri.length) continue;
      // Con cambio de filamento hay dos colores: el marco levantado sale con las
      // letras y la banda del doble contorno (a la altura de la base) con el fondo.
      const aDondeVa = p.impresora === 'pausa' && clave === 'borde' ? (p.estilo === 'doble' ? 'fondo' : 'letras') : clave;
      const parte = aDondeVa;
      const color = (aDondeVa !== clave ? colores[aDondeVa] : colores[clave]) || '#cccccc';
      const llave = `${parte}|${color.toLowerCase()}`;
      if (!grupos.has(llave)) grupos.set(llave, { parte, color, mallas: [] });
      grupos.get(llave).mallas.push(moverMalla(pz[clave], x, y, 0));
    }
  });
  const etiquetas = { fondo: 'Fondo', letras: 'Letras', borde: 'Borde' };
  const variosColores = (parte) => [...grupos.values()].filter((g) => g.parte === parte).length > 1;
  const cuerpos = [...grupos.values()]
    .sort((a, b) => ['fondo', 'letras', 'borde'].indexOf(a.parte) - ['fondo', 'letras', 'borde'].indexOf(b.parte))
    .map((g) => ({
      id: `${g.parte}-${g.color.replace('#', '')}`,
      nombre: variosColores(g.parte) ? `${etiquetas[g.parte]} ${g.color.toLowerCase()}` : etiquetas[g.parte],
      color: g.color,
      malla: unirMallas(g.mallas)
    }));
  const ancho = anchoCol.reduce((a, b) => a + b, 0) + sep * (columnas - 1);
  const alto = altoFila.reduce((a, b) => a + b, 0) + sep * (filas - 1);
  const avisos = [];
  if (piezas.some((x) => x.textoMasAltoQuePieza)) avisos.push('Algún nombre tiene varias líneas y queda más alto que la cara plana del lápiz.');
  return { cuerpos, ancho, alto, avisos };
}

// Avisa si el conjunto no entra en la cama de la impresora.
export function entraEnCama(ancho, alto, cama) {
  if (ancho <= cama.x && alto <= cama.y) return { entra: true, rotar: false };
  if (ancho <= cama.y && alto <= cama.x) return { entra: false, rotar: true };
  return { entra: false, rotar: false };
}

// ---------- Medidas ----------

export const ALTURAS_CAPA = [0.08, 0.12, 0.16, 0.2, 0.28];

const LIMITES = {
  alturaLetra: [3, 80], grosorBase: [0.4, 20], reliveLetras: [0.2, 10], margen: [0.5, 30],
  esquinas: [0, 20], agujero: [2, 15], grosorBorde: [0.4, 6], separacion: [0, 50],
  alturaFija: [0, 200], engrosar: [0, 2], desnivel: [0, 20], diametroLapiz: [3, 20], paredLapiz: [0.8, 8], columnas: [1, 12]
};

const acotar = (v, [min, max]) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : min));

// Deja los parámetros dentro de rangos que arman una pieza válida (un campo
// vacío o en 0 no rompe la geometría) y ajusta los grosores a un múltiplo de
// la altura de capa para que el slicer no redondee a otra cosa.
export function sanearParametros(p, alturaCapa = 0) {
  const s = { ...p };
  for (const [k, lim] of Object.entries(LIMITES)) s[k] = acotar(p[k], lim);
  if (s.modo !== 'lapiz' && s.estilo === 'letras') s.estilo = 'contorno';
  if (alturaCapa > 0) {
    const multiplo = (v) => Math.max(alturaCapa, Math.round(v / alturaCapa) * alturaCapa);
    s.grosorBase = Math.round(multiplo(s.grosorBase) * 1000) / 1000;
    s.reliveLetras = Math.round(multiplo(s.reliveLetras) * 1000) / 1000;
  }
  if (s.impresora === 'pausa') {
    // Con un solo cambio de filamento hay dos colores: fondo y relieve.
    s.colores = { ...s.colores, borde: p.estilo === 'doble' ? s.colores.fondo : s.colores.letras };
    s.colorPorNombre = false;
  }
  return s;
}

// Indicaciones para imprimir con cambio de filamento a mano: a qué altura (y
// en qué capa) pausar para pasar del color del fondo al de las letras.
export function infoPausa(p, alturaCapa) {
  const z = p.grosorBase;
  const capas = alturaCapa > 0 ? Math.round(z / alturaCapa) : null;
  return { altura: z, capasHechas: capas };
}
