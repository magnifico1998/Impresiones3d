import React, { useRef, useState } from 'react';
import { EXTRA_MAX, MAX_PUNTOS_ASA, MAX_PUNTOS_FORMA, curvaAsa, perfilExterior, radioExteriorFn, sanearParametros } from '../../utils/jarros';

// Editores de la silueta del cuerpo y de la curva del asa: puntos que se arrastran sobre una cuadrícula. Trabajan con
// los parámetros ya saneados (`sanearParametros`) y avisan los cambios con `alCambiar({ ... })`, que la pantalla suma a
// sus parámetros.

const COLOR_PUNTO = '#ff7a00';
const COLOR_SELECCION = '#1f6feb';

// Convierte un evento del puntero a coordenadas del viewBox del SVG.
function aViewBox(svg, ev, ancho, alto) {
  const r = svg.getBoundingClientRect();
  return [((ev.clientX - r.left) * ancho) / r.width, ((ev.clientY - r.top) * alto) / r.height];
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const redondear = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function Cuadricula({ ancho, alto, paso }) {
  const lineas = [];
  for (let x = paso; x < ancho; x += paso) lineas.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={alto} stroke="var(--border)" strokeWidth="0.5" />);
  for (let y = paso; y < alto; y += paso) lineas.push(<line key={`y${y}`} x1={0} y1={y} x2={ancho} y2={y} stroke="var(--border)" strokeWidth="0.5" />);
  return <g>{lineas}</g>;
}

// ---------- Silueta del cuerpo ----------

const FA = 220, FH = 270; // tamaño del dibujo (viewBox)
const F_MARGEN = { izq: 14, der: 10, sup: 12, inf: 18 };

export function EditorForma({ parametros, alCambiar, alEmpezar }) {
  const p = sanearParametros(parametros);
  const svgRef = useRef(null);
  const [activo, setActivo] = useState(null); // índice del punto que se arrastra
  const [elegido, setElegido] = useState(null);

  const Ri = p.diametroHueco / 2;
  const rMin = Ri - 4;
  const rMax = Ri + p.pared + EXTRA_MAX;
  const sx = (FA - F_MARGEN.izq - F_MARGEN.der) / (rMax - rMin);
  const sy = (FH - F_MARGEN.sup - F_MARGEN.inf);
  const px = (r) => F_MARGEN.izq + (r - rMin) * sx;
  const py = (t) => FH - F_MARGEN.inf - t * sy;
  const aRadio = (x) => (x - F_MARGEN.izq) / sx + rMin;
  const aAltura = (y) => (FH - F_MARGEN.inf - y) / sy;

  const perfil = perfilExterior(p);
  const H = p.fondo + p.altoHueco;
  const puntos = p.formaPuntos;
  const base = Ri + p.pared;
  const exterior = perfil.map(([r, z]) => `${px(r)},${py(z / H)}`).join(' ');

  const mover = (ev) => {
    if (activo === null) return;
    const [x, y] = aViewBox(svgRef.current, ev, FA, FH);
    const extra = limitar(aRadio(x) - base, 0, EXTRA_MAX);
    const nuevos = puntos.map((q) => [...q]);
    const ultimo = nuevos.length - 1;
    if (activo === 0 || activo === ultimo) nuevos[activo][1] = redondear(extra, 2);
    else {
      const t = limitar(aAltura(y), nuevos[activo - 1][0] + 0.03, nuevos[activo + 1][0] - 0.03);
      nuevos[activo] = [redondear(t, 3), redondear(extra, 2)];
    }
    alCambiar({ formaPuntos: nuevos, forma: 'propia' });
  };
  const soltar = () => setActivo(null);

  const agregar = () => {
    if (puntos.length >= MAX_PUNTOS_FORMA) return;
    alEmpezar?.();
    let mejor = 0, hueco = -1;
    for (let i = 0; i < puntos.length - 1; i++) { const d = puntos[i + 1][0] - puntos[i][0]; if (d > hueco) { hueco = d; mejor = i; } }
    const t = (puntos[mejor][0] + puntos[mejor + 1][0]) / 2;
    const extra = Math.max(0, radioExteriorFn(p)(t * H) - base);
    const nuevos = [...puntos.slice(0, mejor + 1), [redondear(t, 3), redondear(extra, 2)], ...puntos.slice(mejor + 1)].map((q) => [...q]);
    setElegido(mejor + 1);
    alCambiar({ formaPuntos: nuevos, forma: 'propia' });
  };
  const quitar = () => {
    if (elegido === null || elegido === 0 || elegido === puntos.length - 1) return;
    alEmpezar?.();
    alCambiar({ formaPuntos: puntos.filter((_, i) => i !== elegido).map((q) => [...q]), forma: 'propia' });
    setElegido(null);
  };

  return (
    <div>
      <svg
        ref={svgRef} viewBox={`0 0 ${FA} ${FH}`} width="100%" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', touchAction: 'none', display: 'block', maxHeight: '300px' }}
        onPointerMove={mover} onPointerUp={soltar} onPointerLeave={soltar}
      >
        <Cuadricula ancho={FA} alto={FH} paso={22} />
        {/* Pared: entre el hueco (línea punteada) y la silueta exterior. */}
        <polygon points={`${px(Ri)},${py(0)} ${exterior} ${px(Ri)},${py(1)}`} fill="var(--accentDim, #fde3c8)" stroke="none" />
        <polyline points={exterior} fill="none" stroke="var(--text)" strokeWidth="1.6" />
        <line x1={px(Ri)} y1={py(0)} x2={px(Ri)} y2={py(1)} stroke="var(--text3)" strokeWidth="1" strokeDasharray="4 3" />
        <text x={px(Ri) - 3} y={FH - 5} fontSize="8" fill="var(--text3)" textAnchor="end">hueco</text>
        <text x={FA - 6} y={FH - 5} fontSize="8" fill="var(--text3)" textAnchor="end">radio →</text>
        {puntos.map(([t, e], i) => (
          <circle
            key={i} cx={px(base + e)} cy={py(t)} r={elegido === i ? 6 : 5} fill={elegido === i ? COLOR_SELECCION : COLOR_PUNTO} stroke="#fff" strokeWidth="1.5" style={{ cursor: 'grab' }}
            onPointerDown={(ev) => { ev.preventDefault(); alEmpezar?.(); svgRef.current.setPointerCapture?.(ev.pointerId); setActivo(i); setElegido(i); }}
          />
        ))}
      </svg>
      <div style={{ fontSize: '10px', color: 'var(--text3)', margin: '4px 0 6px' }}>
        Arrastrá los puntos: a los costados cambia cuánto se ensancha el jarro; arriba y abajo, dónde. Los puntos de las puntas sólo se mueven de costado.
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" className="btn btn-sm" disabled={puntos.length >= MAX_PUNTOS_FORMA} onClick={agregar}>+ Punto</button>
        <button type="button" className="btn btn-sm" disabled={elegido === null || elegido === 0 || elegido === puntos.length - 1} onClick={quitar}>Quitar punto</button>
      </div>
    </div>
  );
}

// ---------- Curva del asa ----------

const AA = 240, AH = 300;
const A_MARGEN = 12;

export function EditorAsa({ parametros, alCambiar, alEmpezar }) {
  const p = sanearParametros(parametros);
  const svgRef = useRef(null);
  const [activo, setActivo] = useState(null);
  const [elegido, setElegido] = useState(null);
  const curva = curvaAsa(p);
  if (!curva) return null;

  const { xBase, salidaEfectiva: salida, span, z1, z2, x1, x2 } = curva;
  const H = p.fondo + p.altoHueco;
  // Ventana del dibujo (mm): de la pared a un poco más de lo que sobresale, y entre los extremos con aire.
  const xLo = Math.min(x1, x2) - 8, xHi = xBase + salida * 1.35;
  const zLo = Math.max(0, z2 - 16), zHi = Math.min(H, z1 + 16);
  const s = Math.min((AA - 2 * A_MARGEN) / (xHi - xLo), (AH - 2 * A_MARGEN) / (zHi - zLo));
  const px = (x) => A_MARGEN + (x - xLo) * s;
  const py = (z) => AH - A_MARGEN - (z - zLo) * s;
  const aX = (x) => (x - A_MARGEN) / s + xLo;
  const aZ = (y) => (AH - A_MARGEN - y) / s + zLo;

  const R = radioExteriorFn(p);
  const pared = [];
  for (let k = 0; k <= 20; k++) { const z = zLo + ((zHi - zLo) * k) / 20; pared.push([R(z), z]); }
  const paredPts = `${px(xLo)},${py(zLo)} ${pared.map(([r, z]) => `${px(r)},${py(z)}`).join(' ')} ${px(xLo)},${py(zHi)}`;

  const pts = p.asaPuntos;
  const esq = new Set(p.asaEsquinas);
  const mover = (ev) => {
    if (activo === null) return;
    const [x, y] = aViewBox(svgRef.current, ev, AA, AH);
    const u = limitar((aX(x) - xBase) / salida, 0.08, 1.6);
    const v = limitar((aZ(y) - z2) / span, -0.1, 1.1);
    const nuevos = pts.map((q) => [...q]);
    nuevos[activo] = [redondear(u, 3), redondear(v, 3)];
    alCambiar({ asaPuntos: nuevos, asaForma: 'propia' });
  };
  const soltar = () => setActivo(null);

  const alternarEsquina = (i) => {
    const nuevas = esq.has(i) ? p.asaEsquinas.filter((k) => k !== i) : [...p.asaEsquinas, i];
    alCambiar({ asaEsquinas: nuevas, asaForma: 'propia' });
  };
  const agregar = () => {
    if (pts.length >= MAX_PUNTOS_ASA) return;
    alEmpezar?.();
    // En medio del tramo más largo de la línea de control (extremo de arriba, puntos, extremo de abajo).
    const ctrl = [[0.1, 1], ...pts, [0.1, 0]];
    let mejor = 0, largo = -1;
    for (let i = 0; i < ctrl.length - 1; i++) {
      const d = Math.hypot((ctrl[i + 1][0] - ctrl[i][0]) * salida, (ctrl[i + 1][1] - ctrl[i][1]) * span);
      if (d > largo) { largo = d; mejor = i; }
    }
    const nuevo = [redondear((ctrl[mejor][0] + ctrl[mejor + 1][0]) / 2, 3), redondear((ctrl[mejor][1] + ctrl[mejor + 1][1]) / 2, 3)];
    const nuevos = [...pts.slice(0, mejor), nuevo, ...pts.slice(mejor)].map((q) => [...q]);
    // Las esquinas que estaban de ese punto en adelante corren un lugar.
    const esquinas = p.asaEsquinas.map((i) => (i >= mejor ? i + 1 : i));
    setElegido(mejor);
    alCambiar({ asaPuntos: nuevos, asaEsquinas: esquinas, asaForma: 'propia' });
  };
  const quitar = () => {
    if (elegido === null || pts.length <= 1) return;
    alEmpezar?.();
    alCambiar({
      asaPuntos: pts.filter((_, i) => i !== elegido).map((q) => [...q]),
      asaEsquinas: p.asaEsquinas.filter((i) => i !== elegido).map((i) => (i > elegido ? i - 1 : i)),
      asaForma: 'propia'
    });
    setElegido(null);
  };

  // La curva, con los tramos de menos de 40° de inclinación (que necesitan soportes) en rojo.
  const tramos = [];
  for (let i = 0; i < curva.puntos.length - 1; i++) {
    const [a, b] = [curva.puntos[i], curva.puntos[i + 1]];
    tramos.push(<line key={i} x1={px(a[0])} y1={py(a[1])} x2={px(b[0])} y2={py(b[1])} stroke={curva.segPlano[i] ? '#d64545' : 'var(--text)'} strokeWidth="3" strokeLinecap="round" />);
  }

  return (
    <div>
      <svg
        ref={svgRef} viewBox={`0 0 ${AA} ${AH}`} width="100%" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', touchAction: 'none', display: 'block', maxHeight: '340px' }}
        onPointerMove={mover} onPointerUp={soltar} onPointerLeave={soltar}
      >
        <Cuadricula ancho={AA} alto={AH} paso={24} />
        <polygon points={paredPts} fill="var(--accentDim, #fde3c8)" stroke="var(--text3)" strokeWidth="0.8" />
        {tramos}
        {/* Extremos en la pared (fijos). */}
        {[[x1, z1], [x2, z2]].map(([x, z], i) => <rect key={i} x={px(x) - 3.5} y={py(z) - 3.5} width="7" height="7" fill="var(--text)" />)}
        {pts.map(([u, v], i) => {
          const cx = px(xBase + u * salida), cy = py(z2 + v * span);
          const color = elegido === i ? COLOR_SELECCION : COLOR_PUNTO;
          const eventos = {
            style: { cursor: 'grab' },
            onPointerDown: (ev) => { ev.preventDefault(); alEmpezar?.(); svgRef.current.setPointerCapture?.(ev.pointerId); setActivo(i); setElegido(i); },
            onDoubleClick: () => { alEmpezar?.(); alternarEsquina(i); }
          };
          return esq.has(i)
            ? <rect key={i} x={cx - 5} y={cy - 5} width="10" height="10" fill={color} stroke="#fff" strokeWidth="1.5" {...eventos} />
            : <circle key={i} cx={cx} cy={cy} r={elegido === i ? 6 : 5} fill={color} stroke="#fff" strokeWidth="1.5" {...eventos} />;
        })}
        <text x={AA - 6} y={AH - 4} fontSize="8" fill="var(--text3)" textAnchor="end">hacia afuera →</text>
      </svg>
      <div style={{ fontSize: '10px', color: 'var(--text3)', margin: '4px 0 6px' }}>
        Arrastrá los puntos para darle forma al asa. Doble clic en un punto = esquina viva (cuadrado). En rojo, los tramos con menos de 40° de inclinación: necesitan soportes.
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" className="btn btn-sm" disabled={pts.length >= MAX_PUNTOS_ASA} onClick={agregar}>+ Punto</button>
        <button type="button" className="btn btn-sm" disabled={elegido === null || pts.length <= 1} onClick={quitar}>Quitar punto</button>
      </div>
    </div>
  );
}
