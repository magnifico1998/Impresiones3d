// Detalles del jarro (Fase 3 del plan en docs/plan-generador-jarros.md): EMBLEMAS (un símbolo sobre un respaldo, repetido
// alrededor del jarro) y AROS decorativos (bandas arriba y abajo, con remaches). Cada uno es una pieza que se puede
// imprimir aparte y encastrar en una cavidad del cuerpo, o ir pegada. Sin navegador: se prueba en Node.
//
// Los emblemas se arman PLANOS (X hacia la derecha, Y hacia arriba, Z hacia afuera, z = 0 es la superficie de la pared) y
// se ENVUELVEN sobre el jarro igual que el cartel. Los aros son sólidos de revolución que siguen la silueta.
import { caminosAFormas, desplazarCaminos, extruir, formasACaminos, restarCaminos, unirMallas } from './llaveros';
import { revolucion } from './mallasJarro';
import { caminosDeContornos, caminosDeSvg } from './svgSimbolo';
import { contornosDeJson } from './simbolosPropios';
import { RADIO_REMACHE, SOLAPE, capasConBisel, conTriangulos, contornoCartel, envolver, partir, poligono, remache } from './jarrosCartel';

const MAX_ARCO_RAD = 3.0;

// ---------- Símbolos ----------

const circulo = (cx, cy, r, n = 64) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
const aCaminos = (pts) => formasACaminos([poligono(pts)]);

// Cada símbolo es una función (tamaño en mm → caminos de Clipper) centrada en (0, 0), con ese alto.
export const SIMBOLOS = [
  {
    id: 'estrella', nombre: 'Estrella',
    caminos: (t) => aCaminos(Array.from({ length: 10 }, (_, i) => {
      const a = Math.PI / 2 + (Math.PI * i) / 5, r = i % 2 ? 0.2 : 0.5;
      return [t * r * Math.cos(a), t * (r * Math.sin(a) - 0.045)];
    }))
  },
  {
    id: 'corazon', nombre: 'Corazón',
    caminos: (t) => aCaminos(Array.from({ length: 72 }, (_, i) => {
      const a = (2 * Math.PI * i) / 72;
      const x = 16 * Math.sin(a) ** 3;
      const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
      return [(t * x) / 32, (t * (y + 2.5)) / 32];
    }))
  },
  {
    id: 'escudo', nombre: 'Escudo',
    caminos: (t) => {
      const pts = [[-0.4, 0.5], [0.4, 0.5]];
      for (let i = 0; i <= 24; i++) { const f = (Math.PI * i) / 24; pts.push([0.4 * Math.cos(f), 0.02 - 0.52 * Math.sin(f)]); }
      return aCaminos(pts.map(([x, y]) => [x * t, y * t]));
    }
  },
  {
    id: 'rayo', nombre: 'Rayo',
    caminos: (t) => aCaminos([[0.12, 0.5], [-0.26, -0.04], [-0.03, -0.04], [-0.14, -0.5], [0.27, 0.07], [0.03, 0.07], [0.26, 0.5]].map(([x, y]) => [x * t, y * t]))
  },
  {
    id: 'luna', nombre: 'Luna',
    caminos: (t) => restarCaminos(aCaminos(circulo(0, 0, 0.5 * t)), aCaminos(circulo(0.2 * t, 0.06 * t, 0.42 * t)))
  },
  { id: 'gota', nombre: 'Gota', caminos: (t) => aCaminos(gotaPuntos(t)) },
  {
    id: 'corona', nombre: 'Corona',
    caminos: (t) => aCaminos([[-0.5, -0.35], [0.5, -0.35], [0.5, 0.3], [0.25, 0.0], [0, 0.45], [-0.25, 0.0], [-0.5, 0.3]].map(([x, y]) => [x * t, y * t]))
  }
];
export const SIMBOLO_INICIAL = 'estrella';
export const SIMBOLO_SVG = 'svg'; // el dibujo que subió el usuario (`emblemaSvg`)
export const SIMBOLO_PROPIO = 'propio'; // un símbolo dibujado o de la biblioteca (`emblemaForma`, contornos en JSON)

// Gota: la punta arriba y un círculo abajo (los lados salen tangentes al círculo).
function gotaPuntos(t) {
  const cy = -0.16, r = 0.34, punta = 0.5;
  const alfa = Math.acos(r / (punta - cy)); // ángulo entre el eje y el punto donde la tangente toca el círculo
  const pts = [[0, punta]];
  for (let i = 0; i <= 48; i++) {
    const f = Math.PI / 2 - alfa - ((2 * Math.PI - 2 * alfa) * i) / 48;
    pts.push([r * Math.cos(f), cy + r * Math.sin(f)]);
  }
  return pts.map(([x, y]) => [x * t, y * t]);
}

// Formas del respaldo del emblema (las del cartel que quedan bien en una forma pareja) y "sin respaldo".
export const RESPALDOS = [
  { id: 'ovalo', nombre: 'Círculo' },
  { id: 'placa', nombre: 'Cuadrado' },
  { id: 'hexagono', nombre: 'Hexágono' },
  { id: 'etiqueta', nombre: 'Octógono' },
  { id: 'ninguno', nombre: 'Sin respaldo' }
];

// ---------- Emblemas ----------

let ultimaForma = null;
let ultimo = null;

// Caminos del símbolo elegido, con su lado mayor en `t` mm.
function caminosDelSimbolo(s, t) {
  if (s.emblemaSimbolo === SIMBOLO_SVG) return caminosDeSvg(s.emblemaSvg, t);
  if (s.emblemaSimbolo === SIMBOLO_PROPIO) return caminosDeContornos(contornosDeJson(s.emblemaForma), t);
  return (SIMBOLOS.find((x) => x.id === s.emblemaSimbolo) || SIMBOLOS[0]).caminos(t);
}

// Forma plana de UN emblema (todavía sin envolver): las partes y la cavidad. Z = 0 es la pared; la base va de -empotrado a
// grosor - empotrado.
export function formaEmblema(s, empotrado) {
  const t = s.emblemaTamano;
  const relieve = s.emblemaRelieve;
  const zAtras = -empotrado;
  const zArriba = s.emblemaGrosor - empotrado;
  const simbolo = caminosDelSimbolo(s, t);
  const planas = [];
  let contorno;
  let lado = t;
  if (s.emblemaRespaldo === 'ninguno') {
    // Sin respaldo: el símbolo mismo es la pieza.
    contorno = simbolo;
    const bisel = Math.max(0, Math.min(s.emblemaBisel, s.emblemaGrosor - 0.8, t / 6));
    planas.push({ id: 'simbolo', nombre: 'Símbolo', colorClave: 'simbolo', malla: capasConBisel(contorno, zAtras, zArriba, bisel) });
  } else {
    lado = t + 2 * s.emblemaMargen;
    contorno = formasACaminos([contornoCartel(s.emblemaRespaldo, lado, lado)]);
    const bisel = Math.max(0, Math.min(s.emblemaBisel, s.emblemaGrosor - 0.8, lado / 6));
    planas.push({ id: 'respaldo', nombre: 'Respaldo', colorClave: 'emblema', malla: capasConBisel(contorno, zAtras, zArriba, bisel) });
    if (s.emblemaBorde) {
      const superficie = desplazarCaminos(contorno, -bisel);
      const interior = desplazarCaminos(contorno, -(bisel + s.emblemaBordeAncho));
      const anillo = restarCaminos(superficie, interior);
      if (anillo.length) planas.push({ id: 'borde', nombre: 'Borde', colorClave: 'emblemaBorde', malla: extruir(caminosAFormas(anillo), zArriba - SOLAPE, zArriba + relieve) });
    }
    planas.push({ id: 'simbolo', nombre: 'Símbolo', colorClave: 'simbolo', malla: extruir(caminosAFormas(simbolo), zArriba - SOLAPE, zArriba + relieve) });
  }
  const partes = planas.filter((q) => conTriangulos(q.malla)).map((q) => ({ id: q.id, nombre: q.nombre, colorClave: q.colorClave, malla: partir(q.malla) }));
  let cavidad = null;
  if (s.emblemaDesmontable) cavidad = partir(extruir(caminosAFormas(desplazarCaminos(contorno, s.holguraEncastre)), zAtras - 0.15, 1.5));
  return { partes, cavidad, lado };
}

// Arma los emblemas de los parámetros `s` (ya saneados) para un cuerpo con radio exterior R(z) y alto H. Devuelve null sin
// emblema. Resultado: { items: [{ indice, theta0, partes, cavidad }], ancho, alto, zc, Rref, empotrado, avisos }.
export function armarEmblemas(entrada, R, H) {
  if (!entrada.emblema) return null;
  // Un SVG que no se puede leer no rompe el jarro: se arma con la estrella y se avisa.
  let s = entrada;
  const avisosSvg = [];
  if (s.emblemaSimbolo === SIMBOLO_SVG || s.emblemaSimbolo === SIMBOLO_PROPIO) {
    try { caminosDelSimbolo(s, s.emblemaTamano); } catch (e) { s = { ...s, emblemaSimbolo: SIMBOLO_INICIAL }; avisosSvg.push(`${e.message} Se usó una estrella.`); }
  }
  const clave = JSON.stringify([
    s.emblemaSimbolo, s.emblemaSimbolo === SIMBOLO_SVG ? s.emblemaSvg : '', s.emblemaSimbolo === SIMBOLO_PROPIO ? s.emblemaForma : '', s.emblemaRespaldo, s.emblemaTamano, s.emblemaMargen, s.emblemaGrosor, s.emblemaRelieve, s.emblemaBisel, s.emblemaBorde, s.emblemaBordeAncho,
    s.emblemaCantidad, s.emblemaAltura, s.emblemaAngulo, s.emblemaDesmontable, s.emblemaEmpotrado, s.holguraEncastre, s.formaPuntos, s.diametroHueco, s.pared, s.fondo, s.altoHueco
  ]);
  if (ultimo && ultimo.clave === clave) return ultimo.resultado;

  const avisos = [...avisosSvg];
  const empotrado = s.emblemaDesmontable ? s.emblemaEmpotrado : 0.6;
  const claveForma = JSON.stringify([s.emblemaSimbolo, s.emblemaSimbolo === SIMBOLO_SVG ? s.emblemaSvg : '', s.emblemaSimbolo === SIMBOLO_PROPIO ? s.emblemaForma : '', s.emblemaRespaldo, s.emblemaTamano, s.emblemaMargen, s.emblemaGrosor, s.emblemaRelieve, s.emblemaBisel, s.emblemaBorde, s.emblemaBordeAncho, s.emblemaDesmontable, empotrado, s.holguraEncastre]);
  let forma;
  if (ultimaForma && ultimaForma.clave === claveForma) forma = ultimaForma.forma;
  else { forma = formaEmblema(s, empotrado); ultimaForma = { clave: claveForma, forma }; }

  const ancho = forma.lado, alto = forma.lado;
  const zc = Math.min(H - alto / 2 - 2, Math.max(alto / 2 + 2, s.emblemaAltura));
  if (Math.abs(zc - s.emblemaAltura) > 0.01) avisos.push('Se corrió el emblema para que no se salga del jarro por arriba o por abajo.');
  const Rref = R(zc);
  if (ancho / Rref > MAX_ARCO_RAD) avisos.push('El emblema es tan ancho que casi da media vuelta al jarro: achicalo.');
  const n = s.emblemaCantidad;
  if (n > 1 && (ancho / Rref) * n > 2 * Math.PI * 0.97) avisos.push('Los emblemas no entran uno al lado del otro: achicalos o poné menos.');

  const items = [];
  for (let i = 0; i < n; i++) {
    const theta0 = ((-90 + s.emblemaAngulo + (360 * i) / n) * Math.PI) / 180;
    const colocar = (m) => envolver(m, R, H, zc, theta0, Rref);
    items.push({ indice: i, theta0, partes: forma.partes.map((q) => ({ ...q, malla: colocar(q.malla) })), cavidad: forma.cavidad ? colocar(forma.cavidad) : null });
  }
  const resultado = { items, ancho, alto, zc, Rref, empotrado, avisos };
  ultimo = { clave, resultado };
  return resultado;
}

// ---------- Aros ----------

// Radio del aro (borde exterior e interior) a cada altura: sigue la silueta del cuerpo.
function perfilAro(R, H, z0, z1, relieve, empotrado) {
  const alto = z1 - z0;
  const b = Math.min(relieve * 0.7, alto / 3); // chaflán arriba y abajo (el de abajo también evita soportes)
  const zs = [z0 + b];
  const pasos = 6;
  for (let k = 1; k < pasos; k++) zs.push(z0 + b + ((alto - 2 * b) * k) / pasos);
  zs.push(z1 - b);
  const rz = (z) => R(Math.min(H, Math.max(0, z)));
  const exterior = [[rz(z0) + relieve - b, z0], ...zs.map((z) => [rz(z) + relieve, z]), [rz(z1) + relieve - b, z1]];
  const interior = [[rz(z1) - empotrado, z1], [rz(z0) - empotrado, z0]];
  return [...exterior, ...interior];
}

// Arma los aros pedidos. Devuelve una lista de { id, nombre, z0, z1, partes: [{ id, nombre, colorClave, malla }], cavidad,
// desmontable, empotrado } y los avisos.
export function armarAros(s, R, H) {
  const aros = [];
  const avisos = [];
  const lista = [];
  if (s.aroArriba) lista.push({ id: 'aroArriba', nombre: 'Aro de arriba', z1: H - s.aroDistBorde, signo: 1 });
  if (s.aroAbajo) lista.push({ id: 'aroAbajo', nombre: 'Aro de abajo', z1: s.fondo + s.aroDistBase + s.aroAlto, signo: -1 });
  for (const a of lista) {
    const z1 = Math.min(H, Math.max(s.aroAlto + 0.5, a.z1));
    const z0 = z1 - s.aroAlto;
    const empotrado = s.aroDesmontable ? s.aroEmpotrado : 0.6;
    const partes = [];
    partes.push({ id: 'aro', nombre: 'Aro', colorClave: 'aro', malla: revolucion(perfilAro(R, H, z0, z1, s.aroRelieve, empotrado), 128) });
    if (s.aroRemaches > 0) {
      const zc = (z0 + z1) / 2;
      const Rref = R(zc);
      const gota = remache(0, 0, s.aroRelieve - SOLAPE, Math.min(1.1, s.aroRelieve + 0.5));
      const cabezas = [];
      for (let i = 0; i < s.aroRemaches; i++) cabezas.push(envolver(gota, R, H, zc, (2 * Math.PI * i) / s.aroRemaches, Rref));
      // Con tantos remaches que se tocan, se avisa.
      if ((2 * Math.PI * Rref) / s.aroRemaches < 2 * RADIO_REMACHE + 0.8) avisos.push(`Hay demasiados remaches en el ${a.nombre.toLowerCase()}: se tocan entre sí.`);
      if (s.aroAlto < 2 * RADIO_REMACHE + 1) avisos.push(`El ${a.nombre.toLowerCase()} es muy bajo para los remaches: hacelo más alto o sacalos.`);
      partes.push({ id: 'remaches', nombre: 'Remaches', colorClave: 'aroRemaches', malla: unirMallas(cabezas) });
    }
    let cavidad = null;
    if (s.aroDesmontable) {
      const hg = s.holguraEncastre;
      const rz = (z) => R(Math.min(H, Math.max(0, z)));
      const zz = [z0 - hg, (z0 + z1) / 2, z1 + hg];
      cavidad = revolucion([...zz.map((z) => [rz(z) - empotrado - hg, z]), ...[...zz].reverse().map((z) => [rz(z) + 3, z])], 128);
      // ¿Se puede calzar? Si arriba del aro el cuerpo es más ancho que donde va el aro, no pasa deslizándolo desde arriba.
      let mas = 0;
      for (let k = 0; k <= 12; k++) mas = Math.max(mas, rz(z1 + ((H - z1) * k) / 12));
      if (mas > rz((z0 + z1) / 2) + 0.2) avisos.push(`El ${a.nombre.toLowerCase()} desmontable no se puede deslizar desde arriba porque el jarro se ensancha: se pega (o usá una silueta recta).`);
    }
    aros.push({ id: a.id, nombre: a.nombre, signo: a.signo, z0, z1, partes, cavidad, desmontable: s.aroDesmontable, empotrado });
  }
  return { aros, avisos };
}
