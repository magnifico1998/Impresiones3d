# Operación

Cómo publicar cambios, dónde mirar cuando algo falla y tareas de rutina.
Los comandos son para PowerShell, desde la carpeta del proyecto.

## Ramas y publicación

- **`develop`**: integración. **`main`**: producción.
- Los cambios se hacen en una rama de trabajo y se pasan con fast-forward:

```powershell
git checkout develop
git merge --ff-only <rama>
git checkout main
git merge --ff-only <rama>
git push origin develop main
git checkout develop
```

> En este PowerShell `&&` no funciona: corré los comandos de a uno.

Qué publica cada cosa:

| Cambio en | Se publica con |
|---|---|
| `src/`, `api/`, `index.html` | Push a `main` → **Vercel** publica solo |
| `functions/` | `firebase deploy --only functions` (o `--only functions:nombre`) |
| `firestore.rules`, `storage.rules` | `firebase deploy --only firestore:rules,storage` |
| `firestore.indexes.json` | `firebase deploy --only firestore:indexes` |

**Orden recomendado** cuando cambian a la vez el frontend y el backend: primero
deployá las functions y las reglas, después hacé el push a `main`. Así el
frontend nuevo nunca llama a una función que todavía no existe.

Antes de publicar `firestore.rules`, comparalas con las que hay en Firebase
Console → Firestore → Reglas, por si se editó algo a mano allá.

**Después de deployar reglas, recargá la app (F5)** si la tenías abierta.
Si una colección nueva se había rechazado antes del deploy, su escucha en
tiempo real quedó cortada y Firebase no la reintenta: se puede guardar, pero
la lista no se actualiza hasta recargar. (Pasó con Presupuestos.)

## Desarrollo local

```powershell
npm install
npm run dev          # http://localhost:5173
npm run lint
npm run build
```

**Ojo:** en local la app usa el **Firebase real** (no hay emuladores). Lo que
guardes en local queda en producción. Para probar, usá una cuenta de prueba.

## Secrets y configuración

Se cargan una vez y quedan en Firebase; nunca van en el repo:

```powershell
firebase functions:secrets:set GMAIL_APP_PASSWORD   # contraseña de aplicación de Gmail
firebase functions:secrets:set MP_ACCESS_TOKEN      # Access Token de Mercado Pago
firebase functions:secrets:set MP_WEBHOOK_SECRET    # clave secreta de Webhooks de MP
```

`functions/.env.print3d-manager-73846` puede tener `MP_PAYER_EMAIL_PRUEBA`
(solo para pruebas con credenciales de test de Mercado Pago). **En producción
tiene que estar vacío.**

Webhook en el panel de Mercado Pago: eventos "Planes y suscripciones",
apuntando a la función `webhookMercadoPago`.

## Logs

```powershell
firebase functions:log --only transicionSuscripciones
firebase functions:log --only cierreMensualRevendedores
firebase functions:log --only webhookMercadoPago
firebase functions:list        # qué funciones están deployadas
```

`transicionSuscripciones` deja una línea por corrida con el resumen:
cuántas cuentas pasaron a lectura, cuántas se bloquearon, cuántos avisos se
mandaron, etc.

## Qué revisar si...

**Un cliente pagó y sigue sin plan.**
1. Que toque "Verificar pago" en "Mi emprendimiento" (sincroniza con Mercado Pago).
2. Revisá `firebase functions:log --only webhookMercadoPago`.
3. En Firestore, `pagosMP/{paymentId}`: si dice `aplicado: false`, el campo
   `motivo` explica por qué.

**Una cuenta quedó bloqueada y ya pagó por fuera.**
Panel Admin → Suscriptores → "Renovar suscripción" (o "Reactivar"). Si es de
un revendedor, solo la puede renovar él.

**El cierre del mes de un revendedor no aparece.**
`firebase functions:log --only cierreMensualRevendedores`. Es idempotente: si
falló, se puede volver a ejecutar desde Google Cloud Console → Cloud Scheduler.

**Un cron falla con "requires an index".**
El log trae el link para crear el índice. Crealo y agregalo a
`firestore.indexes.json`.

**No llegan los mails.**
Revisá que `GMAIL_APP_PASSWORD` siga siendo válida (Google la revoca si cambia
la contraseña de la cuenta) y los logs de la función que manda el mail.

## Tareas manuales

- **Agregar un admin:** Firebase Console → Firestore → `admins` → documento con
  ID = email en minúsculas.
- **Borrar una cuenta bloqueada:** panel Admin → Suscriptores → borrar
  (confirmando el email). Es definitivo.
- **Cambiar precios o límites:** panel Admin → Planes. Ojo: las suscripciones de
  Mercado Pago que ya existen pueden seguir cobrando el precio anterior; la
  comisión del revendedor se calcula sobre lo realmente cobrado.
- **Facturar a revendedores:** después del día 1, en panel Admin → revendedor
  → historial: descargar el PDF del mes y marcarlo como "Facturado".
