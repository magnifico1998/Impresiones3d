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

## Dominio

La app se publica en **https://manager3d.com.ar** (dominio principal en
Vercel; `manager3d.vercel.app` sigue funcionando). Si el dominio cambia:

1. **Firebase Console → Authentication → Settings → Authorized domains:**
   agregar el dominio nuevo (y `www.` si se usa). Sin esto falla el login con
   Google y con link por mail. Hacerlo antes de apuntar el dominio.
2. **Vercel → Domains:** conectar el dominio y dejarlo como principal (la
   vista previa del catálogo, `api/catalogo-meta.js`, toma ese dominio).
3. **`APP_URL` en `functions/emailTemplates.js`:** es el botón de los mails
   y la vuelta del checkout de Mercado Pago. Cambiarlo y redesplegar las
   functions.
4. Generar un PDF de pedido con logo desde el dominio nuevo, para confirmar
   que Storage deja descargar el logo.

El webhook de Mercado Pago y ARCA no dependen del dominio (van a las Cloud
Functions). Los usuarios tienen que volver a iniciar sesión en el dominio
nuevo: la sesión del navegador queda atada a cada dominio.

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
al repo**: generalos en una carpeta fuera del proyecto (ej. `C:\arca`, que hay
que crear con `mkdir C:\arca`). Si el PowerShell no encuentra `openssl`, usá
el que trae Git (en esta PC está instalado por usuario):
`& "$env:LOCALAPPDATA\Programs\Git\mingw64\bin\openssl.exe"`.

### 1. Homologación (pruebas)

1. Generá la clave y el pedido de certificado (reemplazá el CUIT):

   ```powershell
   cd C:\arca
   openssl genrsa -out arca_homo.key 2048
   openssl req -new -key arca_homo.key -subj "/C=AR/O=Manager3D/CN=manager3d/serialNumber=CUIT 20262375065" -out arca_homo.csr
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
5. Panel Admin → pestaña "Facturación ARCA": completá los datos,
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

## Boletín de novedades

En Administrador → Negocio → Boletín de novedades:

1. **Editar contenido** y reescribir las novedades de la campaña.
2. **Enviarme una prueba** y revisarla en el mail (también en el celular).
3. Elegir los estados de suscripción y **Enviar**.

Gmail manda unos 500 mails por día desde `manager3d.app@gmail.com`: si hay
más suscriptores, el envío queda **Pausado** y se termina con **Reanudar** al
día siguiente. Quien responda BAJA se agrega a la lista de **Bajas** de la
misma tarjeta.

## Tickets de soporte

Los tickets llegan por mail y están en Admin → Tickets. Para analizar uno,
**Copiar para análisis** (o **Descargar (.md)**) y pegarlo en Claude.

También se pueden leer desde la terminal, sin pasar por el panel:

```powershell
node scripts/ticket.mjs        # tickets pendientes
node scripts/ticket.mjs 12     # TKT-0012 completo, con el log
```

El script necesita, una sola vez, una clave de cuenta de servicio:

1. Firebase Console → Configuración del proyecto → Cuentas de servicio →
   **Generar nueva clave privada**.
2. Guardar el JSON como `C:\Users\<usuario>\.manager3d\service-account.json`
   (fuera del repo; **nunca** se sube). Otra opción es definir
   `GOOGLE_APPLICATION_CREDENTIALS` con la ruta.
3. Tener instaladas las dependencias de `functions/` (`npm install` ahí).

Esa clave da acceso total al proyecto: guardarla sólo en esta máquina y, si
se filtra, borrarla desde la misma pantalla de Firebase.

## Conector de impresión

Programa aparte (carpeta `conector/`, ver su `README.md`) que corre en una PC del
taller. No se despliega con la web: `npm --prefix conector run empaquetar` arma
`conector/dist/Manager3D-Conector.zip` (un único .exe, sin instalar Node, más un
LEEME, ~34 MB) y `node scripts/subir-conector.mjs` lo sube a Storage
(`conector/Manager3D-Conector.zip`, lo lee cualquier usuario logueado según
`storage.rules`). Los suscriptores lo bajan con el botón "Descargar el conector"
de Configuración → Impresión directa; **hay que volver a subirlo cada vez que
cambia el conector**. El .exe no está firmado: Windows puede mostrar el aviso de
SmartScreen la primera vez. En redes de empresa que revisan el tráfico (certificado
propio) el conector usa los certificados que Windows ya tiene instalados; si igual
dice "fetch failed", el panel muestra la causa (por ejemplo SELF_SIGNED_CERT_IN_CHAIN). Habla con
las funciones `crearCodigoConector`, `vincularConector` y `onConectorBorrado`, así
que esas funciones y las reglas de Firestore y Storage tienen que estar
desplegadas. Los usuarios técnicos que crea (email `…@conectores.manager3d.invalid`)
se ven en Firebase Authentication y se borran solos al desvincular.

## Qué revisar si...

**La app muestra "No pudimos cargar tus datos".**
Falló la lectura inicial de `users/{uid}/meta/config`. La pantalla muestra abajo el
**Detalle técnico** (también queda en la consola del navegador y en el log de soporte):
- `unavailable`, `failed-precondition` o "client is offline": **red o navegador** (sin
  internet, proxy o firewall de empresa, antivirus; probar Ctrl+F5, otra ventana o
  otro navegador). Con Reintentar suele volver sola.
- `permission-denied`: **reglas de Firestore**; comparar lo publicado con
  `firestore.rules` y revisar el estado de la suscripción de esa cuenta.

**Una subida de imágenes o del logo falla con "storage/unauthorized".**
Revisá `storage.rules` con `node scripts/probar-reglas-storage.cjs`, que evalúa casos
reales sin publicar nada. `firebase deploy` sólo valida que las reglas compilen: una
función que no existe para ese tipo (por ejemplo `.matches()` sobre una ruta) compila
y después rechaza todo (pasó el 4/10, TKT-0004). Correr el script **antes de publicar**
cualquier cambio de reglas de Storage.

**Un botón "no hace nada" (generar PDF, recorrido, exportar Excel) después de un deploy.**
La pestaña quedó abierta con la versión anterior: lo que se descarga al usarlo
tiene otro nombre en la nueva y Vercel devuelve la página principal en su
lugar. La app muestra un cartel "Hay una versión nueva… Recargar"
(`src/utils/avisoVersionNueva.js`); si no aparece, recargar con Ctrl+F5.

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

**Un suscriptor no puede verificar la facturación.**
El mensaje de "Mi emprendimiento" → pestaña "Facturación ARCA" dice qué falta. Lo más común:
no delegó "Facturación Electrónica" al CUIT 20262375065, o el punto de venta
no es del tipo Web Services. La delegación puede tardar unos minutos.

**"Ese CUIT ya está configurado en otra cuenta".**
Firestore → `cuitsFacturacion/{cuit}` dice qué cuenta lo tiene (`uid`).
Verificá quién es el dueño real del CUIT; si corresponde, borrá ese doc a
mano y que el suscriptor vuelva a tocar "Guardar y verificar".

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
- **Habilitar la facturación de pedidos a un plan:** panel Admin → Planes →
  editar → tildar "Facturación electrónica".
- **Facturar a revendedores:** después del día 1, en panel Admin → revendedor
  → historial: descargar el PDF del mes y marcarlo como "Facturado".

## Entornos: producción y prueba

Hay dos proyectos de Firebase con la misma estructura (alias en `.firebaserc`): **prod** = `print3d-manager-73846` (datos reales) y **test** = `manager3d-test` (para desarrollar y probar).

- **Qué usa cada uno:** `npm run dev` (localhost) usa **test** (para mirar prod desde localhost: `VITE_ENTORNO=prod` en `.env.local`, con cuidado). Vercel: `main` usa **prod**; `develop` y los previews usan **test** si en Vercel está la variable `VITE_ENTORNO=test` con alcance *Preview*. En la app con test aparece la etiqueta **PRUEBA** junto a la versión. La función `api/catalogo-meta.js` elige sola según `VERCEL_ENV`.
- **Flujo de cambios en reglas, índices o functions:** primero a test (`firebase deploy --only firestore,storage,functions --project test`), probar, y recién después a prod (`--project prod`). Firestore no tiene esquema: el formato de los datos es lo que escribe el código, así que test y prod quedan iguales mientras se desplieguen los mismos reglas, índices y functions.
- **Servicios externos en test:** los secretos (`ARCA_CERT`, `ARCA_KEY`, `GMAIL_APP_PASSWORD`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`) valen "desactivado-en-prueba": ni cobra, ni factura, ni manda mails. Para probar uno de esos flujos hay que cargar credenciales de prueba (Mercado Pago de prueba, ARCA homologación, una casilla propia) con `firebase functions:secrets:set NOMBRE --project test`. `functions/.env.manager3d-test` (no se versiona) tiene `MP_PAYER_EMAIL_PRUEBA`.
- **Datos de prueba:** `node scripts/copiar-config-a-prueba.cjs` copia de prod a test sólo la configuración (planes, FAQ, monotributo); nunca datos de clientes. Las cuentas de prueba se crean entrando a la versión de test. Para precargar los datos de una cuenta real: entrar a test con ese email y correr `node scripts/clonar-cuenta-a-prueba.cjs <email>` (copia clientes, pedidos, compras, inventario, biblioteca y perfil; no copia facturas, suscripción, conectores ni G-code). Los admins se copian con `node scripts/copiar-config-a-prueba.cjs admins`.
- **Conector de impresión de prueba:** `npm --prefix conector run empaquetar -- --test` arma `conector/dist/Manager3D-Conector-PRUEBA.zip` (se conecta a `manager3d-test`, título "(PRUEBA)", guarda su vínculo en `%APPDATA%Manager3D-Conector-PRUEBA`, así puede convivir con el de producción en la misma PC) y `node scripts/subir-conector.mjs test` lo sube al Storage de prueba: se baja desde Configuración → Impresión directa en la app de prueba. Sin `--test` el conector es el de producción. La config de cada entorno está en `conector/src/entorno.js`. Para llevar a prueba los G-code de una cuenta: `node scripts/copiar-gcode-a-prueba.cjs <email>` (después de clonar la cuenta).
