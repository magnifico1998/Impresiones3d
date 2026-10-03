// Recorrido guiado por la app (components/Recorrido.jsx): resalta cada parte
// y explica para qué sirve, cambiando de sección sola. Usa driver.js, que se
// descarga recién al empezar el recorrido.
//
// Cada paso dice en qué sección va (`pagina`, la de setActivePage), qué
// pestaña de esa sección abrir (`pestana`: el texto del botón) y qué resaltar
// (`elemento`: una función que lo busca en la página). Se busca por el título
// de la tarjeta o el texto del botón; si no se encuentra (por ejemplo, una
// sección que esa cuenta no tiene), el paso se muestra centrado igual.
//
// Para que se aprenda también CÓMO LLEGAR: al entrar a cada sección nueva
// se agrega un paso que resalta ese ítem del menú lateral (y la pestaña, si
// hay), y cada globo lleva arriba el camino ("Menú › Configuración ›
// Herramientas"). Ver armarPasos.

const limpio = (t) => String(t || '').replace(/^[▸▾]\s*/, '').replace(/\s+/g, ' ').trim();

// La tarjeta (.card) con ese título.
const tarjeta = (titulo) => () =>
  [...document.querySelectorAll('.card-title')].find((t) => limpio(t.textContent).startsWith(titulo))?.closest('.card');

// El botón con ese texto (visible).
const boton = (texto) => () =>
  [...document.querySelectorAll('button, label.btn')].find((b) => b.offsetParent && limpio(b.textContent).includes(texto));

// La pestaña de una sección: botón fuera del menú lateral cuyo texto empieza
// con ese nombre (puede tener un contador, "Inventario (2)").
const pestanaDe = (nombre) => () =>
  [...document.querySelectorAll('button:not(.nav-item)')].find((b) => b.offsetParent && limpio(b.textContent).startsWith(nombre) && limpio(b.textContent).length <= nombre.length + 6);

// El título de la página actual, con su descripción.
const tituloPagina = () => document.querySelector('.page-title')?.parentElement;

// Nombre de cada sección en el menú lateral.
const MENU = {
  config: 'Configuración',
  empresa: 'Mi emprendimiento',
  calc: 'Calculadora',
  biblioteca: 'Biblioteca',
  pedidos: 'Pedidos',
  presupuestos: 'Presupuestos',
  compras: 'Compras',
  catalogoweb: 'Catálogo web',
  faq: 'Preguntas frecuentes',
  soporte: 'Soporte'
};

// El ítem del menú lateral de una sección.
const itemMenu = (pagina) => () =>
  [...document.querySelectorAll('.nav-item')].find((b) => b.offsetParent && limpio(b.textContent).startsWith(MENU[pagina]));

const PASOS_BASE = [
  {
    titulo: '¡Bienvenido a Manager3D! 👋',
    texto: 'Te mostramos en 2 minutos lo principal para arrancar: dónde configurar tus costos, cómo calcular una pieza desde el G-code y cómo cargar pedidos. Podés salir cuando quieras con la ✕.'
  },
  {
    pagina: 'config', pestana: 'Herramientas', elemento: tarjeta('Impresoras'),
    titulo: 'Tus impresoras',
    texto: 'Cargá cada impresora con su consumo (W) y el costo de mantenimiento por hora. Con esto se calcula la luz y el desgaste de cada pieza.'
  },
  {
    pagina: 'config', pestana: 'Herramientas', elemento: tarjeta('Filamentos'),
    titulo: 'Filamentos',
    texto: 'Los tipos de filamento que usás y el precio por kilo. Es la base del costo de material.'
  },
  {
    pagina: 'config', pestana: 'Herramientas', elemento: tarjeta('Colores disponibles'),
    titulo: 'Colores',
    texto: 'Los colores que tenés. Los vas a elegir en cada versión de un pedido y en el catálogo web.'
  },
  {
    pagina: 'config', pestana: 'Herramientas', elemento: tarjeta('Valores por defecto'),
    titulo: 'Valores por defecto',
    texto: 'Precio del kWh, costo de tu mano de obra por hora, margen de ganancia y desperdicio. La Calculadora arranca con estos valores.'
  },
  {
    pagina: 'config', pestana: 'Aplicación', elemento: tarjeta('Inventario'),
    titulo: 'Inventario',
    texto: 'Si lo activás, tus compras suman stock (el filamento en gramos) y al completar un pedido se descuenta lo que usó. También podés fijar un stock mínimo para que te avise.'
  },
  {
    pagina: 'empresa', pestana: 'Emprendimiento', elemento: tarjeta('Datos generales'),
    titulo: 'Tu emprendimiento',
    texto: 'Nombre, logo, contacto y datos bancarios. Salen en los PDF de tus presupuestos y pedidos.'
  },
  {
    pagina: 'calc', elemento: tarjeta('Importar archivo'),
    titulo: 'Calculadora: cargá tu G-code',
    texto: 'Arrastrá acá el G-code o el .3mf de tu laminador (Bambu Studio, PrusaSlicer, Orca, Cura). Lee los gramos y el tiempo de impresión, y te sugiere el precio con tus costos.'
  },
  {
    pagina: 'calc', elemento: boton('Guardar en biblioteca'),
    titulo: 'Guardalo en la Biblioteca',
    texto: 'Guardá la pieza calculada como producto: después la sumás a pedidos y presupuestos sin volver a calcular.'
  },
  {
    pagina: 'biblioteca', elemento: tituloPagina,
    titulo: 'Biblioteca de productos',
    texto: 'Tus productos guardados, con sus versiones de color y precio de venta. Desde acá armás pedidos y presupuestos, y elegís qué publicar en el catálogo.'
  },
  {
    pagina: 'pedidos', elemento: boton('Nuevo pedido'),
    titulo: 'Cargá un pedido',
    texto: 'Elegí el cliente y los productos (de la Biblioteca o de la Calculadora), con la cantidad de cada versión de color. Después lo vas pasando de estado: en producción, listo, enviado. El semáforo te avisa si llegás con la fecha de entrega.'
  },
  {
    pagina: 'presupuestos', elemento: boton('Nuevo presupuesto'),
    titulo: 'Presupuestos',
    texto: 'Armá un presupuesto y mandalo en PDF. Cuando el cliente lo aprueba, se convierte en pedido con un clic.'
  },
  {
    pagina: 'compras', pestana: 'Compras', elemento: boton('Nueva compra'),
    titulo: 'Compras e inventario',
    texto: 'Registrá lo que comprás (filamentos, insumos, accesorios) para tener tus gastos. Con el inventario activado, también suma stock: en la pestaña Inventario ves cuánto te queda de cada cosa.'
  },
  {
    pagina: 'catalogoweb', elemento: tituloPagina,
    titulo: 'Catálogo web',
    texto: 'Tu tienda online para compartir por WhatsApp o redes: tus clientes ven los productos que elegís publicar y te mandan pedidos desde ahí.'
  },
  {
    pagina: 'faq', elemento: tituloPagina,
    titulo: 'Preguntas frecuentes',
    texto: 'Las respuestas a las dudas más comunes sobre cada sección.'
  },
  {
    pagina: 'soporte', elemento: boton('Nuevo ticket'),
    titulo: '¿Algo no funciona?',
    texto: 'Creá un ticket y usá "Grabar el problema" para que nos llegue todo lo necesario. También podés tocar "Reportar" en cualquier aviso de error.'
  },
  {
    pagina: 'resumen', elemento: () => document.querySelector('[data-tour="boton-recorrido"]'),
    titulo: '¡Listo!',
    texto: 'Ya conocés lo principal. Te recomendamos empezar por Configuración y calcular tu primera pieza. Para volver a ver el recorrido cuando quieras, tocá <b>🧭 Recorrido</b>, acá arriba.'
  }
];

// (la pestaña no se repite si se llama igual que la sección, ej. Compras › Compras)
const ruta = (p) => ['Menú', MENU[p.pagina], p.pestana !== MENU[p.pagina] && p.pestana].filter(Boolean).join(' › ');
const conRuta = (p) => `<div class="recorrido-ruta">📍 ${ruta(p)}</div>${p.texto}`;

// Pasos finales: antes de cada sección nueva, el paso "cómo llegar" (resalta
// el ítem del menú; la sección se abre recién en el paso siguiente). Un
// cambio de pestaña dentro de la misma sección también lo indica.
function armarPasos() {
  const pasos = [];
  let anterior = {};
  for (const p of PASOS_BASE) {
    if (p.pagina && MENU[p.pagina] && p.pagina !== anterior.pagina) {
      pasos.push({
        elemento: itemMenu(p.pagina),
        titulo: `Cómo llegar: ${MENU[p.pagina]}`,
        texto: `<div class="recorrido-ruta">📍 ${ruta(p)}</div>En el menú de la izquierda, tocá <b>${MENU[p.pagina]}</b>${p.pestana && p.pestana !== MENU[p.pagina] ? ` y después la pestaña <b>${p.pestana}</b>` : ''}.`
      });
    }
    const cambiaPestana = p.pagina === anterior.pagina && p.pestana && p.pestana !== anterior.pestana;
    pasos.push({
      ...p,
      texto: p.pagina && MENU[p.pagina]
        ? conRuta({ ...p, texto: (cambiaPestana ? `Tocá la pestaña <b>${p.pestana}</b>. ` : '') + p.texto })
        : p.texto
    });
    anterior = p;
  }
  return pasos;
}

export const PASOS = armarPasos();

// Busca el elemento varias veces mientras la sección se termina de mostrar.
async function esperarElemento(buscar, ms = 1500) {
  const fin = Date.now() + ms;
  for (;;) {
    const el = buscar();
    if (el) return el;
    if (Date.now() > fin) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Abre la sección y la pestaña del paso y devuelve el elemento a resaltar.
async function prepararPaso(paso, setActivePage) {
  if (paso.pagina) setActivePage(paso.pagina);
  if (paso.pestana) {
    const tab = await esperarElemento(pestanaDe(paso.pestana));
    if (tab && !tab.classList.contains('active')) tab.click();
  }
  if (!paso.elemento) return null;
  const el = await esperarElemento(paso.elemento);
  el?.scrollIntoView({ block: 'center' });
  return el;
}

// Arranca el recorrido. alTerminar(completo): completo = llegó al final.
export async function iniciarRecorrido({ setActivePage, alTerminar }) {
  const [{ driver }] = await Promise.all([import('driver.js'), import('driver.js/dist/driver.css')]);
  let llegoAlFinal = false;
  // Elemento de cada paso, buscado al llegar a ese paso (la sección tiene que
  // estar abierta). Sin elemento, driver.js muestra el paso centrado.
  const elementos = [];

  const ir = async (d, indice) => {
    elementos[indice] = await prepararPaso(PASOS[indice], setActivePage);
    d.moveTo(indice);
  };

  const d = driver({
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: 'Terminar',
    allowClose: true,
    overlayClickBehavior: 'none',
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: 'recorrido-popover',
    steps: PASOS.map((p, i) => ({
      element: () => elementos[i],
      popover: { title: p.titulo, description: p.texto, side: 'bottom', align: 'start' }
    })),
    onNextClick: (_el, _paso, { driver: dr }) => {
      const i = dr.getActiveIndex() ?? 0;
      if (i >= PASOS.length - 1) {
        llegoAlFinal = true;
        dr.destroy();
        return;
      }
      ir(dr, i + 1);
    },
    onPrevClick: (_el, _paso, { driver: dr }) => {
      const i = dr.getActiveIndex() ?? 0;
      if (i > 0) ir(dr, i - 1);
    },
    onDestroyed: () => alTerminar?.(llegoAlFinal)
  });
  d.drive(0);
}
