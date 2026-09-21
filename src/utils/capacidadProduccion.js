// Simula la cola de producción para estimar la fecha en que cada pedido va
// a terminar de imprimirse, dada la capacidad instalada (cantidad de
// impresoras y horas laborables) configurada en cfg.capacidadProduccion.
//
// Modelo (peor escenario, a propósito conservador): las N impresoras se
// dedican TODAS al pedido de mayor prioridad hasta terminarlo -- recién ahí
// pasan en bloque al siguiente. No se asume que una impresora que queda
// libre "adelanta" trabajo de un pedido de menor prioridad mientras el de
// mayor prioridad todavía tiene piezas pendientes en otra impresora (eso
// daría una estimación más optimista, pero también más frágil si en la
// práctica el taller prioriza terminar un pedido antes de arrancar el
// siguiente). Dentro de un mismo pedido, sus piezas sí se reparten en
// paralelo entre las N impresoras (algoritmo LPT: la pieza más larga
// primero, a la impresora que antes quede libre) -- la ETA del pedido es el
// momento en que la última impresora ocupada por sus piezas termina.
//
// Orden de la cola (reglas de negocio ya definidas, no reordenar sin
// confirmar con el dueño del negocio):
//   1. Pedidos en 'progreso' siempre van antes que los 'pendiente' (ya
//      están en curso, no se pueden reordenar) -- el primero de la cola es
//      la prioridad 1, el siguiente la 2, y así sucesivamente.
//   2. Entre los 'progreso': los que tienen fechaEntrega van primero,
//      ordenados por fecha más próxima; los que no la tienen van después,
//      ordenados por antigüedad del pedido.
//   3. Entre los 'pendiente': por el orden manual de prioridad
//      (pedido.ordenProduccion), y los que no tienen ese campo van al final
//      ordenados por antigüedad.

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

// horas es el tiempo de TODA la tanda de `cantidad` unidades, no por
// unidad -- ver src/components/modals/ModalBibGuardar.jsx. El tiempo
// restante de una pieza parcialmente producida se aproxima linealmente.
function horasRestantesPieza(pieza) {
  const cantidad = pieza.cantidad || 0;
  const elaborados = pieza.elaborados || 0;
  const horas = pieza.horas || 0;
  if (cantidad <= 0 || elaborados >= cantidad) return 0;
  return horas * (cantidad - elaborados) / cantidad;
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

// Devuelve { [pedidoId]: { etaEstimada: Date|null, piezasDetalle: [...] } }
// para todos los pedidos en 'progreso'/'pendiente' con piezas por terminar.
export function simularCapacidadProduccion(pedidos, capacidadCfgRaw) {
  if (!capacidadCfgRaw?.habilitado) return {};

  const capacidadCfg = resolverCapacidadCfg(capacidadCfgRaw);
  const n = Math.max(1, capacidadCfgRaw.cantidadImpresoras || 1);

  const cola = ordenarColaPedidos(
    pedidos.filter(p => p.estado === 'progreso' || p.estado === 'pendiente')
  );

  const resultado = {};
  cola.forEach(pedido => {
    resultado[pedido.id] = { etaEstimada: null, piezasDetalle: [] };
  });

  // Simplificación deliberada: no hay telemetría real de qué está
  // imprimiendo cada máquina ahora mismo, así que arrancamos asumiendo que
  // las N impresoras quedan libres en conjunto desde el próximo instante
  // laboral -- ese es el momento en que se le puede dedicar toda la
  // capacidad al pedido de prioridad 1.
  let cursor = proximoInicioLaboral(new Date(), capacidadCfg);

  cola.forEach(pedido => {
    const piezas = piezasPendientesDePedido(pedido);
    if (piezas.length === 0) return; // ya terminado, no consume capacidad ni corre el cursor

    // LPT (longest processing time first): repartir la pieza más larga
    // primero da un reparto entre impresoras más parejo que en el orden en
    // que están cargadas.
    const libres = new Array(n).fill(cursor);
    const detalle = resultado[pedido.id];

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
        detalle.piezasDetalle.push({ piezaId: pieza.piezaId, inicio, fin });
      });

    // El pedido no está listo hasta que la última impresora ocupada con sus
    // piezas termina -- y ese es también el momento en que las N impresoras
    // vuelven a estar todas libres para el siguiente pedido de la cola.
    cursor = libres.reduce((max, t) => (t > max ? t : max), libres[0]);
    detalle.etaEstimada = cursor;
  });

  return resultado;
}
