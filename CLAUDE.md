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
- Permisos y límites: `firestore.rules`, `storage.rules`, y los chequeos de
  límites en `src/context/AppContext.jsx` (`motivoLimitePedido`) y
  `src/catalogo/CatalogoPublico.jsx`.
- Presupuestos (estados, aprobación que crea el pedido):
  `src/components/PresupuestosPage.jsx`,
  `src/components/modals/ModalPresupuesto.jsx`, `src/utils/piezaPedido.js`.
- Mails automáticos: `functions/emailTemplates.js` (cuándo se mandan).

Si agregás o sacás una Cloud Function o una colección, actualizá
`docs/arquitectura.md`. Si cambia cómo se publica o se opera, actualizá
`docs/operacion.md`. Al final de la respuesta, avisale al usuario qué
sección de la documentación cambió.

## Versión (obligatorio)

La versión visible en el encabezado sale de `version` en `package.json`
(se muestra como `vMAYOR.MENOR`). **La versión sube una vez por cada deploy a
producción** (la rama que se pasa a `main`), no por cada commit ni por cada
cambio dentro de la rama. Se sube en el último commit de la rama, antes de
pasarla a producción. Lo que manda es lo que trae ese deploy:

- **El deploy trae funciones nuevas** (una función, una regla de negocio, un
  flujo distinto): es una **versión nueva**. Sube el **mayor** y el menor vuelve
  a 0, sin importar cuántas funciones traiga. `13.2` → `14.0`
  (`package.json`: `14.0.0`).
- **El deploy trae sólo arreglos o cambios estéticos** (un error, un texto,
  estilos, ajustes chicos): sigue siendo la **misma versión madre** y sólo sube
  el número después del punto. `14.0` → `14.1` → `14.2`
  (`package.json`: `14.1.0`).

Si un deploy junta de los dos tipos, manda el de funciones nuevas. Las pruebas
en `develop` o en la base de prueba no cambian la versión: se cuenta al pasar
a `main`. Al final de la respuesta, avisale al usuario a qué versión quedó.

Cada versión **nueva** (mayor) suma su entrada en `src/utils/novedades.js` (en
el mismo commit): lo que cambió para el usuario, en lenguaje de usuario, sin lo
estético ni lo correctivo, ni lo que sólo afecta al panel de administración.
Es lo que muestra el aviso "Novedades" al entrar. Los arreglos (mismo mayor)
no llevan entrada.

## Cómo trabaja el usuario

- Escribile en español rioplatense.
- Ramas: `develop` (integración) y `main` (producción, la publica Vercel).
  Trabajá en una rama propia y pasá los cambios con `git merge --ff-only`.
- **Los `firebase deploy`, `functions:secrets:set` y los merges/push a
  `develop` y `main` los corre el usuario.** Pasale los comandos para
  PowerShell, **de a uno por línea** (su PowerShell no acepta `&&`).
- En local (`npm run dev`) y en `develop` (Vercel Preview) la app usa la base de **prueba** (`manager3d-test`); producción es sólo `main`. Ver "Entornos" en `docs/operacion.md`. Los `firebase deploy` a prod (`--project prod`) y los merges/push a `main` necesitan su OK explícito.

## Convenciones de código

- Los comentarios explican el **por qué** y están en español; mantené esa
  densidad y ese tono.
- Todo lo que toca estado de la suscripción, plata, permisos o límites pasa
  por una Cloud Function; el cliente no escribe esas colecciones.
- Nombres internos heredados: `descuentosPorPlan` / `descuentoPct` es la
  **comisión del revendedor**; en pantalla se muestra como "comisión".
