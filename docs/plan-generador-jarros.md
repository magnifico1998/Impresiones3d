# Plan: generador de jarros (herramienta nueva en Herramientas)

Estado (2026-11-05): **Fases 0, 1 y 2 hechas, y la Fase 3 empezada (emblemas con símbolos de lista y aros)** (pestaña "Jarros porta-lata" de Herramientas): esqueleto, lata y hueco,
silueta editable del cuerpo, abertura del fondo, asa de curva libre con aviso de soportes (pegada o desmontable con
encastre) y **cartel con el nombre** (seis formas, tipografías, arco, onda, borde, remaches, curvado sobre el jarro,
desmontable con cavidad o pegado). Falta la **impresión de prueba** del encastre del asa, de la lata y del cartel para
ajustar las holguras. El cartel ya se **arrastra sobre el 3D**, admite **varios renglones con alineación** (izquierda, centro, derecha y
ambos márgenes) y todas las tarjetas de las herramientas son plegables. El cartel se puede **repetir** (1 a 4 copias iguales repartidas alrededor). De la **Fase 3** ya están los **emblemas** (siete símbolos de lista sobre un respaldo, de 1 a 4 repartidos
alrededor, desmontables con cavidad o pegados) y los **aros** decorativos arriba y abajo con remaches. También se puede **subir un SVG propio** como símbolo del emblema. También están la **biblioteca de símbolos por cuenta** (Firestore) y el **editor con simetrías**. Con eso la Fase 3 queda completa.
Decisiones tomadas con Gustavo: va como
**una pestaña nueva en Herramientas**, con el **mismo esquema de plantillas, camas y permiso de plan** que las otras
herramientas; se arranca por una primera versión chica y se va ampliando por fases. Este documento es el recorrido
completo para retomarlo en cualquier sesión.

## 1. Qué es

Una herramienta que genera, a partir de parámetros, un **jarro porta-lata** completo: el cuerpo que aloja una lata de
medida estándar, el asa, los textos, los escudos y los detalles. Se ve en 3D en vivo y se exporta para imprimir.

**Requisito central de Gustavo: las piezas que no dan la vuelta completa al jarro son desmontables.** El diseño genera
el modelo completo (para verlo armado), pero logos, carteles con el nombre, remaches, detalles de agarre del asa, anillos
y similares salen como **piezas aparte, para imprimirlas por separado** y pegarlas o encastrarlas después.

## 2. Qué muestran las referencias

Son las capturas del generador de un tercero (MakerWorld, financiación colectiva). **Sirven para saber qué funciones
queremos; no se copia su código, sus formas ni sus íconos**: todo lo nuestro se diseña y se dibuja de cero (ver sección 8).

| Pestaña de la referencia | Qué hace | Fase |
|---|---|---|
| **Lata** | Presets de medida (222, 250, 330, 355, 440, 473, 500, 568, 710 y 946 ml con diámetro y alto) y deslizadores de diámetro y alto; cómo encaja la lata; abertura del fondo | 1 |
| **Forma** | Silueta del cuerpo | 1 |
| **Cuerpo** | Material y textura: duelas de madera (cantidad, irregularidad, separaciones, veta, desgaste), metal martillado, escamas, soga, tejido, cuero, adoquín, corteza, lino, acolchado, felpa, tachas, bambú, mimbre, ladrillo, rombos, hielo, conchas…, con tamaño del relieve y profundidad | 4 |
| **Bandas** | Aros decorativos arriba y abajo, con remaches | 3 |
| **Asa** | Forma (clásica, D, oreja, bucle alto, sin soportes, angular) con **editor de curva arrastrando puntos**, ancho, grosor, de redonda a cuadrada, más gruesa en los extremos, giro alrededor del jarro, placas de montaje y **aviso automático si necesita soportes** (ángulo de 40°). Complementos: envolturas (cuero, cuerda gruesa, cintas), anillos metálicos, collarines, símbolo en el asa, descanso para el pulgar | 1 (forma) y 5 (complementos) |
| **Nombre** | Texto con letras y estilo, **cartel** con decenas de formas (cinta, pergamino, hexágono, escudo…), tamaño “ajustado a las letras” o propio, espacio alrededor, grosor, bisel, superficie del cartel, **arco y ondulación** para que siga la curva del jarro, borde, remaches, repetir, contorno tipo sticker, y arrastrar, girar y escalar sobre el jarro | 2 |
| **Emblema** | Símbolo con respaldo (escudo, hexágono, corazón, etc.), tamaño propio o ajustado, espesor y bisel, borde, repetición, **editor “dibujá una forma”** con simetrías (espejo, giros ×2 a ×8) y **SVG propio** | 3 |
| **Extras** | Complementos varios | 3 |
| **Colores** | Colores por pieza (la pieza elegida se marca) y colores nuevos | 6 |
| **Imprimir / Biblioteca** | Exportar a 3MF para Prusa y Bambu; guardar y reabrir diseños | 6 y 7 |
| **Barra de vista** | Liso, con colores, alambre, transparente, con la lata adentro y **vista despiece** | 0 |

## 3. Cómo se modela: todo es una lista de piezas

Es lo que hace posible el requisito de las piezas desmontables, por eso se define **desde el primer día**:

- El diseño es una **lista de piezas** (cuerpo, asa, cartel, escudo, banda superior, remaches…). Cada una tiene su malla,
  su color, su nombre y una marca **`desmontable`**.
- **Cómo se fija** cada pieza desmontable (se decide con pruebas de impresión, ver sección 7): una **cavidad en el
  cuerpo** donde apoya la pieza para pegarla, o una **espiga y su agujero** con tolerancia, o un encastre. El cuerpo
  trae la cavidad y la pieza trae el ajuste; los dos salen del mismo parámetro, así no se desfasan.
- **Orientación de impresión por pieza**: cada pieza suelta se apoya sobre su cara plana (los carteles y escudos, de
  espaldas; las bandas, acostadas) para que se imprima sin soportes.
- **Vista armada y vista despiece**, con un interruptor “desmontable” por pieza.
- **Exportación**: un solo 3MF con todo el modelo armado, o **cada pieza suelta** (STL individual) y una **placa de
  impresión** con las piezas sueltas acomodadas en la cama.

## 4. Qué ya existe en Manager3D y se reutiliza

La sección Herramientas ya tiene muchas de las piezas difíciles, así que **no se empieza de cero**:

- **Texto a geometría** con fuentes (`opentype.js`) y **operaciones de polígonos** (`clipper-lib`): `src/utils/llaveros.js`.
- **Operaciones booleanas de mallas** (`three-bvh-csg`), **extrusión y soldado de mallas** (`mallas3d.js`).
- **Visor 3D con vista despiece y selección** (`VisorPiezas.jsx`).
- **Texturas de superficie con relieve real**, vista previa en la GPU y trabajador en segundo plano (`superficie.js`,
  `texturasSuperficie.js`, `shaderSuperficie.js`): es la base de la fase 4.
- **3MF de Bambu Studio con una pieza por color y el filamento ya asignado** (`bambu3mf.js`; hoy sólo con la plantilla
  de una **A1**).
- **Permiso por plan** (`herramientasStl`, `utils/accesoHerramientas.js`) y la lista de pestañas de `HerramientasPage.jsx`.
- **Geometría que se prueba en Node** (los módulos no tocan el navegador), con pruebas en `pruebas/` como las de llaveros.
- **Archivos 3MF en la Biblioteca** (los productos ya aceptan archivos `.3mf`).

## 5. Fases

Cada fase termina con algo que se usa y se **imprime de prueba** antes de seguir.

**Fase 0 — Esqueleto.** Pestaña “Jarros” en Herramientas con el permiso del plan. El modelo de piezas (sección 3), el visor
con barra de vista (liso, colores, alambre, transparente, con lata, despiece) y la exportación por pieza y en conjunto.

**Fase 1 — Jarro base (primera versión).** Presets de lata y medidas propias; cuerpo por revolución con **silueta
editable**; espesor de pared, fondo y abertura; **tolerancia del ajuste de la lata**; **asa** con editor de curva,
parámetros de sección y **aviso de soportes**; el cuerpo y el asa como piezas (asa pegada o separada, a elegir). Pruebas:
medidas y estanqueidad de la malla, que la lata entre con la tolerancia elegida, que entre en la cama.
*Entregable imprimible: un jarro liso con asa, más un anillo de prueba para calibrar el ajuste.*

**Fase 2 — Nombre y cartel (primera pieza desmontable).** Texto con fuentes, carteles de varias formas, ajuste a las
letras, grosor y bisel, **curvatura del jarro (arco y ondulación)**, posición arrastrando, borde y remaches. El cartel
sale como **pieza aparte con su cavidad en el cuerpo**. Acá se valida el concepto de pieza desmontable de punta a punta.
*Entregable: jarro con cartel encastrado y el cartel impreso por separado.*

**Fase 3 — Emblemas, bandas y extras (hecha).** Respaldos de emblema, **biblioteca de símbolos propios (SVG)**, editor de formas
con simetrías, SVG del usuario, repetición, aros decorativos arriba y abajo con remaches. Cada uno, pieza desmontable.

**Fase 4 — Texturas del cuerpo (hecha: texturas del catálogo y duelas de madera, con vista liviana y modelo final).** Texturas con relieve real, apoyadas en la herramienta de superficies que ya existe, y
**duelas de madera como geometría propia** (cantidad, irregularidad, separaciones, veta). Es la fase más pesada: modelos
de cientos de miles de triángulos. Se trabaja con **vista previa liviana y modelo final de alta calidad**, y se limita el
peso del archivo para que el laminador no se trabe.

**Fase 5 — Complementos del asa (hecha: envoltura, collarines, descanso del pulgar, símbolo sobre el asa y placas de montaje decorativas).** Envolturas (cuero, cuerda gruesa, cintas), anillos metálicos, collarines, placas de
montaje, descanso para el pulgar, símbolo en el asa. Son **detalles de agarre desmontables** (lo que pidió Gustavo).

**Fase 6 — Colores, Bambu e impresión (hecha en parte: vista previa de impresión con costos y "Guardar en la Biblioteca"; falta la plantilla de otras impresoras Bambu).** Color por pieza; 3MF con **un filamento por color** (y plantillas para otras
impresoras además de la A1); **placas de impresión automáticas** con las piezas sueltas; vista previa de impresión
(tiempo y material, enganchada a los costos de Manager3D); **“Guardar en la Biblioteca”** con el 3MF y una foto del modelo.

**Fase 7 — Biblioteca de diseños y estilos (hecha: siete estilos, diseños guardados en la cuenta y compartir como archivo).** Guardar y reabrir diseños (por cuenta), estilos listos para usar
(navideño, vikingo, cervecero…) y compartir un diseño.

## 6. Decisiones técnicas

- **Motor 3D:** se sigue con `three`, `three-bvh-csg` y `clipper-lib`, que ya están. Si las booleanas fallan con mallas
  grandes o con formas raras, se evalúa `manifold-3d` (WebAssembly, mucho más robusto) **antes** de la fase 4.
- **Trabajo pesado en un trabajador de segundo plano** (como `superficieWorker.js`), con **vista previa rápida** y modelo
  final de mayor calidad al exportar. En la referencia el modelo ronda los 600 mil a 800 mil triángulos.
- **Las texturas se aplican al final**, sobre el cuerpo ya armado. No se hacen booleanas sobre mallas con textura.
- **Controles de imprimibilidad** como los de la referencia: voladizos de más de 40°, espesor mínimo de pared, tolerancias
  de encastre, que entre en la cama de la impresora elegida y aviso si una pieza necesita soportes.
- **El diseño es un JSON versionado** (parámetros y piezas), separado de las mallas, para guardarlo, reabrirlo y
  evolucionarlo sin romper los diseños viejos.
- **Pruebas automáticas de la geometría en Node** (medidas, que las mallas estén cerradas, que quepa la lata, que entre
  en la cama), como las de llaveros.
- **Mejor en la computadora que en el celular**: el modelo pesado puede trabar un teléfono; se avisa.

## 7. Riesgos y pruebas físicas

- **Ajuste de la lata y de los encastres**: depende de la impresora, el filamento y la boquilla. Hace falta una **impresión
  de prueba** (anillos y espigas con varias tolerancias) para fijar los valores por defecto.
- **Medidas reales de las latas**: las oficiales varían unos milímetros. Conviene medir las que se van a usar.
- **Booleanas con mallas grandes**: el riesgo técnico principal; se mitiga con el trabajo en segundo plano, mallas
  intermedias livianas y, si hace falta, `manifold-3d`.
- **3MF multicolor**: hoy sólo existe la plantilla de la **Bambu Lab A1**; para otras impresoras hay que sumar plantillas y
  probarlas en cada laminador.

## 8. Origen y derechos

- Las capturas son del producto de otra persona: se usan **sólo para entender las funciones**. Los íconos, formas de
  cartel, escudos, texturas y textos de la interfaz se **diseñan de cero**.
- **Símbolos**: si se usa una biblioteca de íconos, revisar la licencia (algunas piden atribución). Las **fuentes** de
  `@fontsource` ya están en el proyecto y tienen licencia abierta.

## 9. Decisiones

**Tomadas (2026-11-05)**
1. **Impresoras y laminadores:** el mismo esquema que las otras herramientas (lista de camas, elección de impresora y la
   plantilla 3MF de la Bambu A1).
2. **Lata de arranque:** 500 ml de **70 × 170 mm**, con las principales latas prefijadas y **diámetro y alto del hueco
   editables a gusto** ("Medida propia").
3. **El asa:** **pegada por defecto**, pero **se puede hacer desmontable con encastre** (placas de montaje con ranura y
   espigas con holgura).
4. **Permiso por plan:** el mismo que las herramientas actuales (`herramientasStl`).

**Abiertas**
5. **Holgura del encastre y de la lata:** los valores de fábrica (0,3 mm y 0,5 mm) son una primera estimación; se ajustan
   con la **impresión de prueba** del cuerpo y el asa sueltos.
6. **Otras piezas desmontables** (carteles, escudos, remaches…): cómo se fijan (pegado en cavidad o encastre) se decide al
   llegar a la Fase 2.
7. **Símbolos y emblemas**: ¿SVG propios, una biblioteca con licencia libre o los dos?
8. **Estilos de fábrica** que quieras incluir de entrada (navideño, vikingo, cervecero…).
