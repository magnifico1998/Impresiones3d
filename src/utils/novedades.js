// Novedades de la plataforma: lo que muestra el aviso "Novedades" al entrar
// (components/ModalNovedades.jsx). Una entrada por versión MAYOR (cambios
// funcionales o de negocio, ver "Versión" en CLAUDE.md), de la más nueva a
// la más vieja. Los cambios estéticos o correctivos no van acá.
//   items: { texto, soloAdmin? } — soloAdmin: sólo lo ve una cuenta admin.

export const NOVEDADES = [
  {
    version: 13,
    fecha: '2026-10-03',
    items: [
      { texto: 'Al entrar te mostramos las novedades desde tu último ingreso. Para volver a verlas, tocá la versión arriba a la izquierda.' }
    ]
  },
  {
    version: 12,
    fecha: '2026-10-03',
    items: [
      { texto: 'Facturación y monotributo (Mi emprendimiento → Facturación ARCA): lo facturado por mes, el acumulado de los últimos 12 meses contra el tope de tu categoría y la proyección a la próxima recategorización.' },
      { texto: 'Podés cargar los ingresos que facturaste fuera de Manager3D para que el acumulado sea completo.' },
      { texto: 'Contador de tickets pendientes en el menú y aviso emergente cuando entra uno nuevo.', soloAdmin: true },
      { texto: 'Categorías de monotributo con "Buscar en ARCA" y opción de sumar las facturas de suscripciones al totalizador.', soloAdmin: true }
    ]
  },
  {
    version: 11,
    fecha: '2026-10-02',
    items: [
      { texto: 'Datos bancarios (Mi emprendimiento): CBU/CVU, alias, titular y banco salen al pie de los PDF de presupuestos y pedidos para que te transfieran.' },
      { texto: 'Al descontar un pedido del inventario, buscá el rollo escribiendo el color o el tipo.' },
      { texto: 'Si un pedido no consumió nada, "Confirmar sin descontar" lo marca como resuelto.' },
      { texto: 'El inventario se ordena tocando el título de cualquier columna.' }
    ]
  },
  {
    version: 10,
    fecha: '2026-10-02',
    items: [
      { texto: 'Boletín de novedades a los suscriptores y editor visual de las plantillas de mail.', soloAdmin: true }
    ]
  },
  {
    version: 9,
    fecha: '2026-10-01',
    items: [
      { texto: 'Nueva sección Soporte: creá un ticket y usá "Grabar el problema" para que nos llegue todo lo necesario para resolverlo. También podés tocar "Reportar" en cualquier aviso de error.' },
      { texto: 'El descuento de filamento de un pedido se calcula por versión y, en los multicolor, reparte cada material entre los colores de la versión.' }
    ]
  },
  {
    version: 7,
    fecha: '2026-09-30',
    items: [
      { texto: 'Exportá a Excel los artículos bajo el stock mínimo, con lo que falta y el último proveedor, para armar el pedido.' }
    ]
  },
  {
    version: 6,
    fecha: '2026-09-30',
    items: [
      { texto: 'Importá tu inventario inicial desde una planilla CSV (Compras → Inventario).' }
    ]
  }
];

// Entradas con lo que ve esa cuenta (sin las de admin si no lo es), las de
// versión mayor a `desde` (o todas), sin las que quedan vacías.
export function novedadesPara({ esAdmin, desde = 0 }) {
  return NOVEDADES
    .filter((n) => n.version > desde)
    .map((n) => ({ ...n, items: n.items.filter((i) => esAdmin || !i.soloAdmin) }))
    .filter((n) => n.items.length);
}
