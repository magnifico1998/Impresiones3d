// Mallas de triángulos para las herramientas de modelado (separar piezas por
// color). Todo corre en el navegador: los archivos del usuario no se suben a
// ningún lado. Una malla es { pos: Float32Array (x,y,z por vértice),
// tri: Uint32Array (3 índices por triángulo) }, en milímetros, con los
// triángulos en sentido antihorario visto desde afuera (como el STL).
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

// Dos vértices a menos de esta distancia (mm) se consideran el mismo: el STL
// repite cada vértice en cada triángulo y hay que volver a unirlos para saber
// qué triángulos son vecinos.
const TOLERANCIA_SOLDADO = 1e-4;

// ---------- Lectura ----------

// STL binario o ASCII. Algunos exportadores escriben "solid" al principio de
// un STL binario, así que se decide por el tamaño y no por la cabecera.
export function leerStl(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 84) {
    const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = vista.getUint32(80, true);
    if (84 + n * 50 === bytes.length) return leerStlBinario(vista, n);
  }
  const texto = strFromU8(bytes);
  if (!/facet/i.test(texto)) throw new Error('El archivo no parece un STL válido.');
  return leerStlAscii(texto);
}

function leerStlBinario(vista, n) {
  const sopa = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const base = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) sopa[i * 9 + k] = vista.getFloat32(base + k * 4, true);
  }
  return soldar(sopa);
}

function leerStlAscii(texto) {
  const numeros = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(texto))) numeros.push(+m[1], +m[2], +m[3]);
  if (!numeros.length || numeros.length % 9) throw new Error('El STL ASCII está incompleto.');
  return soldar(Float32Array.from(numeros));
}

const ESCALA_UNIDAD_3MF = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

// 3MF (también los proyectos de Bambu Studio / Orca, que guardan cada objeto
// en un archivo aparte dentro de 3D/Objects). Devuelve una lista de
// { nombre, malla }: cada pieza del archivo queda como un cuerpo separado,
// en su posición de la cama.
export function leer3mf(buffer) {
  let archivos;
  try {
    archivos = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error('El 3MF no se pudo abrir (¿está dañado?).');
  }
  const modelos = {};
  for (const ruta of Object.keys(archivos)) {
    if (/\.model$/i.test(ruta)) modelos['/' + ruta.replace(/^\//, '')] = strFromU8(archivos[ruta]);
  }
  const principal = Object.keys(modelos).find((r) => /^\/3D\/3dmodel\.model$/i.test(r)) || Object.keys(modelos)[0];
  if (!principal) throw new Error('El 3MF no tiene ningún modelo adentro.');

  const objetosPorArchivo = {};
  const objetosDe = (ruta) => {
    if (!objetosPorArchivo[ruta]) objetosPorArchivo[ruta] = modelos[ruta] ? parsearObjetos3mf(modelos[ruta]) : {};
    return objetosPorArchivo[ruta];
  };
  const xmlPrincipal = modelos[principal];
  const unidad = /unit="([a-z]+)"/i.exec(xmlPrincipal)?.[1] || 'millimeter';
  const escala = ESCALA_UNIDAD_3MF[unidad] ?? 1;

  const cuerpos = [];
  // Recorre componentes hasta llegar a las mallas, acumulando transformaciones.
  const juntar = (ruta, id, matriz, nombre, profundidad) => {
    const obj = objetosDe(ruta)[id];
    if (!obj || profundidad > 8) return;
    const nombreObj = obj.nombre || nombre;
    if (obj.malla) {
      cuerpos.push({ nombre: nombreObj, malla: transformarMalla(obj.malla, multiplicarMatriz(escalaMatriz(escala), matriz)) });
    }
    for (const c of obj.componentes) {
      juntar(c.ruta || ruta, c.objectid, multiplicarMatriz(matriz, c.matriz), nombreObj, profundidad + 1);
    }
  };
  const reItem = /<item\b([^>]*)\/?>/g;
  let m;
  while ((m = reItem.exec(xmlPrincipal))) {
    const attrs = m[1];
    const id = /objectid="([^"]+)"/.exec(attrs)?.[1];
    const ruta = /path="([^"]+)"/.exec(attrs)?.[1] || principal;
    juntar(ruta, id, leerMatriz3mf(/transform="([^"]+)"/.exec(attrs)?.[1]), '', 0);
  }
  if (!cuerpos.length) throw new Error('No se encontraron piezas en el 3MF.');
  return cuerpos;
}

function parsearObjetos3mf(xml) {
  const objetos = {};
  const reObjeto = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
  let m;
  while ((m = reObjeto.exec(xml))) {
    const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
    const nombre = /\bname="([^"]*)"/.exec(m[1])?.[1] || '';
    const cuerpo = m[2];
    let malla = null;
    if (/<mesh\b/.test(cuerpo)) {
      const pos = [];
      const reV = /<vertex\b[^>]*?x="([^"]+)"[^>]*?y="([^"]+)"[^>]*?z="([^"]+)"/g;
      let v;
      while ((v = reV.exec(cuerpo))) pos.push(+v[1], +v[2], +v[3]);
      const tri = [];
      const reT = /<triangle\b[^>]*?v1="(\d+)"[^>]*?v2="(\d+)"[^>]*?v3="(\d+)"/g;
      let t;
      while ((t = reT.exec(cuerpo))) tri.push(+t[1], +t[2], +t[3]);
      malla = { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
    }
    const componentes = [];
    const reC = /<component\b([^>]*)\/?>/g;
    let c;
    while ((c = reC.exec(cuerpo))) {
      componentes.push({
        objectid: /objectid="([^"]+)"/.exec(c[1])?.[1],
        ruta: /path="([^"]+)"/.exec(c[1])?.[1],
        matriz: leerMatriz3mf(/transform="([^"]+)"/.exec(c[1])?.[1])
      });
    }
    objetos[id] = { nombre, malla, componentes };
  }
  return objetos;
}

// ---------- Matrices (4x4, por columnas, como three.js) ----------

export const MATRIZ_IDENTIDAD = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// El 3MF escribe 12 números: las tres columnas de la rotación y la traslación.
function leerMatriz3mf(texto) {
  if (!texto) return [...MATRIZ_IDENTIDAD];
  const n = texto.trim().split(/\s+/).map(Number);
  if (n.length !== 12 || n.some((x) => !Number.isFinite(x))) return [...MATRIZ_IDENTIDAD];
  return [n[0], n[1], n[2], 0, n[3], n[4], n[5], 0, n[6], n[7], n[8], 0, n[9], n[10], n[11], 1];
}

function escalaMatriz(s) {
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
}

export function multiplicarMatriz(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let f = 0; f < 4; f++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + f] * b[c * 4 + k];
      r[c * 4 + f] = s;
    }
  }
  return r;
}

// Rotación de `grados` alrededor del eje 'x', 'y' o 'z'.
export function matrizRotacion(eje, grados) {
  const a = (grados * Math.PI) / 180;
  const c = Math.round(Math.cos(a) * 1e12) / 1e12;
  const s = Math.round(Math.sin(a) * 1e12) / 1e12;
  if (eje === 'x') return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  if (eje === 'y') return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Rotación que lleva el vector unitario `desde` a `hasta`.
export function matrizAlinear(desde, hasta) {
  const [ax, ay, az] = desde;
  const [bx, by, bz] = hasta;
  const vx = ay * bz - az * by, vy = az * bx - ax * bz, vz = ax * by - ay * bx;
  const c = ax * bx + ay * by + az * bz;
  if (c < -0.999999) {
    // Opuestos: media vuelta alrededor de cualquier eje perpendicular.
    const eje = Math.abs(ax) < 0.9 ? normalizar(cruz([ax, ay, az], [1, 0, 0])) : normalizar(cruz([ax, ay, az], [0, 1, 0]));
    const [x, y, z] = eje;
    return [2 * x * x - 1, 2 * x * y, 2 * x * z, 0, 2 * x * y, 2 * y * y - 1, 2 * y * z, 0, 2 * x * z, 2 * y * z, 2 * z * z - 1, 0, 0, 0, 0, 1];
  }
  const k = 1 / (1 + c);
  return [
    vx * vx * k + c, vy * vx * k + vz, vz * vx * k - vy, 0,
    vx * vy * k - vz, vy * vy * k + c, vz * vy * k + vx, 0,
    vx * vz * k + vy, vy * vz * k - vx, vz * vz * k + c, 0,
    0, 0, 0, 1
  ];
}

export function transformarMalla(malla, m) {
  const pos = new Float32Array(malla.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = malla.pos[i], y = malla.pos[i + 1], z = malla.pos[i + 2];
    pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  // Una matriz con espejo da vuelta los triángulos: se reordenan para que
  // sigan mirando hacia afuera.
  const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  return { pos, tri: det < 0 ? invertirTriangulos(malla.tri) : malla.tri };
}

function invertirTriangulos(tri) {
  const r = new Uint32Array(tri.length);
  for (let i = 0; i < tri.length; i += 3) {
    r[i] = tri[i];
    r[i + 1] = tri[i + 2];
    r[i + 2] = tri[i + 1];
  }
  return r;
}

// ---------- Vectores ----------

export const restar = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalizar(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export const vertice = (pos, i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];

// ---------- Soldado y topología ----------

// Une los vértices repetidos de una "sopa" de triángulos (9 números por
// triángulo) y descarta los triángulos que quedan sin área.
export function soldar(sopa) {
  const indice = new Map();
  const pos = [];
  const tri = [];
  const q = 1 / TOLERANCIA_SOLDADO;
  const idDe = (x, y, z) => {
    const clave = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = indice.get(clave);
    if (id === undefined) {
      id = pos.length / 3;
      indice.set(clave, id);
      pos.push(x, y, z);
    }
    return id;
  };
  for (let i = 0; i < sopa.length; i += 9) {
    const a = idDe(sopa[i], sopa[i + 1], sopa[i + 2]);
    const b = idDe(sopa[i + 3], sopa[i + 4], sopa[i + 5]);
    const c = idDe(sopa[i + 6], sopa[i + 7], sopa[i + 8]);
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  return { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
}

// Vuelve a soldar una malla ya indexada (por ejemplo, una que vino de un 3MF
// con vértices duplicados).
export function resoldar(malla) {
  const sopa = new Float32Array(malla.tri.length * 3);
  for (let i = 0; i < malla.tri.length; i++) {
    const v = malla.tri[i];
    sopa[i * 3] = malla.pos[v * 3];
    sopa[i * 3 + 1] = malla.pos[v * 3 + 1];
    sopa[i * 3 + 2] = malla.pos[v * 3 + 2];
  }
  return soldar(sopa);
}

// Vecino de cada triángulo por cada uno de sus lados: vecinos[t*3+k] es el
// triángulo del otro lado de la arista que va del vértice k al k+1, o -1 si
// es un borde abierto (o una arista con más de dos triángulos).
export function vecinosTriangulos(malla) {
  const { tri } = malla;
  const nv = malla.pos.length / 3;
  const aristas = new Map();
  const nt = tri.length / 3;
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
      const clave = a * nv + b;
      aristas.set(clave, aristas.has(clave) ? -2 : t * 3 + k);
    }
  }
  const vecinos = new Int32Array(nt * 3).fill(-1);
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
      const otra = aristas.get(b * nv + a);
      if (otra !== undefined && otra >= 0 && aristas.get(a * nv + b) >= 0) vecinos[t * 3 + k] = Math.floor(otra / 3);
    }
  }
  return vecinos;
}

export function normalesTriangulos(malla) {
  const { pos, tri } = malla;
  const nt = tri.length / 3;
  const normales = new Float32Array(nt * 3);
  const areas = new Float32Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = vertice(pos, tri[t * 3]), b = vertice(pos, tri[t * 3 + 1]), c = vertice(pos, tri[t * 3 + 2]);
    const n = cruz(restar(b, a), restar(c, a));
    const l = Math.hypot(n[0], n[1], n[2]);
    areas[t] = l / 2;
    if (l > 0) {
      normales[t * 3] = n[0] / l;
      normales[t * 3 + 1] = n[1] / l;
      normales[t * 3 + 2] = n[2] / l;
    }
  }
  return { normales, areas };
}

// Volumen encerrado (mm³). Positivo si los triángulos miran hacia afuera.
export function volumenMalla(malla) {
  const { pos, tri } = malla;
  let v = 0;
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i] * 3, b = tri[i + 1] * 3, c = tri[i + 2] * 3;
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return v / 6;
}

export function cajaMalla(malla) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const { pos } = malla;
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (pos[i + k] < min[k]) min[k] = pos[i + k];
      if (pos[i + k] > max[k]) max[k] = pos[i + k];
    }
  }
  return { min, max };
}

// Una pieza imprimible tiene que ser un sólido cerrado: cada arista la
// comparten exactamente dos triángulos, recorrida una vez en cada sentido.
// Devuelve cuántas aristas abiertas y cuántas mal orientadas o repetidas hay.
export function revisarCerrada(malla) {
  const { tri } = malla;
  const nv = malla.pos.length / 3;
  const cuenta = new Map();
  for (let i = 0; i < tri.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const clave = tri[i + k] * nv + tri[i + ((k + 1) % 3)];
      cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
    }
  }
  let abiertas = 0, repetidas = 0;
  for (const [clave, n] of cuenta) {
    if (n > 1) repetidas++;
    const a = Math.floor(clave / nv), b = clave % nv;
    if (!cuenta.has(b * nv + a)) abiertas++;
  }
  return { abiertas, repetidas, cerrada: abiertas === 0 && repetidas === 0 };
}

// Separa una malla en sus partes sueltas (componentes conexas).
export function partesSueltas(malla) {
  const vecinos = vecinosTriangulos(malla);
  const nt = malla.tri.length / 3;
  const grupo = new Int32Array(nt).fill(-1);
  const grupos = [];
  for (let s = 0; s < nt; s++) {
    if (grupo[s] >= 0) continue;
    const g = grupos.length;
    const lista = [s];
    grupo[s] = g;
    for (let i = 0; i < lista.length; i++) {
      const t = lista[i];
      for (let k = 0; k < 3; k++) {
        const u = vecinos[t * 3 + k];
        if (u >= 0 && grupo[u] < 0) { grupo[u] = g; lista.push(u); }
      }
    }
    grupos.push(lista);
  }
  return grupos.map((lista) => subMalla(malla, lista));
}

// Malla nueva con sólo los triángulos indicados (compacta los vértices).
export function subMalla(malla, triangulos) {
  const mapa = new Map();
  const pos = [];
  const tri = new Uint32Array(triangulos.length * 3);
  triangulos.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const v = malla.tri[t * 3 + k];
      let id = mapa.get(v);
      if (id === undefined) {
        id = pos.length / 3;
        mapa.set(v, id);
        pos.push(malla.pos[v * 3], malla.pos[v * 3 + 1], malla.pos[v * 3 + 2]);
      }
      tri[i * 3 + k] = id;
    }
  });
  return { pos: Float32Array.from(pos), tri };
}

// ---------- Escritura ----------

export function stlBinario(malla, nombre = 'Manager3D') {
  const nt = malla.tri.length / 3;
  const buffer = new ArrayBuffer(84 + nt * 50);
  const vista = new DataView(buffer);
  const cabecera = strToU8(`Manager3D - ${nombre}`.slice(0, 79));
  new Uint8Array(buffer, 0, cabecera.length).set(cabecera);
  vista.setUint32(80, nt, true);
  const { normales } = normalesTriangulos(malla);
  for (let t = 0; t < nt; t++) {
    const base = 84 + t * 50;
    for (let k = 0; k < 3; k++) vista.setFloat32(base + k * 4, normales[t * 3 + k], true);
    for (let v = 0; v < 3; v++) {
      const i = malla.tri[t * 3 + v] * 3;
      for (let k = 0; k < 3; k++) vista.setFloat32(base + 12 + v * 12 + k * 4, malla.pos[i + k], true);
    }
  }
  return new Uint8Array(buffer);
}

const escaparXml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const num = (x) => (Math.round(x * 1e5) / 1e5).toString();

// 3MF con una pieza por cuerpo, cada una con su color. Con `ensamblado` las
// piezas quedan como partes de un mismo objeto en su posición original (el
// slicer las abre armadas, listas para asignar un filamento a cada una); sin
// eso, cada pieza es un objeto suelto con la transformación que se le pase.
export function crear3mf(cuerpos, { ensamblado = true } = {}) {
  const colores = cuerpos.map((c) => `<base name="${escaparXml(c.nombre)}" displaycolor="${(c.color || '#cccccc').toUpperCase()}FF" />`).join('');
  const objetos = cuerpos.map((c, i) => {
    const v = [];
    for (let k = 0; k < c.malla.pos.length; k += 3) v.push(`<vertex x="${num(c.malla.pos[k])}" y="${num(c.malla.pos[k + 1])}" z="${num(c.malla.pos[k + 2])}" />`);
    const t = [];
    for (let k = 0; k < c.malla.tri.length; k += 3) t.push(`<triangle v1="${c.malla.tri[k]}" v2="${c.malla.tri[k + 1]}" v3="${c.malla.tri[k + 2]}" />`);
    return `<object id="${i + 2}" name="${escaparXml(c.nombre)}" type="model" pid="1" pindex="${i}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;
  });
  let build;
  if (ensamblado) {
    const idEnsamble = cuerpos.length + 2;
    objetos.push(`<object id="${idEnsamble}" name="Modelo separado" type="model"><components>${cuerpos.map((_, i) => `<component objectid="${i + 2}" />`).join('')}</components></object>`);
    build = `<item objectid="${idEnsamble}" />`;
  } else {
    build = cuerpos.map((c, i) => `<item objectid="${i + 2}"${c.transformacion ? ` transform="${matriz3mf(c.transformacion)}"` : ''} />`).join('');
  }
  const modelo = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="es-AR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Manager3D</metadata><resources><basematerials id="1">${colores}</basematerials>${objetos.join('')}</resources><build>${build}</build></model>`;
  const tipos = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" /></Relationships>`;
  return zipSync({
    '[Content_Types].xml': strToU8(tipos),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(modelo)
  });
}

function matriz3mf(m) {
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]].map(num).join(' ');
}

// Parte los triángulos con lados más largos que `largoMax` (mm) hasta que
// ninguno lo supere o se llegue a `maxTriangulos`. La forma no cambia (los
// puntos nuevos son puntos medios), pero la varita y el pincel pasan a
// marcar con más detalle en modelos de pocos triángulos, donde un solo
// triángulo largo puede cruzar toda una cara.
export function afinarMalla(malla, largoMax = 1, maxTriangulos = 1500000) {
  let pos = Array.from(malla.pos);
  let tri = malla.tri;
  const l2 = largoMax * largoMax;
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    const medios = new Map();
    const nv0 = pos.length / 3;
    const largo2 = (a, b) => {
      const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
      return dx * dx + dy * dy + dz * dz;
    };
    // Las aristas a partir se deciden primero, para que los dos triángulos
    // que comparten una arista la partan en el mismo punto.
    for (let i = 0; i < tri.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = tri[i + k], b = tri[i + ((k + 1) % 3)];
        const clave = a < b ? a * nv0 + b : b * nv0 + a;
        if (!medios.has(clave) && largo2(a, b) > l2) {
          medios.set(clave, pos.length / 3);
          pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
        }
      }
    }
    if (!medios.size) break;
    const medio = (a, b) => medios.get(a < b ? a * nv0 + b : b * nv0 + a);
    const nuevos = [];
    for (let i = 0; i < tri.length; i += 3) {
      const v = [tri[i], tri[i + 1], tri[i + 2]];
      const m = [medio(v[0], v[1]), medio(v[1], v[2]), medio(v[2], v[0])];
      const partidas = m.filter((x) => x !== undefined).length;
      if (partidas === 0) { nuevos.push(...v); continue; }
      if (partidas === 3) {
        nuevos.push(v[0], m[0], m[2], m[0], v[1], m[1], m[2], m[1], v[2], m[0], m[1], m[2]);
        continue;
      }
      // Se gira el triángulo (sin cambiar su orientación) para que el caso
      // quede siempre igual: con un lado partido, es x→y; con dos, x→y e y→z.
      for (let r = 0; r < 3; r++) {
        const [x, y, z] = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]];
        const [mxy, myz, mzx] = [m[r], m[(r + 1) % 3], m[(r + 2) % 3]];
        if (partidas === 1 && mxy !== undefined) { nuevos.push(x, mxy, z, mxy, y, z); break; }
        if (partidas === 2 && mzx === undefined) { nuevos.push(mxy, y, myz, x, mxy, myz, x, myz, z); break; }
      }
    }
    tri = Uint32Array.from(nuevos);
    if (tri.length / 3 > maxTriangulos) break;
  }
  return { pos: Float32Array.from(pos), tri };
}
