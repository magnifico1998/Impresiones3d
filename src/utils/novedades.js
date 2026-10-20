// Novedades de la plataforma: lo que muestra el aviso "Novedades" al entrar
// (components/ModalNovedades.jsx). Una entrada por versión MAYOR (cambios
// funcionales o de negocio, ver "Versión" en CLAUDE.md), de la más nueva a
// la más vieja. Sólo lo que cambia para los suscriptores: ni lo estético o
// correctivo, ni lo que sólo afecta al panel de administración.
//   items: { texto }

export const NOVEDADES = [
  {
    version: 17,
    fecha: '2026-10-19',
    items: [
      { texto: 'Productos sin impresión en la Biblioteca: cargá lo que vendés pero no imprimís (reventa, accesorios, insumos) con su costo de compra y un margen. El precio sale recomendado pero lo podés editar, y el costo lo actualizás a mano. Se usan en pedidos, presupuestos, stock y catálogo como cualquier producto; no entran en "Actualizar precios" ni descuentan filamento.' },
      { texto: 'Dirección propia para tu catálogo web: elegí un nombre único en Catálogo web → "Dirección de tu catálogo" y compartí manager3d.com.ar/tu-nombre, con vista previa al compartirlo por WhatsApp.' },
      { texto: 'Mejor vista en el celular: la app y el catálogo se adaptan al ancho de la pantalla, sin tener que desplazar de costado.' }
    ]
  },
  {
    version: 16,
    fecha: '2026-10-17',
    items: [
      { texto: 'Tienda con stock: nuevo formato del catálogo web (Catálogo web → Formato), con las categorías arriba como menú desplegable, fotos grandes y botón Comprar. La nueva sección Productos en stock (se activa en Configuración) guarda cuántas unidades terminadas tenés de cada producto y color: la tienda muestra primero lo que hay y deja pedir el resto a pedido. Al importar la compra como pedido, lo que salió de stock queda completado y descuenta el stock, y lo que falta fabricar queda pendiente.' },
      { texto: 'Aviso por mail al cliente cuando su pedido está listo: se activa en Configuración → Avisos a clientes, se manda una sola vez por pedido y sólo a los clientes con mail cargado. En la ficha de cada cliente podés marcar "No enviarle notificaciones por mail" (vale para todos los avisos, menos las facturas de ARCA).' },
      { texto: 'En la lista de Presupuestos, bajo el nombre del cliente se ven también los productos que incluye cada presupuesto.' }
    ]
  },
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
      { texto: 'Impresión directa más simple: en el conector elegís la marca de tu impresora (Bambu, Anycubic, Creality, Elegoo, Prusa…) y el archivo se abre en el programa de laminado de esa marca, donde lo revisás y lo mandás a imprimir con su flujo oficial. Un proyecto .3mf sin laminar siempre va al slicer.' },
      { texto: 'En las listas de archivos de tus productos, cada tipo se distingue con su ícono y su color: 📄 G-code, 📦 3MF laminado y 🧩 Proyecto 3MF.' },
      { texto: 'Paletas de colores: nueva paleta minimalista "Tranqui" y, en la paleta personalizada de la app y en la del catálogo, ahora también podés elegir el color de los textos de apoyo y de las etiquetas. El panel del conector toma los colores de tu paleta.' },
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
