// Filtro por plan del boletín de novedades. Sin dependencias, así lo usa
// http/boletin.js y lo prueba pruebas/boletin-filtro.test.js.
//
// Una cuenta "sin plan" es la que todavía no tiene `planId` en la suscripción
// (la prueba, o quien se registró y nunca eligió). Se identifica con SIN_PLAN
// porque no corresponde a ningún documento de `planes`.

const SIN_PLAN = 'sin-plan';

const planDe = (planId) => planId || SIN_PLAN;

// `planes` ausente (undefined) = sin filtro por plan: se mantiene el
// comportamiento anterior del boletín, que sólo filtraba por estado.
function coincidePlan(planId, planes) {
  if (planes === undefined || planes === null) return true;
  return planes.includes(planDe(planId));
}

// Cuántas cuentas hay por combinación estado + plan, con la clave
// "estado|plan". El panel suma las que coinciden con lo tildado.
function contarPorEstadoYPlan(lista) {
  const cuenta = {};
  for (const s of lista) {
    const clave = `${s.estado}|${planDe(s.planId)}`;
    cuenta[clave] = (cuenta[clave] || 0) + 1;
  }
  return cuenta;
}

module.exports = { SIN_PLAN, planDe, coincidePlan, contarPorEstadoYPlan };
