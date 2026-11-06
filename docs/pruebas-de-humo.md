# Pruebas de humo antes de un pase a producción

Se hacen en `https://manager3dtest.vercel.app` (base de prueba, con tu cuenta clonada), nunca en producción.
Si hace falta ordenar los datos de prueba: `node scripts/clonar-cuenta-a-prueba.cjs <email>` y
`node scripts/copiar-gcode-a-prueba.cjs <email>`.

Primero lo automático (si falla, no seguir):

```powershell
npm run verificar-pase -- --con-reglas
```

Después, esta lista a mano. Tildá cada línea; si algo falla, anotá qué pasó y en qué pantalla.
(También se puede correr con la skill `/qa` de gstack sobre la URL de prueba: recorre los flujos y detecta errores
de consola; el inicio de sesión con Google lo hacés vos.)

## Ingreso y sesión
- [ ] Entrar con Google; el encabezado muestra la etiqueta **PRUEBA** y la versión nueva.
- [ ] Recargar con Ctrl + Shift + R: vuelve a entrar sin pedir nada raro.
- [ ] Cerrar sesión y volver a entrar.
- [ ] Modal de **Novedades** al entrar (si la versión tiene entrada) y se vuelve a abrir tocando la versión.

## Pedidos
- [ ] Crear un pedido nuevo (cliente nuevo y cliente existente).
- [ ] Agregar productos a un pedido existente desde la Biblioteca → en el detalle, **Cerrar** los quita; repetir y **Guardar cambios** los deja.
- [ ] Cambiar el estado (pendiente → progreso → listo → enviado → completado) y cancelar: sin pantalla en blanco; el modal de **consumo de inventario** abre y se puede confirmar o "Ahora no".
- [ ] Descuento en monto y en porcentaje; envío; monto abonado con fecha: los totales y el saldo cierran.
- [ ] Los campos de plata se ven como `$ 15.000` al salir del campo y se editan normales.
- [ ] PDF del pedido: con un logo **rectangular** sale sin deformar; probar los 4 tamaños de logo.
- [ ] 🖨 Enviar de una pieza con más de un G-code: aparecen **todos**, se marca el que ya se envió, "Mandar de nuevo" pide confirmación.
- [ ] Facturar un pedido (modal abre y cierra bien; no emitir en prueba).

## Presupuestos
- [ ] Nuevo presupuesto con productos de la Biblioteca y con línea libre; guardar, editar, marcar enviado.
- [ ] **Imágenes adjuntas**: agregar 1, 3 y 5 imágenes con comentario; PDF con 1, 2 y 4 por hoja; quitar una; reordenar.
- [ ] "Sólo PDF" no sube nada; "Guardar y generar PDF" sí.
- [ ] Aprobar convierte en pedido; rechazar; eliminar (borra también las imágenes).

## Biblioteca y Calculadora
- [ ] Editar un producto (nombre, precio, imágenes); ajustar precios masivo; recalcular.
- [ ] Subir un G-code a un producto; ver el cupo del plan; mandarlo a una impresora (ver Conector).
- [ ] Calculadora: cargar un G-code, calcular, **Guardar en la Biblioteca**, **Agregar pieza a pedido** (Cerrar deshace, Guardar deja), generar presupuesto.
- [ ] **Cargar productos desde ZIP:** bajar la plantilla, armar un ZIP con 2 productos (uno con 2 colores y fotos), ver la vista previa, importar; revisar stock por color, fotos y precio. Probar un color inexistente, un producto repetido y una foto que falte (se rechazan en la vista previa) y **Cancelar** (no sube nada).

## Compras, inventario y clientes
- [ ] Nueva compra (filamento y otro insumo); el inventario suma; consumo de un pedido descuenta.
- [ ] Importar inventario desde CSV; ordenar columnas; exportar a Excel lo que está bajo mínimo.
- [ ] Clientes: alta, edición, detalle con sus pedidos.

## Catálogo web
- [ ] Catálogo web con sus dos pestañas (**Productos y pedidos** y **Apariencia**): cambiar de una a otra y volver a entrar (recuerda la última). Marca del catálogo (logo, tamaños, texto destacado), publicar productos, ver el catálogo público en una ventana de incógnito.
- [ ] Desactivar el catálogo: el link muestra logo, nombre y mensaje de mantenimiento; cambiar el mensaje en Apariencia → "Mensaje del catálogo desactivado" y comprobarlo.
- [ ] En el público: armar un pedido, enviarlo; llega a "Catálogo web" del panel; botón "Volver al catálogo".

## Mi emprendimiento y configuración
- [ ] Subir un logo rectangular; elegir el tamaño del logo en los PDF; datos bancarios en el PDF.
- [ ] Configuración: costos, impresoras, kWh, mano de obra (los campos de plata formateados).
- [ ] Capacidad de producción.

## Separar por colores
- [ ] Cargar un STL y un 3MF de Bambu Studio; girar y "Elegir cara de apoyo".
- [ ] Varita (con y sin "frenar sólo en los valles"), Ctrl+clic para sumar, pincel y borrar; "Afinar malla".
- [ ] Revisar el corte con cierre plano y perno: dice que son sólidos cerrados; aplicar; deshacer y rehacer.
- [ ] Exportar el 3MF a color y abrirlo en el slicer (una parte por color); bajar el ZIP en posición "para imprimir".
- [ ] Con una cuenta cuyo plan no tiene "Herramientas de modelado", la sección ofrece "Ver planes".

## Jarros porta-lata
- [ ] Herramientas → Jarros porta-lata: arranca con la lata de 500 ml (hueco 70,5 × 170); elegir otra lata y escribir un diámetro y alto propios (pasa a "Medida propia").
- [ ] Vista: Liso, Colores, Alambre, Transparente; "Con lata" muestra la lata translúcida adentro; "Despiece" separa el asa (y levanta la lata).
- [ ] **Silueta:** probar las siete formas de la lista y arrastrar puntos en el editor (agregar y quitar uno); la pared nunca queda más fina que la pedida; con "Más ancho arriba" extremo avisa que la pared se abre más de 45°. **Abertura en el fondo:** poner 30 mm y ver el agujero desde abajo (vista Transparente o Alambre).
- [ ] **Asa a tu gusto:** elegir cada forma de la lista; arrastrar puntos, doble clic para una esquina viva, agregar y quitar; ver en rojo los tramos que necesitan soportes y que "Sin soportes" muestra el ✓. Probar "Más gruesa en los extremos" y el **giro** (por ejemplo 90°) con el asa pegada y desmontable.
- [ ] **Tarjetas plegables:** en cada herramienta (Llaveros, Imagen a llavero, Separar por colores, Superficies y Jarros) todas las tarjetas arrancan cerradas; abrir y cerrar una no pierde lo escrito ni el modelo cargado, y en Jarros las cerradas muestran su resumen.
- [ ] **Cartel de varios renglones:** escribir 2 o 3 renglones con Enter y probar las cinco alineaciones (izquierda, centrada, derecha y las dos de ambos márgenes, también con una palabra sola); cambiar la separación entre renglones. **Arrastrar el cartel** agarrándolo en la vista 3D: tiene que seguir el puntero y, al soltar, actualizar la altura y el giro (y volver con Deshacer); la cámara no debe girar mientras se arrastra.
- [ ] **Cartel con el nombre:** activar "Con cartel con el nombre", escribir un nombre, probar varias tipografías y una propia; recorrer las seis formas, "Ajustado" y "Medida propia", y mover la altura y el giro. Probar arco, onda, borde y 2 o 4 remaches, y ver que el cartel siga la curva del jarro (también con la silueta de barril). Cambiar los colores de las partes.
- [ ] Cartel **desmontable**: el cuerpo muestra la cavidad (vista Despiece o Transparente) y el cartel sale aparte; bajar la **placa de impresión** y el **ZIP por piezas**, abrir la placa en el slicer (el cartel como un objeto con varias partes de color) y **hacer una impresión de prueba del cartel y del cuerpo** para ver que encaja con la holgura de 0,3 mm. Probar también "pegado".
- [ ] **Emblemas:** activar "Con emblema", probar los siete símbolos y los cinco respaldos (también "Sin respaldo"), poner 2, 3 y 4 emblemas y ver que se reparten parejo; cambiar altura y giro, relieve y borde; si se pisa con el cartel o el asa tiene que aparecer el aviso. Desmontable: ver la cavidad en el cuerpo (vista Despiece o Transparente) y bajar la placa y el ZIP por piezas.
- [ ] **Repetir el cartel:** poner 2, 3 y 4 carteles iguales y ver que se reparten parejo; agarrar uno en la vista 3D y arrastrarlo: se mueven todos juntos; con el asa desmontable o pegada, ver el aviso si uno cae sobre ella; bajar la placa y el ZIP (una pieza por cartel).
- [ ] **Estilos y diseños:** probar cada estilo (Cervecero, Vikingo, Navideño, Rústico, Carbono, Panal, Minimalista): arma el jarro completo, no cambia la lata ni la impresora, y "Deshacer" vuelve atrás. "Mis diseños guardados": guardar con nombre (se ve la miniatura), recargar la página y abrirlo; guardar otro con el mismo nombre pide confirmar el reemplazo; borrar pide confirmar. Con una cuenta de equipo, el miembro ve y abre los diseños del dueño; en modo lectura no deja guardar. "Descargar este diseño" y "Abrir un diseño compartido" (en otra cuenta o navegador, también con un SVG o símbolo propio en el emblema); un archivo cualquiera (.json que no sea un diseño) muestra el aviso y no cambia nada.
- [ ] **Impresión y costos:** abrir la tarjeta con un jarro de varios colores: ver el material por color, el tiempo y el costo; cambiar filamento, impresora, relleno y horas de trabajo y ver que los números cambien y coincidan con lo que da la Calculadora para esos gramos y horas. "Guardar en la Biblioteca": se arma el modelo final (unos segundos con textura), se abre el modal con la foto del modelo y los costos, guardar y verificar en Biblioteca el producto (imagen principal, costos, materiales por color) y en 📄 el 3MF; con un plan sin cupo de G-code no se sube el archivo pero el producto se guarda.
- [ ] **Botones de archivo:** en Jarros (tipografía propia y SVG), Llaveros (tipografía propia) y las zonas de soltar de las otras herramientas, ver el botón y que abra el selector de archivos.
- [ ] **Símbolo y placas del asa:** con asa, activar "Símbolo sobre el asa" (probar con un símbolo de lista, un SVG y uno de la biblioteca; con y sin respaldo; moverlo con la posición) y "Placas de montaje decorativas" (las cuatro formas; con asa pegada y desmontable: el rosetón tiene que apoyar contra la pared o la placa y el asa pasar por el agujero sin tocarlo). Bajar la placa de impresión: el símbolo sale plano y los rosetones acostados.
- [ ] **Complementos del asa:** con asa, activar "Envoltura del agarre" y probar los cuatro estilos, largo, posición y espesor (con la curva "Angular" y la "En D"); "Collarines en las dos puntas" y "junto a la pared"; "Descanso para el pulgar" (posición, altura, cuánto abraza). Girar el asa alrededor del jarro: todo gira con ella. Con asa pegada y desmontable: bajar la placa y el ZIP, y en el slicer ver cada complemento acostado (envoltura y collarines en dos mitades). **Impresión de prueba de una envoltura** para ver si las dos mitades abrazan el asa con la holgura de 0,3 mm y si la cuerda se lee bien.
- [ ] **Textura del cuerpo:** probar "Duelas de madera" (cantidad, ancho y profundidad de la ranura, irregularidad, veta, "Otra variante") y varias texturas del catálogo (madera, carbono, geométricas) con distintas siluetas (barril, cono); ver que el borde de arriba y de abajo quede liso y el hueco de la lata intacto. Con cartel, emblema y aros: tienen que seguir apoyando en la pared. Bajar el 3MF y la placa: tarda unos segundos (arma el modelo final), el archivo abre en el slicer sin errores y no pasa de unos 600 mil triángulos en el cuerpo. **Impresión de prueba** de las duelas para ver que la ranura y la veta se vean a la altura de capa elegida.
- [ ] **Editor con simetrías y biblioteca:** en Emblemas, "Dibujar un símbolo con simetría": probar Espejo (dibujar el lado derecho; el izquierdo sale solo), Giratoria con 3, 6 y 12 repeticiones y Giratoria con espejo; agregar, arrastrar y borrar (doble clic) puntos; mover el suavizado. "Usar en el emblema" lo pone en el 3D. Guardarlo con nombre, recargar la página y verlo en "Mis símbolos guardados"; usarlo en otro jarro, borrarlo (pide confirmar), subir un SVG y guardarlo. Con una cuenta de equipo, que el miembro vea y use la biblioteca del dueño; en modo lectura no deja guardar.
- [ ] **SVG propio:** en Emblemas, subir un SVG con formas rellenas (un logo simple, con un hueco como una "O"): el botón "Mi SVG" queda elegido, el dibujo no sale espejado ni al revés y mantiene su proporción; subir uno de líneas sin relleno, un .png y uno de más de 300 KB: cada uno muestra su mensaje y no cambia el emblema. Probar con y sin respaldo.
- [ ] **Aros:** activar "Aro arriba" y "Aro abajo", probar remaches (6 a 24), cambiar alto, relieve y distancias, y con silueta de barril o cono ver que el aro sigue la pared. "Desmontables": ranura en el cuerpo y aviso si la silueta se ensancha. **Impresión de prueba** de un aro y de un emblema desmontables para confirmar que calzan con la holgura de 0,3 mm.
- [ ] Con el asa desmontable y una silueta de barril o cono, bajar la **placa de impresión** y abrirla en el slicer: el cuerpo no debe mostrar errores de malla ni "aristas abiertas".
- [ ] Asa pegada: aviso de soportes. Activar "Asa desmontable": aparecen las placas y las espigas; bajar el **3MF a color**, el **ZIP por piezas** y la **placa de impresión** y abrirlos en el slicer (el asa acostada).
- [ ] **Impresión de prueba del encastre** (cuerpo y asa suelta): confirmar que la espiga entra con la holgura de 0,3 mm; si queda dura o floja, ajustar "Holgura del encastre".
- [ ] Con una cuenta cuyo plan no tiene "Herramientas de modelado", la pestaña ofrece "Ver planes".

## Conector de impresión (en test)
- [ ] Bajar el conector desde Configuración → Impresión directa (versión PRUEBA), vincular con el código, cargar "Guardar en carpeta".
- [ ] Mandar un G-code desde un pedido y desde la Biblioteca; queda en la carpeta; el envío aparece en la lista.

## Soporte, admin y otros
- [ ] Crear un ticket de soporte con "Grabar el problema".
- [ ] Admin: ver suscriptores, planes, **Aviso de actualización** (publicar, ver el cartel en otra pestaña, quitar).
- [ ] Admin: boletín (sólo "mandar prueba", no enviar).

## Transversales
- [ ] Modales: un clic afuera NO cierra (formularios); **Esc** cierra y, con cambios sin guardar, pide confirmar.
- [ ] Números: separador de miles y coma decimal en gramos, horas y porcentajes.
- [ ] App instalable (Chrome o Edge): botón "Instalar app", abre en su ventana.
- [ ] Cartel de **versión nueva**: con la pestaña abierta, publicar otro deploy y comprobar que avisa.
- [ ] Consola del navegador (F12) sin errores en rojo al recorrer las pantallas principales.
- [ ] En el celular: entrar, ver pedidos, abrir el catálogo.

## Rechazar el pase si…
Falla cualquier casilla de **Ingreso, Pedidos, Presupuestos o Catálogo**, aparece una pantalla en blanco, un guardado
que no se ve, o un total que no cierra. Lo demás se evalúa caso por caso.
