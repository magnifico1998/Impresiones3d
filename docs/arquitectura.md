# Arquitectura

Qué hay en cada parte del proyecto y cómo se conectan. Para el "por qué" de
cada regla, ver [reglas-de-negocio.md](reglas-de-negocio.md).

## Vista general

```
Navegador ──► Vercel (frontend React + /api/catalogo-meta)
   │
   ├──► Firebase Auth (Google o link por email)
   ├──► Firestore (datos, protegidos por firestore.rules)
   ├──► Storage (logos e imágenes, protegido por storage.rules)
   └──► Cloud Functions (lógica que el cliente no puede hacer solo)
                 │
                 ├──► Mercado Pago (suscripciones y cobros)
                 ├──► ARCA (factura electrónica: WSAA + WSFEv1)
                 └──► Gmail (mails automáticos)
```

- **Proyecto Firebase:** `print3d-manager-73846`.
- **Frontend en producción:** https://manager3d.com.ar (Vercel publica la
  rama `main`; https://manager3d.vercel.app sigue siendo el dominio interno
  de Vercel).
- **Regla de oro:** todo lo que toca plata, estado de suscripción, permisos o
  límites **pasa por una Cloud Function**. El cliente solo escribe sus datos
  operativos (pedidos, clientes, biblioteca, etc.), y las reglas de Firestore
  lo controlan.

## Frontend (`src/`)

React 19 + Vite, sin router: la navegación es por estado.

| Archivo | Qué hace |
|---|---|
| `main.jsx` | Punto de entrada. Si la URL es `/catalogo/...` carga solo el catálogo público; si no, la app con login. Ambos se cargan con import dinámico, así ninguno descarga el código del otro |
| `AppPrivada.jsx` | La app con login (envuelve `App` con `AppProvider` y los diálogos) |
| `App.jsx` | Layout: header, sidebar y la página activa |
| `context/AppContext.jsx` | Estado global: sesión, cuenta efectiva (la propia o la del dueño si es miembro invitado), suscripción, config, datos, login |
| `firebaseBase.js` | Firebase base (app + Firestore + Functions). Lo usa el catálogo público |
| `firebase.js` | Re-exporta la base y suma Auth y Storage (app con login) |
| `catalogo/CatalogoPublico.jsx` | Catálogo web de cada tienda, sin login |
| `components/*Page.jsx` | Una por sección: Resumen, Pedidos, Presupuestos, Clientes, Calculadora, Compras, Biblioteca, Catálogo web, Preguntas frecuentes, Configuración, Mi emprendimiento, Admin |
| `components/admin/`, `components/modals/` | Paneles y modales |
| `components/Dialogos.jsx` | Confirmaciones y avisos propios (reemplazan a `alert`/`confirm`) |
| `utils/` | Cálculos (finanzas del pedido, precio neto, capacidad), PDFs (`presupuestoPDF.js`, `listadoPDF.js`), armado de piezas de pedido (`piezaPedido.js`), WhatsApp, paletas |
| `SeccionFacturaPedido.jsx`, `modals/ModalFacturarPedido.jsx`, `TarjetaFacturacionCuenta.jsx`, `utils/facturacion.js` | Facturación de pedidos: bloque en el detalle del pedido, modal para emitir y configuración en "Mi emprendimiento" |
| `TablaComprobantes.jsx`, `ComprobantesCuenta.jsx`, `SelectorRangoFechas.jsx`, `utils/exportarExcel.js` | Listado de comprobantes con filtros, rango de fechas y exportación a Excel; lo usan el panel admin y la pestaña "Facturación ARCA" de cada emprendimiento |
| `utils/registroSoporte.js`, `utils/formatoTicket.js`, `components/soporte/`, `components/admin/SeccionTickets.jsx` | Tickets de soporte: registro en memoria de la sesión (se instala en `AppPrivada.jsx`), modal con "Grabar el problema" (`CentroSoporte`, abierto con el evento `abrir-ticket`), página Soporte y pestaña Tickets del admin |
| `utils/recorrido.js`, `Recorrido.jsx`, `utils/estadoRecorrido.js` | Recorrido guiado (driver.js, se descarga al empezar): pasos por sección; se ofrece a quien nunca lo hizo (en prueba, con el perfil completo) y se repite con el botón "🧭 Recorrido" del encabezado (también en Soporte y Preguntas frecuentes) |
| `utils/novedades.js`, `modals/ModalNovedades.jsx` | Aviso "Novedades" al entrar: una entrada por versión mayor; la última vista se recuerda en el navegador por usuario. Se reabre tocando la versión del encabezado |
| `index.css` | Estilos globales y variables de color |

## Vercel (`api/` y `vercel.json`)

- `api/catalogo-meta.js`: sirve `/catalogo/{uid}` con el título y la vista
  previa (Open Graph) con el nombre real del emprendimiento. Así, al compartir
  el link por WhatsApp se ve la tienda y no "Manager3D".
- `vercel.json`: redirige `/catalogo/*` a esa función y todo lo demás a
  `index.html`.

## Cloud Functions (`functions/`)

Node 22, firebase-functions 7. Todas se exportan desde `functions/index.js`,
con un máximo de 10 instancias por función.

### Llamadas desde la app (callable / HTTP)

| Función | Para qué | Quién |
|---|---|---|
| `cambiarEstadoSuscripcion` | Activar, renovar, suspender, extender la prueba, reactivar | Admin / revendedor |
| `crearSuscripcionMP`, `sincronizarSuscripcionMP`, `cancelarSuscripcionMP` | Contratar, verificar y cancelar el débito de Mercado Pago | Dueño de la cuenta |
| `webhookMercadoPago` | Recibe los avisos de Mercado Pago (valida la firma) | Mercado Pago |
| `registrarUltimoAcceso` | Guarda el último ingreso; renueva el plan gratuito | La app, una vez por sesión |
| `crearTicket` | Crea un ticket de soporte con el log de la sesión (número correlativo, tope de 5 por día) y avisa por mail al admin y al usuario | Cualquier usuario logueado |
| `actualizarTicket` | Cambia el estado de un ticket y/o lo responde por mail | Admin |
| `completarPerfil` | Guarda el perfil del dueño (ficha `datosSuscriptor`) y le da acceso al plan gratuito: al vencer la prueba, o en el momento si está en lectura o bloqueada | Dueño de la cuenta |
| `registrarAperturaCatalogo` | Cuenta las aperturas del catálogo y responde si la tienda todavía acepta pedidos (límite del plan) | Catálogo público |
| `agregarMiembro`, `quitarMiembro`, `responderInvitacion` | Usuarios adicionales ("equipo") | Dueño / invitado |
| `borrarCuenta` | Borrado definitivo de una cuenta | Admin |
| `habilitarRevendedor`, `deshabilitarRevendedor`, `borrarRevendedor`, `actualizarDescuentosRevendedor`, `vincularRevendedor`, `marcarCierreFacturado` | Gestión de revendedores | Admin |
| `validarCodigoRevendedor` | Valida un código en el formulario de contacto | Cualquier usuario |
| `activarCodigoPromocional` | Canjear un código de comercio | Usuario en prueba |
| `crearCodigoPromocional`, `actualizarCodigoPromocional`, `desactivarCodigoPromocional` | Gestión de códigos | Admin |
| `listarPlantillasEmail`, `guardarPlantillaEmail`, `restablecerPlantillaEmail` | Textos de los mails | Admin |
| `buscarCategoriasMonotributo` | Lee la tabla de categorías del monotributo de la página de ARCA (no guarda: el admin la aplica desde el panel) | Admin |
| `gestionarBoletin` | Boletín de novedades: resumen de destinatarios, bajas, prueba, envío y reanudación | Admin |
| `probarConexionArca`, `emitirFacturaManual`, `facturarPagoMP`, `reintentarFactura`, `anularFactura`, `descargarFacturaPDF`, `reenviarFacturaMail` | Facturación electrónica con ARCA | Admin |
| `configurarFacturacionCuenta` | Configura y verifica contra ARCA el CUIT y punto de venta de una cuenta; reserva el CUIT | Dueño de la cuenta |
| `facturarPedido`, `reintentarFacturaCuenta`, `descartarFacturaCuenta`, `anularFacturaCuenta`, `descargarFacturaCuentaPDF`, `enviarFacturaCuentaMail` | Factura C de los pedidos de una cuenta | Dueño y miembros (plan con facturación) |

### Automáticas

| Función | Cuándo | Qué hace |
|---|---|---|
| `onNuevoUsuario` | Primer login | Crea la suscripción en prueba y manda los mails de bienvenida |
| `onPedidoCreado` | Cada escritura de un pedido | Actualiza los contadores del ciclo (pedidos y monto) |
| `onBibliotecaCambio` | Alta o baja en la biblioteca | Recalcula `bibliotecaCount`; al borrar un producto, borra sus archivos G-code |
| `onGcodeSubido` | Archivo nuevo en Storage `users/{uid}/gcode-entrada/` | Lo recomprime con Brotli, controla el cupo del plan, lo guarda en `gcode/{id}.br` y completa la ficha |
| `crearCodigoConector` / `vincularConector` | Vincular un conector de impresión (callable de la app / HTTP del conector) | Genera el código de un solo uso y, al canjearlo, crea el usuario técnico del conector (claim `conectorDe`) |
| `onConectorBorrado` | Se borra `users/{uid}/conectores/{id}` | Borra el usuario técnico del conector |
| `onGcodeBorrado` | Se borra un `users/{uid}/gcode/*.br` | Recalcula `gcodeBytes` (espacio usado) |
| `onNuevaSolicitudContacto` | Formulario "contactate" | Avisa al admin |
| `onNuevaSolicitudCatalogo` | Solicitud en un catálogo web | Avisa a la tienda |
| `transicionSuscripciones` | Todos los días, 03:00 UTC | Vencimientos, bloqueos, avisos y renovación de promos |
| `reactivacionInactivos` | Todos los días, 04:00 UTC | Mail a quien lleva 10 días sin entrar |
| `cierreMensualRevendedores` | Día 1, 00:00 Argentina | Cierra el mes de cada revendedor |
| `onPagoMPRegistrado` | Alta de `pagosMP/{paymentId}` | Si está habilitado, factura el cobro en ARCA y manda el PDF |

### Módulos compartidos

| Archivo | Contenido |
|---|---|
| `admin.js` | Conexión a Firestore, constantes (prueba 7 días, lectura 30, gracia de débito 3), cálculo de ciclos y fechas |
| `ledgerRevendedor.js` | Comisión y registro de ventas del revendedor |
| `cobrosMercadoPago.js` | Aplicación idempotente de cobros (la usan el webhook y la sincronización) |
| `mercadopago.js` | Cliente de la API de Mercado Pago, validación de firma, secrets |
| `planGratuito.js` | Plan gratuito (Boceto): cuál es, perfil completo, activación de un ciclo de 30 días |
| `mailer.js` | Envío por Gmail (`manager3d.app@gmail.com`); admin = `gustavokimmel@gmail.com` |
| `emailTemplates.js` | Plantillas de mail por defecto |
| `arca.js` | Cliente SOAP de ARCA: ticket de WSAA (firmado con el certificado) y WSFEv1 (CAE, último número, consulta) |
| `facturacion.js` | Emisión de Factura C / Nota de Crédito C: candado de numeración, reintentos sin duplicar, mail |
| `facturaPDF.js` | PDF del comprobante con el QR de ARCA (se genera al vuelo, no se guarda) |

## Firestore: colecciones

| Colección | Contenido | Quién escribe |
|---|---|---|
| `users/{uid}/meta`, `clientes`, `compras`, `biblioteca`, `pedidos`, `presupuestos` | Datos de trabajo de cada cuenta | Dueño y miembros (si la cuenta no está en lectura) |
| `users/{uid}/suscripcion/actual` (+ `eventos`, `contadores/{cicloId}`) | Estado de la suscripción, historial y consumo del ciclo | Solo Cloud Functions |
| `planes` | Planes, precios y límites | Admin |
| `faq`, `faqMeta` | Preguntas frecuentes | Admin |
| `solicitudesContacto/{uid}` | Formulario "contactate con el área comercial" | Dueño (datos) / admin (estado) |
| `datosSuscriptor/{uid}` | Datos personales e impositivos (uso interno); los completa el suscriptor al contratar | Admin / revendedor, y `crearSuscripcionMP` |
| `revendedores/{codigo}` (+ `ventas/{YYYY-MM}`) | Revendedores y sus ventas por mes | Solo Cloud Functions |
| `codigosPromocionales/{codigo}` (+ `activaciones`) | Códigos de comercios | Solo Cloud Functions |
| `pagosMP/{paymentId}` | Registro de cobros de Mercado Pago (candado anti duplicados) | Solo Cloud Functions |
| `credencialesMP` | Tokens de revendedores (opción C, sin usar) | Solo Cloud Functions |
| `facturas/{id}` | Comprobantes emitidos a ARCA (`mp_{paymentId}` para los de suscripciones) | Solo Cloud Functions; lee el admin |
| `users/{uid}/facturas`, `facturasPorPedido/{pedidoId}`, `facturacion/config` | Facturas de la cuenta, estado de la factura de cada pedido y datos del emisor | Solo Cloud Functions; leen el dueño y los miembros |
| `cuitsFacturacion/{cuit}` | Qué cuenta tiene reservado cada CUIT | Solo Cloud Functions (sin acceso desde la app) |
| `users/{uid}/inventarioMovimientos` | Consumos, ajustes, bajas y carga inicial (importada de CSV) del inventario (el stock se calcula con las compras) | Dueño y miembros |
| `configFacturacion/emisor` | Datos del emisor, entorno y si se factura automático | Admin |
| `arcaTickets`, `arcaNumeracion` | Ticket de acceso a ARCA y candado de numeración | Solo Cloud Functions (sin acceso desde la app) |
| `catalogoTiendas/{uid}` (+ `productos`, `solicitudes`) | Catálogo público de cada tienda | Dueño; los visitantes solo crean solicitudes |
| `invitacionesMiembro/{email}` | Vínculos de equipo | Solo Cloud Functions |
| `tickets/{id}` (+ `adjuntos/log`) | Tickets de soporte; el log con el contexto técnico sólo lo lee el admin | Solo Cloud Functions; leen el admin y la cuenta |
| `users/{uid}/conectores/{id}`, `trabajosImpresion/{id}`, `codigosConector/{codigo}` | Conectores de impresión vinculados, cola de envíos a impresoras y códigos de vinculación | Conectores y códigos: Cloud Functions (y el conector, su latido); cola: la cuenta pide/cancela y el conector avanza el estado |
| `users/{uid}/gcode/{id}` | Fichas de los archivos G-code de la Biblioteca (producto, impresora, tamaños, estado) | Dueño y miembros crean la ficha y cambian la impresora; el resto, `onGcodeSubido` |
| `recorridos/{uid}` | Si cada usuario hizo el recorrido guiado (`hecho` / `salteado`, veces) | El propio usuario |
| `monotributo/categorias` | Topes anuales de cada categoría del monotributo, para el totalizador de facturación | Admin; la leen todas las cuentas |
| `boletines/{id}` | Cada envío del boletín: copia del contenido, destinatarios, enviados y fallidos | Solo Cloud Functions; lee el admin |
| `configuracion/emailTemplates`, `configuracion/boletin` | Textos personalizados de los mails y bajas del boletín | Solo Cloud Functions (sin acceso desde la app) |
| `contadores/tickets`, `soporteCuotas/{uid}` | Último número de ticket y tickets creados hoy por usuario | Solo Cloud Functions (sin acceso desde la app) |
| `admins/{email}` | Lista de admins | A mano desde Firebase Console |

Storage: `users/{uid}/...` (logos e imágenes), accesible por el dueño y los
miembros activos (`storage.rules`). Los G-code van aparte: la cuenta sólo
sube a `gcode-entrada/` (hasta 300 MB) y lee o borra en `gcode/`, donde
sólo escribe `onGcodeSubido`.

## Seguridad: dónde está cada control

- **`firestore.rules`** es la fuente de verdad de los permisos: bloqueo por
  estado de la cuenta, límites de pedidos y biblioteca, acceso de miembros y
  revendedores, y validación de los formularios públicos.
- Lo que no se puede validar con reglas (pagos, cupos, límite de usuarios,
  cambios de estado) está en Cloud Functions, con transacciones.
- El webhook de Mercado Pago valida la firma HMAC; los secrets nunca están en
  el repo.
