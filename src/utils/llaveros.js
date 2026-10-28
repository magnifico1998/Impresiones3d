// Generador de llaveros y nombres para lápiz. Arma las piezas (fondo, letras y
// borde, una por color) como mallas { pos, tri } en milímetros, con Z hacia
// arriba y la cara de abajo apoyada en z = 0, listas para exportar.
// El texto se vuelve geometría con una fuente de opentype.js ya cargada; este
// módulo no toca el navegador, así que se prueba en Node.
import * as THREE from 'three';
import ClipperNs from 'clipper-lib';
import { soldar } from './mallas3d';

// clipper-lib exporta distinto según el empaquetador.
const Clipper = ClipperNs.ClipperOffset ? ClipperNs : ClipperNs.ClipperLib || ClipperNs.default;

export const MODOS = [
  { id: 'llavero', nombre: 'Llavero' },
  { id: 'lapiz', nombre: 'Nombre para lápiz' }
];

export const ESTILOS_BORDE = [
  { id: 'placa', nombre: 'Placa' },
  { id: 'contorno', nombre: 'Contorno' },
  { id: 'doble', nombre: 'Doble' }
];

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

export const PARAMETROS_INICIALES = Object.freeze({
  modo: 'llavero',
  nombres: ['Valentina'],
  mayusculas: 'como', // como | mayus | minus
  dividirLineas: false,
  columnas: 1,
  separacion: 4,
  alturaFija: 0,
  engrosar: 0,
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
  colores: { fondo: '#2f6fdb', letras: '#ffffff', borde: '#f2b705' },
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
function extruir(formas, z0, z1, segmentos = 10) {
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

// Engrosa (o afina, con valor negativo) las formas `delta` mm hacia cada lado.
// Une de paso los contornos que se pisan (letras cursivas que se tocan).
export function engrosarFormas(formas, delta) {
  if (!formas.length || !delta) return formas;
  const E = 1000;
  const co = new Clipper.ClipperOffset(2, 0.25 * E * 0.1);
  const aClipper = (pts) => pts.map((q) => ({ X: Math.round(q.x * E), Y: Math.round(q.y * E) }));
  for (const f of formas) {
    const { shape, holes } = f.extractPoints(12);
    // Contorno externo antihorario y huecos horarios, como pide Clipper.
    const ext = aClipper(shape);
    if (!Clipper.Clipper.Orientation(ext)) ext.reverse();
    co.AddPath(ext, Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
    for (const h of holes) {
      const hu = aClipper(h);
      if (Clipper.Clipper.Orientation(hu)) hu.reverse();
      co.AddPath(hu, Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
    }
  }
  const arbol = new Clipper.PolyTree();
  co.Execute(arbol, delta * E);
  const aPuntos = (nodo) => nodo.Contour().map((q) => new THREE.Vector2(q.X / E, q.Y / E));
  const resultado = [];
  const recorrer = (nodo) => {
    const forma = new THREE.Shape(aPuntos(nodo));
    for (const hueco of nodo.Childs()) {
      forma.holes.push(new THREE.Path(aPuntos(hueco)));
      hueco.Childs().forEach(recorrer);
    }
    resultado.push(forma);
  };
  arbol.Childs().forEach(recorrer);
  return resultado;
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
export function armarLlavero(fuente, nombre, p) {
  const { formas, ancho: aTexto, alto: hTexto } = textoAFormas(fuente, textoDe(nombre, p), p.alturaLetra, p.engrosar);
  const radioAg = p.agujero / 2;
  const pared = Math.max(1.2, p.grosorBorde + 0.6);
  const bordeTotal = p.estilo === 'doble' ? p.grosorBorde * 2 + 0.6 : p.estilo === 'contorno' ? p.grosorBorde : 0;
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
  if (p.estilo === 'contorno') mallasBorde.push(anillo(0, p.grosorBorde));
  if (p.estilo === 'doble') {
    mallasBorde.push(anillo(0, p.grosorBorde));
    mallasBorde.push(anillo(p.grosorBorde + 0.6, p.grosorBorde));
  }
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
function seccionLapiz(p, conAgujero) {
  const d = p.diametroLapiz;
  const lado = d + p.paredLapiz * 2;
  const s = rectRedondeado(lado, lado, Math.min(lado / 2 - 0.1, p.paredLapiz + 1.5), 0, lado / 2);
  if (conAgujero) {
    const r = d / 2;
    let h;
    if (p.formaAgujero === 'techo') {
      // Círculo con punta a 45° arriba: se imprime sin soportes. Se recorre
      // de 135° a 405° (por abajo) y se cierra en la punta.
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 48;
        pts.push(new THREE.Vector2(Math.cos(a) * r, lado / 2 + Math.sin(a) * r));
      }
      pts.push(new THREE.Vector2(0, lado / 2 + r * Math.SQRT2));
      h = new THREE.Path(pts);
    } else {
      h = agujeroCircular(0, lado / 2, r);
    }
    s.holes.push(h);
  }
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

export function armarLapiz(fuente, nombre, p) {
  const { formas, ancho: aTexto, alto: hTexto } = textoAFormas(fuente, textoDe(nombre, p), p.alturaLetra, p.engrosar);
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
      const parte = p.impresora === 'pausa' && clave === 'borde' ? 'letras' : clave;
      const color = (p.impresora === 'pausa' && clave === 'borde' ? colores.letras : colores[clave]) || '#cccccc';
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
  alturaFija: [0, 200], engrosar: [0, 2], diametroLapiz: [3, 20], paredLapiz: [0.8, 8], columnas: [1, 12]
};

const acotar = (v, [min, max]) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : min));

// Deja los parámetros dentro de rangos que arman una pieza válida (un campo
// vacío o en 0 no rompe la geometría) y ajusta los grosores a un múltiplo de
// la altura de capa para que el slicer no redondee a otra cosa.
export function sanearParametros(p, alturaCapa = 0) {
  const s = { ...p };
  for (const [k, lim] of Object.entries(LIMITES)) s[k] = acotar(p[k], lim);
  if (alturaCapa > 0) {
    const multiplo = (v) => Math.max(alturaCapa, Math.round(v / alturaCapa) * alturaCapa);
    s.grosorBase = Math.round(multiplo(s.grosorBase) * 1000) / 1000;
    s.reliveLetras = Math.round(multiplo(s.reliveLetras) * 1000) / 1000;
  }
  if (s.impresora === 'pausa') {
    // Con un solo cambio de filamento hay dos colores: fondo y relieve.
    s.colores = { ...s.colores, borde: s.colores.letras };
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
