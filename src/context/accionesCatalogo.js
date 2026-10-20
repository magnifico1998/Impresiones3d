import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { repartoParaImportar, descontarStock } from '../utils/stock';
import { fechaLocalHoy } from '../utils/fechaCompletado';
import { proyeccionCatalogoProducto, refCatalogoProducto } from './documentos';

// Catálogo web público (catalogoTiendas/{cuenta}/...): configuración visible,
// publicación de productos y solicitudes de la tienda. Funciones comunes que
// AppProvider arma en cada render con lo que tiene cargado.
//   ctx: { cuentaId, biblioteca, clientes, cfg, showToast, getNewId, productoDocRef,
//          addCliente, addPedido, updatePedido, updateProducto }
export function crearAccionesCatalogo(ctx) {
  const { cuentaId, biblioteca, clientes, cfg, showToast, getNewId, productoDocRef, addCliente, addPedido, updatePedido, updateProducto } = ctx;
  const catalogoProductoDocRef = (id) => refCatalogoProducto(cuentaId, id);

  const guardarCatalogoConfig = async (parcial, { silencioso = false } = {}) => {
    try {
      const nuevo = { ...parcial, actualizado: new Date().toISOString() };
      await setDoc(doc(db, "catalogoTiendas", cuentaId), nuevo, { merge: true });
    } catch (e) {
      console.error("Error al guardar la configuración del catálogo:", e);
      if (!silencioso) showToast('⚠ No se pudo guardar la configuración del catálogo.', 'error');
    }
  };

  // ids: Set o array de ids de biblioteca que deben quedar PUBLICADOS en
  // /catalogo. Sólo se copian campos "públicos" (nombre, cat, desc, imagen,
  // precio de venta) a catalogoProductos — nunca costoUnitario, filDetalle,
  // impresora, etc. Cualquier producto que estaba publicado y se
  // desmarcó acá se borra de catalogoProductos.
  const publicarProductosEnCatalogo = async (ids) => {
    try {
      const idSet = ids instanceof Set ? ids : new Set(ids);
      const batch = writeBatch(db);

      biblioteca.forEach(p => {
        const debePublicarse = idSet.has(p.id);
        const estabaPublicado = !!p.pub;

        if (debePublicarse) {
          batch.set(catalogoProductoDocRef(p.id), proyeccionCatalogoProducto(p));
          if (!estabaPublicado) {
            batch.set(productoDocRef(p.id), { ...p, pub: true });
          }
        } else if (estabaPublicado) {
          batch.delete(catalogoProductoDocRef(p.id));
          batch.set(productoDocRef(p.id), { ...p, pub: false });
        }
      });

      await batch.commit();
      showToast('✓ Catálogo publicado.');
      return true;
    } catch (e) {
      console.error("Error al publicar el catálogo:", e);
      showToast('⚠ No se pudo publicar el catálogo.', 'error');
      return false;
    }
  };

  // Arma una "pieza" de pedido a partir de un ítem de solicitud web,
  // heredando datos de costo del producto original en biblioteca. Mismo
  // criterio que construirPiezaDesdeBibParaPedido (ModalArmarPedido.jsx),
  // pero vive acá porque el origen es una solicitud ya armada por el
  // cliente y no una selección manual del admin.
  const construirPiezaDesdeSolicitud = (item) => {
    const prod = biblioteca.find(p => p.id === item.prodId) || {};
    const horas = prod.horas || 0;
    const watts = prod.watts || 0;
    const precioKwh = prod.precioKwh || cfg.kwh || 0;
    const moHora = prod.moHora || 0;
    const horasTrab = prod.horasTrab || 0;
    const costeElec = (watts / 1000) * horas * precioKwh;
    const costeMO = moHora * horasTrab;

    let mant = 0;
    if (prod.impresoraNombre) {
      const imp = cfg.impresoras.find(i => i.nombre === prod.impresoraNombre);
      if (imp) mant = imp.mant || 0;
    }
    const costeMant = mant * horas;
    const precioConfiable = prod.id != null
      ? (prod.precioSugUnitario || prod.costoUnitario || 0)
      : (Number(item.precioUnit) || 0);

    return {
      id: getNewId(),
      bibliotecaId: prod.id ?? null,
      nombre: prod.nombre || String(item.nombre || ''),
      archivoNombre: prod.gcodeNombre || null,
      gcodeArchivos: prod.gcodeArchivos || null,
      filDetalle: prod.filDetalle || [],
      // Gramos y materiales para descontar el inventario (mismo criterio
      // que utils/piezaPedido.js -> datosConsumoPieza).
      gramos: Number(prod.gramos) || 0,
      desperdicio: Number(prod.desperdicio) || 0,
      materiales: Array.isArray(prod.materiales) ? prod.materiales : null,
      multiMat: !!prod.multiMat,
      costeElec,
      costeMant,
      costeMO,
      horas,
      impresoraNombre: prod.impresoraNombre || null,
      costoUnitario: prod.costoUnitario || 0,
      ...(prod.tipo === 'reventa' ? { sinImpresion: true } : {}),
      // El precio sale de la biblioteca (misma fórmula que la copia pública,
      // ver proyeccionCatalogoProducto), NUNCA del precioUnit de la
      // solicitud: ese lo escribe un visitante anónimo y lo puede poner en
      // $1 llamando a Firestore directo. Sólo si el producto ya no existe
      // en la biblioteca se usa el de la solicitud como referencia.
      precioEstimado: precioConfiable,
      precioVenta: precioConfiable,
      cantidad: Math.max(0, Math.floor(Number(item.cantidad) || 0)),
      // Lo que salió de stock (tienda del catálogo) ya está hecho; el resto queda por fabricar.
      elaborados: (item.versiones || []).reduce((s, v) => s + Math.min(Math.max(0, Math.floor(Number(v.deStock) || 0)), Math.max(0, Math.floor(Number(v.cantidad) || 0))), 0),
      notas: 'Pedido vía catálogo web',
      versiones: (item.versiones || []).map(v => ({
        id: Date.now() + Math.random(),
        cantidad: v.cantidad,
        color: v.color || '',
        colorSecundario: v.colorSecundario || '',
        comentario: v.comentario || '',
        realizados: Math.min(Math.max(0, Math.floor(Number(v.deStock) || 0)), Math.max(0, Math.floor(Number(v.cantidad) || 0)))
      }))
    };
  };

  // Convierte una solicitud del catálogo web en un Pedido real (nuevo o
  // agregado a uno existente) y marca la solicitud como "importado" para
  // que no vuelva a aparecer como pendiente.
  const importarSolicitudComoPedido = async (solicitud, destino = 'nuevo') => {
    try {
      // Tienda del catálogo: se revalida contra el stock real cuánto sale de stock (lo que mandó el visitante
      // no es de fiar y el stock pudo cambiar). Lo que sale de stock queda completado; el resto, por fabricar.
      const itemsRepartidos = (solicitud.items || []).map((item) => {
        const prod = biblioteca.find(p => p.id === item.prodId);
        return { ...item, versiones: repartoParaImportar(prod?.stock, item.versiones || []) };
      });
      const nuevasPiezas = itemsRepartidos.map(construirPiezaDesdeSolicitud);
      const usaStock = itemsRepartidos.some(it => it.versiones.some(v => v.deStock > 0));
      const todoCompleto = nuevasPiezas.length > 0 && nuevasPiezas.every(pz => pz.elaborados >= pz.cantidad);
      let pedidoDestinoId = null;

      // El teléfono es el único dato realmente único acá: el nombre lo
      // escribe el cliente a mano en el catálogo y puede variar de un
      // pedido a otro (mayúsculas, apellido, apodo), pero el teléfono no
      // cambia. Por eso el teléfono manda: si ya existe un cliente con
      // ese teléfono, es esa persona sin importar cómo escribió el
      // nombre esta vez — y usamos el nombre que YA tenía guardado (no
      // el nuevo) para que el pedido quede bien enlazado a él en las
      // estadísticas de Clientes. Sólo si no hay teléfono cargado caemos
      // a comparar por nombre.
      const nombreSolicitud = (solicitud.cliente || '').trim();
      const telSolicitud = (solicitud.telefono || '').replace(/\D/g, '');

      let clienteExistente = null;
      if (telSolicitud) {
        clienteExistente = clientes.find(c => (c.tel || '').replace(/\D/g, '') === telSolicitud) || null;
      }
      if (!clienteExistente && nombreSolicitud) {
        clienteExistente = clientes.find(
          c => (c.nombre || '').trim().toLowerCase() === nombreSolicitud.toLowerCase()
        ) || null;
      }

      // Nombre que va a llevar el pedido: el del cliente ya existente
      // (si lo encontramos), o si no el que escribió recién.
      const nombreParaPedido = clienteExistente?.nombre || nombreSolicitud || 'Sin nombre';

      if (nombreSolicitud && !clienteExistente) {
        await addCliente({
          id: getNewId(),
          nombre: nombreSolicitud,
          tel: solicitud.telefono || '',
          email: solicitud.email || '',
          prov: '',
          loc: '',
          cp: '',
          calle: '',
          altura: '',
          fechaAlta: new Date().toLocaleDateString('es-AR'),
          fechaAltaTs: Date.now()
        });
      }

      if (destino === 'nuevo') {
        const newIdVal = getNewId();
        const nuevo = {
          id: newIdVal,
          cliente: nombreParaPedido,
          desc: solicitud.comentarioGeneral || 'Pedido desde catálogo web',
          // Con productos de stock el pedido no necesita verificación de lo que ya está hecho: si todo salió de stock
          // queda listo para entregar; si falta fabricar, pendiente.
          estado: usaStock ? (todoCompleto ? 'listo' : 'pendiente') : 'en_verificacion',
          fechaPedido: fechaLocalHoy(),
          fechaEntrega: '',
          notaGeneral: solicitud.telefono ? `Tel: ${solicitud.telefono}` : '',
          piezas: nuevasPiezas,
          // Recalculado con los precios de la biblioteca: totalEstimado lo
          // manda el visitante anónimo y no es confiable.
          precioVenta: nuevasPiezas.reduce((s, p) => s + p.cantidad * p.precioVenta, 0),
          envio: 0,
          insumos: [],
          creado: new Date().toLocaleDateString('es-AR'),
          creadoTs: Date.now()
        };
        // Si no se guardó (límite del plan, ya avisado, o error de la
        // nube), la solicitud queda sin importar para reintentar después.
        if (!(await addPedido(nuevo))) return null;
        pedidoDestinoId = newIdVal;
      } else {
        const targetId = parseInt(destino, 10);
        await updatePedido(targetId, (p) => ({
          ...p,
          piezas: [...p.piezas, ...nuevasPiezas]
        }));
        pedidoDestinoId = targetId;
      }

      // Lo que salió de stock se descuenta de la Biblioteca (y de la copia pública del catálogo).
      for (const item of itemsRepartidos) {
        if (!item.versiones.some(v => v.deStock > 0)) continue;
        try {
          await updateProducto(item.prodId, (p) => ({ ...p, stock: descontarStock(p.stock, item.versiones) }));
        } catch (e) {
          console.error('No se pudo descontar el stock de', item.nombre, e);
          showToast('⚠ El pedido se creó, pero no se pudo descontar el stock de ' + (item.nombre || 'un producto') + '. Ajustalo a mano en Productos en stock.', 'error');
        }
      }

      const { _docId, ...datosSolicitud } = solicitud;
      await setDoc(doc(db, "catalogoTiendas", cuentaId, "solicitudes", _docId), { ...datosSolicitud, estado: 'importado' }, { merge: true });

      showToast('✓ Solicitud importada como pedido.');
      return pedidoDestinoId;
    } catch (e) {
      console.error("Error al importar la solicitud como pedido:", e);
      showToast('⚠ No se pudo importar la solicitud.', 'error');
      return null;
    }
  };

  const descartarSolicitud = async (docId) => {
    try {
      await deleteDoc(doc(db, "catalogoTiendas", cuentaId, "solicitudes", docId));
    } catch (e) {
      console.error("Error al descartar la solicitud:", e);
      showToast('⚠ No se pudo descartar la solicitud.', 'error');
    }
  };

  return { guardarCatalogoConfig, publicarProductosEnCatalogo, importarSolicitudComoPedido, descartarSolicitud };
}
