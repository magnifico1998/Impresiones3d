// Motor de operaciones booleanas entre mallas { pos, tri }: Manifold (WebAssembly, ver src/vendor/manifold/LEEME.md).
// Garantiza que el resultado sea un sólido cerrado, cosa que `three-bvh-csg` no asegura cuando las caras se tocan en
// ángulo (placas contra una pared inclinada). Se carga la primera vez que se pide, sin bloquear la pantalla:
// `iniciarMotor()` devuelve una promesa y, una vez lista, `motorListo()` es true y `operar` anda de forma sincrónica.
import urlWasm from '../vendor/manifold/manifold.wasm?url';

let motor = null;
let promesa = null;

export function iniciarMotor() {
  if (!promesa) {
    promesa = (async () => {
      const { default: Modulo } = await import('../vendor/manifold/manifold.js');
      // En el navegador el .wasm es un archivo aparte (hay que decir dónde está); en Node lo encuentra solo.
      const wasm = await Modulo(typeof window !== 'undefined' ? { locateFile: () => urlWasm } : {});
      wasm.setup();
      motor = wasm;
      return wasm;
    })().catch((e) => { promesa = null; throw e; });
  }
  return promesa;
}

export const motorListo = () => motor !== null;

// Las mallas de entrada tienen que ser sólidos cerrados con los triángulos hacia afuera, con los vértices compartidos.
function aManifold(malla) {
  const { Manifold, Mesh } = motor;
  return new Manifold(new Mesh({ numProp: 3, vertProperties: new Float32Array(malla.pos), triVerts: new Uint32Array(malla.tri) }));
}

// 'sumar' o 'restar' (a menos b).
export function operar(a, b, operacion) {
  if (!motor) throw new Error('El motor 3D todavía no cargó.');
  const A = aManifold(a);
  const B = aManifold(b);
  const R = operacion === 'sumar' ? A.add(B) : A.subtract(B);
  const salida = R.getMesh();
  const malla = { pos: Float32Array.from(salida.vertProperties), tri: Uint32Array.from(salida.triVerts) };
  A.delete();
  B.delete();
  R.delete();
  return malla;
}
