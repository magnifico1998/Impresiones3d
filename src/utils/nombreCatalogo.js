// Nombre del catálogo en la dirección: manager3d.com.ar/{nombre}. Copia de functions/nombreCatalogo.js (que es la que
// manda: la función valida de nuevo al guardar); acá se usa para validar mientras se escribe y para reconocer la ruta.

export const MIN = 3;
export const MAX = 40;

export const RESERVADOS = [
  'admin', 'administrador', 'api', 'app', 'assets', 'ayuda', 'biblioteca', 'blog', 'catalogo', 'catalogos', 'cdn', 'clientes',
  'compras', 'configuracion', 'contacto', 'correo', 'dev', 'demo', 'empresa', 'faq', 'favicon', 'icons', 'index', 'login',
  'logout', 'mail', 'manager', 'manager3d', 'manifest', 'pedidos', 'planes', 'precios', 'prueba', 'presupuestos', 'privacidad',
  'public', 'registro', 'robots', 'sitemap', 'soporte', 'staging', 'static', 'status', 'stock', 'sw', 'terminos', 'test',
  'tienda', 'tiendas', 'version', 'www'
];

export function normalizarNombre(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function motivoNombreInvalido(nombre) {
  if (nombre.length < MIN) return `El nombre tiene que tener al menos ${MIN} letras o números.`;
  if (nombre.length > MAX) return `El nombre puede tener hasta ${MAX} caracteres.`;
  if (RESERVADOS.includes(nombre)) return 'Ese nombre está reservado: elegí otro.';
  return null;
}

// Nombre de catálogo que trae una ruta ("/mi-tienda" → "mi-tienda"), o null si no es una dirección de catálogo:
// la raíz, "/catalogo/..." (el link por uid de siempre), una ruta reservada o algo que no es un nombre válido.
export function nombreDeRuta(pathname) {
  const partes = String(pathname || '').split('/').filter(Boolean);
  if (partes.length !== 1) return null;
  const n = partes[0];
  if (n !== n.toLowerCase() || normalizarNombre(n) !== n || motivoNombreInvalido(n)) return null;
  return n;
}

// ¿Esta ruta la sirve el catálogo público (y no la app con login)?
export const esRutaDeCatalogo = (pathname) => String(pathname || '').startsWith('/catalogo') || nombreDeRuta(pathname) !== null;
