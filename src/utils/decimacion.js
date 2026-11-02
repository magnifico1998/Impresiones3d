// Simplificación de mallas: colapsa aristas de a una, siempre la que menos
// cambia la forma (métrica de error cuádrica, QEM), hasta llegar a la cantidad
// de triángulos pedida. Las zonas planas se pueden colapsar sin perder nada,
// así que lo que más se achica son las caras lisas de un modelo con texturas.
//
// Reglas para no arruinar la malla: no se tocan los vértices del borde de una
// malla abierta, sólo se colapsa una arista si sus dos extremos comparten
// exactamente los vecinos que corresponden (la malla sigue siendo un sólido
// cerrado) y se rechaza el colapso que dé vuelta o aplaste un triángulo.

// Pila de aristas candidatas ordenada por costo, con arreglos tipados.
class Monticulo {
  constructor(capacidad) {
    this.n = 0;
    this.cap = Math.max(1024, capacidad);
    this.costo = new Float64Array(this.cap);
    this.a = new Int32Array(this.cap);
    this.b = new Int32Array(this.cap);
    this.va = new Int32Array(this.cap);
    this.vb = new Int32Array(this.cap);
  }

  crecer() {
    this.cap *= 2;
    for (const k of ['costo', 'a', 'b', 'va', 'vb']) {
      const nuevo = new this[k].constructor(this.cap);
      nuevo.set(this[k]);
      this[k] = nuevo;
    }
  }

  poner(costo, a, b, va, vb) {
    if (this.n === this.cap) this.crecer();
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.costo[p] <= costo) break;
      this.copiar(i, p);
      i = p;
    }
    this.costo[i] = costo; this.a[i] = a; this.b[i] = b; this.va[i] = va; this.vb[i] = vb;
  }

  copiar(a, b) {
    this.costo[a] = this.costo[b]; this.a[a] = this.a[b]; this.b[a] = this.b[b]; this.va[a] = this.va[b]; this.vb[a] = this.vb[b];
  }

  // Saca la de menor costo y deja sus datos en `sacado`.
  sacar(sacado) {
    sacado.costo = this.costo[0]; sacado.a = this.a[0]; sacado.b = this.b[0]; sacado.va = this.va[0]; sacado.vb = this.vb[0];
    this.n--;
    if (this.n === 0) return;
    const c = this.costo[this.n], a = this.a[this.n], b = this.b[this.n], va = this.va[this.n], vb = this.vb[this.n];
    let i = 0;
    for (;;) {
      let h = 2 * i + 1;
      if (h >= this.n) break;
      if (h + 1 < this.n && this.costo[h + 1] < this.costo[h]) h++;
      if (this.costo[h] >= c) break;
      this.copiar(i, h);
      i = h;
    }
    this.costo[i] = c; this.a[i] = a; this.b[i] = b; this.va[i] = va; this.vb[i] = vb;
  }
}

// Simplifica `malla` ({ pos, tri }) hasta `objetivo` triángulos (0 = sin
// meta). Aunque ya se haya llegado a la meta, se siguen colapsando las aristas
// que no cambian la forma más que `tolerancia` mm (caras planas de más).
// Devuelve { pos, tri, antes, despues }.
export function decimar(malla, { objetivo = 0, tolerancia = 0.005 } = {}) {
  const nv = malla.pos.length / 3, nt = malla.tri.length / 3;
  const pos = Float64Array.from(malla.pos);
  const tri = Int32Array.from(malla.tri);
  const vivo = new Uint8Array(nt).fill(1);
  const muerto = new Uint8Array(nv);
  const version = new Int32Array(nv);
  let vivas = nt;
  const tol2 = tolerancia * tolerancia;

  // ---- Cuádricas: la suma de los cuadrados de la distancia a los planos de las caras de cada vértice ----
  const Q = new Float64Array(nv * 10);
  for (let t = 0; t < nt; t++) {
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;
    nx /= l; ny /= l; nz /= l;
    const d = -(nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2]);
    for (let k = 0; k < 3; k++) {
      const q = tri[t * 3 + k] * 10;
      Q[q] += nx * nx; Q[q + 1] += nx * ny; Q[q + 2] += nx * nz; Q[q + 3] += nx * d;
      Q[q + 4] += ny * ny; Q[q + 5] += ny * nz; Q[q + 6] += ny * d;
      Q[q + 7] += nz * nz; Q[q + 8] += nz * d; Q[q + 9] += d * d;
    }
  }

  // ---- Aristas únicas y vértices del borde ----
  const claves = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
      claves[t * 3 + k] = a < b ? a * nv + b : b * nv + a;
    }
  }
  claves.sort();
  const borde = new Uint8Array(nv);
  const unicas = [];
  for (let i = 0; i < claves.length;) {
    let j = i + 1;
    while (j < claves.length && claves[j] === claves[i]) j++;
    const a = Math.floor(claves[i] / nv), b = claves[i] - a * nv;
    unicas.push(a, b);
    if (j - i !== 2) { borde[a] = 1; borde[b] = 1; } // abierta o con más de dos caras
    i = j;
  }

  // ---- Caras de cada vértice (listas enlazadas en arreglos) ----
  let cap = nt * 3 + 1024;
  let nodoCara = new Int32Array(cap), nodoSig = new Int32Array(cap);
  let usados = 0;
  const cabeza = new Int32Array(nv).fill(-1);
  const agregar = (v, f) => {
    if (usados === cap) {
      cap *= 2;
      const c = new Int32Array(cap); c.set(nodoCara); nodoCara = c;
      const s = new Int32Array(cap); s.set(nodoSig); nodoSig = s;
    }
    nodoCara[usados] = f; nodoSig[usados] = cabeza[v]; cabeza[v] = usados++;
  };
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) agregar(tri[t * 3 + k], t);

  const tiene = (f, v) => tri[f * 3] === v || tri[f * 3 + 1] === v || tri[f * 3 + 2] === v;
  const marca = new Int32Array(nv);
  let sello = 0;
  const vecinosDe = (u, salida) => {
    salida.length = 0;
    sello++;
    for (let n = cabeza[u]; n >= 0; n = nodoSig[n]) {
      const f = nodoCara[n];
      if (!vivo[f] || !tiene(f, u)) continue;
      for (let k = 0; k < 3; k++) {
        const w = tri[f * 3 + k];
        if (w !== u && marca[w] !== sello) { marca[w] = sello; salida.push(w); }
      }
    }
  };

  // ---- Costo de colapsar a-b: el mejor entre dejar a, dejar b o el punto medio ----
  const qs = new Float64Array(10);
  const mejor = { costo: 0, x: 0, y: 0, z: 0 };
  const error = (x, y, z) => qs[0] * x * x + 2 * qs[1] * x * y + 2 * qs[2] * x * z + 2 * qs[3] * x
    + qs[4] * y * y + 2 * qs[5] * y * z + 2 * qs[6] * y + qs[7] * z * z + 2 * qs[8] * z + qs[9];
  const evaluar = (a, b) => {
    for (let k = 0; k < 10; k++) qs[k] = Q[a * 10 + k] + Q[b * 10 + k];
    const cand = [
      [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]],
      [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]],
      [(pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2]
    ];
    let m = Infinity;
    for (const [x, y, z] of cand) {
      const e = error(x, y, z);
      if (e < m) { m = e; mejor.x = x; mejor.y = y; mejor.z = z; }
    }
    mejor.costo = Math.max(0, m);
  };

  const monticulo = new Monticulo(unicas.length / 2 + 1024);
  for (let i = 0; i < unicas.length; i += 2) {
    evaluar(unicas[i], unicas[i + 1]);
    monticulo.poner(mejor.costo, unicas[i], unicas[i + 1], 0, 0);
  }

  // ---- ¿Se puede colapsar a-b llevándolos al punto (x, y, z)? ----
  const listaA = [], listaB = [];
  const marcaA = new Int32Array(nv);
  let selloA = 0;
  const sePuede = (a, b, x, y, z) => {
    if (borde[a] || borde[b]) return false;
    // Caras que tienen a los dos: tienen que ser exactamente dos.
    let comunes = 0;
    for (let n = cabeza[a]; n >= 0; n = nodoSig[n]) {
      const f = nodoCara[n];
      if (vivo[f] && tiene(f, a) && tiene(f, b)) comunes++;
    }
    if (comunes !== 2) return false;
    // Condición de enlace: los vecinos en común son justo los de esas dos caras.
    vecinosDe(a, listaA);
    selloA++;
    for (const w of listaA) marcaA[w] = selloA;
    vecinosDe(b, listaB);
    let enComun = 0;
    for (const w of listaB) if (marcaA[w] === selloA) enComun++;
    if (enComun !== 2) return false;
    // Ningún triángulo se da vuelta ni se aplasta.
    for (const [v, otro] of [[a, b], [b, a]]) {
      for (let n = cabeza[v]; n >= 0; n = nodoSig[n]) {
        const f = nodoCara[n];
        if (!vivo[f] || !tiene(f, v) || tiene(f, otro)) continue;
        const i0 = tri[f * 3], i1 = tri[f * 3 + 1], i2 = tri[f * 3 + 2];
        const p = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
        const viejo = [p(i0), p(i1), p(i2)];
        const nuevo = [i0 === v ? [x, y, z] : viejo[0], i1 === v ? [x, y, z] : viejo[1], i2 === v ? [x, y, z] : viejo[2]];
        const cruz = (t) => {
          const ux = t[1][0] - t[0][0], uy = t[1][1] - t[0][1], uz = t[1][2] - t[0][2];
          const vx = t[2][0] - t[0][0], vy = t[2][1] - t[0][1], vz = t[2][2] - t[0][2];
          return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        };
        const co = cruz(viejo), cn = cruz(nuevo);
        const lo = Math.hypot(...co), ln = Math.hypot(...cn);
        if (lo < 1e-12) continue;
        if (ln < 1e-10 || co[0] * cn[0] + co[1] * cn[1] + co[2] * cn[2] < 0.2 * lo * ln) return false;
      }
    }
    return true;
  };

  // ---- Colapsar ----
  const sacado = { costo: 0, a: 0, b: 0, va: 0, vb: 0 };
  const vecinosU = [];
  while (monticulo.n > 0) {
    monticulo.sacar(sacado);
    const { costo, a: u, b: v } = sacado;
    if (muerto[u] || muerto[v] || version[u] !== sacado.va || version[v] !== sacado.vb) continue;
    if ((objetivo <= 0 || vivas <= objetivo) && costo > tol2) break;
    evaluar(u, v);
    if (!sePuede(u, v, mejor.x, mejor.y, mejor.z)) continue;
    pos[u * 3] = mejor.x; pos[u * 3 + 1] = mejor.y; pos[u * 3 + 2] = mejor.z;
    for (let k = 0; k < 10; k++) Q[u * 10 + k] += Q[v * 10 + k];
    for (let n = cabeza[v]; n >= 0; n = nodoSig[n]) {
      const f = nodoCara[n];
      if (!vivo[f] || !tiene(f, v)) continue;
      if (tiene(f, u)) { vivo[f] = 0; vivas--; continue; }
      for (let k = 0; k < 3; k++) if (tri[f * 3 + k] === v) tri[f * 3 + k] = u;
      agregar(u, f);
    }
    muerto[v] = 1;
    version[u]++;
    vecinosDe(u, vecinosU);
    for (const w of vecinosU) {
      evaluar(u, w);
      monticulo.poner(mejor.costo, u, w, version[u], version[w]);
    }
  }

  // ---- Armar la malla chica ----
  const nuevoId = new Int32Array(nv).fill(-1);
  let cuenta = 0;
  for (let t = 0; t < nt; t++) {
    if (!vivo[t]) continue;
    for (let k = 0; k < 3; k++) if (nuevoId[tri[t * 3 + k]] < 0) nuevoId[tri[t * 3 + k]] = cuenta++;
  }
  const salidaPos = new Float32Array(cuenta * 3);
  for (let v = 0; v < nv; v++) {
    const id = nuevoId[v];
    if (id >= 0) { salidaPos[id * 3] = pos[v * 3]; salidaPos[id * 3 + 1] = pos[v * 3 + 1]; salidaPos[id * 3 + 2] = pos[v * 3 + 2]; }
  }
  const salidaTri = new Uint32Array(vivas * 3);
  let o = 0;
  for (let t = 0; t < nt; t++) {
    if (!vivo[t]) continue;
    for (let k = 0; k < 3; k++) salidaTri[o++] = nuevoId[tri[t * 3 + k]];
  }
  return { pos: salidaPos, tri: salidaTri, antes: nt, despues: vivas };
}
