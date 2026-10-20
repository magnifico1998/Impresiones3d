import { doc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizarStock } from '../utils/stock';

// Copia pública de un producto en el catálogo web: catalogoTiendas/{cuenta}/productos/{id}.
export const refCatalogoProducto = (cuentaId, id) => doc(db, 'catalogoTiendas', cuentaId, 'productos', String(id));

// Campos "públicos" de un producto de biblioteca que se espejan a
// catalogoTiendas/{uid}/productos — nombre, categoría, descripciones,
// imágenes y precio de venta; nunca costoUnitario, filDetalle ni ningún
// costo interno. Única fuente de esa proyección: la usan tanto la
// publicación inicial (publicarProductosEnCatalogo) como la
// re-sincronización automática al editar un producto ya publicado
// (updateProducto / updateProductosBulk), para que el catálogo público
// nunca quede mostrando un precio o una imagen viejos.
export const proyeccionCatalogoProducto = (p) => ({
  id: p.id,
  nombre: p.nombre,
  cat: p.cat || 'Sin categoría',
  subcat: p.subcat || '',
  subsubcat: p.subsubcat || '',
  desc: p.desc || '',
  descLarga: p.descLarga || '',
  imagen: p.imagen || '',
  imagenes: p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []),
  precio: p.precioSugUnitario || p.costoUnitario || 0,
  // Fallback al booleano viejo (permiteColorSecundario) para no perder el
  // flag de productos marcados antes de este cambio -- ver
  // ModalBibEditarCat.jsx, que hace el mismo fallback al cargar.
  modoColorSecundario: p.modoColorSecundario || (p.permiteColorSecundario ? 'libre' : ''),
  // Unidades terminadas por color (sección Productos en stock): lo que la tienda del catálogo vende al instante.
  stock: normalizarStock(p.stock),
  // Foto que le corresponde a cada color (la tienda la muestra al elegir el color).
  fotosColor: Array.isArray(p.fotosColor) ? p.fotosColor : [],
  // Colores con los que se ofrece (si limitarColores): ver utils/coloresProducto.js.
  limitarColores: !!p.limitarColores,
  coloresElegidos: Array.isArray(p.coloresElegidos) ? p.coloresElegidos : [],
  actualizado: new Date().toISOString()
});

// Campos de primer nivel que difieren entre la versión local (`antes`) y
// la nueva, listos para updateDoc/batch.update. Antes cada update hacía
// setDoc del objeto COMPLETO armado desde el estado local: si otra pestaña
// o un miembro del equipo había cambiado otro campo del mismo documento un
// segundo antes, esa escritura lo pisaba con el valor viejo. Escribiendo
// sólo lo que cambió, dos ediciones de campos distintos ya no se pisan.
export const camposCambiados = (antes, despues) => {
  const cambios = {};
  Object.keys(despues).forEach(k => {
    if (JSON.stringify(antes?.[k]) !== JSON.stringify(despues[k])) {
      cambios[k] = despues[k] === undefined ? deleteField() : despues[k];
    }
  });
  Object.keys(antes || {}).forEach(k => {
    if (!(k in despues)) cambios[k] = deleteField();
  });
  return cambios;
};

export const hayCambios = (cambios) => Object.keys(cambios).length > 0;

export const numeroSiguientePresupuesto = (presupuestos) =>
  presupuestos.reduce((max, p) => Math.max(max, Number(p.numero) || 0), 0) + 1;
