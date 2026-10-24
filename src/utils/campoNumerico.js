// Lógica compartida de los campos numéricos (components/CampoNumero.jsx y CampoMoneda.jsx).
//
// Problema que resuelve: muchos formularios guardan 0 o 1 cuando el campo queda vacío (`parseFloat(v) || 0`) y vuelven a
// mostrar ese valor al instante, así que nunca se podía borrar el último dígito para escribir otra cantidad. Los campos
// ahora muestran lo que se está escribiendo mientras se edita (el "borrador") y recién al salir completan lo que falta.

// Valor con el que se completa un campo que quedó vacío al salir: el mínimo si es mayor a 0 (una cantidad no puede ser 0
// si el mínimo es 1) y, si no, 0. Nunca queda un número vacío o null.
export function valorAlDejarVacio(min) {
  const m = Number(min);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

// Pone ese valor en el <input> y avisa con un evento `input` real, así el `onChange` de quien usa el campo se entera
// igual que si se hubiera escrito a mano (React no escucha cambios hechos con `input.value = ...`).
export function completarVacio(input, min) {
  const asignar = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  asignar.call(input, String(valorAlDejarVacio(min)));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
