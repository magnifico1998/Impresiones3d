// Estados de un presupuesto (users/{uid}/presupuestos): texto visible y
// clase de badge. Los usan PresupuestosPage y ModalPresupuesto.
export const ESTADOS_PRESUPUESTO = {
  creado: { texto: 'Presupuesto creado', badge: 'badge-progress' },
  enviado: { texto: 'Aguardando respuesta', badge: 'badge-pending' },
  aprobado: { texto: 'Aprobado', badge: 'badge-done' },
  rechazado: { texto: 'Rechazado', badge: 'badge-cancelled' }
};

// Estados en los que un presupuesto todavía se puede editar y recibir
// productos nuevos (desde la Calculadora o la Biblioteca).
export const ESTADOS_ABIERTOS = ['creado', 'enviado'];
