// Complementos del asa (Fase 5 del plan en docs/plan-generador-jarros.md): ENVOLTURA del agarre (liso tipo cuero, cuerda,
// bandas o acanalado), COLLARINES (anillos que remachan la envoltura o van junto a la pared) y DESCANSO PARA EL PULGAR.
// Todos son piezas aparte, que se imprimen sueltas y se pegan o calzan sobre el asa. Sin navegador: se prueba en Node.
//
// Cada complemento es una "manga": un tubo hueco que rodea al asa (con una holgura) y que sigue su curva. La envoltura y los
// collarines se arman en DOS MITADES (cortadas por el plano de la curva) que se pegan alrededor del asa, así entran aunque el
// asa esté pegada al jarro; el descanso es una manga que sólo cubre el lado de afuera.
import { transformarMalla, matrizRotacion, cajaMalla, volumenMalla, revisarCerrada } from './mallas3d';
import { caminosAFormas, extruir, formasACaminos, restarCaminos, unirMallas, moverMalla } from './llaveros';
import { invertir } from './mallasJarro';
import { formaEmblema } from './jarrosDetalles';
import { contornoCartel, poligono } from './jarrosCartel';

export const ESTILOS_ENVOLTURA = [
  { id: 'liso', nombre: 'Lisa (cuero)' },
  { id: 'cuerda', nombre: 'Cuerda' },
  { id: 'bandas', nombre: 'Bandas' },
  { id: 'acanalado', nombre: 'Acanalada' }
];

const EMPOTRADO_SIMBOLO = 0.8; // cuánto se mete la plaquita del símbolo en el asa
// Del plano de un disco (X, Y a lo ancho, Z hacia afuera) al mundo del asa: Z pasa a X (hacia afuera de la pared), X a Y y Y a Z.
const ejeAMundo = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1];
const SEPARACION_MITADES = 5; // mm entre las dos mitades al acomodarlas para imprimir
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Remuestrea el camino del asa por largo de arco: devuelve su largo y una función s → { x, z, tx, tz, alargue, escala }.
export function muestreadorCamino({ puntos, tangentes, alargue, escala }) {
  const acum = [0];
  for (let i = 1; i < puntos.length; i++) acum.push(acum[i - 1] + Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]));
  const largo = acum[acum.length - 1];
  const muestra = (s0) => {
    const s = Math.min(largo, Math.max(0, s0));
    let j = 0;
    while (j < puntos.length - 2 && acum[j + 1] < s) j++;
    const len = acum[j + 1] - acum[j];
    const t = len > 1e-9 ? (s - acum[j]) / len : 0;
    const lerp = (a, b) => a + (b - a) * t;
    let tx = lerp(tangentes[j][0], tangentes[j + 1][0]), tz = lerp(tangentes[j][1], tangentes[j + 1][1]);
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return {
      x: lerp(puntos[j][0], puntos[j + 1][0]), z: lerp(puntos[j][1], puntos[j + 1][1]), tx, tz,
      alargue: lerp(alargue[j], alargue[j + 1]), escala: lerp(escala[j], escala[j + 1])
    };
  };
  return { largo, muestra };
}

// Manga hueca alrededor del asa entre los largos de arco s0 y s1, sólo sobre el arco de sección de a0 a a1 (radianes; el
// ángulo 0 mira hacia afuera del lazo del asa, π/2 hacia +Y). `espesor(s, a)`: cuánto sobresale (mm) del asa más la holgura.
// Sale cerrada y con los triángulos hacia afuera.
export function barrerManga(camino, { s0, s1, a0, a1, espesor, ancho, grosor, redondez, holgura, paso = 1.5, pasosArco = 18 }) {
  const { muestra } = muestreadorCamino(camino);
  const exp = 2 / redondez;
  const M = Math.max(2, Math.round(pasosArco * Math.abs(a1 - a0) / Math.PI));
  const n = Math.max(2, Math.ceil((s1 - s0) / paso) + 1);
  const pos = [];
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * i) / (n - 1);
    const f = muestra(s);
    const nx = -f.tz, nz = f.tx;
    const g = (grosor / 2) * f.escala * f.alargue;
    const aw = (ancho / 2) * f.escala;
    for (const interior of [false, true]) {
      for (let k = 0; k <= M; k++) {
        const a = a0 + ((a1 - a0) * k) / M;
        const c = Math.cos(a), sn = Math.sin(a);
        const u = Math.sign(c) * Math.abs(c) ** exp, w = Math.sign(sn) * Math.abs(sn) ** exp;
        const e = interior ? 0 : Math.max(0.3, espesor(s, a));
        const gg = g + holgura + e, ww = aw + holgura + e;
        pos.push(f.x + nx * gg * u, ww * w, f.z + nz * gg * u);
      }
    }
  }
  const idx = (i, t, k) => (i * 2 + t) * (M + 1) + k;
  // Cada familia de triángulos se prueba en los dos sentidos hasta que la malla quede cerrada y con volumen positivo.
  const armar = (fo, fc, fs) => {
    const tri = [];
    const quad = (a, b, c, d, dir) => { if (dir) tri.push(a, b, c, a, c, d); else tri.push(a, c, b, a, d, c); };
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < M; k++) {
        quad(idx(i, 0, k), idx(i, 0, k + 1), idx(i + 1, 0, k + 1), idx(i + 1, 0, k), fo); // por afuera
        quad(idx(i, 1, k), idx(i, 1, k + 1), idx(i + 1, 1, k + 1), idx(i + 1, 1, k), !fo); // por adentro
      }
    }
    for (let k = 0; k < M; k++) {
      quad(idx(0, 0, k), idx(0, 0, k + 1), idx(0, 1, k + 1), idx(0, 1, k), fc); // tapa del principio
      quad(idx(n - 1, 0, k), idx(n - 1, 0, k + 1), idx(n - 1, 1, k + 1), idx(n - 1, 1, k), !fc); // tapa del final
    }
    for (let i = 0; i < n - 1; i++) {
      quad(idx(i, 0, 0), idx(i + 1, 0, 0), idx(i + 1, 1, 0), idx(i, 1, 0), fs); // lado del principio del arco
      quad(idx(i, 0, M), idx(i + 1, 0, M), idx(i + 1, 1, M), idx(i, 1, M), !fs); // lado del final del arco
    }
    return { pos: Float32Array.from(pos), tri: Uint32Array.from(tri) };
  };
  for (const fo of [true, false]) for (const fc of [true, false]) for (const fs of [true, false]) {
    const m = armar(fo, fc, fs);
    if (revisarCerrada(m).cerrada) return volumenMalla(m) < 0 ? invertir(m) : m;
  }
  return armar(true, true, true);
}

// Dibujo del relieve de cada estilo de envoltura: cuánto sobresale (mm) en el largo s y el ángulo a.
function relieveEnvoltura(estilo, espesor, paso, s0, s1) {
  const fin = (s) => 0.55 + 0.45 * suave(0, 2, Math.min(s - s0, s1 - s)); // extremos biselados
  return (s, a) => {
    let f = 1;
    if (estilo === 'cuerda') f = 0.62 + 0.38 * (0.5 + 0.5 * Math.cos(3 * a - (2 * Math.PI * s) / paso));
    else if (estilo === 'bandas') f = 0.5 + 0.5 * suave(0.35, 0.65, 0.5 + 0.5 * Math.cos((2 * Math.PI * s) / paso));
    else if (estilo === 'acanalado') f = 0.7 + 0.3 * (0.5 + 0.5 * Math.cos(10 * a));
    return espesor * f * fin(s);
  };
}

// Acomoda dos mitades (cortadas por el plano y = 0) acostadas sobre su cara de corte, una al lado de la otra.
function acostarMitades(arriba, abajo) {
  const a = transformarMalla(arriba, matrizRotacion('x', 90)); // y ≥ 0 pasa a ser altura
  const b = transformarMalla(abajo, matrizRotacion('x', -90)); // y ≤ 0 pasa a ser altura
  const ca = cajaMalla(a), cb = cajaMalla(b);
  const A = moverMalla(a, -ca.min[0], -ca.min[1], -ca.min[2]);
  const B = moverMalla(b, -cb.min[0], -cb.min[1] + (ca.max[1] - ca.min[1]) + SEPARACION_MITADES, -cb.min[2]);
  return unirMallas([A, B]);
}

// Mallas de impresión y armada de una manga completa dividida en dos mitades.
function mangaEnMitades(camino, opciones) {
  const arriba = barrerManga(camino, { ...opciones, a0: 0, a1: Math.PI });
  const abajo = barrerManga(camino, { ...opciones, a0: Math.PI, a1: 2 * Math.PI });
  return { armada: unirMallas([arriba, abajo]), impresion: acostarMitades(arriba, abajo) };
}

// Arma los complementos del asa. `s`: parámetros ya saneados; `camino`: el camino del asa (sin girar) y `entrada`: cuánto se
// prolonga el asa dentro de la pared (asa pegada). Devuelve { piezas: [{ id, nombre, colorClave, malla, mallaImpresion }],
// avisos }; las mallas armadas están en el plano X-Z (sin girar alrededor del jarro) y la de impresión ya está apoyada.
export function armarComplementosAsa(s, camino, entrada = 0, extremos = null) {
  const piezas = [];
  const avisos = [];
  if (!s.asa) return { piezas, avisos };
  const { largo } = muestreadorCamino(camino);
  const base = { ancho: s.asaAncho, grosor: s.asaGrosor, redondez: s.asaRedondez, holgura: s.holguraEncastre };
  // Los complementos no se acercan a la pared: dejan la parte recta de arranque libre.
  const reserva = (e) => entrada + Math.max(4, s.asaPlacas ? s.asaPlacaGrosor : 0) + e + 1;
  const curvo = (e) => camino.radioMin < (s.asaGrosor * 1.0) / 2 + e + base.holgura;
  const ocupados = []; // [s0, s1] de lo ya puesto, para avisar si se pisan

  if (s.envoltura) {
    const e = s.envolturaEspesor;
    const lim = reserva(e);
    const largoMax = Math.max(5, largo - 2 * lim);
    const L = Math.min(s.envolturaLargo, largoMax);
    const centro = Math.min(largo - lim - L / 2, Math.max(lim + L / 2, (s.envolturaCentro / 100) * largo));
    const s0 = centro - L / 2, s1 = centro + L / 2;
    if (s.envolturaLargo > largoMax + 0.01) avisos.push('La envoltura es más larga que el tramo libre del asa: se acortó.');
    if (curvo(e)) avisos.push('La envoltura es muy gruesa para la curva del asa: bajá el espesor o abrí la curva.');
    const m = mangaEnMitades(camino, { ...base, s0, s1, espesor: relieveEnvoltura(s.envolturaEstilo, e, s.envolturaPaso, s0, s1) });
    piezas.push({ id: 'envoltura', nombre: 'Envoltura del asa', colorClave: 'envoltura', malla: m.armada, mallaImpresion: m.impresion });
    ocupados.push([s0, s1, 'la envoltura']);
    if (s.envolturaRemate) {
      // Un collarín en cada punta, justo afuera de la envoltura.
      const ec = s.collarinEspesor, w = s.collarinAncho;
      const tramos = [[s0 - w, s0], [s1, s1 + w]].filter(([a, b]) => a >= lim - 0.01 && b <= largo - lim + 0.01);
      if (tramos.length < 2) avisos.push('No hay lugar para los dos collarines de la envoltura: acortala o bajá su espesor.');
      if (tramos.length) {
        const ms = tramos.map(([a, b]) => mangaEnMitades(camino, { ...base, s0: a, s1: b, espesor: () => Math.max(ec, e + 0.4) }));
        piezas.push({ id: 'remate', nombre: 'Collarines de la envoltura', colorClave: 'collarin', malla: unirMallas(ms.map((x) => x.armada)), mallaImpresion: apilarFila(ms.map((x) => x.impresion)) });
      }
    }
  }

  if (s.asaCollarines) {
    const ec = s.collarinEspesor, w = s.collarinAncho;
    const lim = reserva(ec);
    if (largo - 2 * lim < 2 * w + 4) avisos.push('No hay lugar para los collarines junto a la pared: achicalos o hacé el asa más larga.');
    else {
      const tramos = [[lim, lim + w], [largo - lim - w, largo - lim]];
      tramos.forEach(([a, b]) => { const ov = ocupados.find(([x, y]) => a < y && b > x); if (ov) avisos.push(`Un collarín se pisa con ${ov[2]}: movelos o acortala.`); });
      const ms = tramos.map(([a, b]) => mangaEnMitades(camino, { ...base, s0: a, s1: b, espesor: () => ec }));
      piezas.push({ id: 'collarines', nombre: 'Collarines del asa', colorClave: 'collarin', malla: unirMallas(ms.map((x) => x.armada)), mallaImpresion: apilarFila(ms.map((x) => x.impresion)) });
    }
  }

  // Símbolo sobre el asa: una plaquita con el símbolo elegido en Emblemas, curvada a lo largo del asa.
  if (s.asaSimbolo) {
    const sa = {
      ...s, emblemaTamano: s.asaSimboloTamano, emblemaRespaldo: s.asaSimboloRespaldo, emblemaMargen: 2, emblemaGrosor: 2.4,
      emblemaRelieve: s.asaSimboloRelieve, emblemaBisel: 0.4, emblemaBorde: false, emblemaDesmontable: false
    };
    let forma;
    try {
      forma = formaEmblema(sa, EMPOTRADO_SIMBOLO);
    } catch (e) {
      forma = formaEmblema({ ...sa, emblemaSimbolo: 'estrella' }, EMPOTRADO_SIMBOLO);
      avisos.push(`${e.message} Se usó una estrella en el asa.`);
    }
    const lado = forma.lado;
    const lim = reserva(s.asaSimboloRelieve + 1);
    if (lado > s.asaAncho - 1) avisos.push('El símbolo es más ancho que el asa: achicalo para que no sobresalga de los costados.');
    if (largo - 2 * lim < lado) avisos.push('El símbolo no entra en el tramo libre del asa: achicalo.');
    else {
      const sc = Math.min(largo - lim - lado / 2, Math.max(lim + lado / 2, (s.asaSimboloPosicion / 100) * largo));
      const { muestra } = muestreadorCamino(camino);
      // Plano → asa: x (a lo ancho) pasa a Y; y (hacia arriba del símbolo) va hacia el extremo de arriba del asa; z, hacia afuera.
      const curvar = (m) => {
        const pos = new Float32Array(m.pos.length);
        for (let i = 0; i < pos.length; i += 3) {
          const f = muestra(sc - m.pos[i + 1]);
          const g = (s.asaGrosor / 2) * f.escala * f.alargue + m.pos[i + 2];
          pos[i] = f.x - f.tz * g;
          pos[i + 1] = m.pos[i];
          pos[i + 2] = f.z + f.tx * g;
        }
        return { pos, tri: m.tri };
      };
      const partes = forma.partes.map((q) => ({ id: q.id, nombre: q.nombre, colorClave: q.colorClave, malla: curvar(q.malla), plana: q.malla }));
      const armada = unirMallas(partes.map((q) => q.malla));
      const cp = cajaMalla(unirMallas(partes.map((q) => q.plana)));
      const impresion = partes.map((q) => ({ id: q.id, nombre: q.nombre, colorClave: q.colorClave, mallaImpresion: moverMalla(q.plana, -cp.min[0], -cp.min[1], -cp.min[2]) }));
      piezas.push({
        id: 'simboloAsa', nombre: 'Símbolo del asa', colorClave: partes[0].colorClave, malla: armada, mallaImpresion: unirMallas(impresion.map((q) => q.mallaImpresion)),
        partes: partes.map((q, i) => ({ id: q.id, nombre: q.nombre, colorClave: q.colorClave, malla: q.malla, mallaImpresion: impresion[i].mallaImpresion }))
      });
      ocupados.forEach(([x, y, nombre]) => { if (sc - lado / 2 < y && sc + lado / 2 > x) avisos.push(`El símbolo del asa se pisa con ${nombre}: movelo.`); });
      ocupados.push([sc - lado / 2, sc + lado / 2, 'el símbolo del asa']);
    }
  }

  // Placas de montaje decorativas: un rosetón plano alrededor de cada extremo del asa, contra la pared (o contra la placa de montaje).
  if (s.asaPlacas && extremos) {
    const lado = s.asaPlacaLado, esp = s.asaPlacaGrosor, hg = base.holgura;
    const w0 = s.asaAncho * camino.escala[0], g0 = s.asaGrosor * camino.escala[0] * camino.alargue[0];
    const exp = 2 / s.asaRedondez;
    const agujero = Array.from({ length: 48 }, (_, k) => {
      const a = (2 * Math.PI * k) / 48, c = Math.cos(a), sn = Math.sin(a);
      return [(w0 / 2 + hg) * Math.sign(c) * Math.abs(c) ** exp, (g0 / 2 + hg) * Math.sign(sn) * Math.abs(sn) ** exp];
    });
    if (lado < Math.max(w0, g0) + 6) avisos.push('Las placas de montaje son muy chicas para el asa: agrandalas.');
    const contorno = formasACaminos([contornoCartel(s.asaPlacaForma, lado, lado)]);
    const anillo = restarCaminos(contorno, formasACaminos([poligono(agujero)]));
    // Contra la pared curva el borde de la placa queda lejos de la pared: se mete lo necesario (asa pegada); con la placa de montaje, apenas.
    const sag = (r) => r - Math.sqrt(Math.max(0, r * r - (lado / 2) ** 2));
    const hondo = s.asaDesmontable ? 0.6 : Math.min(8, 0.6 + sag(extremos.x1));
    const disco = extruir(caminosAFormas(anillo), -hondo, esp);
    const local = transformarMalla(disco, ejeAMundo);
    const colocados = [[extremos.x1, extremos.z1], [extremos.x2, extremos.z2]].map(([x, z]) => moverMalla(local, x, 0, z));
    // Cada disco se imprime acostado sobre su cara de atrás.
    const plano = transformarMalla(local, matrizRotacion('y', -90));
    const cpl = cajaMalla(plano);
    const acostados = [0, 1].map(() => moverMalla(plano, -cpl.min[0], -cpl.min[1], -cpl.min[2]));
    piezas.push({ id: 'placasAsa', nombre: 'Placas de montaje del asa', colorClave: 'placaAsa', malla: unirMallas(colocados), mallaImpresion: apilarFila(acostados) });
  }

  if (s.pulgar) {
    const alto = s.pulgarAlto;
    const lim = reserva(alto);
    const L = Math.min(s.pulgarLargo, Math.max(8, largo - 2 * lim));
    const centro = Math.min(largo - lim - L / 2, Math.max(lim + L / 2, (s.pulgarPosicion / 100) * largo));
    const s0 = centro - L / 2, s1 = centro + L / 2;
    const medio = (s.pulgarArco * Math.PI) / 360; // la mitad del arco, en radianes
    // Almohadilla: más gruesa en el medio y se afina hacia los bordes (lente), con un suave repecho a lo ancho.
    const lente = (sx, a) => alto * Math.sin(Math.PI * ((sx - s0) / (s1 - s0))) ** 0.8 * (0.35 + 0.65 * Math.cos((a / medio) * (Math.PI / 2)));
    const arriba = barrerManga(camino, { ...base, s0, s1, a0: -medio, a1: medio, espesor: lente });
    if (curvo(alto)) avisos.push('El descanso del pulgar es muy alto para la curva del asa: bajalo o abrí la curva.');
    ocupados.forEach(([x, y, nombre]) => { if (s0 < y && s1 > x) avisos.push(`El descanso del pulgar se pisa con ${nombre}: movelo.`); });
    // Se imprime acostado, como el asa.
    const acostado = transformarMalla(arriba, matrizRotacion('x', 90));
    const c = cajaMalla(acostado);
    piezas.push({ id: 'pulgar', nombre: 'Descanso del pulgar', colorClave: 'pulgar', malla: arriba, mallaImpresion: moverMalla(acostado, -c.min[0], -c.min[1], -c.min[2]) });
  }
  return { piezas, avisos };
}

// Pone varias mallas ya apoyadas una al lado de la otra (hacia +Y), con una separación.
function apilarFila(mallas) {
  let y = 0;
  const salida = [];
  for (const m of mallas) {
    const c = cajaMalla(m);
    salida.push(moverMalla(m, -c.min[0], y - c.min[1], -c.min[2]));
    y += c.max[1] - c.min[1] + SEPARACION_MITADES;
  }
  return unirMallas(salida);
}
