// Genera los iconos de la app instalable (public/icons/*.png) con el hexágono del logo
// de Manager3D (el mismo del encabezado), sin dependencias: dibuja los trazos y arma el
// PNG a mano. Se corre una sola vez (o al cambiar el logo):
//   node scripts/generar-iconos-pwa.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FONDO = [15, 17, 23]; // --bg
const TRAZO = [110, 231, 183]; // --accent
const EXTERIOR = [[10, 2], [18, 6], [18, 14], [10, 18], [2, 14], [2, 6]];
const INTERIOR = [[10, 6], [14, 8], [14, 12], [10, 14], [6, 12], [6, 8]];

const distanciaASegmento = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const distanciaAPoligono = (px, py, pts) => Math.min(...pts.map((p, i) => distanciaASegmento(px, py, p, pts[(i + 1) % pts.length])));

// tamaño: lado en px. escala: cuánto del lado ocupa el logo (0.6 = 60%; los "maskable" necesitan margen).
function dibujar(tamano, escala) {
  const S = 3; // supermuestreo para suavizar
  const lado = 20 * (1 / escala); // viewBox ampliado: el logo (20x20) queda centrado
  const desde = (20 - lado) / 2;
  const grosor = 1.5;
  const filas = [];
  for (let y = 0; y < tamano; y++) {
    const fila = Buffer.alloc(1 + tamano * 4);
    for (let x = 0; x < tamano; x++) {
      let cubierto = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = desde + ((x + (sx + 0.5) / S) / tamano) * lado;
          const py = desde + ((y + (sy + 0.5) / S) / tamano) * lado;
          if (Math.min(distanciaAPoligono(px, py, EXTERIOR), distanciaAPoligono(px, py, INTERIOR)) <= grosor / 2) cubierto++;
        }
      }
      const a = cubierto / (S * S);
      const o = 1 + x * 4;
      for (let c = 0; c < 3; c++) fila[o + c] = Math.round(FONDO[c] * (1 - a) + TRAZO[c] * a);
      fila[o + 3] = 255;
    }
    filas.push(fila);
  }
  return Buffer.concat(filas);
}

const tablaCrc = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = tablaCrc[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloque = (tipo, datos) => {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
};
function png(tamano, escala) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(tamano, 0); cabecera.writeUInt32BE(tamano, 4);
  cabecera[8] = 8; cabecera[9] = 6; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', zlib.deflateSync(dibujar(tamano, escala), { level: 9 })),
    bloque('IEND', Buffer.alloc(0))
  ]);
}

const carpeta = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(carpeta, { recursive: true });
const iconos = [
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['icon-maskable-512.png', 512, 0.5], // zona segura: el sistema le recorta los bordes
  ['apple-touch-icon.png', 180, 0.62]
];
for (const [nombre, tam, escala] of iconos) {
  fs.writeFileSync(path.join(carpeta, nombre), png(tam, escala));
  console.log('ok', nombre);
}
