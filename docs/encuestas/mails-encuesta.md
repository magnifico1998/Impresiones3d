# Mails de las encuestas

Se mandan desde Administrador → Negocio → Boletín de novedades: pegá cada
cuerpo en "Editar contenido" (modo HTML), mandate una **prueba** y recién
después enviá. Reemplazá `LINK_DE_LA_ENCUESTA` por el link publicado de cada
formulario (el que sale del script `crear-encuestas.gs`).

`{{saludo}}` lo completa el sistema ("Hola Juana," o "Hola,").

## Grupo A: se registraron y no eligieron plan

**Destinatarios en el panel:** estados "En prueba", "Modo lectura" y
"Bloqueadas" + plan "Sin plan".

**Asunto:** ¿Qué pasó con Manager3D? Te pedimos 2 minutos

**Cuerpo (HTML):**

```html
<h2 style="font-size: 20px; margin: 0 0 12px;">Nos gustaría saber cómo te fue</h2>
<p>{{saludo}}</p>
<p>Hace un tiempo te registraste en Manager3D para ordenar tu emprendimiento de impresión 3D, pero todavía no elegiste un plan. Está perfecto, y no te escribo para venderte nada.</p>
<p>Estamos mejorando la app y lo que más nos sirve es entender qué te faltó, qué no quedó claro o qué te frenó. Son <strong>5 preguntas, menos de 2 minutos</strong>, y se responden desde el celular.</p>
<p style="margin: 22px 0;"><a href="LINK_DE_LA_ENCUESTA" style="background: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: bold;">Contanos cómo te fue</a></p>
<p>Leemos cada respuesta. Si querés que te contactemos para ayudarte a arrancar, dejá tu mail o WhatsApp al final de la encuesta.</p>
<p>Gracias por darle una oportunidad a Manager3D.</p>
```

**Variante corta** (para un segundo recordatorio, a los 5 o 7 días, a quienes
no respondieron; hoy el panel no distingue quién respondió, así que
conviene sumar a los que ya contestaron en "Bajas" antes de reenviar):

> Te escribí hace unos días por una encuesta de 2 minutos sobre Manager3D.
> Si todavía querés contarnos qué te frenó, acá está: LINK_DE_LA_ENCUESTA.
> Gracias.

## Grupo B: usaron Boceto y dejaron de usarlo

**Destinatarios en el panel:** estado "Modo lectura" + plan "Boceto" (el
plan gratuito). Si querés incluir a quienes siguen activos pero hace mucho
no entran, sumá "Activas" + "Boceto" en otro envío.

**Asunto:** Usaste Manager3D y dejaste de entrar: ¿qué pasó?

**Cuerpo (HTML):**

```html
<h2 style="font-size: 20px; margin: 0 0 12px;">Queremos entender qué pasó</h2>
<p>{{saludo}}</p>
<p>Usaste Manager3D con el plan gratuito (Boceto) y hace un tiempo que no entrás. Si dejaste de usarlo, nos interesa saber por qué: puede ser que algo no funcionara como esperabas, que el plan se te quedara corto o simplemente que ya no lo necesitaras.</p>
<p>Son <strong>5 preguntas, menos de 2 minutos</strong>. Tu respuesta nos ayuda a decidir qué mejorar primero.</p>
<p style="margin: 22px 0;"><a href="LINK_DE_LA_ENCUESTA" style="background: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: bold;">Responder la encuesta</a></p>
<p>Tu cuenta sigue ahí: cuando quieras volver a entrar, tus pedidos y productos están como los dejaste.</p>
<p>Gracias por tu tiempo.</p>
```

## Antes de enviar

- Cambiá el color del botón por el de tu marca, si querés.
- Los links son distintos para cada grupo: así sabés de quién es cada respuesta.
- Mandá primero la prueba y abrila en el celular.
- Las respuestas al mail le llegan al mail del admin; quien pida baja, cargalo en "Bajas".
- Si los dos grupos suman más de 400 cuentas, el envío queda pausado y se reanuda al día siguiente.
