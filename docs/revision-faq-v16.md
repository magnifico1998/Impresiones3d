# Revisión de las preguntas frecuentes (versión 16 a 16.4)

Comparé la app en producción (v16, con la tienda con stock, el aviso de pedido listo y los cambios del detalle del pedido) con las preguntas frecuentes y con la revisión anterior (`docs/revision-faq.md`, v15.5). Igual que en esa revisión, cada texto está listo para pegar en el editor de preguntas: las líneas que empiezan con "- " se ven como lista y lo que va entre `**` sale en negrita.

No puedo leer las preguntas cargadas en la app, así que tomo como base los textos de la revisión v15.5. Si todavía no los pegaste, usá directamente las versiones de acá, que ya los reemplazan.

- **Parte A**: preguntas que quedaron desactualizadas con la v16.
- **Parte B**: preguntas a las que conviene sumarles algo.
- **Parte C**: preguntas nuevas (tienda con stock y aviso de pedido listo).
- **Parte D**: video nuevo y a qué preguntas va.

---

# Parte A · Preguntas que hay que corregir

## A1 · 6.3 ¿Cómo me llegan los pedidos que hacen los clientes desde el catálogo?

**Qué cambió:** con el formato Tienda, una compra que sale de stock ya no entra "En verificación": entra lista para entregar o pendiente. Además, la solicitud marca qué sale de stock y qué es a pedido. Reemplaza al texto A4 de la revisión v15.5.

**Texto nuevo:**

Cuando un cliente te manda un pedido desde tu Catálogo web, no se crea directo como pedido de producción. Entra en **Catálogo web → Solicitudes pendientes**, donde lo revisás primero.

Te llega un mail a vos y a las personas de tu equipo.

Con cada solicitud podés:

- ✅ **+ Crear pedido nuevo:** crea el pedido con lo que pidió el cliente.
- 🔄 **Agregar a pedido existente…:** suma lo que pidió a un pedido que ya tenés abierto.
- ❌ **Descartar:** la solicitud se borra sin crear nada.

¿En qué estado entra el pedido?

- Desde el formato **Catálogo**: en **En verificación**, para confirmar los detalles con el cliente antes de fabricar.
- Desde el formato **Tienda**, si todo salió de stock: en **Listo p/ entregar**.
- Desde el formato **Tienda**, si una parte es a pedido: en **Pendiente**, con lo que salió de stock ya marcado como hecho.

En la solicitud, cada producto te muestra si sale **de stock**, **a pedido** o una parte de cada uno (ver 6.11).

Si el cliente ya tiene un pedido abierto, la app te avisa antes de crear uno nuevo. Podés crearlo igual y unirlos después desde el detalle del pedido (**Unir pedidos**).

Flujo recomendado
- El cliente arma su pedido en el catálogo.
- Revisás la solicitud en Solicitudes pendientes.
- Creás el pedido (o lo sumás a uno existente).
- Confirmás los detalles con el cliente (podés usar **Generar Resumen**).
- Fabricás lo que falta y entregás.

[video: dejar el que ya tiene]

## A2 · 7.1 ¿Qué configuro en Configuración?

**Qué cambió:** la pestaña Aplicación suma dos tarjetas: **Avisos a clientes** y **Productos en stock**. Reemplaza a la lista del punto B10 de la revisión v15.5.

**Texto nuevo (lista de la pestaña Aplicación):**

📈 Capacidad de producción.
🎨 Paletas de colores y paleta personalizada.
📧 Avisos a clientes: el mail automático cuando el pedido está listo (ver 1.6.1).
🏷️ Productos en stock: llevar stock de productos terminados, para la tienda del catálogo (ver 6.9).
📦 Inventario y stock mínimo.
🖨️ Impresión directa (el conector para mandar archivos a tus impresoras).
💰 Cálculo de gastos.
🚚 Métodos de envío y sus links de seguimiento.

En **Herramientas** no cambió nada respecto de la revisión anterior.

## A3 · 6.6 Notificaciones

**Qué cambió:** ahora también hay un aviso al cliente cuando su pedido está listo. Reemplaza al texto B9 de la revisión v15.5.

**Texto nuevo:**

Cada vez que un cliente confirma un pedido desde tu Catálogo web, Manager3D te manda un mail a vos y a las personas de tu equipo.

Del lado del cliente, al terminar el pedido ve un botón para **Avisar por WhatsApp** y otro para **Volver al catálogo** y seguir mirando.

¿Le avisa al cliente cuando su pedido está listo?

Sí, si lo activás en **Configuración → Aplicación → Avisos a clientes** (ver 1.6.1).

## A4 · Preguntas que hablen del detalle del pedido

**Qué cambió:** en el detalle del pedido, cada pieza ya no muestra el nombre del archivo G-code, la impresora ni el costo. El descuento quedó en una sola línea (nombre, monto y porcentaje) y ya no se muestra el renglón "Total descuento".

**Qué hacer:** si alguna pregunta dice que en el detalle del pedido se ve el costo de cada pieza, su archivo o su impresora, sacá esa parte. El costo y la ganancia del pedido se siguen viendo más abajo en el mismo detalle (Costo piezas, Costo total y Ganancia), y los archivos de la pieza, con el botón **🖨 Enviar** (ver 11.7).

## A5 · Preguntas sobre WhatsApp desde el pedido

**Qué cambió:** el botón de WhatsApp del pedido abre el chat con el mensaje "Hola Andrea! Te escribo por tu pedido de Lámpara luna | Maceta." Nombra los productos en vez del número de pedido, que el cliente no conoce.

**Qué hacer:** si alguna pregunta muestra el mensaje viejo ("Te escribo por tu pedido #0012"), cambialo por el nuevo.

---

# Parte B · Preguntas a las que hay que sumarles algo

## B1 · 2. Clientes · ¿Qué datos guardo de cada cliente? (o la pregunta de la ficha del cliente)

Agregar:

📧 **No enviarle notificaciones por mail:** si la tildás, Manager3D no le manda avisos automáticos a ese cliente (por ejemplo, el de pedido listo). Las facturas de ARCA se le siguen mandando si tiene mail.

## B2 · 3.3.1 ¿Para qué sirve Presupuestos y en qué se diferencia de un Pedido?

Agregar al final:

💡 En la lista de Presupuestos, debajo del nombre del cliente ves los productos que incluye cada uno, para encontrarlo rápido.

## B3 · 5. Compras · ¿Qué es el Inventario? (o la primera pregunta de Inventario)

Agregar al final:

¿Y los productos que ya tengo impresos?

El Inventario lleva **insumos**: filamento, accesorios, equipos. Las unidades de productos terminados que tenés listas para vender se cargan en otra sección, **Productos en stock** (ver 6.9).

## B4 · 6.7 ¿Cómo pongo mi marca en el catálogo?

Agregar al final:

💡 Además de la marca, podés elegir el **formato** del catálogo: Catálogo (el de siempre) o Tienda (ver 6.8).

## B5 · 8.2.2 ¿Qué pasa si supero el límite de pedidos o de facturación de mi plan?

Sin cambios de texto. Para tener en cuenta: los pedidos que entran desde la tienda cuentan igual que cualquier otro, aunque salgan de stock.

---

# Parte C · Preguntas nuevas

## Categoría "6. Catálogo web"

### 6.8 ¿Qué es el formato Tienda del catálogo?

Es una forma de mostrar tu catálogo pensada para vender lo que ya tenés impreso.

En **Catálogo web → Formato del catálogo** elegís:

- 📋 **Catálogo:** el de siempre. Una lista por categorías para armar pedidos a medida.
- 🛍️ **Tienda:** las categorías van arriba como menú desplegable, los productos se ven con foto grande y botón **Comprar**, y se muestra primero lo que tenés en stock.

El link del catálogo es el mismo: cambia sólo cómo lo ve el cliente.

💡 Al elegir Tienda se activa sola la sección **Productos en stock**, para que cargues lo que tenés.

### 6.9 ¿Cómo cargo los productos que tengo en stock?

En la sección **Productos en stock**, en el menú de la izquierda.

- Si no la ves, activala en **Configuración → Aplicación → Productos en stock** (o elegí el formato Tienda en Catálogo web).
- Buscá el producto y tocá **Editar stock**.
- Elegí el color y escribí cuántas unidades tenés. Con **+ Otro color** sumás otra variante.
- Tocá **Guardar**.

La lista te muestra el stock de cada producto por color y el total. Con **Sólo con stock** ves únicamente los que tienen unidades.

Los productos salen de tu Biblioteca, así que el stock es por producto y por color (o combinación de colores).

⚠️ Es stock de **productos terminados**, distinto del Inventario de Compras, que lleva el filamento y los insumos.

### 6.10 ¿Qué ve el cliente en la tienda?

La tienda tiene dos vistas:

- ✅ **En stock:** lo que está listo para entregar. Es la que se abre primero.
- 🛠️ **Todo el catálogo:** suma los productos que no tenés en stock, que el cliente puede pedir **a pedido**.

Cada producto tiene su etiqueta, **En stock** o **A pedido**. En la ficha del producto, cada color dice cuántas unidades hay.

Si pide más de lo que hay, la app le muestra cuántas salen de stock y cuántas se fabrican a pedido. En la vista En stock sólo puede elegir los colores que hay y hasta la cantidad disponible.

💡 Si todavía no cargaste stock, la tienda abre directamente en Todo el catálogo.

### 6.11 ¿Qué pasa cuando importo una compra de la tienda?

La compra te llega como siempre a **Catálogo web → Solicitudes pendientes**, con cada producto marcado como **de stock**, **a pedido** o una parte de cada uno.

Al crear el pedido (o sumarlo a uno existente):

- ✅ Lo que sale de stock queda **marcado como hecho** en el pedido.
- 🛠️ Lo que falta fabricar queda **pendiente**.
- 📉 El stock se **descuenta solo** de Productos en stock.

Si todo salió de stock, el pedido entra en **Listo p/ entregar**. Si falta fabricar algo, entra en **Pendiente**.

¿Y si dos clientes compran lo mismo a la vez?

El stock no se reserva cuando el cliente arma el carrito: se descuenta cuando importás la solicitud. Al importar, la app vuelve a mirar cuánto stock hay en ese momento: si ya no alcanza, lo que falta queda a pedido.

## Categoría "1. Pedidos" (subcategoría de estados o de avisos)

### 1.6.1 ¿Puedo avisarle al cliente por mail que su pedido está listo?

Sí. Activalo en **Configuración → Aplicación → Avisos a clientes**, tildando **Avisar por mail cuando el pedido está listo**. Viene apagado.

Desde ese momento, cuando un pedido pasa a **Listo p/ entregar**, el cliente recibe un mail con el nombre de tu emprendimiento.

- 📬 Se manda **una sola vez por pedido**, aunque lo vuelvas a pasar a listo.
- 👤 Sólo a los clientes de tu libreta que tienen **mail cargado**.
- ↩️ Si el cliente responde, la respuesta te llega al **email de tu empresa** (Mi emprendimiento).

¿Y si un cliente no quiere recibir mails?

En su ficha (Clientes → Editar), tildá **No enviarle notificaciones por mail**.

💡 Un pedido que ya entra en Listo, por ejemplo una compra de la tienda que salió toda de stock, no manda el aviso: el mail sale cuando el pedido **pasa** a listo desde otro estado.

(La numeración 1.6.1 es una sugerencia: ubicala donde tengas las preguntas de estados del pedido.)

---

# Parte D · Video nuevo

**FAQ-TS-Tienda-con-stock.mp4**, con la voz de Alex. Va en estas preguntas:

- **6.8** ¿Qué es el formato Tienda del catálogo? → [video: FAQ-TS-Tienda-con-stock.mp4, desde el principio]
- **6.9** ¿Cómo cargo los productos que tengo en stock? → [video: FAQ-TS-Tienda-con-stock.mp4, capítulo 2]
- **6.10** ¿Qué ve el cliente en la tienda? → [video: FAQ-TS-Tienda-con-stock.mp4, capítulo 3]
- **6.11** ¿Qué pasa cuando importo una compra de la tienda? → [video: FAQ-TS-Tienda-con-stock.mp4, capítulo 4]

Los minutos exactos de cada capítulo están en el mensaje de entrega del video.

## Videos que conviene regrabar más adelante

- **Videos de Pedidos que muestran el detalle del pedido:** muestran el costo, el archivo y la impresora en cada pieza, que ya no aparecen.
- **Video de Catálogo web (6.3):** sigue siendo válido para el formato Catálogo; no muestra la tarjeta Formato del catálogo.

---

# Actualización v16.4 (catálogo y tienda)

Desde la v16 salieron las v16.1 a v16.4, con mejoras sobre todo en la tienda del catálogo. Estos textos completan o reemplazan los de arriba.

## E1 · Correcciones a preguntas de este documento

### 6.10 ¿Qué ve el cliente en la tienda? (reemplaza el texto de la Parte C)

La tienda tiene dos vistas:

- ✅ **En stock:** lo que está listo para entregar. Es la que se abre primero.
- 🛠️ **Todo el catálogo:** suma los productos que no tenés en stock, que el cliente puede pedir **a pedido**.

Arriba están las categorías como menú. Al pasar el mouse se despliegan sus subcategorías (y las sub-subcategorías, si las usás, ver 6.14). Las categorías que no entran en la barra van en el desplegable **Más**.

Cada producto tiene su etiqueta, **En stock** o **A pedido**. En la ficha del producto:

- Cada color dice cuántas unidades hay.
- Si le asignaste una foto a cada color, al elegir el color se ve su foto (ver 6.13).
- El cliente puede dejar un **comentario** en cada variante (talle, versión, un detalle), que te llega en el pedido.

Si pide más de lo que hay, la app le muestra cuántas salen de stock y cuántas se fabrican a pedido. En la vista En stock sólo puede elegir los colores que hay y hasta la cantidad disponible.

💡 Si todavía no cargaste stock, la tienda abre directamente en Todo el catálogo.

### 6.9 ¿Cómo cargo los productos que tengo en stock?

Agregar al final:

📷 Al elegir el color ves la foto que le asignaste a ese color, para no confundirte de variante. Si el producto tiene colores marcados (ver 6.12), sólo se ofrecen esos.

### 1.6.1 ¿Puedo avisarle al cliente por mail que su pedido está listo?

Cambiar "el cliente recibe un mail con el nombre de tu emprendimiento" por:

el cliente recibe un mail con el nombre de tu emprendimiento y **los productos de su pedido** (por ejemplo, "Maceta (x2) y Llavero"), así sabe enseguida de qué pedido se trata.

## E2 · Preguntas existentes a las que hay que sumarles algo

### 1.1.2 ¿Cómo le agrego piezas a un pedido? (o la pregunta de versiones y colores)

Agregar:

🎨 **Piezas de dos colores:** en el color de cada versión, las combinaciones que armaste en **Configuración → Combinaciones de colores** aparecen en un grupo aparte. Al elegir una se cargan **los dos colores a la vez**. Funciona en el detalle del pedido, al armar un pedido desde la Biblioteca y al agregar una pieza desde la Calculadora.

### 3.2.2 ¿Cómo guardo un producto para no recalcularlo cada vez? / 4. Biblioteca, editar producto

Agregar a la lista de datos:

🗂️ Sub-subcategoría (opcional): un tercer nivel dentro de la subcategoría, para ordenar mejor el menú de la tienda (ver 6.14).

## E3 · Preguntas nuevas

### 6.12 ¿Cómo elijo qué colores se ofrecen de cada producto?

En **Biblioteca → Editar** el producto, abrí **Colores y fotos**:

- Marcá los colores que tiene ese producto. Con **Buscar color…** los encontrás rápido.
- Tildá **Mostrar en el catálogo sólo los colores marcados**.
- Tocá **Guardar cambios**.

Desde ese momento, el catálogo, la tienda y la carga de stock ofrecen sólo esos colores. Si el producto usa combinaciones de dos colores, se marcan las combinaciones.

💡 Sin la opción tildada, o sin ningún color marcado, se ofrecen todos tus colores. Dentro de la app (pedidos, armar pedido) siempre ves todos.

### 6.13 ¿Puedo mostrar una foto distinta para cada color?

Sí, si el producto tiene 2 fotos o más. En **Biblioteca → Editar → Colores y fotos**, al lado de cada color elegí cuál de las fotos le corresponde. Ves una miniatura de la foto elegida.

En la tienda, cuando el cliente elige un color, la ficha muestra su foto. Los colores sin foto asignada muestran la que se estaba viendo.

💡 Si sacás una foto del producto, el color que la usaba vuelve a la foto principal.

### 6.14 ¿Cómo agrego un tercer nivel de categorías en la tienda?

Con la **sub-subcategoría**. Se carga al guardar o editar un producto en la Biblioteca, debajo de la subcategoría (sólo si el producto tiene subcategoría).

Ejemplo: Deco › Macetas › Colgantes.

En la tienda, al pasar el mouse por la subcategoría se despliegan sus sub-subcategorías. El formato Catálogo no la usa: ahí el producto se sigue viendo dentro de su subcategoría.

## E4 · Video

El video **FAQ-TS-Tienda-con-stock.mp4** se grabó con la v16 y sigue siendo válido. No muestra el menú **Más**, las fotos por color, los colores marcados ni el comentario por variante. Si querés, se puede sumar un video corto sobre **Colores y fotos** (6.12 y 6.13).
