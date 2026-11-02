// Modificador de superficies: le aplica a un modelo 3D un relieve (un mapa de
// alturas que se repite) moviendo los vértices a lo largo de su normal. Todo
// corre en el navegador.
//
// Pasos: se parten los triángulos hasta que ningún lado supere la resolución
// pedida (sólo en las zonas que reciben textura), a cada vértice se le calcula
// una coordenada en la textura según la proyección elegida, y se lo empuja
// hacia afuera o hacia adentro según la altura que tenga el mapa ahí.
import { soldar, normalesTriangulos, cajaMalla, afinarMalla } from './mallas3d';
import { muestrear, suavizarTextura, invertirTextura } from './texturasSuperficie';

export const PROYECCIONES = [
  { id: 'triplanar', nombre: 'Triplanar', ayuda: 'Mezcla tres proyecciones según hacia dónde mira cada cara. La mejor para formas complejas.' },
  { id: 'cubica', nombre: 'Cúbica (caja)', ayuda: 'Proyecta desde las seis caras de una caja; las uniones se mezclan poco.' },
  { id: 'cilindrica', nombre: 'Cilíndrica', ayuda: 'Envuelve la textura alrededor de un eje, como una etiqueta en una lata.' },
  { id: 'esferica', nombre: 'Esférica', ayuda: 'Envuelve la textura alrededor del centro del modelo.' },
  { id: 'xy', nombre: 'Plana XY (desde arriba)', ayuda: 'Proyecta recto desde arriba.' },
  { id: 'xz', nombre: 'Plana XZ (de frente)', ayuda: 'Proyecta recto desde el frente.' },
  { id: 'yz', nombre: 'Plana YZ (de costado)', ayuda: 'Proyecta recto desde un costado.' }
];

export const PARAMETROS_SUPERFICIE = {
  proyeccion: 'triplanar',
  fusion: 0.5, // qué tan suave se mezcla entre proyecciones (triplanar y cúbica)
  ejeCilindro: 'z',
  anguloTapa: 25, // cilíndrica: hasta qué inclinación de las tapas se proyecta plano
  sinCostura: true, // cilíndrica y esférica: ajusta el tamaño para que la textura cierre
  tamanoU: 10, // mm que mide una repetición de la textura
  tamanoV: 10,
  desfaseU: 0,
  desfaseV: 0,
  rotacion: 0,
  profundidad: 0.5, // mm entre lo más hundido y lo más alto
  simetrico: true, // el gris medio no mueve nada: lo claro sale y lo oscuro entra
  empujarAdentro: false,
  invertirTextura: false,
  suavizadoTextura: 0, // píxeles de desenfoque
  anguloInferior: 0, // sin textura en caras que miran hacia abajo dentro de este ángulo
  anguloSuperior: 0,
  modoMascara: 'excluir', // 'excluir' (lo pintado no recibe) o 'incluir' (sólo lo pintado recibe)
  transicion: 0, // mm de degradé en el borde de las zonas enmascaradas
  protegerVoladizos: false, // ningún vértice baja en Z
  baseLisa: false, // los vértices pegados a la base quedan en el plano
  resolucion: 0.5, // mm: largo máximo de arista en las zonas con textura
  sello: null, // { centro: [x,y,z], normal: [x,y,z] }: aplica la textura una sola vez
  combinar: 'cubrir' // con varias capas: 'cubrir' tapa lo de abajo donde se pinta, 'sumar' le suma su relieve
};

// Lo que es de todo el modelo y no de una capa.
export const CLAVES_GLOBALES = ['resolucion', 'protegerVoladizos', 'baseLisa'];
export const PARAMETROS_GLOBALES = Object.fromEntries(CLAVES_GLOBALES.map((k) => [k, PARAMETROS_SUPERFICIE[k]]));
export const PARAMETROS_CAPA = Object.fromEntries(Object.entries(PARAMETROS_SUPERFICIE).filter(([k]) => !CLAVES_GLOBALES.includes(k)));
export const MAX_CAPAS = 4;

export const LIMITES_SUPERFICIE = {
  fusion: [0, 1], anguloTapa: [1, 89], tamanoU: [0.5, 200], tamanoV: [0.5, 200], desfaseU: [-200, 200], desfaseV: [-200, 200],
  rotacion: [-180, 180], profundidad: [0.02, 5], suavizadoTextura: [0, 8], anguloInferior: [0, 90], anguloSuperior: [0, 90],
  transicion: [0, 10], resolucion: [0.1, 3]
};

// Deja los parámetros usables: números válidos y dentro de sus límites (los
// campos del formulario pueden quedar vacíos o con valores fuera de rango).
export function sanearSuperficie(p) {
  const s = { ...PARAMETROS_SUPERFICIE, ...p };
  for (const [clave, [min, max]] of Object.entries(LIMITES_SUPERFICIE)) {
    const n = Number(p[clave]);
    s[clave] = Number.isFinite(n) && p[clave] !== '' ? Math.min(max, Math.max(min, n)) : PARAMETROS_SUPERFICIE[clave];
  }
  if (!PROYECCIONES.some((x) => x.id === s.proyeccion)) s.proyeccion = PARAMETROS_SUPERFICIE.proyeccion;
  if (!['x', 'y', 'z'].includes(s.ejeCilindro)) s.ejeCilindro = 'z';
  s.modoMascara = s.modoMascara === 'incluir' ? 'incluir' : 'excluir';
  s.combinar = s.combinar === 'sumar' ? 'sumar' : 'cubrir';
  return s;
}

// ---------- Lectura de OBJ ----------

// OBJ de texto: sólo se usan los vértices y las caras (las de más de tres
// lados se abren en triángulos).
export function leerObj(texto) {
  const v = [];
  const sopa = [];
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.startsWith('v ')) {
      const p = linea.trim().split(/\s+/).slice(1, 4).map(Number);
      if (p.length === 3 && p.every(Number.isFinite)) v.push(p);
    } else if (linea.startsWith('f ')) {
      const idx = linea.trim().split(/\s+/).slice(1).map((s) => {
        const i = parseInt(s.split('/')[0], 10);
        return i < 0 ? v.length + i : i - 1;
      });
      for (let k = 1; k + 1 < idx.length; k++) {
        for (const i of [idx[0], idx[k], idx[k + 1]]) {
          if (!v[i]) throw new Error('El OBJ tiene una cara que apunta a un vértice que no existe.');
          sopa.push(...v[i]);
        }
      }
    }
  }
  if (!sopa.length) throw new Error('El OBJ no tiene caras.');
  return soldar(Float32Array.from(sopa));
}

// ---------- Utilidades ----------

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const GRAD = 180 / Math.PI;

// Normal de la cara más cercana a un punto (para colocar un sello).
export function normalEnPunto(malla, punto) {
  const { pos, tri } = malla;
  const { normales } = normalesTriangulos(malla);
  let mejor = 0, d2m = Infinity;
  for (let t = 0; t < tri.length / 3; t++) {
    let d2 = 0;
    for (let k = 0; k < 3; k++) {
      const c = (pos[tri[t * 3] * 3 + k] + pos[tri[t * 3 + 1] * 3 + k] + pos[tri[t * 3 + 2] * 3 + k]) / 3 - punto[k];
      d2 += c * c;
    }
    if (d2 < d2m) { d2m = d2; mejor = t; }
  }
  return [normales[mejor * 3], normales[mejor * 3 + 1], normales[mejor * 3 + 2]];
}

// Base del sello: dos direcciones sobre la superficie (e1 horizontal, e2 hacia
// "arriba" siempre que se pueda).
function baseSello(normal) {
  const l = Math.hypot(...normal) || 1;
  const n = normal.map((x) => x / l);
  const ayuda = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1 = [ayuda[1] * n[2] - ayuda[2] * n[1], ayuda[2] * n[0] - ayuda[0] * n[2], ayuda[0] * n[1] - ayuda[1] * n[0]];
  const l1 = Math.hypot(...e1) || 1;
  e1 = e1.map((x) => x / l1);
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  return { n, e1, e2 };
}

// ---------- Qué triángulos reciben textura ----------

// 1 por triángulo que puede recibir textura (por su inclinación, la pintura
// y el sello): sólo esos se subdividen.
function triangulosActivos(malla, op, mascara) {
  const { pos, tri } = malla;
  const nt = tri.length / 3;
  const { normales } = normalesTriangulos(malla);
  const act = new Uint8Array(nt).fill(1);
  const sello = op.sello ? baseSello(op.sello.normal) : null;
  const radioSello = sello ? Math.hypot(op.tamanoU, op.tamanoV) / 2 + Math.abs(op.desfaseU) + Math.abs(op.desfaseV) : 0;
  for (let t = 0; t < nt; t++) {
    const nz = normales[t * 3 + 2];
    if (op.anguloInferior > 0 && Math.acos(Math.max(-1, Math.min(1, -nz))) * GRAD <= op.anguloInferior) { act[t] = 0; continue; }
    if (op.anguloSuperior > 0 && Math.acos(Math.max(-1, Math.min(1, nz))) * GRAD <= op.anguloSuperior) { act[t] = 0; continue; }
    if (mascara) {
      if (op.modoMascara === 'incluir' ? !mascara[t] : mascara[t]) { act[t] = 0; continue; }
    }
    if (sello) {
      // La caja del triángulo tiene que tocar la esfera del sello.
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) {
        const x = pos[tri[t * 3 + k] * 3 + j];
        if (x < min[j]) min[j] = x;
        if (x > max[j]) max[j] = x;
      }
      let d2 = 0;
      for (let j = 0; j < 3; j++) {
        const c = op.sello.centro[j];
        const d = c < min[j] ? min[j] - c : c > max[j] ? c - max[j] : 0;
        d2 += d * d;
      }
      if (d2 > radioSello * radioSello) act[t] = 0;
    }
  }
  return act;
}

// Cuántos triángulos va a tener el resultado, sin armarlo.
export function estimarTriangulos(malla, op, mascara) {
  const act = triangulosActivos(malla, op, mascara);
  return estimarConActivos(malla, act, Math.max(0.05, op.resolucion));
}

// Lo mismo para varias capas: se parte lo que alguna capa va a texturar.
export function estimarTriangulosCapas(malla, capas, resolucion) {
  return estimarConActivos(malla, activosDeCapas(malla, capas), Math.max(0.05, resolucion));
}

function activosDeCapas(malla, capas) {
  const act = new Uint8Array(malla.tri.length / 3);
  for (const c of capas) {
    const a = triangulosActivos(malla, { ...PARAMETROS_SUPERFICIE, ...c.op }, c.mascara);
    for (let t = 0; t < act.length; t++) if (a[t]) act[t] = 1;
  }
  return act;
}

// Cada pasada de subdivisión parte en cuatro a los triángulos con algún lado
// más largo que la resolución, así que un triángulo termina en 4^k. En los
// triángulos largos y finos eso se pasa de largo (la pasada sólo parte lo
// largo): ahí se acota por el área, que da hasta unos 24 triángulos por L².
function estimarConActivos(malla, act, L) {
  const { pos, tri } = malla;
  let total = 0;
  for (let t = 0; t < act.length; t++) {
    if (!act[t]) { total++; continue; }
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const largo = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(vx - ux, vy - uy, vz - uz));
    const porPasadas = 4 ** Math.max(0, Math.ceil(Math.log2(largo / L)));
    total += Math.max(1, Math.min(porPasadas, (24 * area) / (L * L)));
  }
  return Math.round(total);
}

// ---------- Proyecciones ----------

// Todo lo que hace falta saber de una proyección para evaluarla: números y
// nada más. Lo usan la función de abajo (en la CPU) y el shader de la vista
// previa (en la GPU), así los dos calculan lo mismo.
export function describirProyeccion(malla, op) {
  const caja = cajaMalla(malla);
  const centro = [0, 1, 2].map((k) => (caja.min[k] + caja.max[k]) / 2);
  const medio = [0, 1, 2].map((k) => (caja.max[k] - caja.min[k]) / 2);
  const rad = (op.rotacion * Math.PI) / 180;
  const tu = Math.max(0.01, op.tamanoU), tv = Math.max(0.01, op.tamanoV);
  const d = {
    tipo: op.sello ? 'sello' : op.proyeccion, co: Math.cos(rad), si: Math.sin(rad), desU: op.desfaseU, desV: op.desfaseV,
    tu, tv, tuAjustado: tu, centro, p: 1, R: 1, ejes: [0, 1, 2], angTapa: op.anguloTapa
  };
  if (d.tipo === 'sello') {
    const { n, e1, e2 } = baseSello(op.sello.normal);
    Object.assign(d, { selloCentro: op.sello.centro, n, e1, e2 });
  } else if (d.tipo === 'triplanar') d.p = 1 + 16 * (1 - op.fusion);
  else if (d.tipo === 'cubica') d.p = 8 + 60 * (1 - op.fusion);
  else if (d.tipo === 'cilindrica') {
    // [primero, segundo, axial] de cada eje.
    d.ejes = op.ejeCilindro === 'x' ? [1, 2, 0] : op.ejeCilindro === 'y' ? [2, 0, 1] : [0, 1, 2];
    d.R = Math.max(0.01, (medio[d.ejes[0]] + medio[d.ejes[1]]) / 2);
    const vuelta = 2 * Math.PI * d.R;
    d.tuAjustado = op.sinCostura ? vuelta / Math.max(1, Math.round(vuelta / tu)) : tu;
  } else if (d.tipo === 'esferica') {
    d.R = Math.max(0.01, (medio[0] + medio[1] + medio[2]) / 3);
    const vuelta = 2 * Math.PI * d.R;
    d.tuAjustado = op.sinCostura ? vuelta / Math.max(1, Math.round(vuelta / tu)) : tu;
  }
  return d;
}

// Devuelve una función que, dada la posición y la normal de un vértice, da la
// altura (0 a 1) de la textura ahí y cuánto recibe (0 a 1).
function crearProyector(malla, op, textura) {
  const d = describirProyeccion(malla, op);
  const { co, si, desU, desV, tu: tu0, tv: tv0, centro } = d;
  const muestra = (s, t, tu, tv) => muestrear(textura, (s * co - t * si - desU) / tu, (s * si + t * co - desV) / tv);
  const salida = { h: 0.5, w: 1 };

  if (d.tipo === 'sello') {
    const { n, e1, e2 } = d;
    const [cx, cy, cz] = d.selloCentro;
    return (x, y, z, nx, ny, nz) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const a0 = dx * e1[0] + dy * e1[1] + dz * e1[2], b0 = dx * e2[0] + dy * e2[1] + dz * e2[2];
      const prof = dx * n[0] + dy * n[1] + dz * n[2];
      const a = (a0 - desU) * co + (b0 - desV) * si, b = -(a0 - desU) * si + (b0 - desV) * co;
      const mira = nx * n[0] + ny * n[1] + nz * n[2];
      if (Math.abs(a) > tu0 / 2 || Math.abs(b) > tv0 / 2 || Math.abs(prof) > Math.max(tu0, tv0) || mira < 0.25) { salida.w = 0; salida.h = 0.5; return salida; }
      salida.w = suave(0.25, 0.6, mira);
      salida.h = muestrear(textura, Math.min(0.9999, a / tu0 + 0.5), Math.min(0.9999, b / tv0 + 0.5));
      return salida;
    };
  }

  if (d.tipo === 'triplanar' || d.tipo === 'cubica') {
    const p = d.p;
    return (x, y, z, nx, ny, nz) => {
      let wx = Math.pow(Math.abs(nx), p), wy = Math.pow(Math.abs(ny), p), wz = Math.pow(Math.abs(nz), p);
      const total = wx + wy + wz || 1;
      // Las proyecciones que casi no pesan no se calculan.
      if (wx < 1e-4 * total) wx = 0;
      if (wy < 1e-4 * total) wy = 0;
      if (wz < 1e-4 * total) wz = 0;
      let h = 0;
      if (wx) h += wx * muestra(y, z, tu0, tv0);
      if (wy) h += wy * muestra(x, z, tu0, tv0);
      if (wz) h += wz * muestra(x, y, tu0, tv0);
      salida.h = h / (wx + wy + wz || 1);
      salida.w = 1;
      return salida;
    };
  }

  if (d.tipo === 'cilindrica') {
    const [i1, i2, ia] = d.ejes;
    const { R, tuAjustado: tu, angTapa } = d;
    return (x, y, z, nx, ny, nz) => {
      const p = [x, y, z], n = [nx, ny, nz];
      const a1 = p[i1] - centro[i1], a2 = p[i2] - centro[i2], ax = p[ia] - centro[ia];
      const lateral = muestra(Math.atan2(a2, a1) * R, ax, tu, tv0);
      const desdeEje = Math.acos(Math.min(1, Math.abs(n[ia]))) * GRAD;
      const tapa = 1 - suave(angTapa, angTapa + 8, desdeEje);
      salida.h = tapa > 0 ? lateral * (1 - tapa) + muestra(a1, a2, tu0, tv0) * tapa : lateral;
      salida.w = 1;
      return salida;
    };
  }

  if (d.tipo === 'esferica') {
    const { R, tuAjustado: tu } = d;
    return (x, y, z) => {
      const dx = x - centro[0], dy = y - centro[1], dz = z - centro[2];
      const r = Math.hypot(dx, dy, dz) || 1;
      salida.h = muestra(Math.atan2(dy, dx) * R, Math.asin(Math.max(-1, Math.min(1, dz / r))) * R, tu, tv0);
      salida.w = 1;
      return salida;
    };
  }

  const tipo = d.tipo;
  return (x, y, z) => {
    salida.h = tipo === 'xy' ? muestra(x, y, tu0, tv0) : tipo === 'xz' ? muestra(x, z, tu0, tv0) : muestra(y, z, tu0, tv0);
    salida.w = 1;
    return salida;
  };
}

// ---------- Aplicar ----------

// Aplica una textura a la malla. `mascara` es un 1 por triángulo pintado de
// `malla`. Devuelve { malla, avisos }.
export function texturizar(malla, textura, opciones, { mascara = null, maxTriangulos = 2500000 } = {}) {
  const op = { ...PARAMETROS_SUPERFICIE, ...opciones };
  return texturizarCapas(malla, [{ textura, op, mascara }], op, { maxTriangulos });
}

// Aplica varias capas, de la de abajo a la de arriba. Cada capa es
// { textura, op, mascara }. Donde una capa "cubre" reemplaza lo de las de abajo
// (según cuánto recibe ahí); donde "suma" le agrega su relieve.
export function texturizarCapas(malla, capas, globales = {}, { maxTriangulos = 2500000 } = {}) {
  const g = { ...PARAMETROS_GLOBALES, ...globales };
  const lista = capas.map((c) => ({ ...c, op: { ...PARAMETROS_SUPERFICIE, ...c.op } }));
  const avisos = [];
  const caja = cajaMalla(malla);
  const dims = [0, 1, 2].map((k) => caja.max[k] - caja.min[k]);
  const profundidad = Math.max(0, ...lista.map((c) => c.op.profundidad));
  if (profundidad > 0.1 * Math.min(...dims)) avisos.push('La profundidad supera el 10% de la dimensión más chica del modelo: la geometría puede superponerse.');

  const { fino, normal, L } = refinar(malla, lista, g, maxTriangulos, avisos);
  const { pos, tri } = fino;
  const nv = pos.length / 3;

  const total = new Float32Array(nv);
  for (const capa of lista) {
    const { valor, peso } = evaluarCapa({ malla, fino, normal, L }, capa);
    const suma = capa.op.combinar === 'sumar';
    for (let v = 0; v < nv; v++) {
      if (peso[v] <= 0) continue;
      total[v] = suma ? total[v] + valor[v] * peso[v] : total[v] * (1 - peso[v]) + valor[v] * peso[v];
    }
  }

  const zMin = caja.min[2];
  const salida = new Float32Array(pos.length);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const d = total[v];
    const nx = normal[v * 3], ny = normal[v * 3 + 1], nz = normal[v * 3 + 2];
    salida[v * 3] = x + nx * d;
    salida[v * 3 + 1] = y + ny * d;
    salida[v * 3 + 2] = z + (g.protegerVoladizos && nz * d < 0 ? 0 : nz * d);
  }
  if (g.baseLisa) {
    for (let v = 0; v < nv; v++) if (pos[v * 3 + 2] - zMin < 0.1) salida[v * 3 + 2] = zMin;
  }
  return { malla: { pos: salida, tri }, avisos };
}

// Parte la malla donde alguna capa va a texturar, hasta la resolución pedida
// (o la más fina que entre en `maxTriangulos`).
function refinar(malla, lista, g, maxTriangulos, avisos) {
  const activos = activosDeCapas(malla, lista);
  let L = Math.max(0.05, g.resolucion);
  // Si no entra en el límite de triángulos se sube la resolución (en mm) hasta que entre.
  const pedida = L;
  while (estimarConActivos(malla, activos, L) > maxTriangulos && L < 50) L *= 1.15;
  if (L > pedida) avisos.push(`Para no pasar de ${maxTriangulos.toLocaleString('es-AR')} triángulos se usó una resolución de ${L.toFixed(2)} mm (pediste ${pedida} mm).`);
  const fino = afinarMalla(malla, L, maxTriangulos, { activos });
  return { fino, normal: normalesVertices(fino.pos, fino.tri), L };
}

// Lo que necesita la vista previa en la GPU: la malla partida, las normales
// y cuánto recibe cada vértice de cada capa (pintura, ángulos y transición).
// El relieve en sí lo calcula el shader con los parámetros de cada capa, así que
// mover el tamaño o la profundidad no obliga a repetir esto.
export function prepararVista(malla, capas, globales = {}, { maxTriangulos = 250000 } = {}) {
  const g = { ...PARAMETROS_GLOBALES, ...globales };
  const lista = capas.slice(0, MAX_CAPAS).map((c) => ({ ...c, op: { ...PARAMETROS_SUPERFICIE, ...c.op } }));
  const avisos = [];
  const { fino, normal, L } = refinar(malla, lista, g, maxTriangulos, avisos);
  const nv = fino.pos.length / 3;
  const recibe = new Float32Array(nv * MAX_CAPAS).fill(0);
  lista.forEach((capa, i) => {
    const r = pesosRecibe({ fino, normal, L }, capa.op, capa.mascara);
    for (let v = 0; v < nv; v++) recibe[v * MAX_CAPAS + i] = r[v];
  });
  return { pos: fino.pos, tri: fino.tri, normal, recibe, avisos };
}

// Normales de los vértices: promedio de las caras, ponderado por el área.
function normalesVertices(pos, tri) {
  const nv = pos.length / 3;
  const normal = new Float32Array(nv * 3);
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { normal[i] += cx; normal[i + 1] += cy; normal[i + 2] += cz; }
  }
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]) || 1;
    normal[v * 3] /= l; normal[v * 3 + 1] /= l; normal[v * 3 + 2] /= l;
  }
  return normal;
}

// Cuánto recibe cada vértice de una capa por la pintura, los ángulos y la
// transición (0 a 1). El sello se calcula aparte, con la proyección.
function pesosRecibe({ fino, normal, L }, op, mascara) {
  const { pos, tri, padre } = fino;
  const nv = pos.length / 3, nt = tri.length / 3;
  const recibe = new Float32Array(nv).fill(1);
  if (mascara) {
    const suma = new Float32Array(nv), cuenta = new Float32Array(nv);
    for (let t = 0; t < nt; t++) {
      const si = (op.modoMascara === 'incluir' ? mascara[padre[t]] : !mascara[padre[t]]) ? 1 : 0;
      for (let k = 0; k < 3; k++) { suma[tri[t * 3 + k]] += si; cuenta[tri[t * 3 + k]]++; }
    }
    for (let v = 0; v < nv; v++) recibe[v] = cuenta[v] ? suma[v] / cuenta[v] : 1;
  }
  for (let v = 0; v < nv; v++) {
    const nz = normal[v * 3 + 2];
    if (op.anguloInferior > 0) recibe[v] *= suave(op.anguloInferior, op.anguloInferior + 8, Math.acos(Math.max(-1, Math.min(1, -nz))) * GRAD);
    if (op.anguloSuperior > 0) recibe[v] *= suave(op.anguloSuperior, op.anguloSuperior + 8, Math.acos(Math.max(-1, Math.min(1, nz))) * GRAD);
  }
  const pasadas = Math.min(40, Math.ceil(op.transicion / L));
  if (pasadas > 0) suavizarPesos(recibe, tri, pasadas);
  return recibe;
}

// La textura de una capa con su suavizado y su inversión aplicados.
export function procesarTextura(textura, op) {
  let t = textura;
  if (op.suavizadoTextura > 0) t = suavizarTextura(t, op.suavizadoTextura);
  if (op.invertirTextura) t = invertirTextura(t);
  return t;
}

// Lo que una capa le hace a cada vértice: cuánto lo mueve (en mm, sin contar
// cuánto recibe) y cuánto recibe (0 a 1: pintura, ángulo y sello).
function evaluarCapa({ malla, fino, normal, L }, capa) {
  const { op, mascara } = capa;
  const textura = procesarTextura(capa.textura, op);
  const { pos } = fino;
  const nv = pos.length / 3;

  const recibe = pesosRecibe({ fino, normal, L }, op, mascara);

  const proyectar = crearProyector(malla, op, textura);
  const sentido = op.empujarAdentro ? -1 : 1;
  const valor = new Float32Array(nv);
  const peso = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    if (recibe[v] <= 0) continue;
    const r = proyectar(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]);
    peso[v] = recibe[v] * r.w;
    if (peso[v] <= 0) continue;
    valor[v] = (op.simetrico ? r.h - 0.5 : r.h) * op.profundidad * sentido;
  }
  return { valor, peso };
}

// Promedia cada peso con el de sus vecinos: el borde de una zona enmascarada
// pasa de a poco de "sin textura" a "con textura".
function suavizarPesos(peso, tri, pasadas) {
  const nv = peso.length;
  const grado = new Uint32Array(nv + 1);
  for (let i = 0; i < tri.length; i++) grado[tri[i] + 1] += 2;
  for (let v = 0; v < nv; v++) grado[v + 1] += grado[v];
  const vecinos = new Uint32Array(grado[nv]);
  const lleno = new Uint32Array(nv);
  for (let t = 0; t < tri.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t + k], b = tri[t + ((k + 1) % 3)], c = tri[t + ((k + 2) % 3)];
      vecinos[grado[a] + lleno[a]++] = b;
      vecinos[grado[a] + lleno[a]++] = c;
    }
  }
  let actual = peso, otro = new Float32Array(nv);
  for (let p = 0; p < pasadas; p++) {
    for (let v = 0; v < nv; v++) {
      let s = 0;
      const n = grado[v + 1] - grado[v];
      for (let k = grado[v]; k < grado[v + 1]; k++) s += actual[vecinos[k]];
      otro[v] = n ? (actual[v] + s / n) / 2 : actual[v];
    }
    [actual, otro] = [otro, actual];
  }
  if (actual !== peso) peso.set(actual);
}
