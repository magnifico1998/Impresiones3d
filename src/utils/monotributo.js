// Totalizador de facturación para el monotributo.
//
// El monotributo no tiene topes mensuales: cada categoría tiene un tope de
// ingresos brutos ANUALES, medido sobre los últimos 12 meses. Se
// recategoriza dos veces por año: en enero (con los 12 meses que cierran el
// 31/12) y en julio (con los que cierran el 30/06). Pasar el tope de la
// categoría más alta excluye del régimen.
//
// Ingresos del mes = Facturas C emitidas en producción (también las que
// después se anularon) − Notas de Crédito C emitidas + los "otros ingresos"
// que el suscriptor carga a mano (lo facturado fuera de la app).
//
// La tabla de categorías (monotributo/categorias) la carga el admin y se
// actualiza cada semestre: { categorias: [{ letra, topeAnual }], vigencia }.

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// "2026-09" → "Sep 2026"
export const nombreMes = (clave) => `${MESES[Number(clave.slice(5, 7)) - 1]} ${clave.slice(0, 4)}`;

const claveMes = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`;

// Mes (YYYY-MM) sumando `delta` meses a una clave.
export function sumarMeses(clave, delta) {
  const total = Number(clave.slice(0, 4)) * 12 + Number(clave.slice(5, 7)) - 1 + delta;
  return claveMes(Math.floor(total / 12), (total % 12) + 1);
}

export const mesActual = (hoy = new Date()) => claveMes(hoy.getFullYear(), hoy.getMonth() + 1);

// Mes de un comprobante: la fecha de ARCA (YYYYMMDD) o, si no tiene, la de creación.
function mesDeComprobante(f) {
  const fecha = String(f.fecha || '');
  if (/^\d{8}$/.test(fecha)) return `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}`;
  const d = f.creadoEl?.toDate?.();
  return d ? claveMes(d.getFullYear(), d.getMonth() + 1) : null;
}

// { 'YYYY-MM': { facturas, notasCredito, facturado, notas, otros, total } }
export function ingresosPorMes(facturas, otrosIngresos = {}) {
  const meses = {};
  const mes = (k) => (meses[k] ||= { facturas: 0, notasCredito: 0, facturado: 0, notas: 0, otros: 0, total: 0 });
  for (const f of facturas || []) {
    if (f.entorno !== 'produccion') continue;
    const k = mesDeComprobante(f);
    if (!k) continue;
    const importe = Number(f.importeTotal) || 0;
    if (Number(f.tipoCbte) === 11 && ['emitida', 'anulada'].includes(f.estado)) {
      mes(k).facturas += 1;
      mes(k).facturado += importe;
    } else if (Number(f.tipoCbte) === 13 && f.estado === 'emitida') {
      mes(k).notasCredito += 1;
      mes(k).notas += importe;
    }
  }
  for (const [k, v] of Object.entries(otrosIngresos || {})) {
    if (/^\d{4}-\d{2}$/.test(k) && Number(v)) mes(k).otros += Number(v);
  }
  for (const m of Object.values(meses)) m.total = m.facturado - m.notas + m.otros;
  return meses;
}

// Suma de los 12 meses que terminan en `hasta` (incluido).
export function acumulado12(meses, hasta) {
  let total = 0;
  for (let i = 0; i < 12; i++) total += meses[sumarMeses(hasta, -i)]?.total || 0;
  return total;
}

// Próxima recategorización: el cierre que se evalúa (30/06 o 31/12) y el
// mes en que se hace (julio o enero).
export function proximaRecategorizacion(hoy = new Date()) {
  const anio = hoy.getFullYear();
  return hoy.getMonth() < 6
    ? { cierre: claveMes(anio, 6), mesRecategorizacion: claveMes(anio, 7) }
    : { cierre: claveMes(anio, 12), mesRecategorizacion: claveMes(anio + 1, 1) };
}

// Categorías ordenadas por tope (válidas).
export const categoriasOrdenadas = (tabla) => (tabla?.categorias || [])
  .filter((c) => c.letra && Number(c.topeAnual) > 0)
  .map((c) => ({ letra: String(c.letra).toUpperCase(), topeAnual: Number(c.topeAnual) }))
  .sort((a, b) => a.topeAnual - b.topeAnual);

// Categoría que corresponde a un monto anual, o null si supera la más alta.
export function categoriaPara(monto, categorias) {
  return categorias.find((c) => monto <= c.topeAnual) || null;
}

// Proyección al próximo cierre: lo que ya está dentro de los 12 meses que
// se van a evaluar más los meses que faltan al promedio de los últimos 3
// meses completos.
export function proyeccionAlCierre(meses, hoy = new Date()) {
  const actual = mesActual(hoy);
  const { cierre } = proximaRecategorizacion(hoy);
  const desde = sumarMeses(cierre, -11);
  let conocido = 0;
  for (let k = desde; k <= actual; k = sumarMeses(k, 1)) conocido += meses[k]?.total || 0;
  const promedio = [1, 2, 3].reduce((s, i) => s + (meses[sumarMeses(actual, -i)]?.total || 0), 0) / 3;
  let faltan = 0;
  for (let k = sumarMeses(actual, 1); k <= cierre; k = sumarMeses(k, 1)) faltan += 1;
  return { cierre, promedio, faltan, proyectado: conocido + promedio * faltan };
}
