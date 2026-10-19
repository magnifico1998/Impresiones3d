// Nombre del catálogo en la dirección: manager3d.com.ar/{nombre}. Reglas puras (sin acceso a Firestore), usadas por la
// función reservarNombreCatalogo y espejadas en src/utils/nombreCatalogo.js (la app las usa para validar mientras se
// escribe). pruebas/nombre-catalogo.test.js controla que las dos copias den lo mismo.

const MIN = 3;
const MAX = 40;

// Direcciones que no pueden ser el nombre de un catálogo: rutas de la app, archivos y palabras que confunden.
const RESERVADOS = [
  'admin', 'administrador', 'api', 'app', 'assets', 'ayuda', 'biblioteca', 'blog', 'catalogo', 'catalogos', 'cdn', 'clientes',
  'compras', 'configuracion', 'contacto', 'correo', 'dev', 'demo', 'empresa', 'faq', 'favicon', 'icons', 'index', 'login',
  'logout', 'mail', 'manager', 'manager3d', 'manifest', 'pedidos', 'planes', 'precios', 'prueba', 'presupuestos', 'privacidad',
  'public', 'registro', 'robots', 'sitemap', 'soporte', 'staging', 'static', 'status', 'stock', 'sw', 'terminos', 'test',
  'tienda', 'tiendas', 'version', 'www'
];

// Minúsculas, sin acentos, espacios y guiones bajos como guión, sólo a-z 0-9 y guiones (sin repetirse ni en los bordes).
function normalizarNombre(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Motivo por el que un nombre ya normalizado no sirve, o null si sirve.
function motivoNombreInvalido(nombre) {
  if (nombre.length < MIN) return `El nombre tiene que tener al menos ${MIN} letras o números.`;
  if (nombre.length > MAX) return `El nombre puede tener hasta ${MAX} caracteres.`;
  if (RESERVADOS.includes(nombre)) return 'Ese nombre está reservado: elegí otro.';
  return null;
}

module.exports = { MIN, MAX, RESERVADOS, normalizarNombre, motivoNombreInvalido };
