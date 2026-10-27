// Separar un modelo en piezas para imprimir cada color por separado (o con
// AMS): el usuario marca una zona de la superficie y se arma un sólido
// cerrado con esa zona ("la pieza") y el resto del modelo con el hueco
// correspondiente, más un encastre para que calcen al armarlos.
//
// El corte sigue las aristas de la malla: no se parten triángulos, así que
// ambas piezas comparten exactamente el mismo borde y quedan cerradas sin
// operaciones booleanas. El cierre puede ser plano (la pieza se imprime
// apoyada sobre esa cara) o curvo (copia la forma de la superficie hacia
// adentro, para zonas orgánicas).
import { ShapeUtils, Vector2 } from 'three';
import {
  vecinosTriangulos, normalesTriangulos, volumenMalla, revisarCerrada,
  vertice, punto, cruz, normalizar
} from './mallas3d';

// Holgura radial de los encastres según el material (mm). PLA arranca en
// 0,15; los materiales que se contraen o se estiran más necesitan más juego.
export const PERFILES_HOLGURA = [
  { id: 'pla', nombre: 'PLA', holgura: 0.15 },
  { id: 'petg', nombre: 'PETG', holgura: 0.2 },
  { id: 'abs', nombre: 'ABS / ASA', holgura: 0.2 },
  { id: 'tpu', nombre: 'TPU', holgura: 0.25 }
];

export const TIPOS_ENCASTRE = [
  { id: 'ninguno', nombre: 'Sin encastre (pegado o AMS)' },
  { id: 'perno', nombre: 'Perno' },
  { id: 'doble', nombre: 'Doble perno' },
  { id: 'llave', nombre: 'Llave de alineación (no gira)' }
];

// Pared mínima que se exige entre el hueco y el otro lado del modelo, y entre
// el agujero del encastre y la cara visible de la pieza.
export const PARED_MINIMA = 0.8;
// El agujero es un poco más profundo que el perno para que no haga tope.
const HOLGURA_FONDO = 0.3;
const LADOS_CIRCULO = 32;

// ---------- Selección ----------

// Vecinos y normales de una malla, calculados una sola vez: en un modelo de
// cientos de miles de triángulos armarlos lleva un rato y cada clic de la
// varita los necesita.
const cacheTopologia = new WeakMap();
export function topologia(malla) {
  let t = cacheTopologia.get(malla);
  if (!t) {
    t = { vecinos: vecinosTriangulos(malla), ...normalesTriangulos(malla) };
    cacheTopologia.set(malla, t);
  }
  return t;
}

// Varita mágica: desde el triángulo tocado se expande por los vecinos
// mientras el pliegue entre dos triángulos sea menor que `anguloMax`
// (grados). Así se frena en las aristas vivas del modelo, que es donde suele
// cambiar el color. Con `hastaValles` sólo frenan los pliegues hacia adentro
// (valles): pasa por las aristas hacia afuera, como el canto de una letra en
// relieve, y se detiene donde la letra se junta con la base.
export function seleccionVarita(malla, semilla, { anguloMax = 30, hastaValles = false, vecinos, normales } = {}) {
  vecinos = vecinos || topologia(malla).vecinos;
  normales = normales || topologia(malla).normales;
  const { pos, tri } = malla;
  const nt = tri.length / 3;
  const cosMax = Math.cos((anguloMax * Math.PI) / 180);
  const marcados = new Uint8Array(nt);
  const lista = [semilla];
  marcados[semilla] = 1;
  for (let i = 0; i < lista.length; i++) {
    const t = lista[i];
    for (let k = 0; k < 3; k++) {
      const u = vecinos[t * 3 + k];
      if (u < 0 || marcados[u]) continue;
      const c = normales[t * 3] * normales[u * 3] + normales[t * 3 + 1] * normales[u * 3 + 1] + normales[t * 3 + 2] * normales[u * 3 + 2];
      let pasa = c >= cosMax;
      if (!pasa && hastaValles) {
        // Valle si el vértice del vecino que no está en la arista queda del
        // lado hacia el que mira este triángulo.
        const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
        let otro = tri[u * 3];
        for (let j = 0; j < 3; j++) { const v = tri[u * 3 + j]; if (v !== a && v !== b) otro = v; }
        const d = (pos[otro * 3] - pos[a * 3]) * normales[t * 3] + (pos[otro * 3 + 1] - pos[a * 3 + 1]) * normales[t * 3 + 1] + (pos[otro * 3 + 2] - pos[a * 3 + 2]) * normales[t * 3 + 2];
        pasa = d <= 0;
      }
      if (pasa) { marcados[u] = 1; lista.push(u); }
    }
  }
  return lista;
}

// Pincel: triángulos conectados al tocado cuyo centro está a menos de
// `radio` mm del punto. Se recorre por vecinos (y no por distancia pura)
// para no pintar del otro lado de una pared fina.
export function seleccionPincel(malla, semilla, centro, radio, { vecinos } = {}) {
  vecinos = vecinos || topologia(malla).vecinos;
  const nt = malla.tri.length / 3;
  const vistos = new Uint8Array(nt);
  const r2 = radio * radio;
  const dentro = (t) => {
    const { pos, tri } = malla;
    let d2 = 0;
    for (let k = 0; k < 3; k++) {
      const c = (pos[tri[t * 3] * 3 + k] + pos[tri[t * 3 + 1] * 3 + k] + pos[tri[t * 3 + 2] * 3 + k]) / 3 - centro[k];
      d2 += c * c;
    }
    return d2 <= r2;
  };
  const lista = [semilla];
  vistos[semilla] = 1;
  for (let i = 0; i < lista.length; i++) {
    const t = lista[i];
    for (let k = 0; k < 3; k++) {
      const u = vecinos[t * 3 + k];
      if (u >= 0 && !vistos[u] && dentro(u)) { vistos[u] = 1; lista.push(u); }
    }
  }
  return lista;
}

// Emprolija el borde de la selección: suma los triángulos rodeados por la
// selección en dos de sus tres lados, saca los que quedaron casi sueltos y
// rellena agujeritos chicos. Un borde con dientes de sierra imprime mal y
// complica el encastre.
export function suavizarSeleccion(malla, sel, { vecinos, pasadas = 2 } = {}) {
  vecinos = vecinos || topologia(malla).vecinos;
  const nt = malla.tri.length / 3;
  let actual = Uint8Array.from(sel);
  for (let p = 0; p < pasadas; p++) {
    const sig = Uint8Array.from(actual);
    for (let t = 0; t < nt; t++) {
      let n = 0;
      for (let k = 0; k < 3; k++) { const u = vecinos[t * 3 + k]; if (u >= 0 && actual[u]) n++; }
      if (!actual[t] && n >= 2) sig[t] = 1;
      else if (actual[t] && n === 0) sig[t] = 0;
    }
    actual = sig;
  }
  // Agujeros: grupos sin seleccionar encerrados por la selección y chicos
  // comparados con el modelo (los grandes pueden ser a propósito, como un
  // anillo de color alrededor de un ojo).
  const visto = new Uint8Array(nt);
  const grupos = [];
  for (let s = 0; s < nt; s++) {
    if (actual[s] || visto[s]) continue;
    const lista = [s];
    visto[s] = 1;
    for (let i = 0; i < lista.length; i++) {
      const t = lista[i];
      for (let k = 0; k < 3; k++) {
        const u = vecinos[t * 3 + k];
        if (u >= 0 && !actual[u] && !visto[u]) { visto[u] = 1; lista.push(u); }
      }
    }
    grupos.push(lista);
  }
  if (grupos.length > 1) {
    const mayor = grupos.reduce((a, b) => (b.length > a.length ? b : a));
    for (const g of grupos) {
      if (g !== mayor && g.length < Math.max(20, nt * 0.01)) for (const t of g) actual[t] = 1;
    }
  }
  return actual;
}

// Un vértice donde el borde de la selección pasa dos veces (dos zonas que se
// tocan por una punta) no deja armar un sólido cerrado. Se resuelve sumando a
// la selección los triángulos de alrededor de ese vértice.
export function repararPuntas(malla, sel, { vecinos } = {}) {
  vecinos = vecinos || topologia(malla).vecinos;
  const nt = malla.tri.length / 3;
  const actual = Uint8Array.from(sel);
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const salidas = new Map();
    for (let t = 0; t < nt; t++) {
      if (!actual[t]) continue;
      for (let k = 0; k < 3; k++) {
        const u = vecinos[t * 3 + k];
        if (u >= 0 && actual[u]) continue;
        const a = malla.tri[t * 3 + k];
        salidas.set(a, (salidas.get(a) || 0) + 1);
      }
    }
    const puntas = [...salidas].filter(([, n]) => n > 1).map(([v]) => v);
    if (!puntas.length) return actual;
    const enPunta = new Set(puntas);
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) if (enPunta.has(malla.tri[t * 3 + k])) actual[t] = 1;
    }
  }
  return actual;
}

// ---------- Bordes ----------

// Lazos del borde de la selección, recorridos en el sentido de los
// triángulos seleccionados (antihorario visto desde afuera de la pieza).
export function lazosBorde(malla, sel, vecinos) {
  const nt = malla.tri.length / 3;
  const siguiente = new Map();
  for (let t = 0; t < nt; t++) {
    if (!sel[t]) continue;
    for (let k = 0; k < 3; k++) {
      const u = vecinos[t * 3 + k];
      if (u >= 0 && sel[u]) continue;
      // Un borde abierto del modelo original no es borde del corte.
      if (u < 0) continue;
      const a = malla.tri[t * 3 + k], b = malla.tri[t * 3 + ((k + 1) % 3)];
      if (siguiente.has(a)) throw new ErrorCorte('La selección se toca a sí misma en una punta. Usá "Emprolijar borde" o ajustá la zona con el pincel.');
      siguiente.set(a, b);
    }
  }
  const lazos = [];
  const usados = new Set();
  for (const inicio of siguiente.keys()) {
    if (usados.has(inicio)) continue;
    const lazo = [];
    let v = inicio;
    while (!usados.has(v)) {
      usados.add(v);
      lazo.push(v);
      v = siguiente.get(v);
      if (v === undefined) throw new ErrorCorte('El borde de la zona quedó abierto: el modelo tiene agujeros cerca de ahí.');
    }
    lazos.push(lazo);
  }
  return lazos;
}

export class ErrorCorte extends Error {}

// ---------- Corte ----------

// Separa la zona seleccionada de `malla`. Devuelve { pieza, resto, ... } o
// lanza ErrorCorte con un motivo para mostrarle al usuario.
//   opciones: { cierre: 'plano'|'curvo', profundidad (mm), encastre,
//              diametro (mm), alto (mm), holgura (mm) }
export function separarZona(malla, sel, opciones = {}) {
  const {
    cierre = 'plano', profundidad = 2, encastre = 'ninguno',
    diametro = 4, alto = 4, holgura = PERFILES_HOLGURA[0].holgura
  } = opciones;
  if (!(profundidad > 0)) throw new ErrorCorte('La profundidad tiene que ser mayor a 0.');
  const { vecinos, normales, areas } = topologia(malla);
  const nt = malla.tri.length / 3;
  const elegidos = [], resto = [];
  for (let t = 0; t < nt; t++) (sel[t] ? elegidos : resto).push(t);
  if (!elegidos.length) throw new ErrorCorte('Primero marcá la zona a separar.');
  if (!resto.length) throw new ErrorCorte('Marcaste todo el modelo: dejá sin marcar lo que no va en este color.');
  const lazos = lazosBorde(malla, sel, vecinos);
  if (!lazos.length) throw new ErrorCorte('La zona marcada es una parte suelta del modelo: ya se puede imprimir aparte sin cortar.');

  const constructor = cierre === 'curvo'
    ? cierreCurvo(malla, elegidos, lazos, profundidad, normales, areas)
    : cierrePlano(malla, elegidos, lazos, profundidad, normales, areas, { encastre, diametro, alto, holgura });

  const pieza = constructor.pieza;
  const restoMalla = armar(malla, resto, constructor.restoExtra, constructor.nuevos);
  const avisos = [...constructor.avisos];
  // Sólo contra la superficie original del resto (los primeros triángulos):
  // el fondo y las paredes del hueco no cuentan como "el otro lado".
  const problemas = revisarGrosor(restoMalla, resto.length, constructor.muestrasHueco);
  return { pieza, resto: restoMalla, normalCierre: constructor.normal, avisos, problemas };
}

// Arma una malla con triángulos originales (por índice) más triángulos
// nuevos que usan índices "extendidos": < nv son vértices originales y >= nv
// son posiciones de `nuevos` (Float32 x,y,z).
function armar(malla, triOriginales, extra, nuevos) {
  const nv = malla.pos.length / 3;
  const mapa = new Map();
  const pos = [];
  const idDe = (v) => {
    let id = mapa.get(v);
    if (id === undefined) {
      id = pos.length / 3;
      mapa.set(v, id);
      if (v < nv) pos.push(malla.pos[v * 3], malla.pos[v * 3 + 1], malla.pos[v * 3 + 2]);
      else pos.push(nuevos[(v - nv) * 3], nuevos[(v - nv) * 3 + 1], nuevos[(v - nv) * 3 + 2]);
    }
    return id;
  };
  const tri = new Uint32Array(triOriginales.length * 3 + extra.length);
  let i = 0;
  for (const t of triOriginales) for (let k = 0; k < 3; k++) tri[i++] = idDe(malla.tri[t * 3 + k]);
  for (const v of extra) tri[i++] = idDe(v);
  return { pos: Float32Array.from(pos), tri };
}

// Normal "promedio" de la zona y vértices que la forman.
function datosZona(malla, elegidos, normales, areas) {
  let n = [0, 0, 0];
  for (const t of elegidos) for (let k = 0; k < 3; k++) n[k] += normales[t * 3 + k] * areas[t];
  n = normalizar(n);
  const vertices = new Set();
  for (const t of elegidos) for (let k = 0; k < 3; k++) vertices.add(malla.tri[t * 3 + k]);
  return { n, vertices };
}

// Paredes laterales entre cada arista del borde (a→b, sentido de la pieza) y
// su copia abajo (a'→b'). Devuelve los triángulos orientados para la pieza;
// el resto los usa dados vuelta.
function paredes(lazos, abajo) {
  const tris = [];
  for (const lazo of lazos) {
    for (let i = 0; i < lazo.length; i++) {
      const a = lazo[i], b = lazo[(i + 1) % lazo.length];
      tris.push(b, a, abajo(a), b, abajo(a), abajo(b));
    }
  }
  return tris;
}

const darVuelta = (tris) => {
  const r = [];
  for (let i = 0; i < tris.length; i += 3) r.push(tris[i], tris[i + 2], tris[i + 1]);
  return r;
};

function cierreCurvo(malla, elegidos, lazos, d, normales, areas) {
  const nv = malla.pos.length / 3;
  const { n, vertices } = datosZona(malla, elegidos, normales, areas);
  // Normal de cada vértice con los triángulos de la zona, para que el borde
  // de la pieza y del hueco sea el mismo.
  const normalV = new Map();
  for (const t of elegidos) {
    for (let k = 0; k < 3; k++) {
      const v = malla.tri[t * 3 + k];
      const acc = normalV.get(v) || [0, 0, 0];
      for (let j = 0; j < 3; j++) acc[j] += normales[t * 3 + j] * areas[t];
      normalV.set(v, acc);
    }
  }
  const nuevos = [];
  const copia = new Map();
  const muestras = [];
  for (const v of vertices) {
    const nn = normalizar(normalV.get(v));
    copia.set(v, nv + nuevos.length / 3);
    const p = [malla.pos[v * 3] - nn[0] * d, malla.pos[v * 3 + 1] - nn[1] * d, malla.pos[v * 3 + 2] - nn[2] * d];
    nuevos.push(...p);
    muestras.push({ p, normal: nn });
  }
  const abajo = (v) => copia.get(v);
  const fondoPieza = [];
  for (const t of elegidos) {
    const [a, b, c] = [malla.tri[t * 3], malla.tri[t * 3 + 1], malla.tri[t * 3 + 2]];
    fondoPieza.push(abajo(a), abajo(c), abajo(b));
  }
  const muros = paredes(lazos, abajo);
  const nuevosF = Float32Array.from(nuevos);
  const pieza = armar(malla, elegidos, [...fondoPieza, ...muros], nuevosF);
  return {
    pieza,
    restoExtra: [...darVuelta(fondoPieza), ...darVuelta(muros)],
    nuevos: nuevosF,
    normal: n,
    avisos: ['Con cierre curvo no se agrega encastre: la pieza se pega o se imprime junto con el resto en una impresora multicolor.'],
    muestrasHueco: submuestrear(muestras, 80)
  };
}

function cierrePlano(malla, elegidos, lazos, d, normales, areas, enc) {
  const nv = malla.pos.length / 3;
  const { n, vertices } = datosZona(malla, elegidos, normales, areas);
  // La tapa plana sólo tiene sentido si toda la zona "mira" hacia el mismo
  // lado; si se dobla (por ejemplo media esfera), la tapa la atravesaría.
  // Las paredes verticales (los costados de una letra en relieve) sí valen.
  let areaTotal = 0, areaDoblada = 0;
  for (const t of elegidos) {
    areaTotal += areas[t];
    if (normales[t * 3] * n[0] + normales[t * 3 + 1] * n[1] + normales[t * 3 + 2] * n[2] < -0.05) areaDoblada += areas[t];
  }
  if (areaDoblada > areaTotal * 0.01) {
    throw new ErrorCorte('La zona se dobla demasiado para un cierre plano: probá con cierre curvo o marcá una zona más chica.');
  }
  // Base del plano (u, w) perpendicular a n.
  const u = normalizar(Math.abs(n[0]) < 0.9 ? cruz(n, [1, 0, 0]) : cruz(n, [0, 1, 0]));
  const w = cruz(n, u);
  let hMin = Infinity;
  for (const v of vertices) hMin = Math.min(hMin, punto(vertice(malla.pos, v), n));
  const H = hMin - d;
  const enPlano = (x, y) => [u[0] * x + w[0] * y + n[0] * H, u[1] * x + w[1] * y + n[1] * H, u[2] * x + w[2] * y + n[2] * H];

  const nuevos = [];
  const agregar = (p) => { const id = nv + nuevos.length / 3; nuevos.push(p[0], p[1], p[2]); return id; };
  const copia = new Map();
  const lazos2d = lazos.map((lazo) => lazo.map((v) => {
    const p = vertice(malla.pos, v);
    const x = punto(p, u), y = punto(p, w);
    copia.set(v, agregar(enPlano(x, y)));
    return [x, y];
  }));
  for (const l of lazos2d) if (seAutoCorta(l)) throw new ErrorCorte('El borde de la zona se cruza consigo mismo visto desde el cierre: probá con cierre curvo o emprolijá el borde.');

  // Contornos exteriores (antihorario visto desde n) y agujeros (horario).
  const exteriores = [], agujeros = [];
  lazos2d.forEach((l, i) => (areaPoligono(l) > 0 ? exteriores : agujeros).push(i));
  if (!exteriores.length) throw new ErrorCorte('No se pudo armar la tapa de la pieza.');

  const avisos = [];
  // Encastres: se ubican en los puntos de la tapa más lejos del borde.
  const encastres = [];
  if (enc.encastre !== 'ninguno') {
    const r = enc.diametro / 2;
    const necesario = r + enc.holgura + PARED_MINIMA;
    const cantidad = enc.encastre === 'doble' ? 2 : 1;
    const centros = mejoresCentros(lazos2d, exteriores, cantidad, r * 2 + enc.holgura * 2 + PARED_MINIMA);
    if (centros.length < cantidad || centros.some((c) => c.dist < necesario)) {
      throw new ErrorCorte(`El encastre de ${enc.diametro} mm no entra en esta zona: elegí uno más chico o sin encastre.`);
    }
    for (const c of centros) {
      const espesor = espesorEn(malla, elegidos, u, w, n, c.x, c.y, r + enc.holgura) - H;
      const alto = Math.min(enc.alto, espesor - PARED_MINIMA - HOLGURA_FONDO);
      if (alto < 1) throw new ErrorCorte(`La pieza es muy fina para un encastre (${num1(espesor)} mm): subí la profundidad o elegí sin encastre.`);
      if (alto < enc.alto - 1e-6) avisos.push(`El encastre quedó de ${num1(alto)} mm de alto (en vez de ${num1(enc.alto)}) para no atravesar la pieza.`);
      encastres.push({ ...c, alto });
    }
  }
  const angulo = ejePrincipal(lazos2d[exteriores[0]]);
  const formaEncastre = (c, extra) => (enc.encastre === 'llave'
    ? cuadrado(c.x, c.y, enc.diametro / 2 + extra, angulo)
    : circulo(c.x, c.y, enc.diametro / 2 + extra));

  // Tapa de cada lado: el polígono del borde con los agujeros de la zona y
  // con el contorno del encastre (perno en el resto, agujero en la pieza).
  const tapa = (agujerosEncastre) => {
    const tris = [];
    for (const ie of exteriores) {
      const contorno = lazos2d[ie];
      const huecos = agujeros.filter((ia) => puntoEnPoligono(lazos2d[ia][0], contorno)).map((ia) => ({ pts: lazos2d[ia], ids: lazos[ia].map((v) => copia.get(v)) }));
      for (const h of agujerosEncastre) if (puntoEnPoligono([h.pts[0][0], h.pts[0][1]], contorno)) huecos.push(h);
      const ids = [...lazos[ie].map((v) => copia.get(v)), ...huecos.flatMap((h) => h.ids)];
      const pts = [...contorno, ...huecos.flatMap((h) => h.pts)];
      const caras = triangular(contorno, huecos.map((h) => h.pts));
      for (const [a, b, c] of caras) {
        // Mirando desde n: horario = cara hacia -n (abajo de la pieza).
        const area = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
        tris.push(...(area < 0 ? [ids[a], ids[b], ids[c]] : [ids[a], ids[c], ids[b]]));
      }
    }
    return tris;
  };

  // Un anillo de vértices a la altura del plano + `elev` sobre la normal.
  const anillo = (pts, elev) => pts.map(([x, y]) => {
    const p = enPlano(x, y);
    return agregar([p[0] + n[0] * elev, p[1] + n[1] * elev, p[2] + n[2] * elev]);
  });
  // Cilindro (o prisma) del encastre. `haciaAfuera` indica si la superficie
  // mira hacia afuera del eje (perno) o hacia el eje (pared de un agujero).
  const tubo = (base, techo, haciaAfuera) => {
    const tris = [];
    for (let i = 0; i < base.length; i++) {
      const a = base[i], b = base[(i + 1) % base.length], a2 = techo[i], b2 = techo[(i + 1) % base.length];
      // Puntos en sentido antihorario visto desde n: a→b→b2 mira hacia afuera.
      if (haciaAfuera) tris.push(a, b, b2, a, b2, a2);
      else tris.push(a, b2, b, a, a2, b2);
    }
    return tris;
  };
  const disco = (ids, pts, haciaN) => {
    const caras = triangular(pts, []);
    const tris = [];
    for (const [a, b, c] of caras) {
      const area = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
      const antihorario = area > 0;
      tris.push(...(antihorario === haciaN ? [ids[a], ids[b], ids[c]] : [ids[a], ids[c], ids[b]]));
    }
    return tris;
  };

  const extraPieza = [], extraResto = [];
  const huecosPieza = [], huecosResto = [];
  for (const c of encastres) {
    // Perno en el resto: sale del fondo del hueco hacia la pieza.
    const ptsPerno = formaEncastre(c, 0);
    const basePerno = anillo(ptsPerno, 0), techoPerno = anillo(ptsPerno, c.alto);
    huecosResto.push({ pts: ptsPerno, ids: basePerno });
    extraResto.push(...tubo(basePerno, techoPerno, true), ...disco(techoPerno, ptsPerno, true));
    // Agujero en la pieza, con la holgura del material.
    const ptsAguj = formaEncastre(c, enc.holgura);
    const baseAguj = anillo(ptsAguj, 0), techoAguj = anillo(ptsAguj, c.alto + HOLGURA_FONDO);
    huecosPieza.push({ pts: ptsAguj, ids: baseAguj });
    extraPieza.push(...tubo(baseAguj, techoAguj, false), ...disco(techoAguj, ptsAguj, false));
  }

  const tapaPieza = tapa(huecosPieza);
  // La tapa del resto es la misma de la pieza pero mirando hacia n, con el
  // agujero donde arranca el perno.
  const tapaResto = darVuelta(tapa(huecosResto));
  const muros = paredes(lazos, (v) => copia.get(v));
  const nuevosF = Float32Array.from(nuevos);
  const pieza = armar(malla, elegidos, [...muros, ...tapaPieza, ...extraPieza], nuevosF);

  // Muestras del fondo del hueco para revisar que no atraviese el modelo.
  const muestras = [];
  for (const ie of exteriores) {
    const l = lazos2d[ie];
    for (const p of muestrasEnPoligono(l, 60)) muestras.push({ p: enPlano(p[0], p[1]), normal: n });
  }
  return {
    pieza,
    restoExtra: [...darVuelta(muros), ...tapaResto, ...extraResto],
    nuevos: nuevosF,
    normal: n,
    avisos,
    muestrasHueco: muestras,
    encastres: encastres.length
  };
}

// ---------- Revisión ----------

// Revisa la pieza y el resto: cerrados, sin volumen negativo, y que el hueco
// no quede pegado al otro lado del modelo (pared fina o atravesada). Lo que
// falla vuelve como { tipo, texto, puntos } para marcarlo en rojo.
export function revisarResultado(original, resultado) {
  const problemas = [...resultado.problemas];
  for (const [nombre, m] of [['La pieza', resultado.pieza], ['El resto del modelo', resultado.resto]]) {
    const r = revisarCerrada(m);
    if (!r.cerrada) problemas.push({ tipo: 'error', texto: `${nombre} no quedó cerrada (${r.abiertas + r.repetidas} aristas con problemas).`, puntos: [] });
    if (volumenMalla(m) <= 0) problemas.push({ tipo: 'error', texto: `${nombre} quedó con volumen inválido.`, puntos: [] });
  }
  const vOriginal = volumenMalla(original);
  const vSuma = volumenMalla(resultado.pieza) + volumenMalla(resultado.resto);
  return { problemas, volumenOriginal: vOriginal, volumenPieza: volumenMalla(resultado.pieza), volumenResto: volumenMalla(resultado.resto), diferenciaVolumen: vSuma - vOriginal };
}

// Desde cada punto del fondo del hueco se tira un rayo hacia adentro del
// resto: si choca con la superficie del modelo antes de PARED_MINIMA, la
// pared queda muy fina (o el hueco sale del otro lado).
function revisarGrosor(resto, triOriginales, muestras) {
  const malos = [];
  if (!muestras.length) return [];
  const { pos, tri } = resto;
  for (const { p, normal } of muestras) {
    const dir = normal.map((x) => -x);
    // Se arranca un poco adentro para no chocar con el propio fondo.
    const o = [p[0] + dir[0] * 0.01, p[1] + dir[1] * 0.01, p[2] + dir[2] * 0.01];
    let minimo = Infinity;
    for (let i = 0; i < triOriginales * 3; i += 3) {
      const t = interseccionRayo(o, dir, pos, tri[i], tri[i + 1], tri[i + 2]);
      if (t > 0 && t < minimo) minimo = t;
    }
    if (minimo < PARED_MINIMA) malos.push(p);
  }
  if (!malos.length) return [];
  return [{
    tipo: 'error',
    texto: `En ${malos.length} punto${malos.length === 1 ? '' : 's'} el hueco queda a menos de ${PARED_MINIMA} mm del otro lado del modelo (o lo atraviesa). Bajá la profundidad.`,
    puntos: malos
  }];
}

// Möller–Trumbore: distancia a lo largo del rayo, o -1 si no lo cruza.
function interseccionRayo(o, d, pos, ia, ib, ic) {
  const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
  const e1x = pos[ib * 3] - ax, e1y = pos[ib * 3 + 1] - ay, e1z = pos[ib * 3 + 2] - az;
  const e2x = pos[ic * 3] - ax, e2y = pos[ic * 3 + 1] - ay, e2z = pos[ic * 3 + 2] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az;
  const bu = (sx * px + sy * py + sz * pz) * inv;
  if (bu < 0 || bu > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const bv = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (bv < 0 || bu + bv > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

// ---------- Geometría 2D ----------

// Triangula un polígono con agujeros usando todos sus puntos. Earcut (el de
// three.js) descarta los puntos alineados, muy comunes en mallas de grilla,
// y eso dejaría la tapa sin coser a las paredes: los puntos salteados se
// vuelven a meter partiendo en abanico el triángulo que los saltó.
export function triangular(contorno, huecos) {
  const anillos = [contorno, ...huecos];
  const anilloDe = [], posEn = [], largo = [];
  let base = 0;
  anillos.forEach((a, r) => {
    for (let i = 0; i < a.length; i++) { anilloDe.push(r); posEn.push(i); }
    largo.push({ base, n: a.length });
    base += a.length;
  });
  const caras = ShapeUtils.triangulateShape(contorno.map(([x, y]) => new Vector2(x, y)), huecos.map((h) => h.map(([x, y]) => new Vector2(x, y))));
  const usados = new Uint8Array(base);
  for (const c of caras) for (const v of c) usados[v] = 1;
  // Puntos salteados entre p y q yendo hacia adelante en el anillo, o null.
  const salteados = (p, q) => {
    if (anilloDe[p] !== anilloDe[q]) return null;
    const { base: b, n } = largo[anilloDe[p]];
    const pasos = (posEn[q] - posEn[p] + n) % n;
    if (pasos < 2) return null;
    const medio = [];
    for (let k = 1; k < pasos; k++) {
      const v = b + ((posEn[p] + k) % n);
      if (usados[v]) return null;
      medio.push(v);
    }
    return medio;
  };
  const pendientes = caras.map((c) => [...c]);
  const salida = [];
  while (pendientes.length) {
    const [a, b, c] = pendientes.pop();
    let partido = false;
    for (const [p, q, x] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const medio = salteados(p, q) || salteados(q, p)?.reverse();
      if (!medio) continue;
      // Abanico desde x respetando el orden p → ... → q del triángulo.
      const cadena = [p, ...medio, q];
      for (const v of medio) usados[v] = 1;
      for (let i = 0; i + 1 < cadena.length; i++) pendientes.push([cadena[i], cadena[i + 1], x]);
      partido = true;
      break;
    }
    if (!partido) salida.push([a, b, c]);
  }
  return salida;
}

const num1 = (x) => (Math.round(x * 10) / 10).toLocaleString('es-AR');

export function areaPoligono(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function puntoEnPoligono([x, y], pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function seAutoCorta(pts) {
  const n = pts.length;
  if (n > 4000) return false; // demasiado grande para revisar acá; lo atrapa la revisión final
  const corta = (p1, p2, p3, p4) => {
    const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (corta(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

function distanciaASegmento([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function distanciaABordes(p, lazos2d) {
  let m = Infinity;
  for (const l of lazos2d) for (let i = 0; i < l.length; i++) m = Math.min(m, distanciaASegmento(p, l[i], l[(i + 1) % l.length]));
  return m;
}

// Puntos de una grilla adentro de la tapa (contando agujeros).
function puntosAdentro(lazos2d, exteriores, lado) {
  const pts = [];
  for (const ie of exteriores) {
    const l = lazos2d[ie];
    const xs = l.map((p) => p[0]), ys = l.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const paso = Math.max(x1 - x0, y1 - y0) / lado;
    for (let x = x0 + paso / 2; x < x1; x += paso) {
      for (let y = y0 + paso / 2; y < y1; y += paso) {
        if (!puntoEnPoligono([x, y], l)) continue;
        if (lazos2d.some((h, i) => i !== ie && areaPoligono(h) < 0 && puntoEnPoligono([x, y], h))) continue;
        pts.push([x, y]);
      }
    }
  }
  return pts;
}

function mejoresCentros(lazos2d, exteriores, cantidad, separacion) {
  // Se acota la cantidad de aristas para que bordes muy finos no tarden.
  const simples = lazos2d.map((l) => (l.length > 400 ? l.filter((_, i) => i % Math.ceil(l.length / 400) === 0) : l));
  const candidatos = puntosAdentro(lazos2d, exteriores, 40).map((p) => ({ x: p[0], y: p[1], dist: distanciaABordes(p, simples) }));
  candidatos.sort((a, b) => b.dist - a.dist);
  const elegidos = [];
  for (const c of candidatos) {
    if (elegidos.length >= cantidad) break;
    if (elegidos.every((e) => Math.hypot(e.x - c.x, e.y - c.y) >= separacion)) elegidos.push(c);
  }
  if (cantidad === 2 && elegidos.length === 2) {
    // Dos pernos rinden más alejados entre sí: entre los candidatos que
    // todavía tienen lugar, se busca el par más separado.
    const minimo = Math.min(elegidos[0].dist, elegidos[1].dist);
    const aptos = candidatos.filter((c) => c.dist >= Math.min(minimo, separacion));
    let mejor = null;
    for (let i = 0; i < aptos.length; i += 2) {
      for (let j = i + 1; j < aptos.length; j += 2) {
        const s = Math.hypot(aptos[i].x - aptos[j].x, aptos[i].y - aptos[j].y);
        if (!mejor || s > mejor.s) mejor = { s, par: [aptos[i], aptos[j]] };
      }
    }
    if (mejor && mejor.s >= separacion) return mejor.par;
  }
  return elegidos;
}

function muestrasEnPoligono(l, cantidad) {
  const pts = puntosAdentro([l], [0], Math.ceil(Math.sqrt(cantidad * 1.6)));
  return pts.concat(submuestrear(l, 20));
}

function submuestrear(lista, maximo) {
  if (lista.length <= maximo) return lista;
  const paso = lista.length / maximo;
  return Array.from({ length: maximo }, (_, i) => lista[Math.floor(i * paso)]);
}

// Altura mínima de la superficie de la zona sobre el plano en un círculo
// alrededor de (x, y): es el espesor real de la pieza donde va el encastre.
function espesorEn(malla, elegidos, u, w, n, cx, cy, radio) {
  const puntos = [[cx, cy]];
  for (let i = 0; i < 12; i++) puntos.push([cx + Math.cos((i * Math.PI) / 6) * radio, cy + Math.sin((i * Math.PI) / 6) * radio]);
  let minimo = Infinity;
  const { pos, tri } = malla;
  for (const [x, y] of puntos) {
    for (const t of elegidos) {
      const p = [0, 1, 2].map((k) => vertice(pos, tri[t * 3 + k]));
      const q = p.map((v) => [punto(v, u), punto(v, w)]);
      const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
      if (Math.abs(area) < 1e-12) continue;
      const l1 = ((q[1][0] - x) * (q[2][1] - y) - (q[2][0] - x) * (q[1][1] - y)) / area;
      const l2 = ((q[2][0] - x) * (q[0][1] - y) - (q[0][0] - x) * (q[2][1] - y)) / area;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const h = l1 * punto(p[0], n) + l2 * punto(p[1], n) + l3 * punto(p[2], n);
      minimo = Math.min(minimo, h);
    }
  }
  return minimo;
}

// Ángulo del eje más largo del contorno (para alinear la llave).
function ejePrincipal(pts) {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

function circulo(cx, cy, r) {
  return Array.from({ length: LADOS_CIRCULO }, (_, i) => {
    const a = (i / LADOS_CIRCULO) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

function cuadrado(cx, cy, medio, angulo) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = sx * medio, y = sy * medio;
    return [cx + x * Math.cos(angulo) - y * Math.sin(angulo), cy + x * Math.sin(angulo) + y * Math.cos(angulo)];
  });
}

// Normal hacia la que hay que apoyar la pieza para imprimirla: la tapa plana
// va contra la cama.
export function normalApoyo(resultado) {
  return resultado.normalCierre.map((x) => -x);
}
