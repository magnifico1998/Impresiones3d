import { anycubicLan } from './anycubicLan.js';
import { bambuConnect } from './bambuConnect.js';
import { bambuLan } from './bambuLan.js';
import { bambuStudio } from './bambuStudio.js';
import { anycubicSlicer } from './anycubicSlicer.js';
import { guardarEnCarpeta } from './carpeta.js';
import { explorar } from './explorar.js';
import { moonraker } from './moonraker.js';

// Cada tipo de impresora sabe probar la conexión y mandar un archivo:
//   probar(impresora) → texto, o tira un Error con el motivo
//   enviar(impresora, { nombre, contenido, accion, opciones }) → { estado, mensaje }
export const DRIVERS = { [anycubicLan.tipo]: anycubicLan, [bambuStudio.tipo]: bambuStudio, [anycubicSlicer.tipo]: anycubicSlicer, [guardarEnCarpeta.tipo]: guardarEnCarpeta, [explorar.tipo]: explorar, [moonraker.tipo]: moonraker, [bambuConnect.tipo]: bambuConnect, [bambuLan.tipo]: bambuLan };

export const driverDe = (tipo) => {
  const d = DRIVERS[tipo];
  if (!d) throw new Error(`Tipo de impresora desconocido: ${tipo}`);
  return d;
};
