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

## Facturación electrónica (ARCA): puesta en marcha

Hace falta clave fiscal nivel 3. La clave privada y el certificado **nunca van
al repo**: generalos en una carpeta fuera del proyecto (ej. `C:\arca`). Si el
PowerShell no encuentra `openssl`, usá el que trae Git:
`& "C:\Program Files\Git\usr\bin\openssl.exe"`.

### 1. Homologación (pruebas)

1. Generá la clave y el pedido de certificado (reemplazá el CUIT):

   ```powershell
   cd C:\arca
   openssl genrsa -out arca_homo.key 2048
   openssl req -new -key arca_homo.key -subj "/C=AR/O=Manager3D/CN=manager3d/serialNumber=CUIT 20123456789" -out arca_homo.csr
   ```

2. En ARCA, adherí el servicio **"WSASS - Autogestión Certificados
   Homologación"**. Adentro: "Nuevo certificado" (pegás el contenido de
   `arca_homo.csr` y guardás lo que devuelve como `arca_homo.crt`) y después
   "Crear autorización a servicio" para ese certificado con el servicio
   **wsfe**.
3. Cargá los secrets:

   ```powershell
   firebase functions:secrets:set ARCA_CERT --data-file C:\arca\arca_homo.crt
   firebase functions:secrets:set ARCA_KEY --data-file C:\arca\arca_homo.key
   ```

4. Deployá functions y reglas (ver "Ramas y publicación").
5. Panel Admin → "Facturación electrónica (ARCA)": completá los datos,
   entorno **Homologación**, punto de venta cualquiera (ej. 1), **Guardar** y
   **Probar conexión**. Después emití una factura manual de prueba y bajá el PDF.

### 2. Producción

1. Generá otra clave y otro pedido (`arca_prod.key` / `arca_prod.csr`), igual
   que arriba.
2. En ARCA, **"Administración de Certificados Digitales"**: agregá un alias,
   subí `arca_prod.csr` y descargá el certificado (`arca_prod.crt`).
3. **"Administrador de Relaciones de Clave Fiscal"** → Nueva relación → ARCA →
   WebServices → **Facturación Electrónica**; como representante elegí el
   alias del certificado.
4. **"Administración de puntos de venta y domicilios"** → alta de un punto de
   venta nuevo con sistema **"Factura Electrónica - Monotributo - Web
   Services"**. No uses el del facturador online.
5. Reemplazá los secrets con los archivos de producción y **volvé a deployar
   las functions** (toman la versión del secret al deployar):

   ```powershell
   firebase functions:secrets:set ARCA_CERT --data-file C:\arca\arca_prod.crt
   firebase functions:secrets:set ARCA_KEY --data-file C:\arca\arca_prod.key
   firebase deploy --only functions
   ```

6. En el panel: entorno **Producción**, el punto de venta nuevo, **Guardar**,
   **Probar conexión**. Recién ahí tildá "Facturar automáticamente".

El certificado vence (suele ser a los 2 años): renovarlo repitiendo los pasos
1, 2 y 5 de producción.

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

**Una factura quedó en "error".**
El panel muestra el código y el mensaje de ARCA. Corregí la causa (datos del
emisor, ficha del suscriptor) y tocá **Reintentar**: es seguro, si ARCA ya la
había autorizado se toma esa, no se duplica. Log:
`firebase functions:log --only onPagoMPRegistrado`.

**ARCA dice que ya hay un ticket vigente ("alreadyAuthenticated").**
Se perdió el ticket guardado en `arcaTickets` (o se pidió uno desde otro
sistema con el mismo certificado). Hay que esperar a que venza, hasta 12
horas.

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
