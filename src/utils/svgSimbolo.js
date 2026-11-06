// Símbolo propio a partir de un archivo SVG (Fase 3 del plan en docs/plan-generador-jarros.md). Lee las formas RELLENAS
// del dibujo (con sus huecos) y las deja centradas en (0, 0) y escaladas para entrar en un tamaño. Los trazos sin relleno
// no se usan (hay que convertirlos a contorno en el programa de dibujo). Necesita DOMParser (navegador, o jsdom en pruebas).
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { formasACaminos } from './llaveros';

export const MAX_BYTES_SVG = 300000;
const MAX_PUNTOS = 30000;

const sinRelleno = (estilo) => !estilo || estilo.fill === undefined || estilo.fill === 'none' || estilo.fill === 'transparent' || estilo.fillOpacity === 0;

const cache = new Map(); // texto → contornos unitarios

// Contornos del dibujo: lista de { fuera: [[x, y]…], huecos: [[[x, y]…]…] } con Y hacia arriba, centrados y con el lado
// mayor igual a 1.
export function contornosDeSvg(texto) {
  const svg = String(texto || '');
  if (svg.length > MAX_BYTES_SVG) throw new Error('El SVG es demasiado pesado (más de 300 KB): simplificalo en el programa de dibujo.');
  if (!/<svg[\s>]/i.test(svg)) throw new Error('Ese archivo no parece un SVG.');
  if (cache.has(svg)) return cache.get(svg);
  let datos;
  try {
    datos = new SVGLoader().parse(svg);
  } catch {
    throw new Error('No se pudo leer ese SVG.');
  }
  const formas = [];
  for (const camino of datos.paths) {
    if (sinRelleno(camino.userData?.style)) continue;
    formas.push(...SVGLoader.createShapes(camino));
  }
  const partes = formas.map((f) => f.extractPoints(12)).map(({ shape, holes }) => ({ fuera: shape.map((q) => [q.x, q.y]), huecos: holes.map((h) => h.map((q) => [q.x, q.y])) }))
    .filter((c) => c.fuera.length >= 3);
  if (!partes.length) throw new Error('El SVG no tiene formas rellenas. Si es un dibujo de líneas, convertí los trazos a contorno ("Trazo a trayecto" / "Object stroke to path").');
  const total = partes.reduce((a, c) => a + c.fuera.length + c.huecos.reduce((b, h) => b + h.length, 0), 0);
  if (total > MAX_PUNTOS) throw new Error('El SVG tiene demasiados detalles: simplificalo en el programa de dibujo.');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of partes) for (const [x, y] of c.fuera) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const lado = Math.max(x1 - x0, y1 - y0);
  if (!(lado > 0)) throw new Error('El SVG no tiene tamaño.');
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const ajustar = ([x, y]) => [(x - cx) / lado, -(y - cy) / lado]; // en SVG Y crece hacia abajo
  const resultado = partes.map((c) => ({ fuera: c.fuera.map(ajustar), huecos: c.huecos.map((h) => h.map(ajustar)) }));
  if (cache.size > 6) cache.clear();
  cache.set(svg, resultado);
  return resultado;
}

// Caminos de Clipper del SVG, escalado para que su lado mayor mida `t` mm.
export const caminosDeSvg = (texto, t) => caminosDeContornos(contornosDeSvg(texto), t);

// Caminos de Clipper de unos contornos unitarios (de un SVG o de un símbolo propio), con el lado mayor en `t` mm.
export function caminosDeContornos(contornos, t) {
  const formas = contornos.map((c) => {
    const aVec = (pts) => pts.map(([x, y]) => new THREE.Vector2(x * t, y * t));
    const f = new THREE.Shape(aVec(c.fuera));
    for (const h of c.huecos) f.holes.push(new THREE.Path(aVec(h)));
    return f;
  });
  return formasACaminos(formas);
}
