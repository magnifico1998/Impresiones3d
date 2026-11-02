// Calcula el relieve fuera del hilo principal para que la pantalla no se
// congele. Dos pedidos:
//  - 'preparar': parte el modelo para la vista previa en la GPU (el shader
//    pone el relieve) y devuelve la malla, las normales y cuánto recibe cada
//    vértice de cada capa.
//  - el resto: calcula la malla con el relieve puesto (ya reducida si se pidió).
import { texturizarCapas, prepararVista } from './superficie';
import { decimar } from './decimacion';

self.onmessage = (e) => {
  const { tipo, malla, capas, globales, maxTriangulos, maxSalida, tolerancia } = e.data;
  try {
    if (tipo === 'preparar') {
      self.postMessage({ progreso: 'Preparando la vista previa…' });
      const r = prepararVista(malla, capas, globales, { maxTriangulos });
      self.postMessage({ ok: true, pos: r.pos, tri: r.tri, normal: r.normal, recibe: r.recibe, avisos: r.avisos }, [r.pos.buffer, r.tri.buffer, r.normal.buffer, r.recibe.buffer]);
      return;
    }
    self.postMessage({ progreso: 'Subdividiendo y aplicando el relieve…' });
    const r = texturizarCapas(malla, capas, globales, { maxTriangulos });
    let { pos, tri } = r.malla;
    const generados = tri.length / 3;
    if (maxSalida > 0 || tolerancia > 0) {
      self.postMessage({ progreso: 'Reduciendo triángulos…' });
      const d = decimar({ pos, tri }, { objetivo: maxSalida || 0, tolerancia });
      pos = d.pos; tri = d.tri;
    }
    self.postMessage({ ok: true, pos, tri, avisos: r.avisos, generados, final: tri.length / 3 }, [pos.buffer, tri.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
