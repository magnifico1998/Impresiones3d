import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { fechaLocalHoy } from '../../utils/fechaCompletado';
import { generarPdfPresupuesto } from '../../utils/presupuestoPDF';

// Presupuesto para un potencial cliente. Se puede generar sólo el PDF (como
// siempre, sin guardar nada) o guardarlo en la sección Presupuestos, desde
// donde se sigue su estado y, si lo aprueban, se convierte en pedido (ver
// PresupuestosPage.jsx). No toca `clientes` ni `pedidos` hasta aprobarse.
//
// Cada línea guarda de dónde salió (prodId de Biblioteca, o una copia del
// cálculo de la Calculadora en `calc`) para que el pedido que se crea al
// aprobar conserve costos y datos de impresión (ver utils/piezaPedido.js).
// Las líneas libres no tienen costos.
//
// `presupuestoEditar`: un presupuesto ya guardado para editar (sólo en
// estado creado/enviado; PresupuestosPage no ofrece editar los cerrados).

// Copia del resultado de la Calculadora con sólo lo que hace falta para
// armar la pieza del pedido. Firestore rechaza valores undefined, por eso
// cada campo cae a un valor definido.
const copiaCalculo = (pz) => ({
  nombreArchivo: pz.nombreArchivo ?? null,
  gcodeArchivos: pz.gcodeArchivos ?? null,
  costeFil: pz.costeFil ?? 0,
  filDetalle: pz.filDetalle ?? [],
  costeElec: pz.costeElec ?? 0,
  costeMant: pz.costeMant ?? 0,
  costeMO: pz.costeMO ?? 0,
  horas: pz.horas ?? 0,
  impresoraNombre: pz.impresoraNombre ?? null,
  total: pz.total ?? 0
});

const nuevoIdLinea = () => Date.now() + Math.random();

export default function ModalPresupuesto({ isOpen, onClose, selectedProdIds, presupuestoActual, presupuestoEditar }) {
  const {
    biblioteca, clientes, empresa, fmt, showToast, getNewId,
    addPresupuesto, updatePresupuesto, siguienteNumeroPresupuesto
  } = useApp();

  const [items, setItems] = useState([]);
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Mismo criterio que ModalArmarPedido.jsx: el formulario se arma UNA
  // sola vez en la transición cerrado -> abierto, nunca mientras sigue
  // abierto (si no, cualquier cambio de referencia en selectedProdIds
  // pisaría precios/cantidades ya editados a mano).
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const recienAbierto = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!recienAbierto) return;

    if (presupuestoEditar) {
      setItems((presupuestoEditar.items || []).map(it => ({ ...it, id: it.id ?? nuevoIdLinea() })));
      setNombreCliente(presupuestoEditar.cliente || '');
      setTelefono(presupuestoEditar.telefono || '');
      setEmail(presupuestoEditar.email || '');
      setNotas(presupuestoEditar.notas || '');
      return;
    }

    let itemsIniciales = [];
    if (selectedProdIds && selectedProdIds.size > 0) {
      itemsIniciales = Array.from(selectedProdIds).map(id => {
        const prod = biblioteca.find(p => p.id === id);
        if (!prod) return null;
        return {
          id: nuevoIdLinea(),
          nombre: prod.nombre,
          cantidad: prod.cantidad || 1,
          precioUnitario: prod.precioSugUnitario || prod.costoUnitario || 0,
          prodId: prod.id
        };
      }).filter(Boolean);
    } else if (presupuestoActual) {
      itemsIniciales = [{
        id: nuevoIdLinea(),
        nombre: presupuestoActual.nombreArchivo || 'Producto',
        cantidad: presupuestoActual.cantidad || 1,
        precioUnitario: presupuestoActual.precio || 0,
        calc: copiaCalculo(presupuestoActual)
      }];
    }

    setItems(itemsIniciales);
    setNombreCliente('');
    setTelefono('');
    setEmail('');
    setNotas('');
    // A propósito sin `biblioteca`/`selectedProdIds`/`presupuestoActual`
    // como disparadores reales -- mismo motivo que ModalArmarPedido.jsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const editando = !!presupuestoEditar;

  const handleItemChange = (id, campo, valor) => {
    setItems(prev => prev.map(it => it.id === id
      ? { ...it, [campo]: campo === 'nombre' ? valor : Math.max(0, parseFloat(valor) || 0) }
      : it));
  };

  const handleRemoveItem = (id) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const handleAddItemLibre = () => {
    setItems(prev => [...prev, { id: nuevoIdLinea(), nombre: '', cantidad: 1, precioUnitario: 0 }]);
  };

  const total = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);

  const validar = () => {
    if (!nombreCliente.trim()) {
      showToast('Ingresá el nombre del interesado.', 'error');
      return false;
    }
    if (!items.length || !items.some(it => it.cantidad > 0)) {
      showToast('Agregá al menos un producto con cantidad mayor a 0.', 'error');
      return false;
    }
    return true;
  };

  // Líneas tal como se guardan: sin claves undefined (Firestore las rechaza)
  // y sin las de cantidad 0.
  const itemsParaGuardar = () => items
    .filter(it => it.cantidad > 0)
    .map(it => {
      const linea = { id: it.id, nombre: it.nombre.trim() || 'Producto', cantidad: it.cantidad, precioUnitario: it.precioUnitario };
      if (it.prodId != null) linea.prodId = it.prodId;
      if (it.calc) linea.calc = it.calc;
      return linea;
    });

  const bajarPdf = (numero, fecha, lineas) => generarPdfPresupuesto({
    empresa, fmt, numero, fecha,
    cliente: nombreCliente.trim(), telefono: telefono.trim(), email: email.trim(), notas: notas.trim(),
    items: lineas
  }).then(() => showToast('PDF generado correctamente'));

  const handleSoloPdf = () => {
    if (!validar()) return;
    bajarPdf(null, new Date().toLocaleDateString('es-AR'), itemsParaGuardar());
    onClose();
  };

  const handleGuardar = async (conPdf) => {
    if (!validar()) return;
    setGuardando(true);
    const lineas = itemsParaGuardar();
    const datos = {
      cliente: nombreCliente.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      notas: notas.trim(),
      items: lineas,
      total: lineas.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0)
    };

    let ok, numero, fecha;
    if (editando) {
      numero = presupuestoEditar.numero;
      fecha = presupuestoEditar.fecha;
      ok = await updatePresupuesto(presupuestoEditar.id, (p) => ({ ...p, ...datos, actualizadoTs: Date.now() }));
    } else {
      numero = siguienteNumeroPresupuesto();
      fecha = fechaLocalHoy();
      ok = await addPresupuesto({
        id: getNewId(),
        numero,
        fecha,
        creadoTs: Date.now(),
        estado: 'creado',
        pedidoId: null,
        ...datos
      });
    }
    setGuardando(false);
    if (!ok) return;

    showToast(editando ? '✓ Presupuesto actualizado.' : `✓ Presupuesto N° ${numero} guardado en Presupuestos.`);
    if (conPdf) bajarPdf(numero, fecha.split('-').reverse().join('/'), lineas);
    onClose();
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{editando ? `Presupuesto N° ${presupuestoEditar.numero}` : 'Nuevo presupuesto'}</div>
        <div className="modal-sub">
          {editando
            ? 'Editá los datos del presupuesto guardado.'
            : 'Guardalo para seguirlo en Presupuestos y convertirlo en pedido si lo aprueban, o generá sólo el PDF.'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Nombre del interesado *</label>
            <input type="text" list="presupuesto-clientes" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Nombre y apellido" />
            <datalist id="presupuesto-clientes">
              {clientes.map(c => <option key={c.id} value={c.nombre} />)}
            </datalist>
          </div>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Teléfono</label>
            <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <label className="fl">Notas (se muestran en el PDF)</label>
        <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />

        <div className="sep"></div>

        <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>
          Productos del presupuesto
        </div>

        <div style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
          {!items.length ? (
            <div className="empty">Todavía no hay productos. Agregá uno con "+ Línea libre".</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 100px 90px 24px', gap: '6px', fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: '4px' }}>
                <span>Producto</span>
                <span>Cant.</span>
                <span>Precio unit.</span>
                <span style={{ textAlign: 'right' }}>Subtotal</span>
                <span></span>
              </div>
              {items.map(it => (
                <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 100px 90px 24px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <input type="text" value={it.nombre} placeholder="Nombre del producto" onChange={(e) => handleItemChange(it.id, 'nombre', e.target.value)} />
                  <input type="number" min="0" value={it.cantidad} onChange={(e) => handleItemChange(it.id, 'cantidad', e.target.value)} />
                  <input type="number" min="0" value={it.precioUnitario} onChange={(e) => handleItemChange(it.id, 'precioUnitario', e.target.value)} />
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, textAlign: 'right' }}>{fmt(it.cantidad * it.precioUnitario)}</div>
                  <button className="btn btn-danger btn-sm" style={{ padding: '2px 5px' }} aria-label="Quitar línea" onClick={() => handleRemoveItem(it.id)}>✕</button>
                </div>
              ))}
            </>
          )}
        </div>

        <button className="btn btn-sm" style={{ width: '100%', marginTop: '6px' }} onClick={handleAddItemLibre}>
          + Línea libre
        </button>

        <div className="sep"></div>

        <div className="total-section">
          <div className="cost-line strong">
            <span>Total del presupuesto</span>
            <span>{fmt(total)}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          {!editando && <button className="btn" onClick={handleSoloPdf} disabled={guardando}>Sólo PDF</button>}
          <button className="btn" onClick={() => handleGuardar(false)} disabled={guardando}>
            {editando ? 'Guardar cambios' : 'Guardar'}
          </button>
          <button className="btn btn-primary" onClick={() => handleGuardar(true)} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar y generar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
