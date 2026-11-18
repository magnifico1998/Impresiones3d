/**
 * Crea las dos encuestas de Manager3D en Google Forms, cada una con su planilla
 * de respuestas. Se pega en https://script.google.com (Nuevo proyecto) y se
 * ejecuta la función crearEncuestas. Los links salen en Ver > Registros.
 *
 * Grupo A: se registraron y no eligieron ningún plan.
 * Grupo B: usaron el plan Boceto y dejaron de usarlo.
 */

function crearEncuestas() {
  crearEncuestaSinPlan_();
  crearEncuestaBoceto_();
}

// ---------- Helpers ----------

function unaOpcion_(form, titulo, opciones, conOtra, obligatoria) {
  var it = form.addMultipleChoiceItem().setTitle(titulo).setChoiceValues(opciones);
  if (conOtra) it.showOtherOption(true);
  it.setRequired(obligatoria !== false);
  return it;
}

function variasOpciones_(form, titulo, opciones, conOtra, ayuda) {
  var it = form.addCheckboxItem().setTitle(titulo).setChoiceValues(opciones);
  if (ayuda) it.setHelpText(ayuda);
  if (conOtra) it.showOtherOption(true);
  it.setRequired(true);
  return it;
}

function textoLargo_(form, titulo, ayuda, obligatoria) {
  var it = form.addParagraphTextItem().setTitle(titulo);
  if (ayuda) it.setHelpText(ayuda);
  it.setRequired(obligatoria === true);
  return it;
}

function contacto_(form) {
  form.addSectionHeaderItem().setTitle('Si querés que te contactemos (opcional)');
  form.addTextItem()
    .setTitle('Tu mail o WhatsApp')
    .setHelpText('Lo usamos sólo para contestarte. Podés dejarlo vacío.')
    .setRequired(false);
}

function terminar_(form, nombrePlanilla) {
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);
  var ss = SpreadsheetApp.create(nombrePlanilla);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  Logger.log(form.getTitle());
  Logger.log('  Link para el mail (publicado): ' + form.getPublishedUrl());
  Logger.log('  Para editarlo: ' + form.getEditUrl());
  Logger.log('  Planilla de respuestas: ' + ss.getUrl());
}

// ---------- Grupo A: se registraron y no eligieron plan ----------

function crearEncuestaSinPlan_() {
  var form = FormApp.create('Manager3D: contanos cómo te fue (2 minutos)');
  form.setDescription(
    'Te registraste en Manager3D y todavía no elegiste un plan. Nos ayuda mucho ' +
    'saber qué pasó, sea lo que sea. Son 5 preguntas y no hay respuestas incorrectas.'
  );
  form.setConfirmationMessage('¡Gracias! Cada respuesta nos ayuda a mejorar Manager3D.');

  variasOpciones_(form,
    '1. ¿Qué querías resolver cuando te registraste en Manager3D?',
    [
      'Llevar pedidos y clientes',
      'Hacer presupuestos',
      'Tener un catálogo web para que me pidan',
      'Controlar costos y stock de filamento',
      'Facturar (ARCA)',
      'Probar qué era'
    ],
    true, 'Podés marcar más de una.'
  );

  unaOpcion_(form,
    '2. Durante la prueba, ¿llegaste a cargar un pedido o armar un presupuesto?',
    [
      'Sí, varios',
      'Sí, uno solo',
      'Lo intenté pero no pude',
      'No lo probé'
    ], false
  );

  variasOpciones_(form,
    '3. ¿Qué fue lo principal que te frenó para elegir un plan?',
    [
      'El precio',
      'Me alcanza con el plan gratuito',
      'No entendí qué incluye cada plan',
      'No me di cuenta de cómo se usa',
      'No tuve tiempo de probarlo',
      'Ya uso otra herramienta (Excel, cuaderno, otro sistema)'
    ],
    true, 'Marcá hasta dos.'
  );

  variasOpciones_(form,
    '4. Hoy, ¿cómo llevás tus pedidos y tus costos?',
    [
      'Excel o Google Sheets',
      'Cuaderno o notas del celular',
      'WhatsApp',
      'Otro sistema pago',
      'No llevo registro'
    ],
    true
  );

  textoLargo_(form,
    '5. ¿Qué tendría que pasar para que te sumaras a un plan pago?',
    'Por ejemplo: un precio menor, más días de prueba, una función puntual, una demo guiada. Contanos con tus palabras.',
    true
  );

  contacto_(form);
  terminar_(form, 'Respuestas: encuesta sin plan (Manager3D)');
}

// ---------- Grupo B: usaron Boceto y dejaron de usarlo ----------

function crearEncuestaBoceto_() {
  var form = FormApp.create('Manager3D: queremos saber por qué dejaste de usarlo (2 minutos)');
  form.setDescription(
    'Usaste Manager3D con el plan gratuito (Boceto) y hace un tiempo que no entrás. ' +
    'Queremos entender qué pasó para mejorarlo. Son 5 preguntas y no hay respuestas incorrectas.'
  );
  form.setConfirmationMessage('¡Gracias por contarnos! Lo vamos a tener en cuenta.');

  variasOpciones_(form,
    '1. ¿Por qué dejaste de usar Manager3D?',
    [
      'Ya no lo necesitaba',
      'El plan gratuito se me quedó corto (límites)',
      'Me resultó complicado de usar',
      'Volví a mi método anterior (Excel, cuaderno)',
      'Mi actividad de impresión 3D bajó o se frenó',
      'Encontré otra herramienta'
    ],
    true, 'Podés marcar más de una.'
  );

  variasOpciones_(form,
    '2. ¿Te topaste con algún límite del plan gratuito?',
    [
      'Pedidos por mes',
      'Monto facturado por mes',
      'Productos guardados en la biblioteca',
      'Visitas o pedidos del catálogo web',
      'Usuarios en la cuenta',
      'Espacio para archivos G-code',
      'Ninguno'
    ],
    false
  );

  variasOpciones_(form,
    '3. ¿Qué función era la que más usabas?',
    [
      'Pedidos',
      'Presupuestos',
      'Catálogo web',
      'Biblioteca de productos',
      'Herramientas de modelado STL',
      'Facturación electrónica',
      'Costos y stock'
    ],
    true
  );
  textoLargo_(form,
    '3 bis. ¿Qué te faltó?',
    'Algo que necesitabas y no encontraste, o que no funcionaba como esperabas.',
    false
  );

  unaOpcion_(form,
    '4. La última vez que entraste, ¿qué pasó?',
    [
      'No pude resolver lo que necesitaba',
      'No tenía pedidos para cargar',
      'La cuenta quedó en modo lectura y no entendí por qué',
      'Simplemente me olvidé de usarlo'
    ], true
  );

  unaOpcion_(form,
    '5. ¿Volverías a usarlo?',
    [
      'Sí, si tuviera una función que me falta (la contás en la pregunta 3 bis)',
      'Sí, pero con un plan pago más barato',
      'Quizás más adelante',
      'No'
    ], false
  );

  contacto_(form);
  terminar_(form, 'Respuestas: encuesta Boceto (Manager3D)');
}
