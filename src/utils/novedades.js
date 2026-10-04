// Novedades de la plataforma: lo que muestra el aviso "Novedades" al entrar
// (components/ModalNovedades.jsx). Una entrada por versión MAYOR (cambios
// funcionales o de negocio, ver "Versión" en CLAUDE.md), de la más nueva a
// la más vieja. Sólo lo que cambia para los suscriptores: ni lo estético o
// correctivo, ni lo que sólo afecta al panel de administración.
//   items: { texto }

export const NOVEDADES = [
  {
    version: 13,
    fecha: '2026-10-04',
    items: [
      { texto: 'Guardá el G-code de cada producto en la Biblioteca (botón 📄), o al guardarlo desde la Calculadora. Se guarda comprimido al máximo y lo bajás tal cual lo subiste, también el .gcode.3mf de Bambu Studio. El espacio depende de tu plan y lo ves en Mi emprendimiento → Tu plan y consumo.' }
    ]
  },
  {
    version: 12,
    fecha: '2026-10-03',
    items: [
      { texto: 'Facturación y monotributo (Mi emprendimiento → Facturación ARCA): lo facturado por mes, el acumulado de los últimos 12 meses contra el tope de tu categoría y la proyección a la próxima recategorización.' },
      { texto: 'Podés cargar los ingresos que facturaste fuera de Manager3D para que el acumulado sea completo.' },
      { texto: 'Recorrido guiado por la app: te muestra dónde configurar tus costos, cómo calcular una pieza desde el G-code y cómo cargar pedidos. Lo abrís cuando quieras con el botón 🧭 Recorrido, arriba a la derecha.' },
      { texto: 'Al entrar te mostramos las novedades desde tu último ingreso. Para volver a verlas, tocá la versión arriba a la izquierda.' }
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

// Entradas de versión mayor a `desde` (o todas).
export const novedadesDesde = (desde = 0) => NOVEDADES.filter((n) => n.version > desde);
