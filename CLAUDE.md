# Manager3D: guía para Claude

Contexto del proyecto en [README.md](README.md) y [docs/](docs/). Leé
`docs/reglas-de-negocio.md` antes de tocar suscripciones, cobros,
revendedores, promociones, planes o permisos.

## Mantener la documentación al día (obligatorio)

Cuando un cambio modifique una **regla de negocio**, actualizá
`docs/reglas-de-negocio.md` **en el mismo commit**, y la fecha de "Última
revisión". Cuenta como regla de negocio cualquier cambio en:

- Duraciones, plazos o constantes: `functions/admin.js`, y las constantes al
  inicio de `functions/http/*.js` y `functions/scheduled/*.js`.
- Estados y transiciones de la suscripción:
  `functions/scheduled/transicionSuscripciones.js`,
  `functions/http/cambiarEstadoSuscripcion.js`,
  `functions/http/registrarUltimoAcceso.js`.
- Cobros: `functions/cobrosMercadoPago.js`, `functions/http/pagosMercadoPago.js`,
  `functions/http/webhookMercadoPago.js`, `functions/mercadopago.js`.
- Revendedores y comisiones: `functions/ledgerRevendedor.js`,
  `functions/http/gestionarRevendedores.js`,
  `functions/scheduled/cierreMensualRevendedores.js`.
- Promociones, equipo y borrado: `functions/http/codigosPromocionales.js`,
  `functions/http/gestionarMiembros.js`, `functions/http/borrarCuenta.js`.
- Permisos y límites: `firestore.rules`, `storage.rules`.
- Mails automáticos: `functions/emailTemplates.js` (cuándo se mandan).

Si agregás o sacás una Cloud Function o una colección, actualizá
`docs/arquitectura.md`. Si cambia cómo se publica o se opera, actualizá
`docs/operacion.md`. Al final de la respuesta, avisale al usuario qué
sección de la documentación cambió.

## Cómo trabaja el usuario

- Escribile en español rioplatense.
- Ramas: `develop` (integración) y `main` (producción, la publica Vercel).
  Trabajá en una rama propia y pasá los cambios con `git merge --ff-only`.
- **Los `firebase deploy`, `functions:secrets:set` y los merges/push a
  `develop` y `main` los corre el usuario.** Pasale los comandos para
  PowerShell, **de a uno por línea** (su PowerShell no acepta `&&`).
- En local la app usa el Firebase real: no guardes ni envíes nada sin su OK.

## Convenciones de código

- Los comentarios explican el **por qué** y están en español; mantené esa
  densidad y ese tono.
- Todo lo que toca estado de la suscripción, plata, permisos o límites pasa
  por una Cloud Function; el cliente no escribe esas colecciones.
- Nombres internos heredados: `descuentosPorPlan` / `descuentoPct` es la
  **comisión del revendedor**; en pantalla se muestra como "comisión".
