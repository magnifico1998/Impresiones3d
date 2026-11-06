// Generador de jarros porta-lata (plan en docs/plan-generador-jarros.md). Arma el jarro como una LISTA DE PIEZAS
// (cuerpo, asa…): cada una con su malla { pos, tri } en milímetros, su color y si es desmontable. Con Z hacia arriba y
// la base del jarro apoyada en z = 0, centrado en x = y = 0; el asa sale hacia +X (y se puede girar alrededor del
// jarro). No toca el navegador, así que se prueba en Node.
//
// Piezas desmontables: cada pieza trae también `mallaImpresion`, que es la misma pieza apoyada como se imprime (el asa,
// acostada sobre su lado), para exportarla suelta o acomodarla en una placa de impresión.
//
// Cuerpo: sólido de revolución cuya silueta exterior se edita con puntos (`formaPuntos`: altura 0 a 1 y cuánto se
// ensancha sobre la pared, en mm). El hueco de la lata es un cilindro; el fondo puede llevar una abertura para empujar
// la lata desde abajo.
//
// Asa: curva libre en el plano que contiene al eje del jarro (`asaPuntos`: puntos normalizados que se arrastran en un
// editor). Cada extremo arranca con un tramo recto horizontal pegado a la pared (para que el encastre apoye plano) y la
// sección puede engrosarse en los extremos. Puede ir PEGADA (por defecto: los extremos se meten en la pared) o
// DESMONTABLE con encastre: el cuerpo lleva dos placas de montaje con una ranura rectangular y el asa trae una espiga
// en cada extremo, con una holgura.
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import { soldar, transformarMalla, matrizRotacion, cajaMalla, volumenMalla, revisarCerrada } from './mallas3d';
import { unirMallas, moverMalla, entraEnCama } from './llaveros';
import { revolucion, caja3d, limpiarTriangulos } from './mallasJarro';
import { motorListo, operar } from './motorBooleano';
import { ALINEACIONES, FORMAS_CARTEL, MAX_LETRAS_RENGLON, MAX_RENGLONES, MAYUSCULAS_CARTEL, armarCartel } from './jarrosCartel';
import { RESPALDOS, SIMBOLOS, SIMBOLO_INICIAL, SIMBOLO_PROPIO, SIMBOLO_SVG, armarAros, armarEmblemas } from './jarrosDetalles';
import { MAX_BYTES_SVG } from './svgSimbolo';
import { MAX_BYTES_SIMBOLO } from './simbolosPropios';
import { TEXTURA_NINGUNA, armarCuerpoTexturado, esTextura } from './jarrosTextura';
import { ESTILOS_ENVOLTURA, armarComplementosAsa } from './jarrosAsa';

// Latas más comunes (diámetro y alto en mm). La de 500 ml es la que usa Gustavo (70 × 170); con "Medida propia" se
// escribe cualquier diámetro y alto de hueco.
export const LATAS = [
  { id: '500', nombre: '500 ml · media pinta', diametro: 70, alto: 170 },
  { id: '250', nombre: '250 ml · slim', diametro: 53, alto: 134 },
  { id: '330', nombre: '330 ml · estándar', diametro: 66.2, alto: 115 },
  { id: '330s', nombre: '330 ml · slim alta', diametro: 58, alto: 146 },
  { id: '355', nombre: '355 ml · estándar', diametro: 66.2, alto: 122.2 },
  { id: '440', nombre: '440 ml · alta', diametro: 66.2, alto: 147 },
  { id: '473', nombre: '473 ml · tallboy', diametro: 66.2, alto: 157 },
  { id: '568', nombre: '568 ml · pinta', diametro: 66.2, alto: 181 },
  { id: '710', nombre: '710 ml', diametro: 73, alto: 216 },
  { id: '946', nombre: '946 ml · crowler', diametro: 73, alto: 193 }
];
export const LATA_PROPIA = 'propia';

// Siluetas del cuerpo: puntos [altura (0 base a 1 borde), cuánto se ensancha sobre la pared (mm)].
export const FORMAS = [
  { id: 'recto', nombre: 'Recto', puntos: [[0, 0], [1, 0]] },
  { id: 'cono', nombre: 'Más ancho arriba', puntos: [[0, 0], [1, 8]] },
  { id: 'conoInv', nombre: 'Más ancho abajo', puntos: [[0, 8], [1, 0]] },
  { id: 'barril', nombre: 'Barril', puntos: [[0, 0], [0.5, 9], [1, 0]] },
  { id: 'cintura', nombre: 'Cintura', puntos: [[0, 7], [0.5, 0], [1, 7]] },
  { id: 'copa', nombre: 'Copa', puntos: [[0, 0], [0.55, 1], [1, 12]] },
  { id: 'base', nombre: 'Base ancha', puntos: [[0, 12], [0.22, 3], [1, 0]] }
];
export const FORMA_PROPIA = 'propia';

// Formas del asa: puntos [hacia afuera (0 pared a 1 = lo que sobresale), altura (0 extremo de abajo a 1 extremo de
// arriba)], ordenados de arriba hacia abajo; `esquinas`: cuáles son esquina viva. Los extremos (en la pared) no se
// editan: cada uno arranca con un tramo recto horizontal.
export const FORMAS_ASA = [
  { id: 'clasica', nombre: 'Clásica', puntos: [[0.75, 0.844], [1, 0.5], [0.75, 0.156]], esquinas: [] },
  { id: 'd', nombre: 'En D', puntos: [[0.93, 0.95], [1, 0.5], [0.93, 0.05]], esquinas: [] },
  { id: 'oreja', nombre: 'Oreja', puntos: [[0.62, 1], [1, 0.74], [0.95, 0.3], [0.5, 0.05]], esquinas: [] },
  { id: 'angular', nombre: 'Angular', puntos: [[1, 1], [1, 0]], esquinas: [0, 1] },
  { id: 'sinsoportes', nombre: 'Sin soportes', puntos: [[0.5, 0.8], [0.85, 0.6], [1, 0.5], [0.85, 0.4], [0.5, 0.2]], esquinas: [] }
];
export const ASA_PROPIA = 'propia';

export const PARAMETROS_INICIALES = Object.freeze({
  // Lata y hueco: el hueco es la lata más la holgura, pero se puede escribir a mano.
  latId: '500',
  holgura: 0.5,
  diametroHueco: 70.5,
  altoHueco: 170,
  // Cuerpo
  pared: 3,
  fondo: 4,
  forma: 'recto',
  formaPuntos: [[0, 0], [1, 0]],
  aberturaFondo: 0, // diámetro del agujero del fondo para empujar la lata; 0 = sin abertura
  // Asa
  asa: true,
  asaDesmontable: false,
  asaForma: 'clasica',
  asaPuntos: [[0.75, 0.844], [1, 0.5], [0.75, 0.156]],
  asaEsquinas: [],
  asaSalida: 40, // cuánto sobresale del jarro
  asaDistTope: 24, // del borde de arriba al centro del extremo superior
  asaDistBase: 30, // de la base al centro del extremo inferior
  asaAncho: 13,
  asaGrosor: 11,
  asaRedondez: 2.6, // 2 = elíptica; más alto = más cuadrada
  asaExtremos: 115, // % más gruesa en los extremos
  asaAngulo: 0, // giro alrededor del jarro (grados)
  // Encastre del asa desmontable
  holguraEncastre: 0.3,
  placa: 6, // cuánto sobresale la placa de montaje de la pared
  // Cartel con el nombre (Fase 2): una pieza que se imprime aparte y se encastra en una cavidad del cuerpo.
  cartel: false,
  cartelTexto: 'Jarro',
  cartelFuente: 'lobster',
  cartelMayusculas: 'como',
  cartelAlineacion: 'centro', // del texto de varios renglones
  cartelInterlineado: 1.35,
  cartelAlturaLetra: 12,
  cartelEngrosar: 0,
  cartelForma: 'cinta',
  cartelTamano: 'ajustado', // 'ajustado' a las letras o 'propio'
  cartelAncho: 70,
  cartelAlto: 28,
  cartelMargen: 4, // espacio alrededor del texto
  cartelGrosor: 3, // de la base, contando lo que se mete en la pared
  cartelRelieve: 1.2, // cuánto sobresalen las letras, el borde y los remaches
  cartelBisel: 0.8,
  cartelArco: 0, // mm que sube (o baja, con valor negativo) el centro del cartel
  cartelOnda: 0,
  cartelBorde: true,
  cartelBordeAncho: 1.6,
  cartelRemaches: 0, // 0, 2 o 4
  cartelAltura: 85, // del fondo del jarro al centro del cartel
  cartelCantidad: 1, // 1 a 4 carteles iguales, repartidos parejo alrededor del jarro
  cartelAngulo: 0, // 0 = de frente (el asa de fábrica sale hacia un costado)
  cartelDesmontable: true,
  cartelEmpotrado: 1.5, // cuánto se mete la base en la pared (sólo desmontable)
  // Complementos del asa (Fase 5): piezas aparte que se pegan o calzan sobre el asa.
  envoltura: false, // manga del agarre, en dos mitades
  envolturaEstilo: 'cuerda', // 'liso', 'cuerda', 'bandas' o 'acanalado'
  envolturaCentro: 50, // % del largo del asa donde va el centro de la envoltura
  envolturaLargo: 60, // mm
  envolturaEspesor: 2.5, // mm que sobresale del asa
  envolturaPaso: 8, // mm entre vueltas de la cuerda o entre bandas
  envolturaRemate: true, // collarines en las dos puntas de la envoltura
  asaCollarines: false, // un collarín junto a cada pared
  collarinAncho: 6,
  collarinEspesor: 1.6,
  pulgar: false, // descanso para el pulgar
  pulgarPosicion: 22, // % del largo del asa, desde el extremo de arriba
  pulgarLargo: 30,
  pulgarArco: 110, // grados de la sección que cubre (por afuera)
  pulgarAlto: 3,
  asaSimbolo: false, // plaquita con el símbolo de Emblemas sobre el asa
  asaSimboloTamano: 14,
  asaSimboloPosicion: 50, // % del largo del asa
  asaSimboloRespaldo: 'ovalo',
  asaSimboloRelieve: 1,
  asaPlacas: false, // placas de montaje decorativas (rosetones) en los extremos del asa
  asaPlacaForma: 'ovalo',
  asaPlacaLado: 26,
  asaPlacaGrosor: 2.2,
  // Textura del cuerpo (Fase 4): relieve real en la pared exterior (sólo hacia adentro, para que lo demás siga calzando).
  textura: TEXTURA_NINGUNA, // 'ninguna', 'duelas' o el id de una textura del catálogo de superficies
  texturaTamano: 12, // mm que mide una repetición (catálogo)
  texturaProfundidad: 0.6,
  texturaInvertir: false,
  texturaBorde: 3, // mm de borde liso arriba y abajo
  texturaResolucion: 0, // mm entre puntos de la malla final (0 = automática)
  duelasCantidad: 16,
  duelasSeparacion: 1.2, // ancho de la ranura entre duelas (mm)
  duelasProfundidad: 1, // profundidad de la ranura (mm)
  duelasIrregularidad: 0.4, // 0 a 1: duelas de distinto ancho y altura
  duelasVeta: 0.5, // 0 a 1: profundidad de las vetas
  duelasSemilla: 1, // otra variante de duelas, mismos ajustes
  // Emblemas (Fase 3): un símbolo sobre un respaldo, repetido alrededor del jarro.
  emblema: false,
  emblemaSimbolo: SIMBOLO_INICIAL, // uno de la lista o 'svg' (el dibujo en `emblemaSvg`)
  emblemaSvg: '', // texto del SVG que subió el usuario
  emblemaSvgNombre: '',
  emblemaForma: '', // contornos (JSON) del símbolo propio: dibujado en el editor o de la biblioteca
  emblemaFormaNombre: '',
  emblemaRespaldo: 'ovalo',
  emblemaTamano: 30, // alto del símbolo
  emblemaMargen: 4, // del símbolo al borde del respaldo
  emblemaGrosor: 3,
  emblemaRelieve: 1.2,
  emblemaBisel: 0.8,
  emblemaBorde: true,
  emblemaBordeAncho: 1.4,
  emblemaCantidad: 1, // 1 a 4, repartidos parejo alrededor
  emblemaAltura: 85,
  emblemaAngulo: 180, // 0 = de frente, como el cartel; 180 = atrás
  emblemaDesmontable: true,
  emblemaEmpotrado: 1.5,
  // Aros decorativos (Fase 3): bandas que dan toda la vuelta, arriba y abajo.
  aroArriba: false,
  aroAbajo: false,
  aroAlto: 6,
  aroRelieve: 1.5,
  aroDistBorde: 6, // del borde de arriba del jarro al aro de arriba
  aroDistBase: 6, // del fondo al aro de abajo
  aroRemaches: 0, // cantidad alrededor (0 = sin remaches)
  aroDesmontable: false,
  aroEmpotrado: 1.2,
  colores: {
    cuerpo: '#c0392b', asa: '#2f7d3a', cartel: '#e9d8a6', letras: '#3a2a1a', borde: '#8a6b3b', remaches: '#c9a227',
    emblema: '#8a6b3b', simbolo: '#e9d8a6', emblemaBorde: '#c9a227', aro: '#8a6b3b', aroRemaches: '#c9a227',
    envoltura: '#6b4a2f', collarin: '#b8b8b8', pulgar: '#6b4a2f', placaAsa: '#8a6b3b'
  },
  impresora: 'ams'
});

const LIMITES = {
  holgura: [0, 3], diametroHueco: [30, 120], altoHueco: [40, 300], pared: [1.2, 12], fondo: [1.2, 20],
  asaSalida: [15, 100], asaDistTope: [8, 150], asaDistBase: [8, 150], asaAncho: [6, 30], asaGrosor: [6, 25],
  asaRedondez: [2, 6], asaExtremos: [100, 160], asaAngulo: [-180, 180], holguraEncastre: [0.1, 1], placa: [3, 12],
  cartelAlturaLetra: [5, 40], cartelInterlineado: [1, 2.2], cartelEngrosar: [0, 2], cartelAncho: [20, 200], cartelAlto: [10, 80], cartelMargen: [1, 15], cartelGrosor: [1.6, 8],
  cartelRelieve: [0.4, 4], cartelBisel: [0, 3], cartelArco: [-15, 15], cartelOnda: [0, 5], cartelBordeAncho: [0.8, 6], cartelAltura: [10, 300],
  cartelAngulo: [-180, 180], cartelEmpotrado: [0.4, 4], cartelCantidad: [1, 4],
  emblemaTamano: [10, 80], emblemaMargen: [1, 15], emblemaGrosor: [1.6, 8], emblemaRelieve: [0.4, 4], emblemaBisel: [0, 3], emblemaBordeAncho: [0.8, 6],
  emblemaCantidad: [1, 4], emblemaAltura: [10, 300], emblemaAngulo: [-180, 180], emblemaEmpotrado: [0.4, 4],
  aroAlto: [3, 20], aroRelieve: [0.6, 5], aroDistBorde: [0, 60], aroDistBase: [0, 60], aroRemaches: [0, 36], aroEmpotrado: [0.4, 4],
  envolturaCentro: [5, 95], envolturaLargo: [15, 300], envolturaEspesor: [1, 8], envolturaPaso: [3, 20], collarinAncho: [3, 15], collarinEspesor: [0.8, 4],
  pulgarPosicion: [5, 45], pulgarLargo: [12, 80], pulgarArco: [40, 160], pulgarAlto: [1, 8],
  asaSimboloTamano: [6, 30], asaSimboloPosicion: [5, 95], asaSimboloRelieve: [0.4, 3], asaPlacaLado: [14, 60], asaPlacaGrosor: [1, 6],
  texturaTamano: [4, 60], texturaProfundidad: [0.1, 3], texturaBorde: [0, 20], texturaResolucion: [0, 3],
  duelasCantidad: [4, 60], duelasSeparacion: [0.4, 4], duelasProfundidad: [0.3, 3], duelasIrregularidad: [0, 1], duelasVeta: [0, 1], duelasSemilla: [1, 9999]
};
export const EXTRA_MAX = 30; // cuánto se puede ensanchar la silueta (mm)
export const MAX_PUNTOS_FORMA = 8;
export const MAX_PUNTOS_ASA = 8;

const ALTURA_CAMA_MAX = 250;
const MUESTRAS_ALTURA = 48; // alturas en que se muestrea la silueta del cuerpo
const STUB = 4; // tramo recto horizontal con el que arranca cada extremo del asa (mm)
const FUERZA_ARRANQUE = 1; // qué tanto sigue horizontal la curva al salir del tramo recto
const GRADOS_SOPORTE = 40; // por debajo de esta inclinación (desde la horizontal) se necesitan soportes
const MAX_PLANO_SIN_SOPORTES = 12; // mm casi planos que se aguantan como puente (cada giro del asa deja unos 5)
const GRADOS_PARED = 45; // pared exterior que se abre más que esto hacia arriba

const limitar = (v, [min, max]) => Math.min(max, Math.max(min, v));
const esHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
const numero = (v, respaldo) => { const n = v === '' || v === null || v === undefined ? NaN : Number(v); return Number.isFinite(n) ? n : respaldo; };

// Puntos de la silueta: sin repetir altura, de 0 a 1, ordenados; la altura 0 y la 1 siempre existen.
function sanearFormaPuntos(lista) {
  const origen = Array.isArray(lista) ? lista : [];
  let pts = origen
    .filter((q) => Array.isArray(q))
    .map(([t, e]) => [limitar(numero(t, 0), [0, 1]), limitar(numero(e, 0), [0, EXTRA_MAX])])
    .slice(0, MAX_PUNTOS_FORMA)
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return PARAMETROS_INICIALES.formaPuntos.map((q) => [...q]);
  pts[0][0] = 0;
  pts[pts.length - 1][0] = 1;
  // Dos puntos a menos de 0,03 de altura se pisan: se descarta el segundo (el último, en la altura 1, siempre queda).
  const util = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (pts[i][0] >= util[util.length - 1][0] + 0.03 && pts[i][0] <= 0.97) util.push(pts[i]);
  util.push(pts[pts.length - 1]);
  pts = util;
  return pts.length >= 2 ? pts : PARAMETROS_INICIALES.formaPuntos.map((q) => [...q]);
}

function sanearAsaPuntos(lista, esquinas) {
  const origen = Array.isArray(lista) ? lista : [];
  const pts = origen
    .filter((q) => Array.isArray(q))
    .map(([u, v]) => [limitar(numero(u, 0.5), [0.08, 1.6]), limitar(numero(v, 0.5), [-0.1, 1.1])])
    .slice(0, MAX_PUNTOS_ASA);
  if (!pts.length) return { puntos: PARAMETROS_INICIALES.asaPuntos.map((q) => [...q]), esquinas: [] };
  const esq = [...new Set((Array.isArray(esquinas) ? esquinas : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < pts.length))];
  return { puntos: pts, esquinas: esq };
}

// Medidas siempre dentro de lo razonable (un campo vacío o raro vuelve a su valor de siempre).
export function sanearParametros(p = {}) {
  const o = { ...PARAMETROS_INICIALES, ...p };
  for (const [clave, rango] of Object.entries(LIMITES)) {
    o[clave] = limitar(numero(p[clave], PARAMETROS_INICIALES[clave]), rango);
  }
  o.asa = p.asa === undefined ? PARAMETROS_INICIALES.asa : !!p.asa;
  o.asaDesmontable = !!p.asaDesmontable;
  o.colores = Object.fromEntries(Object.entries(PARAMETROS_INICIALES.colores).map(([k, porDefecto]) => [k, esHex(p.colores?.[k]) ? p.colores[k] : porDefecto]));
  // Cartel
  o.cartel = !!p.cartel;
  // Hasta 4 renglones de 30 letras (Enter = renglón nuevo).
  o.cartelTexto = String(p.cartelTexto ?? PARAMETROS_INICIALES.cartelTexto).replace(/\r\n?/g, '\n').split('\n').slice(0, MAX_RENGLONES).map((l) => l.slice(0, MAX_LETRAS_RENGLON)).join('\n');
  o.cartelAlineacion = ALINEACIONES.some((x) => x.id === p.cartelAlineacion) ? p.cartelAlineacion : PARAMETROS_INICIALES.cartelAlineacion;
  o.cartelFuente = String(p.cartelFuente || PARAMETROS_INICIALES.cartelFuente);
  o.cartelMayusculas = MAYUSCULAS_CARTEL.includes(p.cartelMayusculas) ? p.cartelMayusculas : 'como';
  o.cartelForma = FORMAS_CARTEL.some((x) => x.id === p.cartelForma) ? p.cartelForma : PARAMETROS_INICIALES.cartelForma;
  o.cartelTamano = p.cartelTamano === 'propio' ? 'propio' : 'ajustado';
  o.cartelBorde = p.cartelBorde === undefined ? PARAMETROS_INICIALES.cartelBorde : !!p.cartelBorde;
  o.cartelDesmontable = p.cartelDesmontable === undefined ? PARAMETROS_INICIALES.cartelDesmontable : !!p.cartelDesmontable;
  o.cartelRemaches = [0, 2, 4].includes(Number(p.cartelRemaches)) ? Number(p.cartelRemaches) : 0;
  // La base apenas se mete en la pared: tiene que quedar al menos 1,4 mm de pared hacia adentro.
  o.cartelEmpotrado = Math.min(o.cartelEmpotrado, Math.max(0.4, o.pared - 1.4));
  o.cartelCantidad = Math.round(o.cartelCantidad);
  // Complementos del asa
  o.envoltura = !!p.envoltura;
  o.envolturaEstilo = ESTILOS_ENVOLTURA.some((x) => x.id === p.envolturaEstilo) ? p.envolturaEstilo : PARAMETROS_INICIALES.envolturaEstilo;
  o.envolturaRemate = p.envolturaRemate === undefined ? PARAMETROS_INICIALES.envolturaRemate : !!p.envolturaRemate;
  o.asaCollarines = !!p.asaCollarines;
  o.pulgar = !!p.pulgar;
  o.asaSimbolo = !!p.asaSimbolo;
  o.asaSimboloRespaldo = RESPALDOS.some((x) => x.id === p.asaSimboloRespaldo) ? p.asaSimboloRespaldo : PARAMETROS_INICIALES.asaSimboloRespaldo;
  o.asaPlacas = !!p.asaPlacas;
  o.asaPlacaForma = RESPALDOS.some((x) => x.id === p.asaPlacaForma && x.id !== 'ninguno') ? p.asaPlacaForma : PARAMETROS_INICIALES.asaPlacaForma;
  // Textura del cuerpo
  o.textura = esTextura(p.textura) ? p.textura : TEXTURA_NINGUNA;
  o.texturaInvertir = !!p.texturaInvertir;
  o.duelasCantidad = Math.round(o.duelasCantidad);
  o.duelasSemilla = Math.round(o.duelasSemilla);
  if (o.texturaResolucion > 0) o.texturaResolucion = Math.max(0.3, o.texturaResolucion);
  // Emblemas y aros
  o.emblema = !!p.emblema;
  o.emblemaSvg = typeof p.emblemaSvg === 'string' && p.emblemaSvg.length <= MAX_BYTES_SVG ? p.emblemaSvg : '';
  o.emblemaSvgNombre = String(p.emblemaSvgNombre || '').slice(0, 60);
  o.emblemaForma = typeof p.emblemaForma === 'string' && p.emblemaForma.length <= MAX_BYTES_SIMBOLO ? p.emblemaForma : '';
  o.emblemaFormaNombre = String(p.emblemaFormaNombre || '').slice(0, 40);
  o.emblemaSimbolo = SIMBOLOS.some((x) => x.id === p.emblemaSimbolo) || (p.emblemaSimbolo === SIMBOLO_SVG && o.emblemaSvg) || (p.emblemaSimbolo === SIMBOLO_PROPIO && o.emblemaForma) ? p.emblemaSimbolo : SIMBOLO_INICIAL;
  o.emblemaRespaldo = RESPALDOS.some((x) => x.id === p.emblemaRespaldo) ? p.emblemaRespaldo : PARAMETROS_INICIALES.emblemaRespaldo;
  o.emblemaBorde = p.emblemaBorde === undefined ? PARAMETROS_INICIALES.emblemaBorde : !!p.emblemaBorde;
  o.emblemaDesmontable = p.emblemaDesmontable === undefined ? PARAMETROS_INICIALES.emblemaDesmontable : !!p.emblemaDesmontable;
  o.emblemaCantidad = Math.round(o.emblemaCantidad);
  o.emblemaEmpotrado = Math.min(o.emblemaEmpotrado, Math.max(0.4, o.pared - 1.4));
  o.aroArriba = !!p.aroArriba;
  o.aroAbajo = !!p.aroAbajo;
  o.aroDesmontable = !!p.aroDesmontable;
  o.aroRemaches = Math.round(o.aroRemaches);
  o.aroEmpotrado = Math.min(o.aroEmpotrado, Math.max(0.4, o.pared - 1.4));
  o.formaPuntos = sanearFormaPuntos(p.formaPuntos);
  const asa = sanearAsaPuntos(p.asaPuntos, p.asaEsquinas);
  o.asaPuntos = asa.puntos;
  o.asaEsquinas = asa.esquinas;
  // Abertura del fondo: un agujero que deja al menos 6 mm de aro alrededor.
  const maxAbertura = Math.max(0, o.diametroHueco - 12);
  o.aberturaFondo = limitar(numero(p.aberturaFondo, 0), [0, maxAbertura]);
  if (o.aberturaFondo < 4) o.aberturaFondo = 0;

  // El asa tiene que entrar en el jarro: su ancho no puede pasar del radio, y los extremos deben dejar lugar para las
  // placas de montaje (arriba y abajo) y no pisarse entre sí.
  const radioHueco = o.diametroHueco / 2;
  const ext = o.asaExtremos / 100;
  o.asaAncho = Math.min(o.asaAncho, Math.max(6, (1.4 * radioHueco - 6) / ext));
  const alto = o.fondo + o.altoHueco;
  const minDist = (o.asaGrosor * ext) / 2 + 5;
  const separacionMin = o.asaGrosor * ext + 14;
  o.asaDistTope = Math.max(minDist, o.asaDistTope);
  o.asaDistBase = Math.max(minDist, o.asaDistBase);
  if (alto - o.asaDistTope - o.asaDistBase < separacionMin) {
    o.asaDistBase = Math.max(minDist, alto - o.asaDistTope - separacionMin);
    if (alto - o.asaDistTope - o.asaDistBase < separacionMin) o.asaDistTope = Math.max(minDist, alto - o.asaDistBase - separacionMin);
  }
  return o;
}

// Parámetros que cambian al elegir una lata de la lista: el hueco sale de la lata más la holgura.
export function conLata(p, latId) {
  const lata = LATAS.find((l) => l.id === latId);
  if (!lata) return { ...p, latId: LATA_PROPIA };
  const holgura = Number.isFinite(Number(p.holgura)) ? Number(p.holgura) : PARAMETROS_INICIALES.holgura;
  return { ...p, latId, diametroHueco: Math.round((lata.diametro + holgura) * 100) / 100, altoHueco: lata.alto };
}

// Parámetros que cambian al elegir una silueta o una forma de asa de la lista.
export function conForma(p, id) {
  const f = FORMAS.find((x) => x.id === id);
  return f ? { ...p, forma: id, formaPuntos: f.puntos.map((q) => [...q]) } : { ...p, forma: FORMA_PROPIA };
}
export function conFormaAsa(p, id) {
  const f = FORMAS_ASA.find((x) => x.id === id);
  return f ? { ...p, asaForma: id, asaPuntos: f.puntos.map((q) => [...q]), asaEsquinas: [...f.esquinas] } : { ...p, asaForma: ASA_PROPIA };
}

// ---------- Mallas básicas ----------

export { revolucion, caja3d, limpiarTriangulos } from './mallasJarro';
export { ALINEACIONES, FORMAS_CARTEL, MAX_RENGLONES, MAX_LETRAS_RENGLON } from './jarrosCartel';
export { RESPALDOS, SIMBOLOS, SIMBOLO_PROPIO, SIMBOLO_SVG } from './jarrosDetalles';
export { ESTILOS_ENVOLTURA } from './jarrosAsa';
export { CATEGORIAS_TEXTURA, TEXTURAS, TEXTURA_DUELAS, TEXTURA_NINGUNA, estimarTriangulosTextura, profundidadMaxima } from './jarrosTextura';
export { contornosDeSvg, MAX_BYTES_SVG } from './svgSimbolo';

// Las booleanas dejan "uniones en T": un triángulo grande pegado a dos chicos que no comparten su vértice, así que la
// malla no queda cerrada por índices aunque lo esté en el espacio. Se parte el triángulo grande en el vértice que le
// toca el borde, hasta que cada arista la compartan exactamente dos triángulos.
export function repararUniones(malla, tolerancia = 1e-3) {
  const pos = malla.pos;
  let tri = Array.from(malla.tri);
  const nv = pos.length / 3;
  const punto = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  for (let pasada = 0; pasada < 8; pasada++) {
    const dirigidas = new Set();
    for (let t = 0; t < tri.length; t += 3) for (let k = 0; k < 3; k++) dirigidas.add(tri[t + k] * nv + tri[t + ((k + 1) % 3)]);
    const abiertas = [];
    for (let t = 0; t < tri.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = tri[t + k], b = tri[t + ((k + 1) % 3)];
        if (!dirigidas.has(b * nv + a)) abiertas.push({ t, k, a, b });
      }
    }
    if (!abiertas.length) break;
    const frontera = new Set();
    for (const e of abiertas) { frontera.add(e.a); frontera.add(e.b); }
    const cortes = new Map(); // triángulo → { k, cadena }
    for (const { t, k, a, b } of abiertas) {
      if (cortes.has(t)) continue; // una arista por triángulo y pasada: la otra se resuelve en la pasada siguiente
      const A = punto(a), B = punto(b);
      const AB = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const L2 = AB[0] * AB[0] + AB[1] * AB[1] + AB[2] * AB[2];
      if (L2 < 1e-12) continue;
      const sobre = [];
      for (const q of frontera) {
        if (q === a || q === b) continue;
        const Q = punto(q);
        const s = ((Q[0] - A[0]) * AB[0] + (Q[1] - A[1]) * AB[1] + (Q[2] - A[2]) * AB[2]) / L2;
        if (s <= 1e-6 || s >= 1 - 1e-6) continue;
        const d = Math.hypot(Q[0] - (A[0] + s * AB[0]), Q[1] - (A[1] + s * AB[1]), Q[2] - (A[2] + s * AB[2]));
        if (d < tolerancia) sobre.push([s, q]);
      }
      if (sobre.length) cortes.set(t, { k, cadena: [a, ...sobre.sort((x, y) => x[0] - y[0]).map((x) => x[1]), b] });
    }
    if (!cortes.size) break;
    const nuevo = [];
    for (let t = 0; t < tri.length; t += 3) {
      const corte = cortes.get(t);
      if (!corte) { nuevo.push(tri[t], tri[t + 1], tri[t + 2]); continue; }
      const c = tri[t + ((corte.k + 2) % 3)];
      for (let i = 0; i < corte.cadena.length - 1; i++) nuevo.push(corte.cadena[i], corte.cadena[i + 1], c);
    }
    tri = nuevo;
  }
  return { pos, tri: Uint32Array.from(tri) };
}

// Unión o resta de mallas 3D. Con el motor Manifold cargado el resultado es siempre un sólido cerrado; si todavía no
// cargó (o no se pudo cargar), se usa three-bvh-csg, que anda pero puede dejar alguna arista abierta con paredes inclinadas.
function booleana(a, b, operacion) {
  if (motorListo()) return operar(a, b, operacion === ADDITION ? 'sumar' : 'restar');
  const geo = (m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.pos), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.tri), 1));
    g.computeVertexNormals();
    return g;
  };
  const evaluador = new Evaluator();
  evaluador.attributes = ['position', 'normal'];
  const ba = new Brush(geo(a));
  const bb = new Brush(geo(b));
  ba.updateMatrixWorld();
  bb.updateMatrixWorld();
  const resultado = evaluador.evaluate(ba, bb, operacion);
  const g = resultado.geometry.index ? resultado.geometry.toNonIndexed() : resultado.geometry;
  const malla = soldar(g.getAttribute('position').array);
  resultado.geometry.dispose();
  return limpiarTriangulos(repararUniones(limpiarTriangulos(malla)));
}

// ---------- Cuerpo ----------

// Interpolación monótona (Fritsch-Carlson) por los puntos [t, valor]: suave y sin pasarse de los valores de los puntos.
function interpoladorMonotono(pts) {
  const n = pts.length;
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h.push(pts[i + 1][0] - pts[i][0]); d.push((pts[i + 1][1] - pts[i][1]) / h[i]); }
  const m = new Array(n).fill(0);
  if (n === 2) { m[0] = d[0]; m[1] = d[0]; }
  else {
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(d[i]) < 1e-12) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
  }
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (i < n - 2 && t > pts[i + 1][0]) i++;
    const x = (t - pts[i][0]) / h[i];
    const x2 = x * x, x3 = x2 * x;
    return (2 * x3 - 3 * x2 + 1) * pts[i][1] + (x3 - 2 * x2 + x) * h[i] * m[i] + (-2 * x3 + 3 * x2) * pts[i + 1][1] + (x3 - x2) * h[i] * m[i + 1];
  };
}

// Radio exterior del cuerpo a cada altura z (mm): la pared más lo que ensancha la silueta.
export function radioExteriorFn(p) {
  const s = sanearParametros(p);
  const extra = interpoladorMonotono(s.formaPuntos);
  const Ri = s.diametroHueco / 2;
  const H = s.fondo + s.altoHueco;
  return (z) => Ri + s.pared + Math.max(0, extra(Math.min(1, Math.max(0, z / H))));
}

// Silueta exterior muestreada [radio, z] (para el editor y para armar el cuerpo).
export function perfilExterior(p) {
  const s = sanearParametros(p);
  const H = s.fondo + s.altoHueco;
  const R = radioExteriorFn(s);
  const pts = [];
  for (let k = 0; k <= MUESTRAS_ALTURA; k++) { const z = (H * k) / MUESTRAS_ALTURA; pts.push([R(z), z]); }
  return pts;
}

function mallaCuerpo(s, R, Ri, H) {
  const rAb = s.aberturaFondo / 2;
  const exterior = [];
  for (let k = 0; k <= MUESTRAS_ALTURA; k++) { const z = (H * k) / MUESTRAS_ALTURA; exterior.push([R(z), z]); }
  return revolucion([[rAb, 0], ...exterior, [Ri, H], [Ri, s.fondo], [rAb, s.fondo]]);
}

// Mayor inclinación (grados desde la vertical) con que la pared exterior se abre hacia arriba.
function aperturaMaximaPared(R, H) {
  let max = 0;
  const dz = H / MUESTRAS_ALTURA;
  for (let k = 0; k < MUESTRAS_ALTURA; k++) {
    const dr = R((k + 1) * dz) - R(k * dz);
    max = Math.max(max, (Math.atan2(dr, dz) * 180) / Math.PI);
  }
  return max;
}

// ---------- Asa ----------

// Curva del asa en el plano X-Z. `extremos`: { x1, z1 } (arriba) y { x2, z2 } (abajo), ya sobre la cara donde apoya el
// asa; `entrada`: cuánto se prolonga hacia adentro de la pared (asa pegada). Devuelve los puntos, la escala de la
// sección en cada uno (más gruesa en los extremos), el largo con poca inclinación y el radio de curvatura más chico.
export function caminoAsa({ x1, z1, x2, z2, puntos, esquinas = [], salida, entrada1 = 0, entrada2 = 0, extremos = 100, muestras = 14 }) {
  const xBase = Math.max(x1, x2);
  const span = z1 - z2;
  const xMin = (x) => x + STUB + 1.5;
  // Puntos de control: tramo recto, curva libre y tramo recto.
  const ctrl = [[x1 + STUB, z1], ...puntos.map(([u, v]) => [Math.max(xMin(Math.max(x1, x2)), xBase + u * salida), z2 + v * span]), [x2 + STUB, z2]];
  const esq = new Set(esquinas.map((i) => i + 1));
  const n = ctrl.length;
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  // Tangentes de entrada y de salida de cada punto de control (esquina viva: una por cada lado).
  const Min = [], Mout = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { Min.push([0, 0]); Mout.push([FUERZA_ARRANQUE * dist(ctrl[0], ctrl[1]), 0]); }
    else if (i === n - 1) { Min.push([-FUERZA_ARRANQUE * dist(ctrl[n - 2], ctrl[n - 1]), 0]); Mout.push([0, 0]); }
    else if (esq.has(i)) {
      Min.push([ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1]]);
      Mout.push([ctrl[i + 1][0] - ctrl[i][0], ctrl[i + 1][1] - ctrl[i][1]]);
    } else {
      const m = [(ctrl[i + 1][0] - ctrl[i - 1][0]) / 2, (ctrl[i + 1][1] - ctrl[i - 1][1]) / 2];
      Min.push(m); Mout.push(m);
    }
  }
  const pts = []; // { p: [x, z], esquina: bool, recto: bool }
  const agregar = (p, extra = {}) => { const u = pts[pts.length - 1]; if (!u || Math.hypot(u.p[0] - p[0], u.p[1] - p[1]) > 1e-6) pts.push({ p, esquina: false, recto: false, ...extra }); else Object.assign(u, extra); };
  // Arranque en la pared (tramo recto horizontal hasta la curva).
  if (entrada1 > 0) agregar([x1 - entrada1, z1], { recto: true });
  agregar([x1, z1], { recto: true });
  agregar(ctrl[0], { recto: true });
  for (let i = 0; i < n - 1; i++) {
    const A = ctrl[i], B = ctrl[i + 1], Ma = Mout[i], Mb = Min[i + 1];
    for (let k = 1; k <= muestras; k++) {
      const t = k / muestras, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      const q = [h00 * A[0] + h10 * Ma[0] + h01 * B[0] + h11 * Mb[0], h00 * A[1] + h10 * Ma[1] + h01 * B[1] + h11 * Mb[1]];
      agregar(q, { esquina: k === muestras && esq.has(i + 1), recto: i === n - 2 && k === muestras });
    }
  }
  agregar([x2, z2], { recto: true });
  if (entrada2 > 0) agregar([x2 - entrada2, z2], { recto: true });

  // Largo de arco acumulado y tangentes (bisectriz en cada punto, con la sección alargada para que la unión no se afine).
  const N = pts.length;
  const acum = [0];
  for (let i = 1; i < N; i++) acum.push(acum[i - 1] + dist(pts[i - 1].p, pts[i].p));
  const largo = acum[N - 1];
  const unit = (a, b) => { const d = dist(a, b) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
  const tangentes = [], alargue = [];
  for (let i = 0; i < N; i++) {
    const da = i > 0 ? unit(pts[i - 1].p, pts[i].p) : unit(pts[0].p, pts[1].p);
    const db = i < N - 1 ? unit(pts[i].p, pts[i + 1].p) : da;
    const sx = da[0] + db[0], sz = da[1] + db[1];
    const l = Math.hypot(sx, sz) || 1;
    const T = [sx / l, sz / l];
    tangentes.push(T);
    alargue.push(1 / Math.max(0.35, da[0] * T[0] + da[1] * T[1]));
  }
  // Escala de la sección: más gruesa cerca de los extremos.
  const e = extremos / 100;
  const escala = acum.map((s) => {
    const w = Math.max(0, 1 - Math.min(s, largo - s) / Math.max(1, 0.2 * largo));
    return 1 + (e - 1) * w * w;
  });
  // Radio de curvatura más chico (sin contar las esquinas vivas) y largo con poca inclinación (sin contar los tramos rectos).
  let radioMin = Infinity, plano = 0;
  const limite = Math.tan((GRADOS_SOPORTE * Math.PI) / 180);
  for (let i = 1; i < N - 1; i++) {
    if (pts[i].esquina || pts[i].recto) continue;
    const da = unit(pts[i - 1].p, pts[i].p), db = unit(pts[i].p, pts[i + 1].p);
    const ang = Math.acos(Math.min(1, Math.max(-1, da[0] * db[0] + da[1] * db[1])));
    const ds = (dist(pts[i - 1].p, pts[i].p) + dist(pts[i].p, pts[i + 1].p)) / 2;
    if (ang > 1e-6) radioMin = Math.min(radioMin, ds / ang);
  }
  const segPlano = []; // por tramo: ¿tiene menos de 40° de inclinación? (los tramos rectos de los extremos no cuentan)
  for (let i = 0; i < N - 1; i++) {
    if (pts[i].recto && pts[i + 1].recto) { segPlano.push(false); continue; }
    const [tx, tz] = unit(pts[i].p, pts[i + 1].p);
    const esPlano = Math.abs(tz) < limite * Math.abs(tx);
    segPlano.push(esPlano);
    if (esPlano) plano += dist(pts[i].p, pts[i + 1].p);
  }
  return { puntos: pts.map((q) => q.p), tangentes, alargue, escala, largo, radioMin, plano, segPlano };
}

// Barre una sección (superelipse de `grosor` en el plano de la curva y `ancho` hacia Y) a lo largo de la curva, con
// tapas planas en los dos extremos.
function barrer({ puntos, tangentes, alargue, escala }, ancho, grosor, redondez, lados = 28) {
  const exp = 2 / redondez;
  const anillo = [];
  for (let k = 0; k < lados; k++) {
    const a = (2 * Math.PI * k) / lados;
    const c = Math.cos(a), s = Math.sin(a);
    anillo.push([Math.sign(c) * Math.abs(c) ** exp, Math.sign(s) * Math.abs(s) ** exp]);
  }
  const pos = [];
  for (let i = 0; i < puntos.length; i++) {
    const [x, z] = puntos[i];
    const [tx, tz] = tangentes[i];
    const nx = -tz, nz = tx; // normal dentro del plano de la curva
    const g = (grosor / 2) * escala[i] * alargue[i];
    const a = (ancho / 2) * escala[i];
    for (const [u, w] of anillo) pos.push(x + nx * g * u, w * a, z + nz * g * u);
  }
  const ultimo = puntos.length - 1;
  const c0 = pos.length / 3;
  pos.push(puntos[0][0], 0, puntos[0][1]);
  const c1 = pos.length / 3;
  pos.push(puntos[ultimo][0], 0, puntos[ultimo][1]);

  // Se prueba el sentido de los triángulos de los lados y de las tapas hasta que la malla quede cerrada y hacia afuera.
  const armar = (lado, tapa) => {
    const tri = [];
    for (let i = 0; i < ultimo; i++) {
      for (let k = 0; k < lados; k++) {
        const a = i * lados + k, b = i * lados + ((k + 1) % lados), c = (i + 1) * lados + ((k + 1) % lados), d = (i + 1) * lados + k;
        if (lado) tri.push(a, b, c, a, c, d); else tri.push(a, c, b, a, d, c);
      }
    }
    for (let k = 0; k < lados; k++) {
      const k2 = (k + 1) % lados;
      if (tapa) tri.push(c0, k2, k, c1, ultimo * lados + k, ultimo * lados + k2);
      else tri.push(c0, k, k2, c1, ultimo * lados + k2, ultimo * lados + k);
    }
    return { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
  };
  for (const [lado, tapa] of [[true, true], [true, false], [false, true], [false, false]]) {
    const m = armar(lado, tapa);
    if (revisarCerrada(m).cerrada && volumenMalla(m) > 0) return m;
  }
  return armar(true, true);
}

// ---------- Impresión ----------

const girarX = matrizRotacion('x', 90);

// Pone la malla apoyada en z = 0 con su esquina mínima en x = y = 0.
function apoyar(malla) {
  const { min } = cajaMalla(malla);
  return moverMalla(malla, -min[0], -min[1], -min[2]);
}

// Las partes de color de una pieza: si no se separa en colores, la pieza entera es su única parte.
export const partesDe = (pieza) => pieza.partes || [{ id: pieza.id, nombre: pieza.nombre, color: pieza.color, malla: pieza.malla, mallaImpresion: pieza.mallaImpresion }];

// Acomoda piezas ya apoyadas en filas dentro de la cama (mm), con un margen y una separación. Devuelve cuerpos listos
// para exportar y si entran todos.
export function armarPlaca(piezas, cama, separacion = 6, margen = 6) {
  const lista = piezas.map((p) => {
    const { min, max } = cajaMalla(p.mallaImpresion);
    return { p, w: max[0] - min[0], h: max[1] - min[1] };
  }).sort((a, b) => b.h - a.h);
  let x = margen, y = margen, fila = 0, entra = true;
  const cuerpos = [];
  for (const it of lista) {
    if (x + it.w > cama.x - margen && x > margen) { x = margen; y += fila + separacion; fila = 0; }
    if (x + it.w > cama.x - margen || y + it.h > cama.y - margen) entra = false;
    // Las partes de color de una misma pieza (cartel, letras, borde…) salen juntas, como partes de un mismo objeto.
    for (const parte of partesDe(it.p)) {
      cuerpos.push({
        nombre: it.p.partes ? `${it.p.nombre} · ${parte.nombre}` : it.p.nombre, color: parte.color, malla: moverMalla(parte.mallaImpresion, x, y, 0),
        ...(it.p.partes ? { grupo: it.p.id, grupoNombre: it.p.nombre } : {})
      });
    }
    x += it.w + separacion;
    fila = Math.max(fila, it.h);
  }
  return { cuerpos, entra };
}

// ---------- Armado ----------

// Curva del asa tal como se dibuja en el editor: la misma que se usa para armar el jarro. Devuelve null sin asa.
export function curvaAsa(entrada) {
  const s = sanearParametros(entrada);
  if (!s.asa) return null;
  const g = geometriaAsa(s);
  return { ...g.camino, z1: g.z1, z2: g.z2, x1: g.x1, x2: g.x2, xBase: Math.max(g.x1, g.x2), salidaEfectiva: g.salidaEf, span: g.z1 - g.z2 };
}

// Posición de los extremos del asa y su curva (con el asa en el plano X-Z, sin girar).
function geometriaAsa(s) {
  const Ri = s.diametroHueco / 2;
  const H = s.fondo + s.altoHueco;
  const R = radioExteriorFn(s);
  const z1 = H - s.asaDistTope;
  const z2 = s.asaDistBase;
  const ext = s.asaExtremos / 100;
  const altoPlaca = s.asaGrosor * ext + 6;
  const anchoPlaca = s.asaAncho * ext + 6;
  const rango = (z, f) => { let lo = Infinity, hi = -Infinity; for (let k = 0; k <= 8; k++) { const r = R(Math.max(0, Math.min(H, z - altoPlaca / 2 + (altoPlaca * k) / 8))); lo = Math.min(lo, r); hi = Math.max(hi, r); } return f === 'min' ? lo : hi; };
  const desmontable = s.asaDesmontable;
  const cara = (z) => (desmontable ? rango(z, 'max') + s.placa : R(z));
  const x1 = cara(z1), x2 = cara(z2);
  const entrada = desmontable ? 0 : Math.max(0.4, Math.min(2, s.pared - 0.8));
  const salidaEf = s.asaSalida - (desmontable ? s.placa : 0);
  const camino = caminoAsa({
    x1, z1, x2, z2, puntos: s.asaPuntos, esquinas: s.asaEsquinas, salida: salidaEf,
    entrada1: entrada, entrada2: entrada, extremos: s.asaExtremos
  });
  return { camino, z1, z2, x1, x2, salidaEf, Ri, H, R, altoPlaca, anchoPlaca, rango, ext };
}

// Arma el jarro: { piezas, lata, ancho, largo, alto, avisos, ... }. Cada pieza: { id, nombre, color, malla, mallaImpresion,
// desmontable, despiece }, con `despiece` la dirección en que se separa en la vista despiece (múltiplos del paso del visor).
export function armarJarro(entrada, { fuente = null, calidad = 'final' } = {}) {
  const p = sanearParametros(entrada);
  const Ri = p.diametroHueco / 2;
  const H = p.fondo + p.altoHueco;
  const R = radioExteriorFn(p);
  const avisos = [];
  // Con textura la pared exterior es una grilla con relieve; la vista usa una grilla liviana y lo que se exporta, la final.
  const texturado = armarCuerpoTexturado(p, R, Ri, H, calidad);
  let cuerpo = texturado ? texturado.malla : mallaCuerpo(p, R, Ri, H);
  if (texturado) avisos.push(...texturado.avisos);
  const piezas = [];
  // Cartel con el nombre: necesita la tipografía ya cargada. Si es desmontable, el cuerpo lleva su cavidad.
  const cartel = p.cartel && fuente ? armarCartel(p, R, H, fuente) : null;
  const cavidadesCartel = cartel ? cartel.copias.filter((c) => c.cavidad).map((c) => c.cavidad) : [];
  if (cavidadesCartel.length) cuerpo = booleana(cuerpo, unirMallas(cavidadesCartel), SUBTRACTION);
  if (cartel) avisos.push(...cartel.avisos);
  // Emblemas y aros: cada uno, si es desmontable, le deja su cavidad al cuerpo (las cavidades se juntan y se restan de una vez).
  const emblemas = armarEmblemas(p, R, H);
  if (emblemas) avisos.push(...emblemas.avisos);
  const { aros, avisos: avisosAros } = armarAros(p, R, H);
  avisos.push(...avisosAros);
  const cavidades = [
    ...(emblemas ? emblemas.items.filter((x) => x.cavidad).map((x) => x.cavidad) : []),
    ...aros.filter((a) => a.cavidad).map((a) => a.cavidad)
  ];
  if (cavidades.length) cuerpo = booleana(cuerpo, unirMallas(cavidades), SUBTRACTION);
  let asa = null;
  let soportes = null;

  const apertura = aperturaMaximaPared(R, H);
  if (apertura > GRADOS_PARED) avisos.push(`La pared exterior se abre ${Math.round(apertura)}° hacia arriba: con más de ${GRADOS_PARED}° se imprime con soportes.`);

  if (p.asa) {
    const g = geometriaAsa(p);
    const hg = p.holguraEncastre;
    const giro = matrizRotacion('z', p.asaAngulo);
    const girar = (m) => (p.asaAngulo ? transformarMalla(m, giro) : m);
    const gAncho = p.asaAncho, gGrosor = p.asaGrosor;
    let malla0; // el asa sin girar (se imprime a partir de ésta)
    if (p.asaDesmontable) {
      const tw = Math.max(5, 0.55 * gAncho * g.ext);
      const th = Math.max(5, 0.55 * gGrosor * g.ext);
      const xFondoRanura = Ri + 1.2; // deja 1,2 mm de pared hacia adentro
      const extremos = [{ z: g.z1, x: g.x1 }, { z: g.z2, x: g.x2 }];
      const placasLista = extremos.map(({ z }) => {
        const rmin = g.rango(z, 'min');
        const yh = g.anchoPlaca / 2;
        const x0 = Math.max(Math.sqrt(Math.max(0, rmin * rmin - yh * yh)) - 0.6, Math.sqrt(Math.max(0, Ri * Ri - yh * yh)) + 0.5);
        const xc = (z === g.z1 ? g.x1 : g.x2);
        return caja3d(x0, xc, -yh, yh, z - g.altoPlaca / 2, z + g.altoPlaca / 2);
      });
      const ranuras = unirMallas(extremos.map(({ z, x }) => caja3d(xFondoRanura, x + 1, -(tw / 2 + hg), tw / 2 + hg, z - (th / 2 + hg), z + (th / 2 + hg))));
      cuerpo = booleana(booleana(cuerpo, girar(unirMallas(placasLista)), ADDITION), girar(ranuras), SUBTRACTION);
      const espigas = unirMallas(extremos.map(({ z, x }) => caja3d(xFondoRanura + 0.4, x + 0.6, -tw / 2, tw / 2, z - th / 2, z + th / 2)));
      malla0 = unirMallas([barrer(g.camino, gAncho, gGrosor, p.asaRedondez), espigas]);
    } else {
      malla0 = barrer(g.camino, gAncho, gGrosor, p.asaRedondez);
    }
    asa = { camino: g.camino, malla0, malla: girar(malla0) };
    soportes = g.camino.plano;
    if (g.camino.radioMin < (gGrosor * g.ext) / 2 + 0.5) avisos.push('El asa se curva demasiado para ese grosor: alejá los puntos entre sí o hacela más fina.');
    if (soportes > MAX_PLANO_SIN_SOPORTES) {
      avisos.push(p.asaDesmontable
        ? `Unos ${Math.round(soportes)} mm del asa tienen menos de ${GRADOS_SOPORTE}° de inclinación: imprimila aparte, acostada (así sale sin soportes).`
        : `Unos ${Math.round(soportes)} mm del asa tienen menos de ${GRADOS_SOPORTE}° de inclinación: con el asa pegada se imprimen con soportes. Hacé más empinados los brazos (forma "Sin soportes") o hacela desmontable e imprimila acostada.`);
    }
  }

  piezas.push({
    id: 'cuerpo', nombre: 'Cuerpo', color: p.colores.cuerpo, malla: cuerpo, mallaImpresion: apoyar(cuerpo), desmontable: false, despiece: [0, 0, 0]
  });
  if (asa) {
    // Acostada sobre su lado: el plano de la curva queda apoyado en la cama.
    const acostada = apoyar(transformarMalla(asa.malla0, girarX));
    const ang = (p.asaAngulo * Math.PI) / 180;
    piezas.push({
      id: 'asa', nombre: 'Asa', color: p.colores.asa, malla: asa.malla, mallaImpresion: acostada, desmontable: p.asaDesmontable,
      despiece: [1.5 * Math.cos(ang), 1.5 * Math.sin(ang), 0]
    });
  }

  // Complementos del asa: envoltura, collarines y descanso del pulgar. Siguen al asa cuando se la gira alrededor del jarro.
  if (asa) {
    const ga = geometriaAsa(p);
    const comp = armarComplementosAsa(p, asa.camino, p.asaDesmontable ? 0 : Math.max(0.4, Math.min(2, p.pared - 0.8)), { x1: ga.x1, z1: ga.z1, x2: ga.x2, z2: ga.z2 });
    avisos.push(...comp.avisos);
    const ang = (p.asaAngulo * Math.PI) / 180;
    const girarComp = p.asaAngulo ? (m) => transformarMalla(m, matrizRotacion('z', p.asaAngulo)) : (m) => m;
    for (const c of comp.piezas) {
      const partes = c.partes ? c.partes.map((q) => ({ id: q.id, nombre: q.nombre, color: p.colores[q.colorClave], malla: girarComp(q.malla), mallaImpresion: q.mallaImpresion })) : null;
      piezas.push({
        id: c.id, nombre: c.nombre, color: partes ? partes[0].color : p.colores[c.colorClave], malla: girarComp(c.malla), mallaImpresion: c.mallaImpresion, desmontable: true,
        ...(partes ? { partes } : {}), despiece: [1.8 * Math.cos(ang), 1.8 * Math.sin(ang), 0]
      });
    }
  }

  if (cartel) {
    // Cada copia es una pieza: la primera se llama 'cartel' (y se mueve en el visor) y las otras 'cartel2', 'cartel3'…
    cartel.copias.forEach((copia) => {
      const partes = copia.partes.map((q) => ({ id: q.id, nombre: q.nombre, color: p.colores[q.colorClave], malla: q.malla }));
      const entero = unirMallas(partes.map((q) => q.malla));
      // Parado, como va sobre el jarro (una placa curva de pie no necesita soportes), apoyada en su borde de abajo.
      const { min } = cajaMalla(entero);
      const impresion = partes.map((q) => ({ ...q, mallaImpresion: moverMalla(q.malla, -min[0], -min[1], -min[2]) }));
      const dir = copia.theta0;
      piezas.push({
        id: copia.indice ? `cartel${copia.indice + 1}` : 'cartel', nombre: cartel.copias.length > 1 ? `Cartel ${copia.indice + 1}` : 'Cartel', color: partes[0].color, malla: entero,
        mallaImpresion: unirMallas(impresion.map((q) => q.mallaImpresion)),
        partes: impresion, desmontable: p.cartelDesmontable, despiece: [1.2 * Math.cos(dir), 1.2 * Math.sin(dir), 0]
      });
    });
    // ¿Se pisa con el asa? (mismo lado del jarro y a la misma altura)
    if (asa) {
      const g = geometriaAsa(p);
      const semiCartel = cartel.ancho / 2 / cartel.Rref;
      const semiAsa = (p.asaAncho * g.ext + 6) / 2 / R(g.z1);
      const solapaAltura = [g.z1, g.z2].some((z) => Math.abs(z - cartel.zc) < cartel.alto / 2 + g.altoPlaca / 2);
      const pisa = cartel.copias.some((c) => {
        let dif = Math.abs((((c.theta0 - (p.asaAngulo * Math.PI) / 180) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
        dif = Math.min(dif, 2 * Math.PI - dif);
        return dif < semiCartel + semiAsa + 0.05;
      });
      if (pisa && solapaAltura) avisos.push('El cartel se pisa con el asa: cambialo de altura o girá uno de los dos alrededor del jarro.');
    }
  }

  // Emblemas: cada uno es una pieza, parada sobre su borde de abajo como va en el jarro.
  if (emblemas) {
    emblemas.items.forEach((it) => {
      const partes = it.partes.map((q) => ({ id: q.id, nombre: q.nombre, color: p.colores[q.colorClave], malla: q.malla }));
      const entero = unirMallas(partes.map((q) => q.malla));
      const { min } = cajaMalla(entero);
      const impresion = partes.map((q) => ({ ...q, mallaImpresion: moverMalla(q.malla, -min[0], -min[1], -min[2]) }));
      const nombre = emblemas.items.length > 1 ? `Emblema ${it.indice + 1}` : 'Emblema';
      piezas.push({
        id: `emblema${it.indice + 1}`, nombre, color: partes[0].color, malla: entero, mallaImpresion: unirMallas(impresion.map((q) => q.mallaImpresion)),
        partes: impresion, desmontable: p.emblemaDesmontable, despiece: [1.2 * Math.cos(it.theta0), 1.2 * Math.sin(it.theta0), 0]
      });
    });
    // ¿Se pisa con el cartel o con el asa?
    const semi = emblemas.ancho / 2 / emblemas.Rref;
    const difAng = (a, b) => { const d = Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return Math.min(d, 2 * Math.PI - d); };
    if (cartel && emblemas.items.some((it) => cartel.copias.some((c) => difAng(it.theta0, c.theta0) < semi + cartel.ancho / 2 / cartel.Rref + 0.05)) && Math.abs(emblemas.zc - cartel.zc) < (emblemas.alto + cartel.alto) / 2) {
      avisos.push('Un emblema se pisa con el cartel: cambialo de altura o girá uno de los dos alrededor del jarro.');
    }
    if (asa) {
      const g = geometriaAsa(p);
      const semiAsa = (p.asaAncho * g.ext + 6) / 2 / R(g.z1);
      const solapaAltura = [g.z1, g.z2].some((z) => Math.abs(z - emblemas.zc) < emblemas.alto / 2 + g.altoPlaca / 2);
      if (solapaAltura && emblemas.items.some((it) => difAng(it.theta0, (p.asaAngulo * Math.PI) / 180) < semi + semiAsa + 0.05)) avisos.push('Un emblema se pisa con el asa: cambialo de altura o girá uno de los dos alrededor del jarro.');
    }
  }

  // Aros: bandas de revolución, paradas como van en el jarro.
  aros.forEach((a) => {
    const partes = a.partes.map((q) => ({ id: q.id, nombre: q.nombre, color: p.colores[q.colorClave], malla: q.malla }));
    const entero = unirMallas(partes.map((q) => q.malla));
    const { min } = cajaMalla(entero);
    const impresion = partes.map((q) => ({ ...q, mallaImpresion: moverMalla(q.malla, -min[0], -min[1], -min[2]) }));
    piezas.push({
      id: a.id, nombre: a.nombre, color: partes[0].color, malla: entero, mallaImpresion: unirMallas(impresion.map((q) => q.mallaImpresion)),
      partes: impresion, desmontable: a.desmontable, despiece: [0, 0, a.signo > 0 ? 1.3 : -1]
    });
    if (asa) {
      const g = geometriaAsa(p);
      if ([g.z1, g.z2].some((z) => z + g.altoPlaca / 2 > a.z0 && z - g.altoPlaca / 2 < a.z1)) avisos.push(`El ${a.nombre.toLowerCase()} se pisa con el asa: cambialo de altura o movelo.`);
    }
  });

  // Lata de referencia (sólo para ver el ajuste, no se exporta).
  const radioLata = Math.max(5, Ri - p.holgura / 2);
  const lata = moverMalla(revolucion([[0, 0], [radioLata, 0], [radioLata, p.altoHueco], [0, p.altoHueco]]), 0, 0, p.fondo);

  const conjunto = unirMallas(piezas.map((x) => x.malla));
  const caja = cajaMalla(conjunto);
  const ancho = caja.max[0] - caja.min[0];
  const largo = caja.max[1] - caja.min[1];
  if (H > ALTURA_CAMA_MAX) avisos.push(`El jarro mide ${Math.round(H)} mm de alto: revisá que entre en la altura de tu impresora.`);
  return {
    piezas, lata, ancho, largo, alto: H, radioExterior: R(0), radioHueco: Ri, avisos, parametros: p,
    // Para mostrar: cuánto del asa necesita soportes (mm con menos de 40°) y si el asa está en el plano X-Z.
    soportesAsa: soportes, aperturaPared: apertura, calidad, triangulosCuerpoTextura: texturado ? texturado.triangulos : 0
  };
}

// ¿Entra parado, tal como se ve armado, en la cama? (el alto se avisa aparte)
export function entraArmado(jarro, cama) {
  return entraEnCama(jarro.ancho, jarro.largo, cama);
}

// Qué hace falta para volver a encuadrar la cámara: sólo el tamaño de la lata. Mover el cartel, el asa o la silueta no
// tiene que devolver la vista a la posición inicial (cambian un poco el tamaño total del jarro y eso se notaba).
export const claveEncuadre = (p) => `${Number(p.diametroHueco) || 0}x${Number(p.altoHueco) || 0}`;

// Nombre base para los archivos exportados.
export const nombreJarro = (p) => `Jarro ${Math.round(Number(p.diametroHueco) || 0)}x${Math.round(Number(p.altoHueco) || 0)}`;
