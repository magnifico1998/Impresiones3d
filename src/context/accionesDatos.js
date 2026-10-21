import { doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { camposCambiados, hayCambios, proyeccionCatalogoProducto, refCatalogoProducto } from './documentos';

// Altas, cambios y bajas de cada colección de la cuenta (compras, presupuestos,
// clientes, biblioteca, FAQ, pedidos). Son funciones comunes, sin estado propio:
// AppProvider las arma en cada render con lo que tiene cargado en ese momento.
//   ctx: { cuentaId, compras, presupuestos, clientes, biblioteca, faq, pedidos,
//          planContratado, consumoActual, mostrarErrorGuardado, showToast }
export function crearAccionesDatos(ctx) {
  const { cuentaId, compras, presupuestos, clientes, biblioteca, faq, pedidos, planContratado, consumoActual, mostrarErrorGuardado, showToast } = ctx;
  const catalogoProductoDocRef = (id) => refCatalogoProducto(cuentaId, id);

  // ---------------------------------------------------------------------
  // Compras: subcolección propia (users/{uid}/compras/{compraId}), un
  // documento por compra, escritura directa en cada add/update/remove.
  const compraDocRef = (id) => doc(db, "users", cuentaId, "compras", String(id));

  const addCompra = async (item) => {
    try {
      await setDoc(compraDocRef(item.id), item);
    } catch (e) {
      console.error("Error al guardar compra:", e);
      mostrarErrorGuardado('⚠ No se pudo guardar la compra en la nube.');
    }
  };

  const updateCompra = async (id, updater) => {
    try {
      const actual = compras.find(c => c.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      const cambios = camposCambiados(actual, nuevo);
      if (hayCambios(cambios)) await updateDoc(compraDocRef(id), cambios);
    } catch (e) {
      console.error("Error al actualizar compra:", e);
      mostrarErrorGuardado('⚠ No se pudo actualizar la compra en la nube.');
    }
  };

  const removeCompra = async (id) => {
    try {
      await deleteDoc(compraDocRef(id));
    } catch (e) {
      console.error("Error al eliminar compra:", e);
      mostrarErrorGuardado('⚠ No se pudo eliminar la compra en la nube.');
    }
  };

  // ---------------------------------------------------------------------
  // Presupuestos: subcolección propia (users/{uid}/presupuestos/{id}), mismo
  // patrón que compras. Estados: 'creado' -> 'enviado' (aguardando
  // respuesta) -> 'aprobado' (crea el pedido, ver PresupuestosPage.jsx) o
  // 'rechazado'. add/update devuelven true si se guardó, para que quien
  // llama no avance (ej. no marque "aprobado") si Firestore lo rechazó.
  const presupuestoDocRef = (id) => doc(db, "users", cuentaId, "presupuestos", String(id));

  // Correlativo visible (N° 1, 2, 3...), calculado sobre los presupuestos
  // cargados. Dos pestañas creando a la vez podrían repetir un número; es
  // sólo un rótulo para el cliente, el id real del documento es único.


  const addPresupuesto = async (item) => {
    try {
      await setDoc(presupuestoDocRef(item.id), item);
      return true;
    } catch (e) {
      console.error("Error al guardar presupuesto:", e);
      mostrarErrorGuardado('⚠ No se pudo guardar el presupuesto en la nube.');
      return false;
    }
  };

  const updatePresupuesto = async (id, updater) => {
    try {
      const actual = presupuestos.find(p => p.id === id);
      if (!actual) return false;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      const cambios = camposCambiados(actual, nuevo);
      if (hayCambios(cambios)) await updateDoc(presupuestoDocRef(id), cambios);
      return true;
    } catch (e) {
      console.error("Error al actualizar presupuesto:", e);
      mostrarErrorGuardado('⚠ No se pudo actualizar el presupuesto en la nube.');
      return false;
    }
  };

  const removePresupuesto = async (id) => {
    try {
      await deleteDoc(presupuestoDocRef(id));
    } catch (e) {
      console.error("Error al eliminar presupuesto:", e);
      mostrarErrorGuardado('⚠ No se pudo eliminar el presupuesto en la nube.');
    }
  };

  // ---------------------------------------------------------------------
  // FASE 2 de la migración a Firestore por secciones: clientes pasa de ser
  // un array dentro del documento monolítico a una subcolección propia
  // (users/{uid}/clientes/{clienteId}), un documento por cliente.
  //
  // A diferencia de pedidos/biblioteca/compras (que en esta fase siguen
  // con el patrón "array + autosave debounced" de Fase 0), clientes ahora
  // escribe directo a Firestore en cada add/update/remove — sin debounce,
  // porque estas funciones ya se llaman solo en acciones explícitas
  // (guardar/eliminar en un modal), no en cada tecla. El estado local
  // `clientes` deja de ser la fuente de verdad: pasa a ser un reflejo del
  // listener en tiempo real de la subcolección (más abajo), igual que ya
  // pasaba con config/empresa en Fase 1.
  //
  // Mantenemos los mismos nombres (addCliente/updateCliente/removeCliente)
  // que ya exportaba Fase 0, así ningún componente necesita cambios: sólo
  // cambió qué hacen estas funciones por dentro.
  const clienteDocRef = (id) => doc(db, "users", cuentaId, "clientes", String(id));

  const addCliente = async (item) => {
    try {
      await setDoc(clienteDocRef(item.id), item);
    } catch (e) {
      console.error("Error al guardar cliente:", e);
      mostrarErrorGuardado('⚠ No se pudo guardar el cliente en la nube.');
    }
  };

  const updateCliente = async (id, updater) => {
    try {
      const actual = clientes.find(c => c.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      const cambios = camposCambiados(actual, nuevo);
      if (hayCambios(cambios)) await updateDoc(clienteDocRef(id), cambios);
    } catch (e) {
      console.error("Error al actualizar cliente:", e);
      mostrarErrorGuardado('⚠ No se pudo actualizar el cliente en la nube.');
    }
  };

  const removeCliente = async (id) => {
    try {
      await deleteDoc(clienteDocRef(id));
    } catch (e) {
      console.error("Error al eliminar cliente:", e);
      mostrarErrorGuardado('⚠ No se pudo eliminar el cliente en la nube.');
    }
  };

  // ---------------------------------------------------------------------
  // FASE 3 de la migración a Firestore por secciones: biblioteca pasa de
  // ser un array dentro del documento monolítico a una subcolección propia
  // (users/{uid}/biblioteca/{productoId}), un documento por producto. Es la
  // sección que más pesaba del documento viejo (por las imágenes, aunque
  // ahora sólo se guarda la URL de Storage, no el base64) y la principal
  // candidata a acercarse al límite de 1 MiB de Firestore — separarla es el
  // beneficio más directo de esta migración.
  //
  // Mismo patrón que clientes en Fase 2: escritura directa por documento,
  // sin debounce, estado local alimentado por un listener en tiempo real
  // sobre la subcolección. La diferencia acá es que varias pantallas
  // (recalcular precios, ajuste masivo, actualización masiva) necesitan
  // actualizar VARIOS productos a la vez — para eso se agrega
  // updateProductosBulk, que hace un solo writeBatch en vez de N escrituras
  // sueltas.
  const productoDocRef = (id) => doc(db, "users", cuentaId, "biblioteca", String(id));

  // Devuelve true si se guardó y false si falló (la importación masiva de productos necesita saberlo).
  const addProducto = async (item) => {
    try {
      await setDoc(productoDocRef(item.id), item);
      return true;
    } catch (e) {
      console.error("Error al guardar producto:", e);
      mostrarErrorGuardado('⚠ No se pudo guardar el producto en la nube.');
      return false;
    }
  };

  const updateProducto = async (id, updater) => {
    try {
      const actual = biblioteca.find(p => p.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      const cambios = camposCambiados(actual, nuevo);
      if (!hayCambios(cambios)) return;
      if (nuevo.pub) {
        // Producto publicado: la copia pública de catalogoTiendas se
        // actualiza en el mismo batch. Antes sólo se actualizaba al volver
        // a "Guardar cambios" en la pestaña Catálogo, y hasta entonces el
        // catálogo público seguía mostrando (y vendiendo a) precio,
        // nombre e imágenes viejos.
        const batch = writeBatch(db);
        batch.update(productoDocRef(id), cambios);
        batch.set(catalogoProductoDocRef(id), proyeccionCatalogoProducto(nuevo));
        await batch.commit();
      } else {
        await updateDoc(productoDocRef(id), cambios);
      }
    } catch (e) {
      console.error("Error al actualizar producto:", e);
      mostrarErrorGuardado('⚠ No se pudo actualizar el producto en la nube.');
      // Antes este error se atrapaba acá y nunca se volvía a lanzar, así que
      // quien llamaba a updateProducto no tenía forma de saber que la
      // escritura había fallado — por eso el modal de edición mostraba
      // igual el toast de "✓ actualizado" aunque el guardado real hubiera
      // fracasado. Relanzamos para que el caller pueda reaccionar (ver
      // ModalBibEditarCat.jsx).
      throw e;
    }
  };

  const removeProducto = async (id) => {
    try {
      // Si el producto estaba publicado, su copia en catalogoTiendas/{uid}/
      // productos tiene que caer junto con él — si no, queda un "fantasma"
      // visible y pedible en /catalogo, encima con las imágenes rotas
      // (BibliotecaPage las borra de Storage antes de llamar acá). Se borra
      // la copia SIEMPRE, sin mirar el flag pub: borrar un doc inexistente
      // no falla en Firestore y el flag local puede estar desactualizado.
      const batch = writeBatch(db);
      batch.delete(productoDocRef(id));
      batch.delete(catalogoProductoDocRef(id));
      await batch.commit();
    } catch (e) {
      console.error("Error al eliminar producto:", e);
      mostrarErrorGuardado('⚠ No se pudo eliminar el producto en la nube.');
    }
  };

  // FAQ: mismo patrón que biblioteca (escritura directa por documento, sin
  // debounce), pero sobre la colección raíz "faq" -- firestore.rules ya
  // restringe la escritura a admins, así que estas funciones son seguras de
  // exponer a cualquier usuario (un no-admin simplemente recibirá
  // permission-denied si intentara llamarlas).
  const faqDocRef = (id) => doc(db, "faq", String(id));

  const addFaq = async (item) => {
    try {
      await setDoc(faqDocRef(item.id), item);
    } catch (e) {
      console.error("Error al guardar pregunta frecuente:", e);
      showToast('⚠ No se pudo guardar la pregunta en la nube.', 'error');
      throw e;
    }
  };

  const updateFaq = async (id, updater) => {
    try {
      const actual = faq.find(f => f.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      const cambios = camposCambiados(actual, nuevo);
      if (hayCambios(cambios)) await updateDoc(faqDocRef(id), cambios);
    } catch (e) {
      console.error("Error al actualizar pregunta frecuente:", e);
      showToast('⚠ No se pudo actualizar la pregunta en la nube.', 'error');
      throw e;
    }
  };

  const removeFaq = async (id) => {
    try {
      await deleteDoc(faqDocRef(id));
    } catch (e) {
      console.error("Error al eliminar pregunta frecuente:", e);
      showToast('⚠ No se pudo eliminar la pregunta en la nube.', 'error');
    }
  };

  // ids: array o Set de ids a actualizar. updater: (item) => nuevoItem,
  // recibe el producto ACTUAL (de `biblioteca`) y devuelve la versión
  // completa a guardar. Los productos cuyo id no esté en `biblioteca` se
  // omiten silenciosamente (por si se armó la selección con datos viejos).
  const updateProductosBulk = async (ids, updater) => {
    try {
      const idSet = ids instanceof Set ? ids : new Set(ids);
      const afectados = biblioteca.filter(p => idSet.has(p.id));
      if (!afectados.length) return;

      // Igual que en updateProducto: los publicados re-sincronizan su copia
      // pública de catalogoTiendas en la misma pasada. Eso puede duplicar
      // las operaciones por producto, y los batch de Firestore admiten 500
      // como máximo — por eso se trocea en tandas y se commitean todas.
      const batches = [];
      let batch = writeBatch(db);
      let ops = 0;
      const agregarOp = (ref, data, { parcial = false } = {}) => {
        if (parcial) batch.update(ref, data);
        else batch.set(ref, data);
        ops++;
        if (ops >= 400) {
          batches.push(batch);
          batch = writeBatch(db);
          ops = 0;
        }
      };
      afectados.forEach(p => {
        const nuevo = updater(p);
        const cambios = camposCambiados(p, nuevo);
        if (!hayCambios(cambios)) return;
        agregarOp(productoDocRef(p.id), cambios, { parcial: true });
        if (nuevo.pub) {
          agregarOp(catalogoProductoDocRef(p.id), proyeccionCatalogoProducto(nuevo));
        }
      });
      batches.push(batch);
      await Promise.all(batches.map(b => b.commit()));
    } catch (e) {
      console.error("Error al actualizar productos en lote:", e);
      mostrarErrorGuardado('⚠ No se pudo aplicar la actualización masiva en la nube.');
    }
  };

  // ---------------------------------------------------------------------
  // FASE 4 de la migración a Firestore por secciones: pedidos pasa de ser
  // un array dentro del documento monolítico a una subcolección propia
  // (users/{uid}/pedidos/{pedidoId}), un documento por pedido. Es la
  // última sección y la más delicada: la de mayor volumen de escritura y
  // la que originalmente disparaba el bug de la race condition (un único
  // timestamp de eco compartido para todo el documento monolítico no
  // alcanzaba cuando había múltiples guardados en vuelo). Con cada pedido
  // como documento independiente, ese problema desaparece de raíz: ya no
  // hay un timestamp global que comparar, cada escritura confirma sólo su
  // propio documento.
  //
  // Mismo patrón que clientes/biblioteca: escritura directa por documento,
  // estado local alimentado por listener en tiempo real. Se agrega además
  // updatePedidosDondeCoincida, para el único caso de actualización masiva
  // que existe hoy (renombrar el cliente en todos sus pedidos cuando se
  // edita el nombre del cliente) — a diferencia de updateProductosBulk
  // (Fase 3), acá no se conoce el conjunto de ids de antemano, se filtra
  // por una condición.
  const pedidoDocRef = (id) => doc(db, "users", cuentaId, "pedidos", String(id));

  // Límites del plan que frenan CREAR un pedido (los hace cumplir
  // firestore.rules: dentroDelLimiteDePedidos y dentroDelLimiteDeMonto).
  // Chequearlos acá antes sólo sirve para mostrar un mensaje claro en vez
  // del error genérico de guardado; si el consumo todavía no cargó, se deja
  // pasar y decide la regla.
  const motivoLimitePedido = () => {
    const limites = planContratado?.limites;
    if (!limites || !consumoActual) return null;
    if (limites.pedidosMes != null && (consumoActual.pedidosCreados || 0) >= limites.pedidosMes) {
      return `Llegaste al límite de ${limites.pedidosMes} pedidos por mes de tu plan. Vas a poder crear pedidos nuevos cuando empiece el próximo ciclo, o antes si pasás a un plan superior.`;
    }
    if (limites.montoFacturadoMes != null && (consumoActual.montoFacturado || 0) >= limites.montoFacturadoMes) {
      return 'Llegaste al monto facturado por mes de tu plan. Vas a poder crear pedidos nuevos cuando empiece el próximo ciclo, o antes si pasás a un plan superior. Los pedidos que ya tenés se pueden seguir editando.';
    }
    return null;
  };

  // Devuelve true si el pedido se guardó (lo usa la aprobación de un
  // presupuesto para no marcarlo aprobado si el pedido no se pudo crear).
  const addPedido = async (item) => {
    const motivo = motivoLimitePedido();
    if (motivo) {
      showToast(`⚠ ${motivo}`, 'error', 8000);
      return false;
    }
    try {
      await setDoc(pedidoDocRef(item.id), item);
      return true;
    } catch (e) {
      console.error("Error al guardar pedido:", e);
      mostrarErrorGuardado('⚠ No se pudo guardar el pedido en la nube.');
      return false;
    }
  };

  const updatePedido = async (id, updater) => {
    try {
      const actual = pedidos.find(p => p.id === id);
      if (!actual) return;
      const nuevo = typeof updater === 'function' ? updater(actual) : { ...actual, ...updater };
      const cambios = camposCambiados(actual, nuevo);
      if (hayCambios(cambios)) await updateDoc(pedidoDocRef(id), cambios);
    } catch (e) {
      console.error("Error al actualizar pedido:", e);
      mostrarErrorGuardado('⚠ No se pudo actualizar el pedido en la nube.');
    }
  };

  // Los pedidos no se eliminan: sólo se cancelan (estado 'cancelado' desde
  // PedidosPage o ModalPedidoDetalle). Por eso no existe un removePedido.

  // predicate: (pedido) => boolean. updater: (pedido) => nuevoPedido.
  const updatePedidosBulk = async (predicate, updater) => {
    try {
      const afectados = pedidos.filter(predicate);
      if (!afectados.length) return;

      // Troceado en tandas: un batch admite 500 operaciones como máximo.
      const cambiosPorPedido = afectados
        .map(p => [p.id, camposCambiados(p, updater(p))])
        .filter(([, cambios]) => hayCambios(cambios));
      for (let i = 0; i < cambiosPorPedido.length; i += 400) {
        const batch = writeBatch(db);
        cambiosPorPedido.slice(i, i + 400).forEach(([id, cambios]) => batch.update(pedidoDocRef(id), cambios));
        await batch.commit();
      }
    } catch (e) {
      console.error("Error al actualizar pedidos en lote:", e);
      mostrarErrorGuardado('⚠ No se pudo aplicar la actualización masiva en la nube.');
    }
  };

  return {
    productoDocRef,
    addCompra, updateCompra, removeCompra,
    addPresupuesto, updatePresupuesto, removePresupuesto,
    addCliente, updateCliente, removeCliente,
    addProducto, updateProducto, removeProducto, updateProductosBulk,
    addFaq, updateFaq, removeFaq,
    addPedido, updatePedido, updatePedidosBulk
  };
}
