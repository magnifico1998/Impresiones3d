// Vista previa del relieve en la GPU. El modelo ya viene partido en triángulos
// chicos (prepararVista) y el shader empuja cada vértice según las capas:
// mover el tamaño, la profundidad o la rotación sólo cambia unos números, así
// que se ve al instante, sin recalcular la malla.
//
// Es la misma cuenta que hace la CPU en superficie.js (crearProyector): los
// números salen de describirProyeccion, para que los dos coincidan.
import * as THREE from 'three';
import { MAX_CAPAS, describirProyeccion, procesarTextura } from './superficie';

export const LADO_MAPA = 256; // cada capa tiene un cuadrado de 256 × 256 en el atlas
const LADO_ATLAS = LADO_MAPA * 2;

const TIPOS = { triplanar: 0, cubica: 0, cilindrica: 1, esferica: 2, xy: 3, xz: 4, yz: 5, sello: 6 };

const N = MAX_CAPAS;

// Los uniformes de las cuatro capas (cada uno con su `value`).
export function crearUniformes() {
  const mapa = new THREE.DataTexture(new Float32Array(LADO_ATLAS * LADO_ATLAS), LADO_ATLAS, LADO_ATLAS, THREE.RedFormat, THREE.FloatType);
  mapa.minFilter = THREE.NearestFilter;
  mapa.magFilter = THREE.NearestFilter;
  mapa.generateMipmaps = false;
  mapa.needsUpdate = true;
  return {
    uMapa: { value: mapa },
    uActiva: { value: new Float32Array(N) },
    uCombinar: { value: new Float32Array(N) },
    uTipo: { value: new Float32Array(N) },
    uP: { value: new Float32Array(N) },
    uProf: { value: new Float32Array(N) },
    uSim: { value: new Float32Array(N) },
    uTam: { value: new Float32Array(N * 4) }, // tu, tv, tu ajustado, ángulo de tapa
    uDes: { value: new Float32Array(N * 4) }, // desfase u, desfase v, cos, sen
    uCentro: { value: new Float32Array(N * 4) }, // centro del modelo y radio
    uEjes: { value: new Float32Array(N * 3) },
    uSelloC: { value: new Float32Array(N * 3) },
    uSelloN: { value: new Float32Array(N * 3) },
    uSelloE1: { value: new Float32Array(N * 3) },
    uSelloE2: { value: new Float32Array(N * 3) },
    uProteger: { value: 0 },
    uBaseLisa: { value: 0 },
    uZmin: { value: 0 }
  };
}

// Pasa una textura (n × alto) a un cuadrado de LADO_MAPA × LADO_MAPA.
export function remuestrear(textura, lado = LADO_MAPA) {
  const { n, datos } = textura;
  const alto = textura.alto || n;
  if (n === lado && alto === lado) return datos;
  const salida = new Float32Array(lado * lado);
  for (let y = 0; y < lado; y++) {
    const fy = ((y + 0.5) / lado) * alto - 0.5;
    const j = Math.floor(fy), ty = fy - j;
    const j0 = ((j % alto) + alto) % alto, j1 = (((j + 1) % alto) + alto) % alto;
    for (let x = 0; x < lado; x++) {
      const fx = ((x + 0.5) / lado) * n - 0.5;
      const i = Math.floor(fx), tx = fx - i;
      const i0 = ((i % n) + n) % n, i1 = (((i + 1) % n) + n) % n;
      const a = datos[j0 * n + i0], b = datos[j0 * n + i1], c = datos[j1 * n + i0], d = datos[j1 * n + i1];
      salida[y * lado + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return salida;
}

// Escribe la textura ya procesada (suavizada e invertida) de la capa `i` en el atlas.
export function escribirMapa(uniformes, i, textura) {
  const mapa = uniformes.uMapa.value;
  const datos = remuestrear(textura);
  const ox = (i % 2) * LADO_MAPA, oy = Math.floor(i / 2) * LADO_MAPA;
  for (let y = 0; y < LADO_MAPA; y++) {
    mapa.image.data.set(datos.subarray(y * LADO_MAPA, (y + 1) * LADO_MAPA), (oy + y) * LADO_ATLAS + ox);
  }
  mapa.needsUpdate = true;
}

// Carga en los uniformes lo que hace cada capa. `capas` son las visibles y con
// textura, en el mismo orden con el que se preparó la malla: { op, textura }
// (o null donde la casilla quedó sin capa).
// `malla` es el modelo original (de ahí salen el centro y el tamaño que usan
// la proyección cilíndrica y la esférica) y `zMin` su punto más bajo.
export function llenarUniformes(uniformes, malla, capas, globales, zMin) {
  const u = uniformes;
  for (const k of ['uActiva', 'uCombinar', 'uTipo', 'uP', 'uProf', 'uSim', 'uTam', 'uDes', 'uCentro', 'uEjes', 'uSelloC', 'uSelloN', 'uSelloE1', 'uSelloE2']) u[k].value.fill(0);
  capas.slice(0, N).forEach((capa, i) => {
    if (!capa) return; // esa casilla ya no tiene capa (se apagó o se quitó)
    const { op } = capa;
    const d = describirProyeccion(malla, op);
    u.uActiva.value[i] = 1;
    u.uCombinar.value[i] = op.combinar === 'sumar' ? 1 : 0;
    u.uTipo.value[i] = TIPOS[d.tipo];
    u.uP.value[i] = d.p;
    u.uProf.value[i] = op.profundidad * (op.empujarAdentro ? -1 : 1);
    u.uSim.value[i] = op.simetrico ? 1 : 0;
    u.uTam.value.set([d.tu, d.tv, d.tuAjustado, d.angTapa], i * 4);
    u.uDes.value.set([d.desU, d.desV, d.co, d.si], i * 4);
    u.uCentro.value.set([...d.centro, d.R], i * 4);
    u.uEjes.value.set(d.ejes, i * 3);
    if (d.tipo === 'sello') {
      u.uSelloC.value.set(d.selloCentro, i * 3);
      u.uSelloN.value.set(d.n, i * 3);
      u.uSelloE1.value.set(d.e1, i * 3);
      u.uSelloE2.value.set(d.e2, i * 3);
    }
  });
  u.uProteger.value = globales.protegerVoladizos ? 1 : 0;
  u.uBaseLisa.value = globales.baseLisa ? 1 : 0;
  u.uZmin.value = zMin;
}

// Escribe en el atlas las texturas de las capas (con su suavizado e inversión).
export function escribirMapas(uniformes, capas) {
  capas.slice(0, N).forEach((capa, i) => { if (capa) escribirMapa(uniformes, i, procesarTextura(capa.textura, capa.op)); });
}

const DECLARACIONES = `
in vec4 aRecibe;
uniform sampler2D uMapa;
uniform float uActiva[${N}];
uniform float uCombinar[${N}];
uniform float uTipo[${N}];
uniform float uP[${N}];
uniform float uProf[${N}];
uniform float uSim[${N}];
uniform vec4 uTam[${N}];
uniform vec4 uDes[${N}];
uniform vec4 uCentro[${N}];
uniform vec3 uEjes[${N}];
uniform vec3 uSelloC[${N}];
uniform vec3 uSelloN[${N}];
uniform vec3 uSelloE1[${N}];
uniform vec3 uSelloE2[${N}];
uniform float uProteger;
uniform float uBaseLisa;
uniform float uZmin;

float suaveGl(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Altura bilineal repitiendo la textura de la capa c (igual que muestrear en la CPU).
float muestraMapa(int c, vec2 uv) {
  vec2 p = fract(uv) * ${LADO_MAPA}.0 - 0.5;
  vec2 pf = floor(p);
  vec2 f = p - pf;
  ivec2 i0 = ivec2(pf);
  int ox = (c - (c / 2) * 2) * ${LADO_MAPA};
  int oy = (c / 2) * ${LADO_MAPA};
  int x0 = (i0.x + ${LADO_MAPA}) & ${LADO_MAPA - 1};
  int x1 = (i0.x + ${LADO_MAPA + 1}) & ${LADO_MAPA - 1};
  int y0 = (i0.y + ${LADO_MAPA}) & ${LADO_MAPA - 1};
  int y1 = (i0.y + ${LADO_MAPA + 1}) & ${LADO_MAPA - 1};
  float a = texelFetch(uMapa, ivec2(ox + x0, oy + y0), 0).r;
  float b = texelFetch(uMapa, ivec2(ox + x1, oy + y0), 0).r;
  float d = texelFetch(uMapa, ivec2(ox + x0, oy + y1), 0).r;
  float e = texelFetch(uMapa, ivec2(ox + x1, oy + y1), 0).r;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}

float proyMuestra(int c, float s, float t, float tu, float tv) {
  float co = uDes[c].z;
  float si = uDes[c].w;
  return muestraMapa(c, vec2((s * co - t * si - uDes[c].x) / tu, (s * si + t * co - uDes[c].y) / tv));
}

// x = altura (0 a 1), y = cuánto recibe (0 a 1).
vec2 alturaCapa(int c, vec3 p, vec3 n) {
  float tipo = uTipo[c];
  float tu = uTam[c].x;
  float tv = uTam[c].y;
  if (tipo < 0.5) {
    vec3 w = pow(abs(n), vec3(uP[c]));
    float total = w.x + w.y + w.z;
    if (total == 0.0) total = 1.0;
    float corte = 1e-4 * total;
    if (w.x < corte) w.x = 0.0;
    if (w.y < corte) w.y = 0.0;
    if (w.z < corte) w.z = 0.0;
    float h = 0.0;
    if (w.x > 0.0) h += w.x * proyMuestra(c, p.y, p.z, tu, tv);
    if (w.y > 0.0) h += w.y * proyMuestra(c, p.x, p.z, tu, tv);
    if (w.z > 0.0) h += w.z * proyMuestra(c, p.x, p.y, tu, tv);
    float suma = w.x + w.y + w.z;
    return vec2(h / (suma == 0.0 ? 1.0 : suma), 1.0);
  }
  if (tipo < 1.5) {
    int i1 = int(uEjes[c].x + 0.5);
    int i2 = int(uEjes[c].y + 0.5);
    int ia = int(uEjes[c].z + 0.5);
    vec3 ctr = uCentro[c].xyz;
    float R = uCentro[c].w;
    float a1 = p[i1] - ctr[i1];
    float a2 = p[i2] - ctr[i2];
    float ax = p[ia] - ctr[ia];
    float lateral = proyMuestra(c, atan(a2, a1) * R, ax, uTam[c].z, tv);
    float desdeEje = degrees(acos(min(1.0, abs(n[ia]))));
    float ang = uTam[c].w;
    float tapa = 1.0 - suaveGl(ang, ang + 8.0, desdeEje);
    float h = tapa > 0.0 ? mix(lateral, proyMuestra(c, a1, a2, tu, tv), tapa) : lateral;
    return vec2(h, 1.0);
  }
  if (tipo < 2.5) {
    vec3 d = p - uCentro[c].xyz;
    float r = length(d);
    if (r == 0.0) r = 1.0;
    float R = uCentro[c].w;
    return vec2(proyMuestra(c, atan(d.y, d.x) * R, asin(clamp(d.z / r, -1.0, 1.0)) * R, uTam[c].z, tv), 1.0);
  }
  if (tipo < 3.5) return vec2(proyMuestra(c, p.x, p.y, tu, tv), 1.0);
  if (tipo < 4.5) return vec2(proyMuestra(c, p.x, p.z, tu, tv), 1.0);
  if (tipo < 5.5) return vec2(proyMuestra(c, p.y, p.z, tu, tv), 1.0);
  // Sello: se aplica una sola vez, sin repetir, en un cuadrado alrededor del centro.
  vec3 dd = p - uSelloC[c];
  float a0 = dot(dd, uSelloE1[c]);
  float b0 = dot(dd, uSelloE2[c]);
  float prof = dot(dd, uSelloN[c]);
  float co = uDes[c].z;
  float si = uDes[c].w;
  float a = (a0 - uDes[c].x) * co + (b0 - uDes[c].y) * si;
  float b = -(a0 - uDes[c].x) * si + (b0 - uDes[c].y) * co;
  float mira = dot(n, uSelloN[c]);
  if (abs(a) > tu * 0.5 || abs(b) > tv * 0.5 || abs(prof) > max(tu, tv) || mira < 0.25) return vec2(0.5, 0.0);
  return vec2(muestraMapa(c, vec2(min(0.9999, a / tu + 0.5), min(0.9999, b / tv + 0.5))), suaveGl(0.25, 0.6, mira));
}

vec3 desplazarSuperficie(vec3 p, vec3 n, vec4 recibe) {
  float total = 0.0;
  for (int c = 0; c < ${N}; c++) {
    if (uActiva[c] < 0.5) continue;
    float rc = recibe[c];
    if (rc <= 0.0) continue;
    vec2 hw = alturaCapa(c, p, n);
    float w = rc * hw.y;
    if (w <= 0.0) continue;
    float v = (uSim[c] > 0.5 ? hw.x - 0.5 : hw.x) * uProf[c];
    total = uCombinar[c] > 0.5 ? total + v * w : total * (1.0 - w) + v * w;
  }
  vec3 q = p + n * total;
  if (uProteger > 0.5 && n.z * total < 0.0) q.z = p.z;
  if (uBaseLisa > 0.5 && p.z - uZmin < 0.1) q.z = uZmin;
  return q;
}
`;

// Le agrega a un material estándar el desplazamiento de vértices.
export function parcharMaterial(material, uniformes) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniformes);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECLARACIONES}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = desplazarSuperficie(position, normal, aRecibe);');
  };
  material.customProgramCacheKey = () => 'superficie-gpu-1';
}
