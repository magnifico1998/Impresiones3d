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

## Compras, inventario y clientes
- [ ] Nueva compra (filamento y otro insumo); el inventario suma; consumo de un pedido descuenta.
- [ ] Importar inventario desde CSV; ordenar columnas; exportar a Excel lo que está bajo mínimo.
- [ ] Clientes: alta, edición, detalle con sus pedidos.

## Catálogo web
- [ ] Marca del catálogo (logo, tamaños, texto destacado), publicar productos, ver el catálogo público en una ventana de incógnito.
- [ ] En el público: armar un pedido, enviarlo; llega a "Catálogo web" del panel; botón "Volver al catálogo".

## Mi emprendimiento y configuración
- [ ] Subir un logo rectangular; elegir el tamaño del logo en los PDF; datos bancarios en el PDF.
- [ ] Configuración: costos, impresoras, kWh, mano de obra (los campos de plata formateados).
- [ ] Capacidad de producción.

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
