import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// Le pide al servidor que consulte a Mercado Pago el estado real de la
// suscripción y aplique el pago si ya se acreditó (ver
// sincronizarSuscripcionMP en functions/http/pagosMercadoPago.js).
// Devuelve el mensaje y el tipo de toast a mostrar.
export async function sincronizarPagoMP() {
  const { data } = await httpsCallable(functions, 'sincronizarSuscripcionMP')();
  if (!data.encontrado) {
    return { mensaje: 'No encontramos ningún pago iniciado desde tu cuenta.', tipo: 'error' };
  }
  if (data.pagosAplicados > 0 && data.estado === 'activa') {
    return { mensaje: '¡Pago acreditado! Tu plan ya está activo.', tipo: 'success' };
  }
  if (data.debito === 'authorized') {
    return { mensaje: 'Débito automático autorizado. El plan se activa apenas Mercado Pago acredite el primer cobro.', tipo: 'success' };
  }
  return { mensaje: 'Mercado Pago todavía no confirmó el pago. Si ya pagaste, probá de nuevo en unos minutos.', tipo: 'error' };
}
