// Lanza el cálculo del relieve en un worker. Cada llamada cancela la anterior
// (si todavía no terminó se descarta), así que sirve para una vista previa que
// se recalcula mientras el usuario mueve los controles.
export function crearLlamador() {
  let worker = null;
  let pendiente = null;

  const cancelar = () => {
    if (worker) { worker.terminate(); worker = null; }
    if (pendiente) { pendiente.rechazar(Object.assign(new Error('cancelado'), { cancelado: true })); pendiente = null; }
  };

  const llamar = (mensaje, alProgreso) => new Promise((resolver, rechazar) => {
    cancelar();
    const w = new Worker(new URL('./superficieWorker.js', import.meta.url), { type: 'module' });
    worker = w;
    pendiente = { rechazar };
    w.onmessage = (e) => {
      if (e.data.progreso) { alProgreso?.(e.data.progreso); return; }
      if (worker === w) { worker = null; pendiente = null; }
      w.terminate();
      if (e.data.ok) resolver(e.data); else rechazar(new Error(e.data.error));
    };
    w.onerror = (e) => {
      if (worker === w) { worker = null; pendiente = null; }
      w.terminate();
      rechazar(new Error(e.message || 'Falló el cálculo.'));
    };
    w.postMessage(mensaje);
  });

  return { llamar, cancelar };
}
