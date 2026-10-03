// Desplegable de condición impositiva del suscriptor (perfil, suscripción y
// ficha del suscriptor en el panel). Antes era texto libre: una condición
// cargada así se respeta como opción, marcada para que se corrija.

export const CONDICIONES_IMPOSITIVAS = ['Consumidor final', 'Monotributo', 'Responsable inscripto', 'Exento'];

export const condicionImpositivaValida = (c) => CONDICIONES_IMPOSITIVAS.includes(c);

export default function SelectorCondicionImpositiva({ value, onChange, id = 'condicionImpositiva' }) {
  return (
    <select id={id} value={value || ''} onChange={onChange}>
      <option value="">Elegí una opción</option>
      {value && !condicionImpositivaValida(value) && (
        <option value={value}>{value} (revisar)</option>
      )}
      {CONDICIONES_IMPOSITIVAS.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}
