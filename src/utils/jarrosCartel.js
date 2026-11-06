// Cartel con el nombre del jarro (Fase 2 del plan en docs/plan-generador-jarros.md): una pieza decorativa que se
// puede imprimir aparte y encastrar en una cavidad del cuerpo, o ir pegada. Sin navegador: se prueba en Node.
//
// Se arma PLANO, con el cartel centrado en el origen, X hacia la derecha, Y hacia arriba y Z hacia afuera del jarro
// (z = 0 es la superficie de la pared), y después se curva: primero el arco y la onda (suben o bajan según X) y
// después se ENVUELVE sobre el jarro (cada punto queda a la distancia de la pared que le toca a su altura). Así el
// cartel sigue la silueta del cuerpo y su cara de atrás apoya parejo en la cavidad.
//
// Partes (cada una con su color, para imprimir a colores): base, borde, letras y remaches.
import * as THREE from 'three';
import {
  aplicarMayusculas, caminosAFormas, cajaDeCaminos, desplazarCaminos, engrosarFormas, extruir, formasACaminos, formasDeCamino, interseccionCaminos,
  moverMalla, rectRedondeado, restarCaminos, unirMallas
} from './llaveros';
import { afinarMalla } from './mallas3d';
import { revolucion } from './mallasJarro';

// Formas del cartel.
export const FORMAS_CARTEL = [
  { id: 'placa', nombre: 'Placa' },
  { id: 'pastilla', nombre: 'Pastilla' },
  { id: 'ovalo', nombre: 'Óvalo' },
  { id: 'cinta', nombre: 'Cinta' },
  { id: 'hexagono', nombre: 'Hexágono' },
  { id: 'etiqueta', nombre: 'Etiqueta' }
];
export const MAYUSCULAS_CARTEL = ['como', 'mayus', 'minus'];

// Alineación del texto de varios renglones: izquierda, centrada, derecha, justificada (los renglones llenan el ancho del
// más largo y el último queda a la izquierda) y en bloque (llenan el ancho todos, incluso el último).
export const ALINEACIONES = [
  { id: 'izquierda', nombre: 'Izquierda' },
  { id: 'centro', nombre: 'Centrada' },
  { id: 'derecha', nombre: 'Derecha' },
  { id: 'justificado', nombre: 'Ambos márgenes' },
  { id: 'bloque', nombre: 'Ambos márgenes (todo)' }
];
export const MAX_RENGLONES = 4;
export const MAX_LETRAS_RENGLON = 30;

export const SOLAPE = 0.2; // cuánto se mete cada capa en la de abajo (mm), para que las partes queden unidas al imprimir
const LARGO_MALLA = 1.4; // las mallas planas se parten hasta que sus lados midan menos de esto (mm), para poder curvarlas
const MAX_ARCO_RAD = 3.0; // un cartel no puede abarcar más que esto alrededor del jarro (≈172°)
export const RADIO_REMACHE = 1.6;

// Texto de uno o varios renglones (separados por saltos de línea) como formas centradas en (0, 0): devuelve también el
// tamaño que ocupa. Cada renglón se alinea dentro del ancho del más largo. Para llenar el ancho ("ambos márgenes") se
// reparte lo que sobra entre las palabras; si el renglón es una sola palabra, entre las letras.
export function textoAlineado(fuente, texto, alturaLetra, engrosar = 0, alineacion = 'centro', interlineado = 1.35) {
  const upm = fuente.unitsPerEm || 1000;
  const alturaMayus = (fuente.tables?.os2?.sCapHeight || upm * 0.7) / upm;
  const tam = alturaLetra / alturaMayus;
  const lineas = String(texto || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_RENGLONES);
  if (!lineas.length) return { formas: [], ancho: 0, alto: 0 };
  const paso = alturaLetra * interlineado;
  const altoTotal = alturaLetra + paso * (lineas.length - 1);
  const naturales = lineas.map((l) => { const c = fuente.getPath(l, 0, 0, tam); return { camino: c, caja: c.getBoundingBox() }; });
  const W = Math.max(...naturales.map((n) => n.caja.x2 - n.caja.x1));
  const hueco = fuente.getAdvanceWidth(' ', tam);

  // Un renglón estirado hasta ocupar el ancho W, con la tinta de 0 a W.
  const estirado = (linea) => {
    const palabras = linea.split(' ');
    const caminos = [];
    if (palabras.length > 1) {
      const anchos = palabras.map((w) => { const b = fuente.getPath(w, 0, 0, tam).getBoundingBox(); return { w, x1: b.x1, ancho: b.x2 - b.x1 }; });
      const suma = anchos.reduce((a, b) => a + b.ancho, 0);
      const separacion = Math.max(hueco, (W - suma) / (palabras.length - 1));
      let x = 0;
      for (const a of anchos) { caminos.push(fuente.getPath(a.w, x - a.x1, 0, tam)); x += a.ancho + separacion; }
    } else {
      const letras = [...linea];
      const natural = fuente.getPath(linea, 0, 0, tam).getBoundingBox();
      if (letras.length < 2) return [fuente.getPath(linea, -natural.x1, 0, tam)];
      const extra = Math.max(0, (W - (natural.x2 - natural.x1)) / (letras.length - 1));
      let x = -natural.x1;
      for (const ch of letras) { caminos.push(fuente.getPath(ch, x, 0, tam)); x += fuente.getAdvanceWidth(ch, tam) + extra; }
    }
    return caminos;
  };

  const formas = [];
  lineas.forEach((linea, i) => {
    const yBase = altoTotal / 2 - alturaLetra - paso * i;
    const { camino, caja } = naturales[i];
    const ultima = i === lineas.length - 1;
    const llena = alineacion === 'bloque' || (alineacion === 'justificado' && !ultima);
    if (llena && caja.x2 - caja.x1 < W - 1e-6) {
      for (const c of estirado(linea)) formas.push(...formasDeCamino(c, -W / 2, yBase));
      return;
    }
    // izquierda: la tinta empieza en el margen izquierdo; derecha: termina en el derecho; el resto, centrada.
    const ox = alineacion === 'izquierda' || alineacion === 'justificado' || alineacion === 'bloque' ? -W / 2 - caja.x1
      : alineacion === 'derecha' ? W / 2 - caja.x2 : -(caja.x1 + caja.x2) / 2;
    formas.push(...formasDeCamino(camino, ox, yBase));
  });
  const e = Math.max(0, engrosar || 0);
  return { formas: engrosarFormas(formas, e / 2), ancho: W + e, alto: altoTotal + e };
}

export const poligono = (puntos) => {
  const s = new THREE.Shape();
  puntos.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};

// Tamaño que tiene que tener el cartel para que el texto (tw × th) entre con un margen `m` en cada forma.
export function tamanoAjustado(forma, tw, th, m) {
  const w = tw + 2 * m, h = th + 2 * m;
  switch (forma) {
    case 'pastilla': return { ancho: w + h * 0.35, alto: h };
    case 'ovalo': return { ancho: w * Math.SQRT2, alto: h * Math.SQRT2 };
    case 'cinta': return { ancho: w + 2 * Math.min(h * 0.35, w * 0.12), alto: h };
    case 'hexagono': return { ancho: w + h * 0.9, alto: h };
    case 'etiqueta': return { ancho: w + h * 0.3, alto: h };
    default: return { ancho: w, alto: h };
  }
}

// Contorno del cartel, centrado en (0, 0).
export function contornoCartel(forma, W, H) {
  const a = W / 2, b = H / 2;
  switch (forma) {
    case 'pastilla': return rectRedondeado(W, H, b);
    case 'ovalo': return poligono(Array.from({ length: 96 }, (_, i) => [a * Math.cos((2 * Math.PI * i) / 96), b * Math.sin((2 * Math.PI * i) / 96)]));
    case 'cinta': { const n = Math.min(H * 0.35, W * 0.12); return poligono([[-a, -b], [a, -b], [a - n, 0], [a, b], [-a, b], [-a + n, 0]]); }
    case 'hexagono': { const k = H * 0.45; return poligono([[-a, 0], [-a + k, -b], [a - k, -b], [a, 0], [a - k, b], [-a + k, b]]); }
    case 'etiqueta': { const c = H * 0.25; return poligono([[-a + c, -b], [a - c, -b], [a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c]]); }
    default: return rectRedondeado(W, H, Math.min(4, H / 4));
  }
}

export const conTriangulos = (m) => m.tri.length > 0;

// Capas apiladas que forman la base con el borde superior en bisel (escalones de a poco). Cada capa se mete un poco en
// la de abajo. Con bisel 0 es una sola extrusión.
export function capasConBisel(caminos, zAtras, zArriba, bisel) {
  const pasos = bisel > 0.05 ? 3 : 1;
  if (pasos === 1) return extruir(caminosAFormas(caminos), zAtras, zArriba);
  const capas = [extruir(caminosAFormas(caminos), zAtras, zArriba - bisel)];
  let tope = zArriba - bisel;
  for (let j = 1; j <= pasos; j++) {
    const recorte = desplazarCaminos(caminos, -(bisel * j) / pasos);
    if (!recorte.length) break;
    const nuevoTope = zArriba - bisel + (bisel * j) / pasos;
    capas.push(extruir(caminosAFormas(recorte), tope - SOLAPE, nuevoTope));
    tope = nuevoTope;
  }
  return unirMallas(capas.filter(conTriangulos));
}

// Remache: cilindro con la tapa redondeada, apoyado en z = base.
export function remache(x, y, base, relieve) {
  const r = RADIO_REMACHE;
  const m = revolucion([[0, -SOLAPE], [r, -SOLAPE], [r, relieve * 0.45], [r * 0.7, relieve * 0.85], [0, relieve]], 24);
  return moverMalla(m, x, y, base);
}

// Posiciones de los remaches: sobre el borde, en los extremos de izquierda y derecha (2) y arriba y abajo (4).
function posicionesRemaches(caminosUtiles, cantidad) {
  if (!cantidad || !caminosUtiles.length) return [];
  const caja = cajaDeCaminos(caminosUtiles);
  const franja = (x0, x1, y0, y1) => formasACaminos([rectRedondeado(x1 - x0, y1 - y0, 0, (x0 + x1) / 2, (y0 + y1) / 2)]);
  const extremo = (corte) => {
    const c = interseccionCaminos(caminosUtiles, corte);
    return c.length ? cajaDeCaminos(c) : null;
  };
  const pts = [];
  const hor = extremo(franja(caja.x0 - 5, caja.x1 + 5, -0.2, 0.2));
  if (hor) { pts.push([hor.x0 + RADIO_REMACHE, 0], [hor.x1 - RADIO_REMACHE, 0]); }
  if (cantidad >= 4) {
    const ver = extremo(franja(-0.2, 0.2, caja.y0 - 5, caja.y1 + 5));
    if (ver) pts.push([0, ver.y0 + RADIO_REMACHE], [0, ver.y1 - RADIO_REMACHE]);
  }
  return pts;
}

// ---------- Curvar ----------

export function partir(m) {
  if (!conTriangulos(m)) return m;
  const r = afinarMalla(m, LARGO_MALLA, 150000);
  return { pos: r.pos, tri: r.tri };
}

// Arco y onda: mueven cada punto hacia arriba o abajo según su X. Con arco positivo el centro del cartel queda más alto.
function arquear(m, W, arco, onda) {
  if (!arco && !onda) return m;
  const pos = new Float32Array(m.pos);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const u = (2 * x) / W;
    pos[i + 1] += arco * (1 - u * u) + onda * Math.sin((2 * Math.PI * x) / (W * 0.66));
  }
  return { pos, tri: m.tri };
}

// Envuelve el cartel plano sobre el jarro: x → ángulo (θ = θ0 + x / Rref), y → altura (zc + y), z → distancia a la
// pared a esa altura. Conserva el sentido de los triángulos (X, Y, Z → tangente, altura, hacia afuera es de mano derecha).
export function envolver(m, R, H, zc, theta0, Rref) {
  const pos = new Float32Array(m.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    const alto = zc + y;
    const r = R(Math.min(H, Math.max(0, alto))) + z;
    const th = theta0 + x / Rref;
    pos[i] = r * Math.cos(th);
    pos[i + 1] = r * Math.sin(th);
    pos[i + 2] = alto;
  }
  return { pos, tri: m.tri };
}

let ultimaForma = null; // { clave, fuente, forma }: la forma plana del último cartel armado

// Arma la forma plana del cartel: las partes (base, borde, letras y remaches) y la cavidad, ya partidas y con el arco y la
// onda, todavía sin envolver. Z = 0 es la superficie de la pared; la base va de -empotrado a grosor - empotrado.
function formaPlana(s, letras, ancho, alto, empotrado) {
  const desmontable = s.cartelDesmontable;
  const bisel = Math.max(0, Math.min(s.cartelBisel, s.cartelGrosor - 0.8, alto / 4));
  const zAtras = -empotrado;
  const zArriba = s.cartelGrosor - empotrado;
  const relieve = s.cartelRelieve;

  const contorno = formasACaminos([contornoCartel(s.cartelForma, ancho, alto)]);
  const planas = []; // [{ id, nombre, colorClave, malla }] en el plano
  planas.push({ id: 'base', nombre: 'Cartel', colorClave: 'cartel', malla: capasConBisel(contorno, zAtras, zArriba, bisel) });

  const superficie = desplazarCaminos(contorno, -bisel); // la cara plana de arriba de la base
  if (s.cartelBorde) {
    const interior = desplazarCaminos(contorno, -(bisel + s.cartelBordeAncho));
    const anillo = restarCaminos(superficie, interior);
    if (anillo.length) planas.push({ id: 'borde', nombre: 'Borde', colorClave: 'borde', malla: extruir(caminosAFormas(anillo), zArriba - SOLAPE, zArriba + relieve) });
  }
  planas.push({ id: 'letras', nombre: 'Letras', colorClave: 'letras', malla: extruir(letras.formas, zArriba - SOLAPE, zArriba + relieve) });
  if (s.cartelRemaches) {
    const util = s.cartelBorde ? desplazarCaminos(contorno, -(bisel + s.cartelBordeAncho / 2 + RADIO_REMACHE * 0.6)) : desplazarCaminos(contorno, -(bisel + RADIO_REMACHE + 0.6));
    const pts = posicionesRemaches(util, s.cartelRemaches);
    if (pts.length) planas.push({ id: 'remaches', nombre: 'Remaches', colorClave: 'remaches', malla: unirMallas(pts.map(([x, y]) => remache(x, y, zArriba, relieve + 0.4))) });
  }

  const preparar = (m) => arquear(partir(m), ancho, s.cartelArco, s.cartelOnda);
  const partes = planas.filter((q) => conTriangulos(q.malla)).map((q) => ({ id: q.id, nombre: q.nombre, colorClave: q.colorClave, malla: preparar(q.malla) }));

  // Cavidad: el contorno de la base con la holgura, un poco más profundo que la base y saliendo de la pared.
  let cavidad = null;
  if (desmontable) {
    const hueco = desplazarCaminos(contorno, s.holguraEncastre);
    cavidad = preparar(extruir(caminosAFormas(hueco), zAtras - 0.15, 1.5));
  }
  return { partes, cavidad };
}

let ultimo = null; // { clave, fuente, resultado }: armar el cartel es lo más caro, y no cambia al editar el asa

// Arma el cartel de los parámetros `s` (ya saneados) para un cuerpo con radio exterior R(z) y alto H. Devuelve null si no
// hay texto o tipografía. Resultado: { partes: [{ id, nombre, colorClave, malla }], cavidad, ancho, alto, zc, theta0,
// Rref, empotrado, avisos }. `cavidad` es el sólido que hay que restarle al cuerpo (sólo con el cartel desmontable).
export function armarCartel(s, R, H, fuente) {
  const texto = aplicarMayusculas(String(s.cartelTexto || '').trim(), s.cartelMayusculas);
  if (!texto || !fuente) return null;
  const clave = JSON.stringify([
    texto, s.cartelAlineacion, s.cartelInterlineado, s.cartelAlturaLetra, s.cartelEngrosar, s.cartelForma, s.cartelTamano, s.cartelAncho, s.cartelAlto, s.cartelMargen, s.cartelGrosor,
    s.cartelRelieve, s.cartelBisel, s.cartelArco, s.cartelOnda, s.cartelBorde, s.cartelBordeAncho, s.cartelRemaches, s.cartelAltura,
    s.cartelAngulo, s.cartelCantidad, s.cartelDesmontable, s.cartelEmpotrado, s.holguraEncastre, s.formaPuntos, s.diametroHueco, s.pared, s.fondo, s.altoHueco
  ]);
  if (ultimo && ultimo.clave === clave && ultimo.fuente === fuente) return ultimo.resultado;

  const avisos = [];
  const letras = textoAlineado(fuente, texto, s.cartelAlturaLetra, s.cartelEngrosar, s.cartelAlineacion, s.cartelInterlineado);
  if (!letras.formas.length) return null;
  let { ancho, alto } = s.cartelTamano === 'ajustado'
    ? tamanoAjustado(s.cartelForma, letras.ancho, letras.alto, s.cartelMargen)
    : { ancho: s.cartelAncho, alto: s.cartelAlto };
  if (s.cartelTamano !== 'ajustado' && (letras.ancho + s.cartelMargen > ancho || letras.alto + s.cartelMargen > alto)) {
    avisos.push('El nombre no entra en el tamaño que elegiste: agrandá el cartel o achicá las letras.');
  }

  // Posición: la altura se limita para que el cartel quede dentro del jarro, y el ancho para que no dé más de media vuelta.
  const zc = Math.min(H - alto / 2 - 2, Math.max(alto / 2 + 2, s.cartelAltura));
  if (Math.abs(zc - s.cartelAltura) > 0.01) avisos.push('Se corrió el cartel para que no se salga del jarro por arriba o por abajo.');
  const theta0 = ((-90 + s.cartelAngulo) * Math.PI) / 180;
  const Rref = R(zc);
  if (ancho / Rref > MAX_ARCO_RAD) {
    ancho = MAX_ARCO_RAD * Rref;
    avisos.push('El cartel es tan ancho que daba más de media vuelta al jarro: se achicó.');
  }

  const desmontable = s.cartelDesmontable;
  const empotrado = desmontable ? s.cartelEmpotrado : 0.6; // pegado: apenas se mete en la pared para quedar unido

  // La FORMA del cartel (plana, ya partida y con el arco y la onda) no depende de dónde se ponga en el jarro: se guarda
  // aparte, así al moverlo sólo se vuelve a envolver, que es lo barato.
  const claveForma = JSON.stringify([
    texto, s.cartelAlineacion, s.cartelInterlineado, s.cartelAlturaLetra, s.cartelEngrosar, s.cartelForma, ancho, alto, s.cartelGrosor, s.cartelRelieve,
    s.cartelBisel, s.cartelArco, s.cartelOnda, s.cartelBorde, s.cartelBordeAncho, s.cartelRemaches, desmontable, empotrado, s.holguraEncastre
  ]);
  let forma;
  if (ultimaForma && ultimaForma.clave === claveForma && ultimaForma.fuente === fuente) forma = ultimaForma.forma;
  else {
    forma = formaPlana(s, letras, ancho, alto, empotrado);
    ultimaForma = { clave: claveForma, fuente, forma };
  }
  // Las copias (1 a 4) se reparten parejo alrededor del jarro a partir del giro elegido; todas comparten la misma forma.
  const n = s.cartelCantidad;
  if (n > 1 && (ancho / Rref) * n > 2 * Math.PI * 0.97) avisos.push('Los carteles no entran uno al lado del otro: achicalos o poné menos.');
  const copias = Array.from({ length: n }, (_, i) => {
    const th = theta0 + (2 * Math.PI * i) / n;
    const colocar = (m) => envolver(m, R, H, zc, th, Rref);
    return { indice: i, theta0: th, partes: forma.partes.map((q) => ({ ...q, malla: colocar(q.malla) })), cavidad: forma.cavidad ? colocar(forma.cavidad) : null };
  });
  const { partes, cavidad } = copias[0];
  if (Math.abs(s.cartelArco) > 0.5 || s.cartelOnda > 0.3) {
    if (desmontable) avisos.push('Con arco u onda, el borde de abajo del cartel no es recto: se imprime con soportes (o dejá el arco y la onda en 0).');
  }

  const resultado = { copias, partes, cavidad, ancho, alto, zc, theta0, Rref, empotrado, avisos };
  ultimo = { clave, fuente, resultado };
  return resultado;
}
