// Novedades de la plataforma: lo que muestra el aviso "Novedades" al entrar
// (components/ModalNovedades.jsx). Una entrada por versión MAYOR (cambios
// funcionales o de negocio, ver "Versión" en CLAUDE.md), de la más nueva a
// la más vieja. Sólo lo que cambia para los suscriptores: ni lo estético o
// correctivo, ni lo que sólo afecta al panel de administración.
//   items: { texto }

export const NOVEDADES = [
  {
    version: 15,
    fecha: '2026-10-11',
    items: [
      { texto: 'Presupuestos con imágenes: adjuntá renders, fotos o planos, cada uno con su comentario. Salen en hojas de anexo al final del PDF, de 1, 2 o 4 imágenes por hoja a elección (una grande para lo que tiene detalle, cuatro para cosas simples).' },
      { texto: 'Los logos rectangulares ya no se deforman en los PDF: se ven enteros y podés elegir su tamaño en Mi emprendimiento → Logo. En el catálogo web el logo también respeta su proporción.' },
      { texto: 'Desde un pedido, el botón 🖨 Enviar muestra todos los archivos G-code del producto y marca los que ya mandaste, para no repetirlos por error (podés mandarlos de nuevo si querés).' },
      { texto: 'Pedidos del mismo cliente: si cargás o te llega del catálogo un pedido para alguien que ya tiene uno abierto, la app te avisa, y desde el detalle del pedido podés unirlos ("Unir pedidos"): se suman las piezas, el precio y lo abonado, y el otro pedido queda cancelado como unido.' },
      { texto: 'Notas internas en cada producto de la Biblioteca (tipo de filamento, detalles de la impresión…): son privadas, no se ven en el catálogo. Desde un pedido, el botón 📝 Notas de cada pieza las muestra.' },
      { texto: 'Si agregás productos a un pedido y lo cerrás sin guardar, esos productos se quitan y el pedido vuelve a como estaba.' },
      { texto: 'Los formularios ya no se cierran al hacer clic afuera por error: se cierran con sus botones o con Esc (si tocaste algo, te pregunta antes de cerrar sin guardar).' },
      { texto: 'Números y plata con separador de miles en toda la app, y los campos de plata se ven con formato ($ 15.000) cuando no los estás editando.' },
      { texto: 'Podés instalar Manager3D como app, con acceso directo en tu PC (botón "Instalar app" arriba, en Chrome o Edge).' },
      { texto: 'Cuando hay una versión nueva, la app te avisa para que recargues; y si programamos una actualización, te avisa con anticipación para que guardes y cierres antes.' }
    ]
  },
  {
    version: 13,
    fecha: '2026-10-06',
    items: [
      { texto: 'Catálogo web, nueva tarjeta "Marca del catálogo": elegí el tamaño de tu logo (para que se vea bien aunque tenga colores claros) y escribí un texto destacado debajo del nombre, como un eslogan o un gancho comercial: hasta 3 líneas y con el tamaño que quieras.' },
      { texto: 'Cuando un cliente te manda un pedido desde el catálogo, ahora tiene un botón "Volver al catálogo" para seguir mirando.' },
      { texto: 'BETA, todavía en desarrollo: impresión directa. Guardá el G-code de tus productos en la Biblioteca (botón 📄) y mandalo a tu impresora desde ahí. Para eso instalás el Manager3D Conector en una PC de tu taller (lo bajás en Configuración → Impresión directa). Funciona con Anycubic Kobra y con Bambu Lab (abriendo el archivo en Bambu Studio); las impresoras con Klipper, como las Creality, están en prueba. Con cualquier otra podés guardar el archivo en una carpeta, por ejemplo la tarjeta SD. El espacio para G-code depende de tu plan; durante la prueba tenés 200 MB.' },
      { texto: 'BETA: en el detalle de un pedido, las piezas cuyo producto tiene G-code muestran el botón 🖨 Enviar para mandarlo a imprimir, con los colores pedidos como recordatorio.' }
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
