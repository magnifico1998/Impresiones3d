# Revisión de las preguntas frecuentes (versión 15.5)

Comparé las preguntas frecuentes (copia del 30/9) con la app actual (v15.5). Cada texto está listo para pegar en el editor de preguntas: las líneas que empiezan con "- " se ven como lista y lo que va entre `**` sale en negrita.

- **Parte A**: preguntas que hay que corregir porque ya no coinciden con la app.
- **Parte B**: preguntas a las que conviene sumarles algo nuevo.
- **Parte C**: preguntas nuevas.
- **Parte D**: limpieza y numeración.

---

# Parte A · Preguntas que hay que corregir

## A1 · 3.3.1 ¿Para qué sirve Presupuestos y en qué se diferencia de un Pedido?

**Qué cambió:** el presupuesto ahora se guarda, tiene número y estados, y al aprobarlo se crea el pedido.

**Texto nuevo:**

La sección Presupuestos sirve para cotizar un trabajo antes de que el cliente confirme la compra.

Cada presupuesto queda guardado con un número correlativo (N° 1, 2, 3…) y un estado, para que sepas en qué quedó cada cotización:

- **Presupuesto creado:** recién guardado.
- **Aguardando respuesta:** ya se lo mandaste al cliente.
- **Aprobado:** el cliente lo aceptó y se creó el pedido.
- **Rechazado:** no prosperó. Lo podés reabrir si el cliente vuelve.

Principales diferencias

📄 **Presupuesto**
- Genera un PDF con la cotización.
- No afecta el inventario ni las estadísticas de ventas.
- Se puede editar y, mientras no esté aprobado, borrar.

📦 **Pedido**
- Es una venta confirmada.
- Lleva producción, estados, cobros y envíos.
- Cuenta en Resumen y en los límites del plan.
- No se borra: se cancela.

💡 Uso recomendado: armá el presupuesto, mandale el PDF al cliente y, cuando lo acepte, tocá **Aprobar**. El pedido se crea solo con los mismos productos y el mismo precio.

## A2 · 3.3.2 ¿Desde dónde puedo generar un presupuesto?

**Qué cambió:** la respuesta decía que un presupuesto no se convierte en pedido. Ahora aprobarlo crea el pedido.

**Texto nuevo:**

Podés crear un presupuesto de tres formas:

- 🧮 **Desde la Calculadora:** con una pieza recién calculada.
- 📚 **Desde la Biblioteca:** seleccioná uno o varios productos y tocá **Presupuesto** en la barra de abajo.
- 📄 **Desde Presupuestos → Nuevo presupuesto:** sumá productos con **+ Desde biblioteca** o escribí una **+ Línea libre**.

Desde la Calculadora o la Biblioteca elegís si va a un presupuesto nuevo o a uno que todavía esté abierto (creado o aguardando respuesta): los productos se suman al final.

Al terminar podés **Guardar**, **Guardar y generar el PDF**, o generar **sólo el PDF** sin guardar.

¿Un presupuesto se convierte en pedido?

Sí, cuando lo aprobás. Al tocar **Aprobar**:

- Se crea un pedido **Pendiente** con la descripción "Presupuesto N° X", las notas y el total como precio de venta.
- Los productos que vinieron de la Biblioteca o de la Calculadora conservan sus costos y datos de impresión. Las líneas libres entran sin costos.
- Si el cliente no existe, se da de alta con el teléfono y el email del presupuesto.

⚠️ Aprobar respeta los límites de tu plan: si el pedido no se puede crear (por ejemplo, llegaste al límite de pedidos del mes), el presupuesto no queda aprobado.

💡 Un presupuesto aprobado ya no se edita ni se borra: desde ahí manda el pedido, que queda vinculado.

## A3 · 1.2.5.4 ¿Cómo priorizo qué pedido se fabrica primero?

**Qué cambió:** ya no existe el botón "Ordenar prioridad" ni el ordenamiento con arrastre. La prioridad es automática.

**Texto nuevo:**

La prioridad se calcula sola, no hace falta ordenar nada a mano. En la lista de Pedidos:

- Primero aparecen los pedidos **En progreso** (lo que se está fabricando ahora).
- Después, los **Pendientes**, ordenados por la **fecha de entrega más próxima**.
- Entre los que no tienen fecha de entrega, va primero el más antiguo.
- Al final, el resto de los activos (en verificación, listo, enviado).

Ese mismo orden es el que usa la estimación de capacidad para calcular la fecha estimada de cada pedido.

💡 Para adelantar un pedido, cargale o acercale la **fecha de entrega**: el orden se actualiza solo.

## A4 · 6.3 ¿Cómo me llegan los pedidos que hacen los clientes desde el catálogo?

**Qué cambió:** el botón "Importar como pedido" ahora es "+ Crear pedido nuevo", se puede sumar la solicitud a un pedido existente y la app avisa si el cliente ya tiene un pedido abierto.

**Texto nuevo:**

Cuando un cliente te manda un pedido desde tu Catálogo web, no se crea directo como pedido de producción. Entra en **Catálogo web → Solicitudes pendientes**, donde lo revisás primero.

Te llega un mail a vos y a las personas de tu equipo.

Con cada solicitud podés:

- ✅ **+ Crear pedido nuevo:** se crea el pedido en estado **En verificación**, para confirmar los detalles con el cliente antes de fabricar.
- 🔄 **Agregar a pedido existente…:** suma lo que pidió a un pedido que ya tenés abierto.
- ❌ **Descartar:** la solicitud se borra sin crear nada.

Si el cliente ya tiene un pedido abierto, la app te avisa antes de crear uno nuevo. Podés crearlo igual y unirlos después desde el detalle del pedido (**Unir pedidos**).

Flujo recomendado
- El cliente arma su pedido en el catálogo.
- Revisás la solicitud en Solicitudes pendientes.
- Creás el pedido (o lo sumás a uno existente).
- Confirmás los detalles con el cliente (podés usar **Generar Resumen**).
- Empezás a fabricar.

[video: dejar el que ya tiene]

## A5 · 0.2 Plan gratuito Boceto

**Qué cambió:** la respuesta habla de "un período de gracia de 10 días antes del modo lectura", que no existe en la app. Además, para pasar a Boceto hay que completar el perfil.

**Texto nuevo:**

¿Qué es el plan gratuito "Boceto"?

Boceto es nuestro plan gratuito, para que uses Manager3D sin costo, con los límites del plan.

¿Cómo lo obtengo?

Completando tu perfil: nombre, apellido, teléfono y localidad. La app te lo ofrece durante la prueba y en los avisos de modo lectura o de cuenta bloqueada.

- Si lo completás durante la prueba, al terminar los 7 días pasás a Boceto en lugar de quedar en modo lectura.
- Si tu cuenta ya está en modo lectura o bloqueada, al completarlo pasás a Boceto en el momento.

¿Hay que renovarlo?

No. Cada período de Boceto dura 30 días y se renueva solo cuando volvés a entrar a la app, sin trámites ni pagos.

✅ Sin costo.
✅ Se obtiene completando el perfil.
✅ Se renueva solo al entrar.
✅ Ideal para conocer la plataforma o para un uso ocasional.

> Si el período de gracia de 10 días es una regla comercial que querés tener, hoy no está en la app: avisame y lo vemos.

## A6 · 9.1 ¿Qué significa que mi cuenta esté "en modo lectura"?

**Qué cambió:** el modo lectura también aparece cuando termina la prueba sin perfil completo, y se sale completando el perfil.

**Texto nuevo:**

En modo lectura podés entrar y consultar toda tu información (pedidos, clientes, Biblioteca, Resumen, inventario y configuración), pero **no podés crear, editar ni borrar** nada.

¿Por qué sucede?
- Terminó la prueba de 7 días y todavía no completaste tu perfil ni contrataste un plan.
- Venció el ciclo de tu plan y no se renovó (por ejemplo, un pago pendiente).

¿Cómo salgo?
- **Contratando o renovando un plan** desde Mi emprendimiento.
- **Completando tu perfil**, para pasar al plan gratuito Boceto en el momento.

¿Cuánto tiempo tengo?

**30 días.** Si en ese plazo no se regulariza, la cuenta queda **bloqueada**. Antes te avisamos por mail, cuando faltan 10 y 5 días.

💡 El modo lectura existe para que no pierdas el acceso a tus datos mientras lo resolvés.

## A7 · 9.2 ¿Qué pasa si mi cuenta queda suspendida?

**Qué cambió:** se puede recuperar completando el perfil (Boceto) y los datos no se borran solos.

**Texto nuevo:**

Una cuenta suspendida (bloqueada) **no puede ver ni editar** nada hasta regularizar la situación.

Tus datos **no se borran**: quedan guardados y vuelven a estar disponibles cuando se reactiva la cuenta.

¿Cómo recupero el acceso?
- **Renovando o contratando un plan.**
- **Completando tu perfil**, para pasar al plan gratuito Boceto.
- Escribiéndonos a manager3d.app@gmail.com si necesitás ayuda.

⚠️ A diferencia del modo lectura, una cuenta suspendida no deja consultar los datos hasta reactivarla.

## A8 · 9.3 ¿Cuánto dura el período de prueba?

**Qué cambió:** decía "depende de la configuración de cada cuenta". Son 7 días.

**Texto nuevo:**

La prueba dura **7 días** desde tu primer ingreso. Durante la prueba tenés todas las funciones de la app, salvo la **facturación electrónica**, que depende del plan. Además tenés **200 MB** para guardar archivos G-code.

Los días que te quedan se ven en **Resumen** y en **Mi emprendimiento**.

¿Qué pasa cuando termina?
- Si completaste tu perfil, pasás al plan gratuito **Boceto**.
- Si no, la cuenta queda en **modo lectura** hasta que contrates un plan o completes el perfil.

💡 Cinco días antes de que termine te avisamos por mail.

## A9 · 9.5.1 ¿Cómo se activa un código promocional de un comercio externo?

**Qué cambió:** faltaba que sólo se activa durante la prueba y que hay uno por cuenta.

**Texto nuevo:**

Un código promocional de un comercio te regala un plan sin costo durante una cantidad de meses.

Para activarlo:
- Tiene que ser **durante la prueba** de 7 días.
- Antes tenés que haber enviado el **formulario de contacto** desde tu cuenta.

⚠️ Se puede usar **un solo código por cuenta**, aunque el beneficio ya se haya terminado. Cada código tiene fecha de vigencia y puede tener un cupo máximo.

Cuando terminan los meses gratis, la cuenta vence como cualquier otra y podés seguir con un plan pago o con Boceto.

## A10 · 8.1.1 ¿Puedo darle acceso a otra persona para que use la app conmigo?

**Qué cambió:** ahora la persona invitada tiene que **aceptar** la invitación.

**Texto nuevo:**

Sí. En **Mi emprendimiento → Usuarios con acceso**, escribí su Gmail en **Agregar usuario (Gmail)**.

- La invitación queda **pendiente de aceptar**.
- Cuando esa persona entra a Manager3D con ese Gmail, la app le pregunta si quiere administrar tu emprendimiento. Si **acepta**, desde ese momento trabaja sobre tu cuenta. También puede rechazarla, o salir más adelante.

¿Qué puede hacer?

Tiene acceso total, igual que vos (no hay roles): pedidos, Biblioteca, clientes, Calculadora, Resumen, inventario y configuración. Lo único que hace sólo el dueño es contratar el plan, completar el perfil y configurar la facturación con ARCA.

Importante
- No se crea una copia: todos trabajan sobre la misma información, en tiempo real.
- Un Gmail puede administrar **una sola** cuenta ajena.

💡 Revisá bien el Gmail: el acceso es sólo para esa cuenta de Google.

[video: dejar el que ya tiene]

## A11 · 7.2 ¿Cómo cambio el tema visual de la app?

**Qué cambió:** la ruta es Configuración → Aplicación, hay paletas nuevas ("Tranqui") y se puede armar una paleta personalizada.

**Texto nuevo:**

Andá a **Configuración → Aplicación → Paletas de colores** y elegí la que más te guste (Tranqui, Cotton, Peach, Cielo, Lagoon, Glaciar, Jade, Onyx, Tiza o Espectro). El cambio se aplica al instante en toda la app.

¿Quiero mis propios colores?

En **Paleta personalizada** elegís cada color: fondos, acento, textos de apoyo y etiquetas.

El catálogo web tiene su propia paleta, que se elige desde Catálogo web.

[video: dejar el que ya tiene]

## A12 · 2. Clientes · ¿Puedo exportar mi listado de clientes?

**Qué cambió:** el botón se llama **📥 Exportar clientes**, no "Exportar CSV".

**Texto nuevo:** igual que el actual, cambiando la primera línea por:

Sí. En la sección Clientes tocá **📥 Exportar clientes** para bajar tu base de clientes en un archivo CSV, que se abre con Excel o Google Sheets.

Y en la lista de lo que incluye, sumar: dirección completa y fecha de alta.

---

# Parte B · Preguntas a las que hay que sumarles algo

## B1 · 11.1 ¿Cómo creo un pedido nuevo?

Agregar al final, antes del tip:

Si el cliente ya tiene un pedido abierto, la app te avisa antes de crear otro. Podés crearlo igual y unirlos después con **Unir pedidos** (ver 1.1.3), o cancelar y sumar los productos al pedido que ya existe.

## B2 · 1.1.2 ¿Cómo le agrego piezas a un pedido?

Agregar una cuarta forma y un aviso:

4. Desde un presupuesto aprobado

Al aprobar un presupuesto se crea el pedido con todos sus productos.

⚠️ Si agregás productos a un pedido y lo cerrás **sin guardar**, esos productos se quitan y el pedido vuelve a como estaba.

## B3 · 1.4.2 ¿Cómo genero el PDF de un pedido?

Agregar a la lista de lo que incluye:

🏦 Tus datos para transferencia (CBU/CVU, alias, titular y banco), si los cargaste en Mi emprendimiento → Datos bancarios. En el pedido salen sólo cuando queda saldo pendiente.

Y al consejo final: "El tamaño del logo en los PDF se elige en Mi emprendimiento → Logo".

## B4 · 3.1.1 ¿Qué archivos puedo importar?

Cambiar la lista de formatos por:

📄 .gcode y .gco
📦 .3mf (por ejemplo, el .gcode.3mf de Bambu Studio u Orca, con todas sus placas)

## B5 · 3.2.2 ¿Cómo guardo un producto para no recalcularlo cada vez?

Agregar a la lista de datos:

🔒 Notas internas: tipo de filamento, detalles de la impresión… Son privadas: no salen en el catálogo.

Y agregar:

Si importaste el archivo en la Calculadora, al guardar podés tildar **Guardar también el archivo G-code**, para tenerlo después en el producto (ver la sección 11).

## B6 · 5.6 ¿Cómo se descuenta el filamento de un pedido?

Agregar después de "Calcula los gramos consumidos…":

El cálculo se hace **por versión**: gramos por unidad × cantidad de cada versión, con su color. En las piezas multicolor hay una fila por material: el que lleva más gramos va al **Color** de la versión y el siguiente al **Color 2**.

Y agregar antes de "¿Puedo descontar el material más tarde?":

¿El rollo sugerido no es el correcto?

Buscalo **escribiendo el color o el tipo** de filamento en la fila.

¿El pedido no consumió nada del inventario?

Si no elegís ningún rollo ni insumo, el botón cambia a **Confirmar sin descontar**: marca el pedido como resuelto para que no te lo vuelva a proponer. Se puede deshacer.

💡 Si no alcanza el stock, el descuento se hace igual y el artículo queda en negativo hasta que lo corrijas con un ajuste.

## B7 · 5.8 ¿Cómo corrijo el stock?

Agregar al final:

💡 Podés **ordenar el inventario** tocando el título de cualquier columna.

## B8 · 5.9 ¿Cómo funciona el stock mínimo?

Agregar antes de la recomendación:

📥 Armá el pedido al proveedor

Con **Exportar para pedir (Excel)** bajás los artículos que están bajo el mínimo, con lo que falta para llegar al mínimo (en filamento, también en rollos enteros), el costo estimado y el proveedor y la fecha de la última compra.

## B9 · 6.6 Notificaciones

Cambiar la primera línea por:

Cada vez que un cliente confirma un pedido desde tu Catálogo web, Manager3D te manda un mail a vos y a las personas de tu equipo.

Y agregar al final:

Del lado del cliente, al terminar el pedido ve un botón para **Avisar por WhatsApp** y otro para **Volver al catálogo** y seguir mirando.

## B10 · 7.1 ¿Qué configuro en Configuración?

En la pestaña **Aplicación**, la lista queda así:

📈 Capacidad de producción.
🎨 Paletas de colores y paleta personalizada.
📦 Inventario y stock mínimo.
🖨️ Impresión directa (el conector para mandar archivos a tus impresoras).
💰 Cálculo de gastos.
🚚 Métodos de envío y sus links de seguimiento.

En **Herramientas**, sacar "Impresora predeterminada" de la lista suelta: ahora está dentro de **Valores por defecto**, junto con la electricidad, la mano de obra, el margen y el desperdicio.

## B11 · 8. Mi emprendimiento · Cómo configurar mi emprendimiento

Cambiar la lista de la pestaña Emprendimiento por:

- Datos generales (nombre, CUIT, dirección, país).
- Contacto.
- Logo, con el tamaño con el que sale en los PDF.
- Datos bancarios para que te transfieran.
- Tu plan y consumo.
- Usuarios con acceso.

Y en Facturación ARCA, sumar:

- Facturación y monotributo: lo facturado por mes y el acumulado contra el tope de tu categoría (ver 10.12).

## B12 · 8.2.1 ¿Dónde veo qué plan tengo contratado?

Agregar a la lista de indicadores:

🗂️ Espacio para archivos G-code.

## B13 · 8.2.2 ¿Qué pasa si supero el límite de pedidos o de facturación de mi plan?

Cambiar la lista por:

- 📦 **Pedidos del mes** o 💰 **monto facturado del mes:** no podés crear pedidos nuevos; los que ya tenés se siguen editando y completando.
- 🌐 **Aperturas del catálogo:** el catálogo se sigue viendo, pero no acepta pedidos nuevos hasta el próximo ciclo.
- 📚 **Productos de la Biblioteca:** no podés guardar productos nuevos.
- 👥 **Usuarios:** no podés invitar a nadie más.
- 🗂️ **Espacio para G-code:** no podés subir más archivos.

Los límites mensuales se liberan solos al empezar el ciclo siguiente, o antes si pasás a un plan más alto.

## B14 · 9.4.2 ¿Qué puede y qué no puede hacer un revendedor?

Cambiar "porcentaje de descuento" por **comisión** en todo el texto, que es como se llama en el panel. Por ejemplo: "Modificar la comisión asignada a sus ventas".

---

# Parte C · Preguntas nuevas

## Categoría "1. Pedidos / 1.1 Administración"

### 1.1.3 ¿Cómo uno dos pedidos del mismo cliente?

Si un cliente te hizo dos pedidos (por ejemplo, uno que cargaste vos y otro que llegó del catálogo), los podés juntar en uno solo.

En la lista de Pedidos, un pedido cuyo cliente tiene otro abierto muestra el aviso **⚠ +1 abierto**.

Para unirlos:
- Abrí el pedido que querés conservar.
- Tocá **Unir pedidos** y elegí el otro pedido.
- Confirmá.

¿Qué pasa al unirlos?
- El pedido que conservás suma las piezas, el precio, el envío, lo abonado, los insumos y las notas del otro.
- Los descuentos se pasan a monto y se suman.
- Queda en el estado **menos avanzado** de los dos (por ejemplo, si uno estaba pendiente y el otro listo, queda pendiente).
- El otro pedido queda **Cancelado**, con la nota "unido al pedido #N". No se borra.

⚠️ Sólo se unen pedidos abiertos: en verificación, pendiente, en progreso o listo. Los enviados o completados ya tienen entregas, cobros y consumo de inventario.

💡 La unión nunca es automática: la decidís vos.

## Categoría "3. Calculadora / 3.3 Presupuestos"

### 3.3.3 ¿Puedo adjuntar imágenes a un presupuesto?

Sí. Podés sumar hasta **8 imágenes** por presupuesto (un render, una foto, un plano), cada una con un comentario opcional.

Salen en hojas de anexo al final del PDF, con **1, 2 o 4 imágenes por hoja**, a elección:

- **1 por hoja:** para imágenes con detalle.
- **4 por hoja:** para cosas simples.

Las imágenes se ven enteras, sin deformarse.

💡 Las imágenes son del presupuesto: al aprobarlo no pasan al pedido. Si generás "sólo el PDF" sin guardar, no se sube nada.

## Categoría "4. Biblioteca"

### 4.4 ¿Dónde anoto detalles de impresión de un producto?

En las **Notas internas** del producto. Las cargás al guardarlo desde la Calculadora o desde **Editar** en la Biblioteca.

Sirven para anotar, por ejemplo, el tipo de filamento, la orientación, los soportes o cualquier detalle de la impresión.

- 🔒 Son privadas: sólo las ven vos y tu equipo. No salen en el catálogo.
- 📝 Desde un pedido, el botón **📝 Notas** de cada pieza te las muestra mientras fabricás.

## Categoría "5. Compras"

### 5.10 ¿Cómo cargo el stock que ya tenía antes de usar el inventario?

Con **Importar CSV**, en Compras → Inventario.

- Tocá **Descargar plantilla** y completala en Excel, una fila por artículo: categoría (Filamento, Insumo, Accesorio, Equipo u Otro), nombre, marca, color, cantidad y costo unitario.
- En filamento, la cantidad va en **rollos** (0,5 es medio rollo) y podés indicar el peso del rollo (si no, se toman 1.000 g). Cargá el color: con él se descuenta al completar pedidos.
- Elegí el archivo y la fecha de la carga: antes de importar ves cada artículo, y si alguno ya existe te marca que se suma. Las filas con errores no se importan.
- Las filas válidas crean el artículo con su costo, como si fuera una compra, pero **no cuentan como gasto**: no aparecen en Compras ni en tus ganancias.

Si el artículo ya existe, la cantidad se suma. Toda la importación se puede deshacer junta.

💡 Opcionalmente, los filamentos, colores, marcas y artículos nuevos se suman a tu configuración.

## Categoría "6. Catálogo web"

### 6.7 ¿Cómo pongo mi marca en el catálogo?

En **Catálogo web → Marca del catálogo**:

- 🖼️ **Tamaño del logo:** chico, mediano, grande o extra grande. Sirve, por ejemplo, para que un logo con colores claros se vea bien.
- ✍️ **Texto destacado:** un eslogan o un gancho comercial debajo del nombre, de hasta 3 líneas y con el tamaño que quieras.

La vista previa te muestra cómo queda el encabezado con los colores de tu catálogo.

💡 El logo respeta su proporción: si es rectangular, no se deforma.

## Categoría "2. Clientes"

### ¿Puedo guardar el método de envío favorito de un cliente?

Sí. En la ficha del cliente (Editar) elegí su **Método de envío favorito**, de los que tenés en Configuración → Métodos de envío. Queda a la vista en sus datos.

Es informativo: no se carga solo en sus pedidos.

## Categoría "10. Facturación electrónica"

### 10.12 ¿Cómo controlo lo facturado contra mi categoría de monotributo?

En **Mi emprendimiento → Facturación ARCA**, la tarjeta **Facturación y monotributo** te muestra:

- 📊 **Lo facturado por mes:** cada barra se compara con el promedio mensual de tu categoría.
- 📈 **El acumulado de los últimos 12 meses** contra el tope anual de tu categoría (verde hasta el 70 %, amarillo hasta el 90 %, rojo después) y qué categoría te corresponde.
- 🔮 **La proyección a la próxima recategorización** (enero o julio), según el promedio de tus últimos meses.

¿Facturás también por fuera de Manager3D?

Cargá esos **otros ingresos** por mes, para que el acumulado sea completo.

Para que funcione, elegí tu **categoría de monotributo** en la tarjeta. Las Notas de Crédito se restan solas.

⚠️ Es orientativo: la recategorización también tiene en cuenta superficie, energía y alquileres.

## Categoría nueva "11. Archivos G-code e impresión directa (BETA)"

Ojo: hoy la pregunta "11.1" de Pedidos tiene un error de numeración (ver Parte D). Corregila antes de crear esta categoría para que no se mezclen.

### 11.1 ¿Cómo guardo el G-code de un producto?

Podés guardar el archivo laminado de cada producto de tu Biblioteca para no andar buscándolo en la compu.

- En la **Biblioteca**, tocá el botón **📄** del producto (o **📄 Gestionar archivos** desde Editar).
- Elegí la **impresora para la que lo laminaste**.
- Tocá **+ Subir archivo**.

También podés guardarlo al pasar un producto de la Calculadora a la Biblioteca, tildando **Guardar también el archivo G-code**.

El archivo se guarda **comprimido al máximo** y, cuando lo bajás, vuelve exactamente como lo subiste.

[video: FAQ-GC-Archivos-G-code.mp4, desde el principio]

### 11.2 ¿Qué archivos puedo guardar y cómo los distingo?

Archivos de hasta 300 MB, de tres tipos, cada uno con su ícono:

- 📄 **G-code** (.gcode, .gco): laminado, listo para imprimir.
- 📦 **3MF laminado** (.gcode.3mf, de Bambu Studio u Orca): ya laminado, con todas sus placas.
- 🧩 **Proyecto 3MF** (.3mf): el modelo con su perfil de impresión, **sin laminar**. Se abre en el programa de laminado para revisarlo y laminarlo.

### 11.3 ¿Cuánto espacio tengo para mis archivos?

Depende de tu plan. Durante la prueba tenés **200 MB**.

El espacio usado se ve arriba en la ventana de archivos del producto y en **Mi emprendimiento → Tu plan y consumo**.

Como se guardan comprimidos, un G-code ocupa más o menos entre el 12 % y el 16 % de lo que pesa, y un .3mf, alrededor de la mitad.

Si un archivo no entra, la app te lo avisa con el motivo.

### 11.4 ¿Cómo paso el archivo a la tarjeta SD o a un pendrive?

Tenés dos formas:

- ⬇️ **Bajar:** en la ventana de archivos del producto, tocá **Bajar** y copiá el archivo a la tarjeta.
- 📂 **Guardar en una carpeta:** con el conector instalado en la PC del taller (ver 11.5), tocá **🖨 Mandar** y elegí **Guardar en una carpeta**. El archivo se guarda directo en la carpeta que elegiste en el conector (por ejemplo, la tarjeta SD) y se abre esa carpeta.

[video: FAQ-GC-Archivos-G-code.mp4, desde 0:20]

### 11.5 ¿Qué es el Manager3D Conector y cómo lo instalo?

Es un programa para Windows que se instala en una PC de tu taller y recibe los archivos que mandás desde Manager3D.

- En **Configuración → Aplicación → Impresión directa**, tocá **⬇ Descargar el conector (Windows)**.
- Abrí el .zip y ejecutá **Manager3D-Conector.exe**. Si Windows muestra un aviso azul, tocá "Más información" y después "Ejecutar de todas formas".
- En la app tocá **+ Vincular un conector** y escribí el código en el panel del conector. El código vale 10 minutos.
- En el panel del conector, cargá tus impresoras: ponele un nombre y elegí la **marca** (Bambu Lab, Anycubic, Creality, Elegoo, Prusa…). El programa de laminado de la marca se busca solo; con **Probar** confirmás que lo encontró. Si no lo encuentra, escribí la ruta de su .exe en "Programa".

**Guardar en una carpeta** está siempre disponible, para cualquier impresora.

En Impresión directa ves si cada conector está **conectado** y qué impresoras tiene.

[video: FAQ-CN-Manager3D-Conector.mp4]

### 11.6 ¿Cómo mando un archivo a imprimir?

Desde la Biblioteca (botón 📄 del producto → **🖨 Mandar**) o desde un pedido (ver 11.7):

- Elegí el destino: tu impresora o **Guardar en una carpeta**.
- Tocá **Abrir en el programa** o **Guardar en la carpeta**.

Con **Abrir en el programa**, el archivo se abre en el programa de laminado de tu marca, en la PC del taller. Desde ahí lo revisás y lo mandás a imprimir con el flujo oficial de la marca, como siempre. Un proyecto .3mf sin laminar siempre va al programa de laminado.

Debajo ves cada envío: En cola, Enviando…, Enviado o Error.

💡 Si el conector está cerrado, el envío queda en cola y se hace cuando lo abras.

[video: FAQ-GC-Archivos-G-code.mp4, desde 0:35]

### 11.7 ¿Puedo mandar el archivo desde un pedido?

Sí. En el detalle del pedido, cada pieza cuyo producto tiene archivos guardados muestra el botón **🖨 Enviar**.

- Te muestra **todos los archivos** del producto y las cantidades y colores pedidos, como recordatorio.
- Marca los que **ya mandaste** desde ese pedido, para que no los repitas por error. Si querés, los podés mandar de nuevo.

Si la pieza no tiene el botón, es porque su producto no tiene archivos guardados, o es una pieza libre de la Calculadora.

[video: FAQ-GC-Archivos-G-code.mp4, desde 0:53]

## Categoría nueva "12. Ayuda y uso de la app"

### 12.1 ¿Cómo pido ayuda o reporto un problema?

Desde **Soporte**, en el menú:

- Tocá **Nuevo ticket**, elegí la categoría (Error, Consulta, Facturación o Sugerencia) y contanos qué pasó.
- Si algo falla, usá **● Grabar el problema** y repetí lo que estabas haciendo: así nos llega todo lo necesario para analizarlo. Antes de mandarlo podés ver qué se envía.

También podés tocar **Reportar** en cualquier aviso de error.

Te llega un mail cuando recibimos el ticket y cada vez que te respondemos. En el menú, Soporte te muestra un contador cuando un ticket tuyo tiene novedades.

💡 Podés crear hasta 5 tickets por día. El ticket también se ve desde las cuentas de tu equipo.

### 12.2 ¿Hay una guía para empezar a usar la app?

Sí, el **Recorrido**: un paseo guiado que te muestra dónde configurar tus costos, cómo calcular una pieza desde el G-code y cómo cargar pedidos, y cómo llegar a cada sección desde el menú.

Arranca solo la primera vez que entrás. Lo podés repetir cuando quieras con el botón **🧭 Recorrido**, arriba a la derecha.

### 12.3 ¿Dónde veo las novedades de la app?

Al entrar, la app te muestra las novedades desde tu último ingreso. Para volver a verlas, tocá el **número de versión**, arriba a la izquierda, al lado de Manager3D.

### 12.4 ¿Puedo instalar Manager3D como una app?

Sí. En Chrome o Edge, tocá **⬇ Instalar app**, arriba. Queda un acceso directo en tu PC y se abre en su propia ventana, como cualquier programa.

Si no ves el botón, es porque tu navegador no lo permite o porque ya está instalada.

### 12.5 ¿Por qué me aparece un aviso de versión nueva?

Porque publicamos una mejora mientras tenías la app abierta. Guardá lo que estés editando y tocá **Recargar**.

Si programamos una actualización, te avisamos con anticipación para que guardes y cierres antes.

### 12.6 ¿Por qué un formulario no se cierra al hacer clic afuera?

Para que no pierdas lo que cargaste por un clic de más. Los formularios se cierran con sus botones o con la tecla **Esc**. Si cambiaste algo, la app te pregunta antes de cerrar sin guardar.

---

# Parte D · Limpieza y numeración

- **Texto que quedó pegado por error:** "Proporcione sus comentarios sobre BizChat" aparece al final de **10.2**, **8.2.1** y **9.4.3**. Hay que borrarlo.
- **Numeración de Pedidos:** "11.1 ¿Cómo creo un pedido nuevo?" debería ser **1.1.1**.
- **Nombre de la categoría 0:** "0. Nuetros Planes" debería ser **"0. Nuestros planes"**.
- **Título de 1.5.1:** "Como se factura un pedido??" debería ser **"1.5.1 ¿Cómo se factura un pedido?"**.
- **Preguntas de Clientes y de Mi emprendimiento:** no tienen número. Sugerencia: 2.1 a 2.6 y 8.0 (o 8.1 corriendo el resto).
- **Título de Mi emprendimiento:** "Como Configuar mi Emprendimiento" debería ser **"¿Cómo configuro mi emprendimiento?"**.
- **1.2.5:** la subcategoría "1.2.5 estimación de capacidad de producción" tiene el mismo número que la pregunta "1.2.5 ¿Puedo eliminar un pedido?". Sugerencia: llevar la subcategoría a **1.2.6**.
- **3.1.2:** dice "analiza el contenido del archivo .GCODE" cuando habla de un .3mf. Debería decir "del archivo .3mf".

## Videos a revisar

- **Sección 11 (G-code e impresión directa):** listos los videos nuevos en la v15.5: FAQ-GC-Archivos-G-code.mp4 (subir, tarjeta SD, abrir en el programa, desde el pedido) y FAQ-CN-Manager3D-Conector.mp4 (instalar, vincular, cargar impresoras, carpeta y primer envío). Reemplazan al video de G-code anterior.
- **Videos de las FAQ de Pedidos y Configuración:** se grabaron con la versión anterior y no muestran lo nuevo: el botón Unir pedidos, las paletas Tranqui y personalizada, y la tarjeta Impresión directa.
