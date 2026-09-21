// Simula la cola de producción para estimar la fecha en que cada pedido va
// a terminar de imprimirse, dada la capacidad instalada (cantidad de
// impresoras y horas laborables) configurada en cfg.capacidadProduccion.
//
// Modelo de dos etapas:
//   1. Los pedidos 'progreso' están genuinamente en curso AL MISMO TIEMPO
//      (el taller ya les está dedicando impresoras), así que se agrupan en
//      un único pool: todas sus piezas pendientes compiten juntas por las N
//      impresoras, y TODOS comparten la misma ETA -- el momento en que
//      termina la última pieza de ese pool combinado.
//   2. Los pedidos 'pendiente' todavía no arrancaron, así que se toma el
//      peor escenario (conservador): se procesan uno a la vez en orden de
//      prioridad, dedicándole TODAS las impresoras a cada uno hasta
//      terminarlo antes de pasar al siguiente -- no se asume que una
//      impresora libre adelanta trabajo del próximo pedido mientras el
//      actual todavía tiene piezas en otra impresora.
// En ambos casos, dentro de un mismo pedido (o del pool de 'progreso') las
// piezas se reparten en paralelo entre las N impresoras con LPT (longest
// processing time first: la pieza más larga primero, a la impresora que
// antes quede libre).
//
// Orden de la cola (reglas de negocio ya definidas, no reordenar sin
// confirmar con el dueño del negocio):
//   1. Pedidos en 'progreso' siempre van antes que los 'pendiente' (ya
//      están en curso, no se pueden reordenar).
//   2. Entre los 'progreso': sólo importa como desempate dentro del pool
//      combinado (ver arriba) -- los que tienen fechaEntrega ordenan primero
//      por fecha más próxima, los que no la tienen por antigüedad.
//   3. Entre los 'pendiente': por el orden manual de prioridad
//      (pedido.ordenProduccion) -- el primero de la cola es la prioridad 1,
//      el siguiente la 2, y así sucesivamente; los que no tienen ese campo
//      van al final ordenados por antigüedad.

// Mismo criterio de "antigüedad de un pedido" que PedidosPage.jsx (getTimestamp):
// creadoTs es un timestamp real fijado una sola vez al crear el pedido: es
// la única fuente confiable de orden de ingreso. Pedidos viejos que no lo
// tienen caen a fechaPedido/creado como respaldo.
function timestampPedido(p) {
  if (p.creadoTs) return p.creadoTs;
  if (p.fechaPedido) return new Date(p.fechaPedido + 'T12:00:00').getTime();
  if (p.creado) {
    const partes = p.creado.split('/');
    if (partes.length === 3) return new Date(partes[2], partes[1] - 1, partes[0]).getTime();
  }
  return 0;
}

// `horas` es el tiempo de impresión POR UNIDAD, no de toda la tanda -- ver
// CalculadoraPage.jsx: costeElec/costeMant se calculan a partir de `horas`
// solo, y el costo/precio TOTAL se obtiene multiplicando por `cantidad`
// ("El costo y precio se multiplican por la cantidad", helper del campo
// Cantidad de unidades). El tiempo restante de una pieza parcialmente
// producida es entonces horas × unidades que todavía faltan.
function horasRestantesPieza(pieza) {
  const cantidad = pieza.cantidad || 0;
  const elaborados = pieza.elaborados || 0;
  const horas = pieza.horas || 0;
  if (cantidad <= 0 || elaborados >= cantidad) return 0;
  return horas * (cantidad - elaborados);
}

function piezasPendientesDePedido(pedido) {
  return (pedido.piezas || [])
    .map(pz => ({ piezaId: pz.id, horasRestantes: horasRestantesPieza(pz) }))
    .filter(pz => pz.horasRestantes > 0);
}

export function ordenarColaPedidos(pedidos) {
  const enProgreso = pedidos.filter(p => p.estado === 'progreso');
  const pendientes = pedidos.filter(p => p.estado === 'pendiente');

  const progresoConFecha = enProgreso
    .filter(p => p.fechaEntrega)
    .sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
  const progresoSinFecha = enProgreso
    .filter(p => !p.fechaEntrega)
    .sort((a, b) => timestampPedido(a) - timestampPedido(b));

  const pendientesOrdenados = [...pendientes].sort((a, b) => {
    const oa = a.ordenProduccion ?? Infinity;
    const ob = b.ordenProduccion ?? Infinity;
    if (oa !== ob) return oa - ob;
    return timestampPedido(a) - timestampPedido(b);
  });

  return [...progresoConFecha, ...progresoSinFecha, ...pendientesOrdenados];
}

// Cuentas que ya tenían un documento de config guardado antes de esta
// feature no reciben los defaults de defaultCfg (cargarConfigDeFirestore usa
// el doc guardado tal cual, sin mergear) -- y como cfg.capacidadProduccion
// se edita campo a campo, puede quedar parcial (ej. sólo {habilitado: true}
// si nunca se tocaron los demás inputs). Se normaliza acá para que el motor
// nunca reciba horaInicio/horasPorDia/diasLaborables inválidos y termine
// generando fechas "Invalid Date".
function resolverCapacidadCfg(capacidadCfg) {
  const horaInicio = Number.isFinite(capacidadCfg?.horaInicio) ? capacidadCfg.horaInicio : 9;
  const horasPorDia = Number.isFinite(capacidadCfg?.horasPorDia) && capacidadCfg.horasPorDia > 0 ? capacidadCfg.horasPorDia : 8;
  const diasLaborables = Array.isArray(capacidadCfg?.diasLaborables) && capacidadCfg.diasLaborables.length
    ? capacidadCfg.diasLaborables
    : [1, 2, 3, 4, 5, 6];
  return { horaInicio, horasPorDia, diasLaborables };
}

// Devuelve el próximo instante dentro de una ventana laboral válida según
// capacidadCfg (si `fecha` ya cae dentro de una, la devuelve tal cual).
function proximoInicioLaboral(fecha, capacidadCfg) {
  const { horaInicio, horasPorDia, diasLaborables } = capacidadCfg;
  let d = new Date(fecha);

  for (let i = 0; i < 14; i++) { // 14 días alcanza de sobra para encontrar el próximo día laborable
    const finVentana = new Date(d);
    finVentana.setHours(horaInicio + horasPorDia, 0, 0, 0);
    const inicioVentana = new Date(d);
    inicioVentana.setHours(horaInicio, 0, 0, 0);

    if (diasLaborables.includes(d.getDay()) && d < finVentana) {
      return d > inicioVentana ? d : inicioVentana;
    }

    // Fuera de horario o día no laborable: saltar al inicio de la ventana
    // del día siguiente.
    d = new Date(d);
    d.setDate(d.getDate() + 1);
    d.setHours(horaInicio, 0, 0, 0);
  }
  return d;
}

// Avanza `horas` de tiempo LABORABLE desde `desde`, saltando fuera de
// horario y días no laborables según capacidadCfg. Devuelve la fecha/hora
// de fin.
function avanzarTiempoLaboral(desde, horas, capacidadCfg) {
  const { horaInicio, horasPorDia } = capacidadCfg;
  let cursor = proximoInicioLaboral(desde, capacidadCfg);
  let restante = horas;

  while (restante > 0) {
    const finVentana = new Date(cursor);
    finVentana.setHours(horaInicio + horasPorDia, 0, 0, 0);
    const disponibleHoy = (finVentana - cursor) / 3600000;

    if (restante <= disponibleHoy) {
      cursor = new Date(cursor.getTime() + restante * 3600000);
      restante = 0;
    } else {
      restante -= disponibleHoy;
      cursor = proximoInicioLaboral(finVentana, capacidadCfg);
    }
  }
  return cursor;
}

// Reparte `piezas` (de uno o varios pedidos, ya mezcladas si corresponde)
// entre `n` impresoras, todas arrancando en `cursor`, con LPT (la pieza más
// larga primero, a la impresora que antes quede libre). Devuelve el detalle
// de inicio/fin de cada pieza y el momento en que la última impresora queda
// libre (el fin del lote completo).
function repartirEntreImpresoras(piezas, n, cursor, capacidadCfg) {
  const libres = new Array(n).fill(cursor);
  const piezasDetalle = [];

  [...piezas]
    .sort((a, b) => b.horasRestantes - a.horasRestantes)
    .forEach(pieza => {
      let idxMin = 0;
      for (let i = 1; i < libres.length; i++) {
        if (libres[i] < libres[idxMin]) idxMin = i;
      }
      const inicio = libres[idxMin];
      const fin = avanzarTiempoLaboral(inicio, pieza.horasRestantes, capacidadCfg);
      libres[idxMin] = fin;
      piezasDetalle.push({ ...pieza, inicio, fin });
    });

  const fin = libres.reduce((max, t) => (t > max ? t : max), libres[0]);
  return { piezasDetalle, fin };
}

// Devuelve { [pedidoId]: { etaEstimada: Date|null, piezasDetalle: [...] } }
// para todos los pedidos en 'progreso'/'pendiente' con piezas por terminar.
export function simularCapacidadProduccion(pedidos, capacidadCfgRaw) {
  if (!capacidadCfgRaw?.habilitado) return {};

  const capacidadCfg = resolverCapacidadCfg(capacidadCfgRaw);
  const n = Math.max(1, capacidadCfgRaw.cantidadImpresoras || 1);

  const cola = ordenarColaPedidos(
    pedidos.filter(p => p.estado === 'progreso' || p.estado === 'pendiente')
  );
  const enProgreso = cola.filter(p => p.estado === 'progreso');
  const pendientesOrdenados = cola.filter(p => p.estado === 'pendiente');

  const resultado = {};
  cola.forEach(pedido => {
    resultado[pedido.id] = { etaEstimada: null, piezasDetalle: [] };
  });

  // Simplificación deliberada: no hay telemetría real de qué está
  // imprimiendo cada máquina ahora mismo, así que arrancamos asumiendo que
  // las N impresoras quedan libres en conjunto desde el próximo instante
  // laboral.
  let cursor = proximoInicioLaboral(new Date(), capacidadCfg);

  // Etapa 1: pool combinado de todos los pedidos 'progreso' -- comparten
  // impresoras entre sí porque están en curso al mismo tiempo, y por eso
  // comparten la misma ETA de salida.
  const piezasProgreso = [];
  enProgreso.forEach(pedido => {
    piezasPendientesDePedido(pedido).forEach(pieza => {
      piezasProgreso.push({ ...pieza, pedidoId: pedido.id });
    });
  });

  if (piezasProgreso.length > 0) {
    const { piezasDetalle, fin } = repartirEntreImpresoras(piezasProgreso, n, cursor, capacidadCfg);
    piezasDetalle.forEach(({ pedidoId, piezaId, inicio, fin: finPieza }) => {
      resultado[pedidoId].piezasDetalle.push({ piezaId, inicio, fin: finPieza });
    });
    cursor = fin;
    enProgreso.forEach(pedido => {
      resultado[pedido.id].etaEstimada = fin;
    });
  }
  // Pedidos 'progreso' sin ninguna pieza pendiente (ya terminados) quedan
  // con etaEstimada null -- no hay nada por terminar, no se les muestra ETA.

  // Etapa 2: pedidos 'pendiente', uno a la vez en orden de prioridad, cada
  // uno con las N impresoras dedicadas por completo (peor escenario).
  pendientesOrdenados.forEach(pedido => {
    const piezas = piezasPendientesDePedido(pedido);
    if (piezas.length === 0) return; // ya terminado, no consume capacidad ni corre el cursor

    const { piezasDetalle, fin } = repartirEntreImpresoras(piezas, n, cursor, capacidadCfg);
    resultado[pedido.id].piezasDetalle = piezasDetalle;
    cursor = fin;
    resultado[pedido.id].etaEstimada = fin;
  });

  return resultado;
}
