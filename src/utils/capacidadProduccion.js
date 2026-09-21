// Simula la cola de producción para estimar la fecha en que cada pedido va
// a terminar de imprimirse, dada la capacidad instalada (cantidad de
// impresoras y horas laborables) configurada en cfg.capacidadProduccion.
//
// Granularidad: por PIEZA, no por pedido. Cada pieza de un pedido se asigna
// a la primera impresora que quede libre, así piezas de un mismo pedido
// pueden imprimirse en paralelo en distintas impresoras. La ETA de un
// pedido es el máximo entre las ETAs de sus piezas (el pedido no está listo
// hasta que termina la última).
//
// Orden de la cola (reglas de negocio ya definidas, no reordenar sin
// confirmar con el dueño del negocio):
//   1. Pedidos en 'progreso' siempre van antes que los 'pendiente' (ya
//      están en curso, no se pueden reordenar).
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
  // Simplificación deliberada: no hay telemetría real de qué está
  // imprimiendo cada máquina ahora mismo, así que todas las impresoras
  // arrancan libres desde el próximo instante laboral.
  const libres = Array.from({ length: n }, () => proximoInicioLaboral(new Date(), capacidadCfg));

  const cola = ordenarColaPedidos(
    pedidos.filter(p => p.estado === 'progreso' || p.estado === 'pendiente')
  );

  const resultado = {};
  cola.forEach(pedido => {
    resultado[pedido.id] = { etaEstimada: null, piezasDetalle: [] };
  });

  cola.forEach(pedido => {
    piezasPendientesDePedido(pedido).forEach(pieza => {
      let idxMin = 0;
      for (let i = 1; i < libres.length; i++) {
        if (libres[i] < libres[idxMin]) idxMin = i;
      }

      const inicio = libres[idxMin];
      const fin = avanzarTiempoLaboral(inicio, pieza.horasRestantes, capacidadCfg);
      libres[idxMin] = fin;

      const detalle = resultado[pedido.id];
      detalle.piezasDetalle.push({ piezaId: pieza.piezaId, inicio, fin });
      if (!detalle.etaEstimada || fin > detalle.etaEstimada) {
        detalle.etaEstimada = fin;
      }
    });
  });

  return resultado;
}
