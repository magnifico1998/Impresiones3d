import { abrirArchivo, guardarTemporal, programaPredeterminado3mf } from './abrir.js';

// Abrir el archivo en Bambu Studio (o el programa que tenga esta PC para los
// .3mf, como Orca Slicer): se guarda el archivo laminado y se abre. Desde ahí
// se manda a la impresora como siempre (nube de Bambu, LAN, o la tarjeta).
// No toca la impresora ni exige Bambu Connect ni el modo LAN, así que sirve
// para cualquier Bambu (y para cualquier otra marca cuyo programa abra el
// archivo).

export const bambuStudio = {
  tipo: 'abrir-en-programa',
  nombre: 'Abrir en Bambu Studio / Orca (el programa de tus .3mf)',
  formatos: ['3mf', 'gcode'],
  puedeImprimir: false, // se imprime desde el programa
  abre: true,
  campos: [],

  async probar() {
    const prog = await programaPredeterminado3mf();
    if (!prog) return 'Listo: el archivo se va a abrir con el programa que tenga esta PC para los .3mf.';
    if (/bambu|orca/i.test(prog)) return `Listo: los .3mf se abren con ${prog.replace(/^Applications\\/, '')}.`;
    return `Ojo: los .3mf se abren con ${prog}. Para que se abran en Bambu Studio, elegilo como programa predeterminado de los .3mf en Windows.`;
  },

  async enviar(impresora, { nombre, contenido }) {
    await abrirArchivo(guardarTemporal(nombre, contenido));
    return { estado: 'enviado', mensaje: 'Abierto en tu programa de laminado: mandalo a la impresora desde ahí.' };
  }
};
