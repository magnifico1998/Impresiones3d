# manifold (motor de operaciones booleanas)

Archivos de terceros, **sin modificar**, tomados del paquete `manifold-3d` de npm:

- `manifold.js`: el módulo de JavaScript que carga el WebAssembly.
- `manifold.wasm`: la biblioteca Manifold compilada a WebAssembly.
- `LICENSE`: licencia Apache 2.0 del proyecto.

- **Versión:** 3.5.4.
- **Origen:** https://github.com/elalish/manifold (paquete `manifold-3d`).
- **Para qué:** sumar y restar mallas 3D (placas y ranuras del jarro, y lo que siga) obteniendo siempre sólidos
  cerrados, algo que `three-bvh-csg` no garantiza cuando las caras se tocan en ángulo.
- **Por qué está acá y no como dependencia:** el paquete de npm trae dependencias de glTF (con `sharp` y binarios por
  plataforma) que no se usan y suman más de mil líneas al `package-lock.json`. Sólo se necesitan estos dos archivos.
- **Cómo actualizarlo:** `npm pack manifold-3d@<versión>`, copiar de nuevo `manifold.js`, `manifold.wasm` y `LICENSE`,
  y correr `npx vitest run pruebas/jarros` para comprobar que las piezas siguen cerrándose.

Se usa a través de `src/utils/motorBooleano.js`, que lo carga sólo cuando hace falta.
