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
                 └──► Gmail (mails automáticos)
```

- **Proyecto Firebase:** `print3d-manager-73846`.
- **Frontend en producción:** https://manager3d.vercel.app (Vercel publica la
  rama `main`).
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
| `registrarAperturaCatalogo` | Cuenta las aperturas del catálogo | Catálogo público |
| `agregarMiembro`, `quitarMiembro`, `responderInvitacion` | Usuarios adicionales ("equipo") | Dueño / invitado |
| `borrarCuenta` | Borrado definitivo de una cuenta | Admin |
| `habilitarRevendedor`, `deshabilitarRevendedor`, `borrarRevendedor`, `actualizarDescuentosRevendedor`, `vincularRevendedor`, `marcarCierreFacturado` | Gestión de revendedores | Admin |
| `validarCodigoRevendedor` | Valida un código en el formulario de contacto | Cualquier usuario |
| `activarCodigoPromocional` | Canjear un código de comercio | Usuario en prueba |
| `crearCodigoPromocional`, `actualizarCodigoPromocional`, `desactivarCodigoPromocional` | Gestión de códigos | Admin |
| `listarPlantillasEmail`, `guardarPlantillaEmail`, `restablecerPlantillaEmail` | Textos de los mails | Admin |

### Automáticas

| Función | Cuándo | Qué hace |
|---|---|---|
| `onNuevoUsuario` | Primer login | Crea la suscripción en prueba y manda los mails de bienvenida |
| `onPedidoCreado` | Cada escritura de un pedido | Actualiza los contadores del ciclo (pedidos y monto) |
| `onBibliotecaCambio` | Alta o baja en la biblioteca | Recalcula `bibliotecaCount` |
| `onNuevaSolicitudContacto` | Formulario "contactate" | Avisa al admin |
| `onNuevaSolicitudCatalogo` | Solicitud en un catálogo web | Avisa a la tienda |
| `transicionSuscripciones` | Todos los días, 03:00 UTC | Vencimientos, bloqueos, avisos y renovación de promos |
| `reactivacionInactivos` | Todos los días, 04:00 UTC | Mail a quien lleva 10 días sin entrar |
| `cierreMensualRevendedores` | Día 1, 00:00 Argentina | Cierra el mes de cada revendedor |

### Módulos compartidos

| Archivo | Contenido |
|---|---|
| `admin.js` | Conexión a Firestore, constantes (prueba 7 días, lectura 30, gracia de débito 3), cálculo de ciclos y fechas |
| `ledgerRevendedor.js` | Comisión y registro de ventas del revendedor |
| `cobrosMercadoPago.js` | Aplicación idempotente de cobros (la usan el webhook y la sincronización) |
| `mercadopago.js` | Cliente de la API de Mercado Pago, validación de firma, secrets |
| `mailer.js` | Envío por Gmail (`manager3d.app@gmail.com`); admin = `gustavokimmel@gmail.com` |
| `emailTemplates.js` | Plantillas de mail por defecto |

## Firestore: colecciones

| Colección | Contenido | Quién escribe |
|---|---|---|
| `users/{uid}/meta`, `clientes`, `compras`, `biblioteca`, `pedidos`, `presupuestos` | Datos de trabajo de cada cuenta | Dueño y miembros (si la cuenta no está en lectura) |
| `users/{uid}/suscripcion/actual` (+ `eventos`, `contadores/{cicloId}`) | Estado de la suscripción, historial y consumo del ciclo | Solo Cloud Functions |
| `planes` | Planes, precios y límites | Admin |
| `faq`, `faqMeta` | Preguntas frecuentes | Admin |
| `solicitudesContacto/{uid}` | Formulario "contactate con el área comercial" | Dueño (datos) / admin (estado) |
| `datosSuscriptor/{uid}` | Datos personales e impositivos (uso interno) | Admin / revendedor |
| `revendedores/{codigo}` (+ `ventas/{YYYY-MM}`) | Revendedores y sus ventas por mes | Solo Cloud Functions |
| `codigosPromocionales/{codigo}` (+ `activaciones`) | Códigos de comercios | Solo Cloud Functions |
| `pagosMP/{paymentId}` | Registro de cobros de Mercado Pago (candado anti duplicados) | Solo Cloud Functions |
| `credencialesMP` | Tokens de revendedores (opción C, sin usar) | Solo Cloud Functions |
| `catalogoTiendas/{uid}` (+ `productos`, `solicitudes`) | Catálogo público de cada tienda | Dueño; los visitantes solo crean solicitudes |
| `invitacionesMiembro/{email}` | Vínculos de equipo | Solo Cloud Functions |
| `admins/{email}` | Lista de admins | A mano desde Firebase Console |

Storage: `users/{uid}/...` (logos e imágenes), accesible por el dueño y los
miembros activos (`storage.rules`).

## Seguridad: dónde está cada control

- **`firestore.rules`** es la fuente de verdad de los permisos: bloqueo por
  estado de la cuenta, límites de pedidos y biblioteca, acceso de miembros y
  revendedores, y validación de los formularios públicos.
- Lo que no se puede validar con reglas (pagos, cupos, límite de usuarios,
  cambios de estado) está en Cloud Functions, con transacciones.
- El webhook de Mercado Pago valida la firma HMAC; los secrets nunca están en
  el repo.
