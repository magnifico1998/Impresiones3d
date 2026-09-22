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
// Prioridad de los 'pendiente' (mismo criterio que PedidosPage.jsx, no hay
// reordenamiento manual): el que tiene la fecha de entrega más próxima va
// primero; entre los que no tienen fecha de entrega, el más antiguo tiene
// mayor prioridad.

// Mismo criterio de "antigüedad de un pedido" que PedidosPage.jsx
// (getTimestamp): creadoTs es un timestamp real fijado una sola vez al
// crear el pedido, la única fuente confiable de orden de ingreso. Pedidos
// viejos que no lo tienen caen a fechaPedido/creado como respaldo.
function timestampPedido(p) {
  if (p.creadoTs) return p.creadoTs;
  if (p.fechaPedido) return new Date(p.fechaPedido + 'T12:00:00').getTime();
  if (p.creado) {
    const partes = p.creado.split('/');
    if (partes.length === 3) return new Date(partes[2], partes[1] - 1, partes[0]).getTime();
  }
  return 0;
}

// Mismo comparador que PedidosPage.jsx (comparaPorPrioridad): se recalcula
// solo a partir de fechaEntrega, sin ningún campo de orden manual.
function comparaPorPrioridad(a, b) {
  if (a.fechaEntrega && b.fechaEntrega) return a.fechaEntrega.localeCompare(b.fechaEntrega);
  if (a.fechaEntrega) return -1;
  if (b.fechaEntrega) return 1;
  return timestampPedido(a) - timestampPedido(b);
}

// `horas` es el tiempo de impresión POR UNIDAD, no de toda la tanda -- ver
// CalculadoraPage.jsx: costeElec/costeMant se calculan a partir de `horas`
// solo, y el costo/precio TOTAL se obtiene multiplicando por `cantidad`
// ("El costo y precio se multiplican por la cantidad", helper del campo
// Cantidad de unidades).
//
// Cada UNIDAD pendiente de una pieza es su propia tarea de `horas` --  no
// se trata la pieza completa como un bloque indivisible, porque distintas
// unidades del mismo producto pueden imprimirse en paralelo en impresoras
// distintas (ej. 30 unidades de 2hs con 3 impresoras -> 20hs de pared, no
// 60hs en una sola impresora).
function tareasPendientesDePedido(pedido) {
  const tareas = [];
  (pedido.piezas || []).forEach(pz => {
    const cantidad = pz.cantidad || 0;
    const elaborados = pz.elaborados || 0;
    const horas = pz.horas || 0;
    const restantes = cantidad - elaborados;
    if (horas <= 0 || restantes <= 0) return;
    for (let i = 0; i < restantes; i++) {
      tareas.push({ piezaId: pz.id, horasRestantes: horas });
    }
  });
  return tareas;
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

// Reparte `piezas` entre `n` impresoras, todas arrancando en `cursor`, con
// LPT (la pieza más larga primero, a la impresora que antes quede libre).
// Devuelve el detalle de inicio/fin de cada pieza y el momento en que la
// última impresora queda libre (el fin del lote completo).
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

// Devuelve { [pedidoId]: { etaEstimada: Date|null, horasTotales: number, piezasDetalle: [...] } }
// para todos los pedidos en 'progreso'/'pendiente' con piezas por terminar.
// `horasTotales` es la suma cruda de horas pendientes del pedido (sin
// repartir entre impresoras) -- se expone aparte de la ETA para poder
// verificar a ojo que el reparto entre impresoras da un resultado
// razonable (ej. un pedido de 25hs con 1 sola impresora tiene que dar una
// ETA de +25hs laborales, no otra cosa).
export function simularCapacidadProduccion(pedidos, capacidadCfgRaw) {
  if (!capacidadCfgRaw?.habilitado) return {};

  const capacidadCfg = resolverCapacidadCfg(capacidadCfgRaw);
  const n = Math.max(1, capacidadCfgRaw.cantidadImpresoras || 1);

  const enProgreso = pedidos.filter(p => p.estado === 'progreso');
  const pendientesOrdenados = [...pedidos.filter(p => p.estado === 'pendiente')].sort(comparaPorPrioridad);

  const resultado = {};
  [...enProgreso, ...pendientesOrdenados].forEach(pedido => {
    const horasTotales = tareasPendientesDePedido(pedido).reduce((s, t) => s + t.horasRestantes, 0);
    resultado[pedido.id] = { etaEstimada: null, horasTotales, piezasDetalle: [] };
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
    tareasPendientesDePedido(pedido).forEach(pieza => {
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
    const piezas = tareasPendientesDePedido(pedido);
    if (piezas.length === 0) return; // ya terminado, no consume capacidad ni corre el cursor

    const { piezasDetalle, fin } = repartirEntreImpresoras(piezas, n, cursor, capacidadCfg);
    resultado[pedido.id].piezasDetalle = piezasDetalle;
    cursor = fin;
    resultado[pedido.id].etaEstimada = fin;
  });

  return resultado;
}
