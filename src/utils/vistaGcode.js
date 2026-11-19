// Vista previa 3D del G-code (calculadora): saca del G-code los trazos donde
// la impresora realmente extruye, agrupados por capa, para dibujarlos y poder
// girarlos. Los movimientos en vacío (viajes, retracciones) no se dibujan.
//
// Se recorre el texto línea por línea sin partirlo en un arreglo gigante: un
// G-code de Bambu/Orca puede pesar decenas de MB.
//
// Resultado:
//   pos:    Float32Array, 6 números por trazo (x1,y1,z1,x2,y2,z2)
//   tipo:   Uint8Array, un id de `tipos` por trazo (qué parte de la pieza es)
//   capas:  Uint32Array, índice del primer trazo de cada capa
//   tipos:  nombres de las partes que trae el archivo (";TYPE:" del laminador)
//   min/max: caja que ocupa la pieza, para centrar la cámara
//   parcial: true si se llegó al tope de trazos y se dejó de leer

const TOPE_TRAZOS = 3_000_000;
// Un arco (G2/G3) se parte en tramos de este ángulo para que se vea redondo.
const PASO_ARCO = Math.PI / 18;

// Color de cada parte según cómo la nombre el laminador (Bambu/Orca/Prusa/Cura).
export function colorDeTipo(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (/overhang/.test(n)) return '#4cc9f0';
  if (/bridge/.test(n)) return '#4895ef';
  if (/support/.test(n)) return '#2a9d8f';
  if (/outer|external|wall-outer/.test(n)) return '#ff7a00';
  if (/inner|perimeter|wall/.test(n)) return '#ffc857';
  if (/top|skin/.test(n)) return '#f72585';
  if (/solid/.test(n)) return '#9b5de5';
  if (/sparse|infill|fill/.test(n)) return '#d1495b';
  if (/skirt|brim|prime|wipe/.test(n)) return '#8d99ae';
  return '#b0b5b0';
}

function crecer(arr, nuevo) {
  const r = new arr.constructor(nuevo);
  r.set(arr);
  return r;
}

export function parsearVistaGcode(texto, { tope = TOPE_TRAZOS } = {}) {
  let cap = 20000;
  let pos = new Float32Array(cap * 6);
  let tipo = new Uint8Array(cap);
  let n = 0;
  let capas = new Uint32Array(256);
  let nCapas = 0;
  const tipos = [];
  const idTipo = new Map();
  let tipoActual = 0;
  let parcial = false;

  let x = 0, y = 0, z = 0, e = 0;
  let absXYZ = true, absE = true;
  let zCapa = null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  const registrarTipo = (nombre) => {
    if (!idTipo.has(nombre)) {
      // Más de 255 tipos distintos no pasa; si pasara, se reusa el último.
      idTipo.set(nombre, Math.min(tipos.length, 255));
      tipos.push(nombre);
    }
    tipoActual = idTipo.get(nombre);
  };

  // Suma un trazo recto; si sigue la misma recta del anterior lo alarga en
  // vez de guardar otro (el relleno trae miles de tramos alineados).
  const trazo = (x1, y1, x2, y2, zz) => {
    if (zCapa === null || Math.abs(zz - zCapa) > 1e-4) {
      zCapa = zz;
      if (nCapas === capas.length) capas = crecer(capas, capas.length * 2);
      capas[nCapas++] = n;
    }
    if (n > 0 && n - 1 >= capas[nCapas - 1]) {
      const o = (n - 1) * 6;
      if (tipo[n - 1] === tipoActual && pos[o + 3] === x1 && pos[o + 4] === y1) {
        const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1];
        const bx = x2 - x1, by = y2 - y1;
        const cruz = ax * by - ay * bx;
        const punto = ax * bx + ay * by;
        if (punto > 0 && Math.abs(cruz) < 1e-3 * Math.hypot(ax, ay) * Math.hypot(bx, by)) {
          pos[o + 3] = x2;
          pos[o + 4] = y2;
          if (x2 < min[0]) min[0] = x2;
          if (x2 > max[0]) max[0] = x2;
          if (y2 < min[1]) min[1] = y2;
          if (y2 > max[1]) max[1] = y2;
          return;
        }
      }
    }
    if (n >= tope) { parcial = true; return; }
    if (n === cap) {
      cap *= 2;
      pos = crecer(pos, cap * 6);
      tipo = crecer(tipo, cap);
    }
    const o = n * 6;
    pos[o] = x1; pos[o + 1] = y1; pos[o + 2] = zz;
    pos[o + 3] = x2; pos[o + 4] = y2; pos[o + 5] = zz;
    tipo[n++] = tipoActual;
    if (x1 < min[0]) min[0] = x1;
    if (x2 < min[0]) min[0] = x2;
    if (x1 > max[0]) max[0] = x1;
    if (x2 > max[0]) max[0] = x2;
    if (y1 < min[1]) min[1] = y1;
    if (y2 < min[1]) min[1] = y2;
    if (y1 > max[1]) max[1] = y1;
    if (y2 > max[1]) max[1] = y2;
    if (zz < min[2]) min[2] = zz;
    if (zz > max[2]) max[2] = zz;
  };

  const reParam = /([XYZEIJ])\s*(-?\d*\.?\d+)/gi;
  let ini = 0;
  const largo = texto.length;
  while (ini < largo && !parcial) {
    let fin = texto.indexOf('\n', ini);
    if (fin === -1) fin = largo;
    const c0 = texto.charCodeAt(ini);
    // Línea de comentario: sólo interesa ";TYPE:..." / ";FEATURE:..." (la parte de la pieza).
    if (c0 === 59) {
      const m = /^;\s*(?:TYPE|FEATURE)\s*:\s*(.+?)\s*$/i.exec(texto.slice(ini, fin));
      if (m) registrarTipo(m[1]);
      ini = fin + 1;
      continue;
    }
    // Sólo las líneas que arrancan con G o M nos importan.
    if (c0 === 71 || c0 === 77) {
      let linea = texto.slice(ini, fin);
      const pc = linea.indexOf(';');
      if (pc !== -1) linea = linea.slice(0, pc);
      const cmd = /^([GM])(\d+)/i.exec(linea);
      if (cmd) {
        const num = parseInt(cmd[2], 10);
        if (cmd[1] === 'M' || cmd[1] === 'm') {
          if (num === 82) absE = true;
          else if (num === 83) absE = false;
        } else if (num === 90) absXYZ = true;
        else if (num === 91) absXYZ = false;
        else if (num === 92) {
          reParam.lastIndex = 0;
          let p;
          while ((p = reParam.exec(linea))) if (p[1].toUpperCase() === 'E') e = parseFloat(p[2]);
        } else if (num <= 3) {
          const v = {};
          reParam.lastIndex = 0;
          let p;
          while ((p = reParam.exec(linea))) v[p[1].toUpperCase()] = parseFloat(p[2]);
          const nx = v.X === undefined ? x : (absXYZ ? v.X : x + v.X);
          const ny = v.Y === undefined ? y : (absXYZ ? v.Y : y + v.Y);
          const nz = v.Z === undefined ? z : (absXYZ ? v.Z : z + v.Z);
          let extruye = false;
          if (v.E !== undefined) {
            const ne = absE ? v.E : e + v.E;
            extruye = ne > e && num !== 0;
            e = ne;
          }
          // Sólo cuenta si se mueve en el plano: un cambio de Z solo (subir la
          // capa) o un empuje de filamento en el lugar no dejan trazo.
          if (extruye && (nx !== x || ny !== y)) {
            if (num === 1) {
              trazo(x, y, nx, ny, nz);
            } else if (v.I !== undefined || v.J !== undefined) {
              // G2 = horario, G3 = antihorario, con el centro relativo al punto de partida.
              const cx = x + (v.I || 0), cy = y + (v.J || 0);
              const r = Math.hypot(x - cx, y - cy);
              const a0 = Math.atan2(y - cy, x - cx);
              let a1 = Math.atan2(ny - cy, nx - cx);
              if (num === 2) { while (a1 >= a0) a1 -= 2 * Math.PI; } else { while (a1 <= a0) a1 += 2 * Math.PI; }
              const pasos = Math.max(1, Math.ceil(Math.abs(a1 - a0) / PASO_ARCO));
              let px = x, py = y;
              for (let k = 1; k <= pasos; k++) {
                const a = a0 + ((a1 - a0) * k) / pasos;
                const qx = k === pasos ? nx : cx + r * Math.cos(a);
                const qy = k === pasos ? ny : cy + r * Math.sin(a);
                trazo(px, py, qx, qy, nz);
                px = qx; py = qy;
              }
            } else {
              trazo(x, y, nx, ny, nz);
            }
          }
          x = nx; y = ny; z = nz;
        }
      }
    }
    ini = fin + 1;
  }

  return {
    pos: pos.slice(0, n * 6),
    tipo: tipo.slice(0, n),
    capas: capas.slice(0, nCapas),
    tipos,
    nTrazos: n,
    min: n ? min : [0, 0, 0],
    max: n ? max : [0, 0, 0],
    parcial
  };
}

// G-codes que trae un archivo para la vista previa: el propio texto si es
// .gcode, o cada placa si es un .3mf de Bambu/Orca (Metadata/plate_N.gcode).
// Devuelve [{ nombre, leer() → texto }]; el texto se lee recién al pedirlo.
export async function gcodesDeArchivo(archivo) {
  const nombre = archivo.name;
  if (!/\.3mf$/i.test(nombre)) {
    return [{ nombre, leer: () => archivo.text() }];
  }
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await archivo.arrayBuffer());
  return Object.keys(zip.files)
    .filter((k) => /\.(gcode|gco)$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((k) => ({ nombre: k.replace(/^.*\//, ''), leer: () => zip.files[k].async('string') }));
}
