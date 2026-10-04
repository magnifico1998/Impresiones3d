import { anycubicLan } from './anycubicLan.js';
import { bambuConnect } from './bambuConnect.js';
import { bambuLan } from './bambuLan.js';
import { bambuStudio } from './bambuStudio.js';

// Cada tipo de impresora sabe probar la conexión y mandar un archivo:
//   probar(impresora) → texto, o tira un Error con el motivo
//   enviar(impresora, { nombre, contenido, accion, opciones }) → { estado, mensaje }
export const DRIVERS = { [anycubicLan.tipo]: anycubicLan, [bambuStudio.tipo]: bambuStudio, [bambuConnect.tipo]: bambuConnect, [bambuLan.tipo]: bambuLan };

export const driverDe = (tipo) => {
  const d = DRIVERS[tipo];
  if (!d) throw new Error(`Tipo de impresora desconocido: ${tipo}`);
  return d;
};
