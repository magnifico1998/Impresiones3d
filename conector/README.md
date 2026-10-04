# Manager3D Conector

Programa que corre en una PC del taller (la que está en la misma red que las
impresoras) y manda a las impresoras los archivos que se eligen en
**Manager3D → Biblioteca → 📄 → 🖨 Mandar**.

No abre ningún puerto a internet: es el conector el que llama a Manager3D, toma
los trabajos de la cola de la cuenta y los manda a la impresora por la red
local. Las IP y los códigos de acceso de las impresoras se guardan **sólo en
esta PC** (`%APPDATA%\Manager3D-Conector\config.json`).

## Instalar y usar

**Para entregarlo a un usuario:** `npm run empaquetar` arma
`dist/Manager3D-Conector.zip` con un único `.exe` (no hace falta instalar nada) y
un LEEME, y `node ../scripts/subir-conector.mjs` lo sube a Firebase Storage para
que los suscriptores lo bajen desde Manager3D (Configuración → Impresión directa). Los pasos de abajo son los mismos con el `.exe`.

1. Con el código fuente: instalar [Node.js](https://nodejs.org) 22 o más nuevo.
2. Abrir `Iniciar-Conector.bat` (la primera vez instala lo que necesita) o el
   `.exe`. Se abre el panel en <http://127.0.0.1:18930>.
3. En Manager3D: **Configuración → Impresión directa → Vincular un conector**.
   Muestra un código de 8 caracteres (vale 10 minutos). Escribirlo en el panel.
4. En el panel, agregar cada impresora y tocar **Probar**.
5. En la Biblioteca, 📄 del producto → **🖨 Mandar** → elegir la impresora.
   - *Solo subir*: el archivo queda en la impresora y se elige en su pantalla.
   - *Subir e imprimir*: pide confirmar que la cama está libre.

El conector tiene que estar abierto para que lleguen los trabajos (si está
apagado, quedan en cola y se mandan cuando se abre).

## Impresoras

| Tipo | Qué hace | Requisitos |
|---|---|---|
| **Anycubic Kobra 3 / 3 V2 / S1** (modo LAN) | Sube el `.gcode` por HTTP y arranca la impresión por MQTT (con TLS). Con ACE, cada color va al lugar del mismo orden. | Firmware original, impresora en **modo LAN** (Ajustes → Red). IP de la pantalla. |
| **Abrir en Bambu Studio / Orca** | Guarda el archivo y lo abre en el programa que tenga la PC para los `.3mf`; se manda a la impresora desde ahí, como siempre. | Bambu Studio u Orca instalado y como programa predeterminado de los `.3mf`. No necesita Bambu Connect ni el modo LAN. |
| **Bambu Lab por Bambu Connect** | Abre el `.3mf` en Bambu Connect para elegir impresora y confirmar. La impresora sigue con la nube y Bambu Handy. | [Bambu Connect](https://wiki.bambulab.com/en/software/third-party-integration) instalado en la PC. |
| **Bambu Lab modo LAN** (experimental) | Sube el `.3mf` por FTPS y arranca por MQTT. | Impresora en **LAN Only + Developer Mode** (deja de usar la nube y Bambu Handy). IP, código de acceso y número de serie de la pantalla. |

Para agregar otra marca: un archivo en `src/drivers/` con `probar` y `enviar`,
y sumarlo en `src/drivers/index.js`.

## Seguridad

- Se vincula con un código de un solo uso. Manager3D le crea al conector un
  usuario técnico que sólo puede leer los archivos G-code y la cola de trabajos
  de esa cuenta, y avanzar el estado de sus propios trabajos. Desvincularlo
  desde Manager3D borra ese usuario.
- El panel local sólo escucha en `127.0.0.1` y rechaza pedidos de otras páginas.
- Arrancar una impresión siempre pide confirmación en la app.

## Pruebas

`node pruebas/anycubic-simulada.mjs`: una impresora Anycubic simulada que
valida el apretón de manos cifrado y la subida.
