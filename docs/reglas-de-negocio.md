# Reglas de negocio

Cómo funciona Manager3D desde el lado del negocio: suscripciones, cobros,
revendedores, códigos promocionales y límites de los planes. Cada regla
indica dónde vive en el código, para poder verificarla.

> Este documento se mantiene al día con el código. Si cambiás una regla,
> actualizá la sección correspondiente en el mismo commit (ver `CLAUDE.md`).

Última revisión: 2026-09-30 (plan gratuito Boceto automático al completar el perfil).

---

## 1. Ciclo de vida de una suscripción

Cada cuenta tiene un único documento `users/{uid}/suscripcion/actual` con un
`estado`. El cliente nunca lo puede escribir: todo cambio pasa por una Cloud
Function y queda registrado en la subcolección `eventos`.

| Estado | Qué puede hacer la cuenta | Cómo entra | Cómo sale |
|---|---|---|---|
| `trial` | Todo | Al registrarse por primera vez | Vence a los **7 días** → `activa` en el plan gratuito si completó el perfil; si no, → `lectura` |
| `activa` | Todo (dentro de los límites del plan) | Pago por Mercado Pago, o activación desde el panel | Vence el ciclo sin renovar → `lectura` |
| `lectura` | Ve sus datos, **no puede editar ni crear** | Vencimiento de trial o de ciclo, o botón "Suspender" | Si renueva o completa el perfil → `activa`. A los **30 días** → `suspendida` |
| `suspendida` | **No ve ni edita nada** (bloqueada) | 30 días en `lectura` sin regularizar | Si renueva o completa el perfil → `activa` |

Reglas clave:

- **Prueba gratis: 7 días** desde el primer ingreso (`DURACION_TRIAL_DIAS`,
  `functions/admin.js`; alta en `functions/triggers/onNuevoUsuario.js`).
- **Modo lectura: 30 días** antes del bloqueo (`DURACION_LECTURA_DIAS`,
  `functions/admin.js`).
- **Las cuentas bloqueadas NO se borran solas.** Los datos quedan guardados y
  se recuperan si la cuenta se reactiva. El borrado definitivo es **manual**,
  desde el panel de Suscriptores (`functions/http/borrarCuenta.js`): exige
  escribir el email exacto de la cuenta, primero cancela el débito de Mercado
  Pago y no tiene vuelta atrás.
- Los cambios de estado automáticos los hace el cron diario
  `transicionSuscripciones` (03:00 UTC,
  `functions/scheduled/transicionSuscripciones.js`).
- El bloqueo lo aplican las reglas de Firestore (`cuentaPuedeEscribir` y
  `cuentaPuedeLeer` en `firestore.rules`). Una cuenta sin documento de
  suscripción no se bloquea (compatibilidad con cuentas viejas).

### Ciclos de facturación

- Un ciclo dura **un mes calendario**, anclado al día de activación: activó el
  15/07 → vence el 15/08. Si el mes siguiente no tiene ese día, se usa el
  último día del mes (igual que Mercado Pago). `sumarMesCalendario` en
  `functions/admin.js`.
- **Renovar antes de vencer no hace perder días:** el ciclo nuevo arranca desde
  el vencimiento vigente, no desde hoy. Si la cuenta ya estaba vencida,
  arranca desde hoy. `calcularCicloActivacion` en `functions/admin.js`.

### Mails automáticos del ciclo

Los manda `transicionSuscripciones`. Los textos se editan desde el panel
Admin → plantillas (defaults en `functions/emailTemplates.js`).

| Momento | Plantilla |
|---|---|
| Al registrarse | `bienvenida` (al usuario) y `nuevoSuscriptor` (al admin) |
| 5 días antes de que venza el trial o el ciclo | `avisoVencimiento` (no se manda si tiene débito automático) |
| Pasa a modo lectura | `modoLectura` |
| Pasa al plan gratuito (al vencer la prueba o al completar el perfil) | `planGratuitoActivado` (al usuario) |
| Completa el perfil por primera vez | `perfilCompletado` (al admin, con los datos) |
| Faltan 10 y 5 días para el bloqueo | `avisoBloqueo` |
| Se bloquea | `cuentaBloqueada` |
| 10 días sin ingresar (máximo uno cada 30 días) | `reactivacion` (cron `reactivacionInactivos`, 04:00 UTC) |

### Acciones manuales del panel (`cambiarEstadoSuscripcion`)

`functions/http/cambiarEstadoSuscripcion.js`:

| Acción | Qué hace | Quién |
|---|---|---|
| `activar` ("Renovar suscripción") | Activa o renueva con un plan; si corresponde, registra la venta del revendedor | Admin o el revendedor de la cuenta |
| `renovarCiclo` | Corre el ciclo un mes, sin registrar venta | Admin |
| `extenderTrial` | Suma 7 días de prueba | Admin (un revendedor no puede regalar prueba) |
| `suspender` | Pasa a `lectura` con los 30 días de gracia (no bloquea de golpe) | Admin o revendedor |
| `reactivar` | Ciclo nuevo completo desde hoy (ej. pagó por transferencia) | Admin |
| `toggleContactadoPostBloqueo` | Marca "ya lo contacté" en una cuenta bloqueada | Admin o revendedor |

- **Una cuenta con débito automático no se puede renovar a mano:** se renueva
  sola con cada cobro. Renovarla encima regalaría un mes o duplicaría la venta.
- **Una cuenta de un revendedor solo la opera ese revendedor.** El admin general
  puede vincularla o desvincularla y borrarla, pero no activarla ni
  suspenderla, para que siempre se aplique la comisión acordada.

---

## 2. Planes y límites

Los planes viven en la colección `planes` de Firestore y se administran desde
el panel Admin (`src/components/modals/ModalPlan.jsx`). **Los precios y
límites no están en el código**: se cambian desde el panel.

Campos de cada plan: `nombre`, `precioMensual`, `orden`, `activo` (visible
para contratar), `gratuito`, y `limites`:

| Límite | Qué controla | Qué pasa al llegar | Dónde se hace cumplir |
|---|---|---|---|
| `pedidosMes` | Pedidos nuevos por ciclo | No puede crear pedidos nuevos | `firestore.rules` (`dentroDelLimiteDePedidos`) |
| `montoFacturadoMes` | Monto facturado en pedidos por ciclo | No puede crear pedidos nuevos; los existentes se pueden seguir editando y completando | `firestore.rules` (`dentroDelLimiteDeMonto`) |
| `aperturasCatalogoMes` | Aperturas del catálogo web por ciclo | El catálogo **se sigue viendo, pero no acepta pedidos** (la apertura que llega justo al límite todavía puede pedir) | `firestore.rules` (`dentroDelLimiteDeAperturas`) y `functions/http/registrarAperturaCatalogo.js` |
| `productosBiblioteca` | Productos guardados en total (no por mes) | No puede guardar productos nuevos | `firestore.rules` (`dentroDelLimiteDeBiblioteca`) |
| `usuarios` | Personas con acceso a la cuenta, contando al dueño | No puede invitar a nadie más | `functions/http/gestionarMiembros.js` |

- Un límite vacío (`null`) significa **sin límite**. Tampoco aplican durante
  la prueba (sin plan asignado).
- Los límites por ciclo se liberan solos cuando empieza el ciclo siguiente, o
  antes si la cuenta pasa a un plan con un límite más alto.
- Avisos: al crear un pedido pasado el límite, la app muestra el motivo. Con el
  catálogo sin pedidos, el dueño ve un aviso en "Catálogo web" y el visitante,
  uno en el catálogo que lo invita a contactar a la tienda directamente.
- Riesgo conocido: las aperturas se cuentan sin protección anti-bot, así que
  alguien podría inflar el contador de una tienda ajena y dejarla sin recibir
  pedidos hasta el próximo ciclo. La solución prevista es Firebase App Check.

### Plan gratuito (ej. "Boceto")

El plan con `gratuito: true` (si hay más de uno, el de menor orden; no importa si está visible para contratar) es
la salida gratis de toda cuenta que no paga, **a cambio de completar el
perfil**: nombre, apellido, teléfono y localidad (emprendimiento, cómo nos
conoció, documento y condición impositiva se piden pero son opcionales). El
perfil es **el mismo formulario de contacto** (`ModalContacto.jsx`), en dos
modos: "Contactate con el área comercial" y "Completá tu perfil y seguí
gratis" (Boceto). En los dos se guarda la solicitud en
`solicitudesContacto/{uid}` (con `origen`: contacto o boceto) y la ficha en
`datosSuscriptor/{uid}` vía `completarPerfil`, que marca `perfilCompleto` en
la suscripción. Al admin le llega un solo mail por persona: el de nueva
solicitud de contacto o, si la solicitud ya existía, el de perfil completo.
El panel muestra en "Solicitudes de contacto" el resumen de "cómo nos
conocieron" sobre todas las solicitudes.

- **En prueba:** la prueba de 7 días sigue con todas las funciones. Al vencer,
  si completó el perfil (o su ficha ya tenía esos datos, por ejemplo del
  checkout), pasa a `activa` en el plan gratuito en vez de a `lectura`. Sin
  perfil, cae a `lectura` como siempre.
- **En `lectura` o `suspendida`:** al completar el perfil pasa al plan
  gratuito en el momento. Es la vía para recuperar cuentas que dejaron de pagar
  o nunca se registraron del todo.
- Cada entrada al plan gratuito arranca un ciclo nuevo de **30 días**
  (`DIAS_PLAN_GRATUITO`, `functions/planGratuito.js`).
- **Se renueva solo:** cuando una cuenta con ese plan está en `lectura` y
  vuelve a entrar, recibe 30 días nuevos. No revive una cuenta `suspendida`
  (para eso, completar el perfil). `functions/http/registrarUltimoAcceso.js`.
- La app ofrece completar el perfil durante la prueba (como mucho una vez por
  día) y en los carteles de modo lectura y de cuenta bloqueada. A las cuentas
  en prueba, o en lectura sin plan, que todavía no completaron el perfil se
  les avisa por mail que existe el plan gratuito (como máximo cada 10 días).
- Sólo el dueño de la cuenta completa el perfil; los miembros invitados no.

Código: `functions/planGratuito.js`, `functions/http/perfil.js`,
`functions/scheduled/transicionSuscripciones.js`,
`src/components/modals/ModalContacto.jsx`.

---

## 3. Cobro con Mercado Pago

- **Débito automático mensual** (Suscripciones de Mercado Pago), en pesos
  (ARS). Hoy **todo se cobra en la cuenta de Mercado Pago de la plataforma**
  (opción A).
- El suscriptor contrata desde "Mi emprendimiento" en tres pasos: elige el
  plan, completa sus **datos de facturación** y confirma el email de su cuenta
  de Mercado Pago, que puede ser distinto del de Google. **Solo contrata el
  dueño de la cuenta**, no los miembros invitados.
- **Los datos de facturación son obligatorios para pagar:** nombre, apellido,
  DNI (7 u 8 dígitos) o CUIT (11 dígitos), condición impositiva, teléfono y
  localidad. Del login con Google la app solo toma el email, así que sin este
  paso quedaría un suscriptor que paga sin datos para facturarle. Los valida
  el servidor (`crearSuscripcionMP` rechaza la contratación si falta alguno) y
  se guardan en la ficha del suscriptor (`datosSuscriptor/{uid}`, la misma de
  "Consultar datos" en el panel), no en la solicitud de contacto, para no
  reabrir el lead. El paso se precarga con la ficha o, si no hay, con el
  formulario de contacto.
- **El plan se activa recién cuando Mercado Pago acredita el cobro**, no al
  abrir el link de pago.
- Cada cobro se aplica **una sola vez**, aunque llegue repetido: el candado es
  el documento `pagosMP/{paymentId}`.
- Si el aviso de Mercado Pago no llega, el plan igual se activa: la app
  sincroniza al volver del checkout (y con el botón "Verificar pago"), y el
  cron diario vuelve a consultar antes de bloquear.
- **Gracia de 3 días** después del vencimiento para cuentas con débito
  automático, antes de pasar a lectura (`DIAS_GRACIA_DEBITO_AUTOMATICO`).
- **Cambio de plan:** la suscripción nueva reemplaza a la anterior, que se
  cancela para no cobrar dos planes.
- **Cancelar el débito no corta el acceso:** la cuenta sigue activa hasta el fin
  del ciclo pagado y después pasa a lectura como cualquier otra.
- La comisión del revendedor se calcula sobre **lo efectivamente cobrado**, no
  sobre el precio actual del plan.

Código: `functions/http/pagosMercadoPago.js`, `functions/cobrosMercadoPago.js`,
`functions/http/webhookMercadoPago.js`, `functions/mercadopago.js`.

### Facturación electrónica (ARCA)

El admin factura como **monotributista**: siempre **Factura C** (código 11)
y, para anular, **Nota de Crédito C** (código 13), sin IVA discriminado. Se
configura y se usa desde panel Admin → pestaña "Facturación ARCA".

- **Cobros de suscripción:** si está tildado "Facturar automáticamente", cada
  cobro de Mercado Pago acreditado (`pagosMP/{paymentId}` con
  `aplicado: true`) genera su factura `facturas/mp_{paymentId}` y se le manda
  el PDF por mail al suscriptor. Es concepto **servicios**, con el período del
  ciclo pagado (desde el inicio del ciclo hasta el día anterior a `cicloFin`).
  Se factura aparte de la activación del plan: si ARCA está caído, el plan se
  activa igual y la factura queda en error para reintentar.
- **Receptor de una suscripción:** sale de la ficha `datosSuscriptor/{uid}`
  (la que se completa al contratar). Si la ficha no tiene un DNI/CUIT válido,
  o dice Monotributo/Responsable inscripto/Exento sin CUIT, se factura a
  **consumidor final** y queda la advertencia en la factura.
- **Pedidos y otros cobros** (transferencias, etc.): factura manual desde el
  panel, con productos o servicios y hasta 50 ítems.
- **Numeración:** la da ARCA (último autorizado + 1), de a una emisión por
  punto de venta y tipo. Si un pedido a ARCA queda sin respuesta, antes de
  reintentar se consulta ese número: si ARCA ya lo autorizó con el mismo
  importe y receptor, se toma ese; nunca se emite dos veces.
- **Anular** emite una Nota de Crédito C por el total, asociada a la factura.
  Una factura admite una sola nota de crédito.
- Los cobros acreditados **antes** de habilitar la facturación automática no
  se facturan solos: se facturan con "Facturar un cobro de Mercado Pago".
- **Homologación / producción:** en homologación los comprobantes son de
  prueba (el PDF lo avisa). El pase a producción se hace cambiando el entorno
  en la configuración, después de cargar el certificado de producción.

Código: `functions/facturacion.js`, `functions/arca.js`,
`functions/facturaPDF.js`, `functions/http/facturacion.js`,
`functions/triggers/onPagoMPRegistrado.js`.

---

## 4. Revendedores

Un admin puede habilitar a cualquier suscriptor como revendedor con un
**código propio** (4 a 12 letras o números, en mayúsculas).
`functions/http/gestionarRevendedores.js`.

### Comisión

- En el panel Admin, cada revendedor tiene una **comisión por plan, en
  porcentaje (0 a 100)**: es **la parte del precio que se lleva el
  revendedor**. Ejemplo: plan de $100 con 30% → $30 para el revendedor y $70
  para la plataforma.
- Ese valor es el default. Al activar o renovar una cuenta, el admin puede usar
  otro porcentaje para esa venta puntual. **El revendedor no puede cambiar su
  propio porcentaje.**
- Internamente el campo se llama `descuentosPorPlan` / `descuentoPct`; en
  pantalla se muestra como "comisión". `pctComision` y `armarVentaLedger` en
  `functions/ledgerRevendedor.js`.

### Quién cobra define hacia dónde va la deuda

| Venta | Quién cobró | Resultado |
|---|---|---|
| Activación manual desde el panel | El revendedor, por fuera | El revendedor **le debe** a la plataforma el precio menos su comisión ("a facturar") |
| Pago por Mercado Pago | La plataforma | La plataforma **le debe** al revendedor su comisión ("a pagarle") |

### Vinculación

- Una cuenta queda vinculada a un revendedor en la **primera venta**: cuando la
  activa el revendedor, o cuando la activa el admin y la solicitud de contacto
  trae el código. Después no cambia sola, y **cada renovación posterior también
  cuenta como venta de ese revendedor.**
- El admin puede vincular o desvincular a mano desde la tabla de Suscriptores.
- **Deshabilitar** un revendedor le corta el acceso al panel, pero sus cuentas
  siguen facturándose. **Borrarlo** solo se permite si no le quedan cuentas
  vigentes (en prueba o activas).
- Para validar un código hay un límite de **8 intentos fallidos cada 10
  minutos** por cuenta, para que no se puedan adivinar códigos.

### Cierre mensual

- Las ventas se acumulan por mes, **en hora de Argentina**, en
  `revendedores/{codigo}/ventas/{YYYY-MM}`.
- El cron `cierreMensualRevendedores` corre el **día 1 a las 00:00 de
  Argentina** (el último día del mes a las 24 hs) y cierra el mes anterior:
  congela los totales y calcula el saldo.
- **Saldo = a facturar − a pagarle.** Si es positivo, el revendedor le debe a
  la plataforma; si es negativo, la plataforma le debe al revendedor.
- Desde el panel Admin se ve el historial por mes, se descarga el PDF y se
  marca el mes como **"Facturado"** (solo meses cerrados).
- Código: `functions/scheduled/cierreMensualRevendedores.js`.

### Pendiente: el revendedor cobra en su propia cuenta (opción C)

El código ya está preparado para que un revendedor cobre en su propia cuenta de
Mercado Pago (`modoCobro: 'propio'`), pero **todavía no está habilitado**. Hoy,
si un revendedor tuviera ese modo, sus clientes no podrían contratar solos por
la app.

---

## 5. Códigos promocionales de comercios

Distintos de los revendedores: un comercio le **regala** al suscriptor un plan
a **costo $0 durante N ciclos**. `functions/http/codigosPromocionales.js`.

- Solo se puede activar **durante la prueba** y después de enviar el
  formulario de contacto.
- **Un código por cuenta, de por vida**, aunque el beneficio ya se haya agotado.
- Cada código tiene plan, cantidad de ciclos, vigencia (fechas inclusivas, en
  hora de Argentina) y un cupo máximo opcional.
- Mientras quedan ciclos, el cron renueva el ciclo gratis cada mes. Cuando se
  agotan, la cuenta vence como cualquier otra.
- Hay un límite de **8 intentos fallidos cada 10 minutos** para evitar que se
  adivinen códigos.
- Los crea y edita un admin desde el panel.

---

## 6. Equipo: usuarios adicionales por cuenta

`functions/http/gestionarMiembros.js`.

- El dueño puede darle **acceso total** a otras cuentas de Google, hasta el
  límite `usuarios` de su plan. No hay roles.
- La invitación nace **pendiente** y solo da acceso cuando el invitado la
  **acepta**. Puede rechazarla, o salir después.
- Un email puede administrar **una sola cuenta ajena**.
- Mientras un invitado está activo, trabaja sobre la cuenta del dueño, no sobre
  la suya.

---

## 7. Presupuestos

Sección propia, separada de Pedidos: un presupuesto todavía no es una venta.
Se guardan en `users/{uid}/presupuestos`. Código:
`src/components/PresupuestosPage.jsx` y
`src/components/modals/ModalPresupuesto.jsx`.

| Estado | Significado | Se puede |
|---|---|---|
| `creado` ("Presupuesto creado") | Recién guardado | Editar, marcar enviado, aprobar, rechazar, eliminar |
| `enviado` ("Aguardando respuesta") | Ya se le mandó al cliente | Editar, aprobar, rechazar, eliminar |
| `aprobado` | El cliente lo aceptó: **se creó el pedido** | Ver el pedido, bajar el PDF |
| `rechazado` | No prosperó | Reabrir (vuelve a "aguardando respuesta"), eliminar |

- Se crean desde la Calculadora, desde la Biblioteca (seleccionando
  productos y tocando "Presupuesto" en la barra de abajo) o desde "Nuevo
  presupuesto" en la sección. Dentro del presupuesto se suman productos con
  "+ Desde biblioteca" (buscador; si el producto ya está, suma una unidad) o
  con "+ Línea libre".
- Desde la Calculadora o la Biblioteca se elige el **presupuesto destino**:
  uno nuevo o uno existente **abierto** (creado o aguardando respuesta; nunca
  aprobados ni rechazados). Si es existente, los productos se suman al final
  de su lista y guardar actualiza ese presupuesto.
- Se puede **guardar**, **guardar y generar el PDF**, o generar **solo el
  PDF** sin guardar (como antes; solo en presupuestos nuevos).
- Numeración correlativa visible (N° 1, 2, 3…), que aparece en el PDF.
- **Aprobar crea el pedido** en estado pendiente, con descripción
  "Presupuesto N° X", las notas del presupuesto y el total como precio de
  venta. Las líneas que vinieron de la Biblioteca o de la Calculadora
  conservan sus costos y datos de impresión; las líneas libres entran sin
  costos. Si el cliente no existe, se da de alta con el teléfono y el email
  del presupuesto.
- Aprobar respeta los **límites del plan** (pedidos y monto por ciclo, modo
  lectura): si el pedido no se puede crear, el presupuesto **no** queda
  aprobado.
- Un presupuesto aprobado no se edita ni se borra: desde ahí manda el pedido,
  que queda vinculado (`pedidoId` en el presupuesto, `presupuestoId` en el
  pedido).
- A diferencia de los pedidos, los presupuestos no aprobados **sí se pueden
  borrar**.
- Se incluyen en el backup. Un backup anterior a esta sección no borra los
  presupuestos existentes al restaurarse.

---

## 8. Pedidos, biblioteca y catálogo web

- **Los pedidos no se borran, solo se cancelan.** Las reglas de Firestore no
  permiten borrarlos, ni siquiera al dueño.
- **Semáforo de la ETA de producción** (con la capacidad de producción
  activada): compara la fecha estimada con la fecha de entrega del pedido.
  Verde "en fecha" con 2 días o más de margen, amarillo "ajustado" con 0 o 1
  día, rojo "no llega" si la estimada cae después, y gris si el pedido no
  tiene fecha de entrega (sólo informativo). Colores fijos, iguales en todas
  las paletas (`etaEstado` en `src/components/PedidosPage.jsx`).
- **Aviso de entrega** en la lista de pedidos (sin depender de la capacidad
  de producción): marco izquierdo y chip naranja "Entrega hoy / mañana / en
  N días" si se entrega en los próximos 7 días, y rojo "Vencido hace N días"
  si la fecha ya pasó. Sólo para pedidos que todavía se están haciendo (no
  listo, enviado, completado ni cancelado) (`alertaEntrega`).
- **Catálogo web público:** cada tienda tiene su catálogo en
  `/catalogo/{uid}`, que se ve sin login. Solo se publica lo que el dueño
  elige: nunca costos ni pedidos. Los visitantes pueden mandar solicitudes solo
  si el catálogo está **activo** y la tienda no pasó su límite de aperturas
  del ciclo (ver sección 2). Cada solicitud le llega por mail al dueño y a
  los miembros de la cuenta (`functions/triggers/onNuevaSolicitudCatalogo.js`).
- Cada apertura del catálogo suma al contador de aperturas del ciclo
  (`functions/http/registrarAperturaCatalogo.js`).

### Compras e inventario

- **Una compra es un ingreso tipo carrito:** varias líneas, cada una con su
  categoría (Filamento, Insumo, Accesorio, Equipo, Impuesto u Otro). Así un
  mismo pedido al proveedor con filamentos y boquillas es un solo ingreso.
  Las líneas se guardan en `lineas`; la compra además guarda un resumen
  (`desc`, `cat` = la única categoría o "Varios", `qty`, `precio` promedio,
  `total`) para los listados y el Resumen.
- **Las métricas y el filtro de Compras van por línea:** el total de una
  compra se reparte entre las categorías de sus líneas, y la compra aparece
  en cada categoría que tenga.
- **Todas las líneas tienen los mismos datos:** nombre, marca, color,
  cantidad y precio (marca y color son opcionales). En **filamento** (línea
  de Insumos con subtipo) el nombre es el tipo, de Configuración →
  Filamentos; en el resto es una descripción, de la lista de artículos de
  esa categoría (`cfg.articulosCompra`). El color sale de Configuración →
  Colores y las marcas son una sola lista para todas las categorías
  (`cfg.marcasFilamento`).
- **Lo que no existe se agrega desde la línea:** al guardar la compra, los
  tipos de filamento nuevos se suman a Filamentos (con el precio de la
  línea), los colores a Colores (con el tono elegido), y las marcas y los
  artículos nuevos a sus listas. También se sugieren dentro de la misma
  compra, en las otras líneas.
- Compras anteriores a las líneas se siguen leyendo igual: una compra común
  es una línea, y las de filamento con `items` son varias líneas de
  filamento (`lineasDeCompra`). Al editarlas y guardarlas pasan al formato
  nuevo.
- **Inventario:** se prende en Configuración → Aplicación → "Llevar
  inventario" (`cfg.inventarioHabilitado`) y suma la pestaña "Inventario"
  en Compras. Entran **todas las líneas salvo Impuestos** (filamentos,
  insumos, accesorios, equipos y otros: algunos se consumen y otros no, pero
  se sabe que se tienen) de las compras marcadas "Sumar al inventario"
  (`alInventario`): tildado por defecto en las compras nuevas; al editar se
  respeta lo que tenía (una compra vieja no entra sola).
- El stock **se calcula**: lo comprado más los movimientos
  (`users/{uid}/inventarioMovimientos`: **consumo**, **ajuste** por conteo
  físico y **baja**, con signo). No se guarda un stock aparte: editar o
  borrar una compra o un movimiento lo corrige solo. Cada artículo es la
  combinación de categoría (o filamento) + nombre + marca + color, sin
  distinguir mayúsculas ni espacios.
- **El filamento se lleva en gramos:** cada rollo comprado suma su peso
  (`pesoRollo` de la línea, 1000 g si no se cargó) y los consumos
  descuentan gramos. El costo promedio se muestra por kg. El resto de los
  artículos va en unidades.
- **Ajustar** registra la diferencia entre lo contado y el stock calculado;
  **Dar de baja** descuenta lo que se rompió o se vendió. Los **equipos** no
  se consumen ni se ajustan: sólo se dan de baja. Cada movimiento se puede
  deshacer desde el historial del artículo.
- **Consumo de los pedidos:** al pasar un pedido a *completado* o *enviado*
  (desde la lista o el detalle) se propone descontarlo; también hay un botón
  en el bloque "Inventario" del detalle. Se estima el filamento por color:
  gramos por unidad × cantidad de cada versión + desperdicio (en piezas
  multicolor, los gramos de cada material del G-code). Los gramos salen de la
  pieza (las piezas nuevas los guardan al crearse) o, en pedidos anteriores,
  del producto de la Biblioteca con el mismo nombre. Para cada color se
  sugiere el rollo del inventario con ese color (y tipo, si se conoce), el de
  más stock; los insumos del pedido se buscan por nombre. Todo es editable.
- Un pedido se descuenta **una sola vez**: los consumos quedan vinculados al
  pedido (`pedidoId`), y para volver a descontarlo hay que deshacer primero.
  Se puede descontar aunque no alcance el stock (queda en negativo, para
  corregir con un ajuste).

- **Stock mínimo:** hay un **mínimo por defecto** en Configuración →
  Aplicación → Inventario (`cfg.inventarioMinimoDefault`: `g` para
  filamento, `u` para el resto) y cada artículo puede tener uno **propio**
  (`cfg.inventarioMinimos[clave]`: número = propio, 0 = sin mínimo, null o
  ausente = usa el por defecto). Si el stock queda por debajo, la fila se
  resalta y la solapa muestra "Inventario (N)". Los equipos no llevan mínimo.

Código del consumo: `src/utils/consumoPedido.js`,
`src/components/modals/ModalConsumoPedido.jsx`,
`src/components/SeccionInventarioPedido.jsx`.

Código: `src/utils/inventario.js`, `src/components/ComprasPage.jsx`,
`src/components/modals/ModalCompra.jsx`.

### Facturación electrónica de los pedidos

Cada suscriptor puede emitir **Factura C** (monotributistas) de sus pedidos
con **su propio CUIT**, desde el detalle del pedido.

- **Quién la tiene:** solo las cuentas cuyo plan tiene activado
  "Facturación electrónica" (`planes/{id}.facturacionElectronica`, se prende
  por plan desde el panel admin, también en planes gratuitos o especiales).
  La prueba de 7 días no tiene plan, así que no factura. Una cuenta en modo
  lectura o bloqueada no puede emitir (sí ver y bajar las que ya tiene).
- **Cómo se habilita:** el suscriptor, en ARCA, **delega el servicio
  "Facturación Electrónica" al CUIT de Manager3D** (20262375065) y crea un
  punto de venta "Web Services". En "Mi emprendimiento" → pestaña "Facturación ARCA" carga CUIT, punto de
  venta y datos del emisor; el servidor lo verifica contra ARCA (delegación y
  punto de venta). Solo el dueño configura; el dueño y los miembros facturan.
- **Un CUIT, una cuenta:** la primera cuenta que configura un CUIT se lo
  reserva (`cuitsFacturacion/{cuit}`). Como la delegación es a Manager3D y
  no a una cuenta, sin esto otra cuenta podría facturar con un CUIT ajeno.
  Liberarlo es manual (ver operacion.md).
- **Una factura vigente por pedido.** Se puede volver a facturar solo si la
  anterior se anuló con nota de crédito, o si quedó con error y se descartó.
  No se descarta una factura "incierta" (ARCA pudo haberla autorizado): hay
  que reintentar, que primero lo consulta.
- No se factura un pedido cancelado ni uno "en verificación".
- La factura se precarga con las piezas del pedido, la **bonificación**
  (diferencia entre la suma de las piezas y el precio neto) y el **envío**
  como ítem; todo es editable (por ejemplo, facturar solo la seña). El
  receptor sale de la ficha del cliente: con CUIT se informa su condición
  frente al IVA; con DNI o sin documento, consumidor final.
- **El mail** con el PDF sale de la casilla de Manager3D con el nombre del
  emprendimiento, y las respuestas le llegan al suscriptor (plantilla
  `facturaEmprendimiento`).

Código: `functions/http/facturacionCuenta.js`, `functions/facturacion.js`,
`src/components/SeccionFacturaPedido.jsx`,
`src/components/modals/ModalFacturarPedido.jsx`,
`src/components/TarjetaFacturacionCuenta.jsx`.

---

## 9. Administración

- Los admins se definen en la colección `admins/{email}` y **se agregan a mano
  desde Firebase Console**. Desde la app no se pueden crear.
- Las preguntas frecuentes (`faq`) y los planes (`planes`) los edita solo un
  admin.
