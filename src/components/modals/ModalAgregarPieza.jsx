import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

// Igual que ModalArmarPedido.jsx (el que arma pedidos desde Biblioteca):
// el pedido destino puede ser uno existente o "+ Crear pedido nuevo", y la
// pieza soporta versiones (color/comentario) repartiendo la cantidad total
// -- antes esto sólo se podía hacer armando el pedido desde Biblioteca, acá
// se agrega la misma capacidad para la pieza que sale de la Calculadora.
export default function ModalAgregarPieza({ isOpen, onClose, presupuestoActual, defaultPedidoId, onConfirm }) {
  const { pedidos, addPedido, updatePedido, clientes, addCliente, getNewId, showToast, cfg, fmt } = useApp();
  const [nombre, setNombre] = useState('');
  const [destino, setDestino] = useState('nuevo');
  const [cliente, setCliente] = useState('');
  const [desc, setDesc] = useState('');
  const [fechaPedido, setFechaPedido] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [versiones, setVersiones] = useState([]);

  const activePedidos = pedidos.filter(p => p.estado !== 'cancelado' && p.estado !== 'completado');

  useEffect(() => {
    if (isOpen && presupuestoActual) {
      const nombreSug = presupuestoActual.nombreArchivo
        ? presupuestoActual.nombreArchivo.replace(/\.(3mf|gcode|gco)$/i, '').replace(/\s*→.*$/, '').trim()
        : 'Pieza';
      setNombre(nombreSug);
      setDestino(defaultPedidoId ? defaultPedidoId.toString() : 'nuevo');
      setCliente('');
      setDesc('');
      setFechaPedido(new Date().toISOString().split('T')[0]);
      setFechaEntrega('');
      const cantidad = presupuestoActual.cantidad || 1;
      setVersiones([{ id: Date.now() + Math.random(), cantidad, color: '', comentario: '' }]);
    }
  }, [isOpen, presupuestoActual, defaultPedidoId]);

  if (!isOpen || !presupuestoActual) return null;


  const badgeText = (e) =>
    ({
      pendiente: 'Pendiente',
      progreso: 'En progreso',
      listo: 'Listo p/ entregar',
      completado: 'Completado',
      cancelado: 'Cancelado'
    }[e] || e);

  const cantidadTotal = presupuestoActual.cantidad || 1;
  const asignado = versiones.reduce((s, v) => s + v.cantidad, 0);
  const restante = cantidadTotal - asignado;

  const handleAddVersion = () => {
    if (restante <= 0) return;
    setVersiones(prev => [...prev, { id: Date.now() + Math.random(), cantidad: restante, color: '', comentario: '' }]);
  };

  const handleRemoveVersion = (verId) => {
    setVersiones(prev => prev.filter(v => v.id !== verId));
  };

  const handleVersionFieldChange = (verId, field, value) => {
    setVersiones(prev => prev.map(v => {
      if (v.id !== verId) return v;
      const val = field === 'cantidad' ? (parseInt(value) || 0) : value;
      return { ...v, [field]: val };
    }));
  };

  const handleConfirm = () => {
    if (destino === 'nuevo' && !cliente.trim()) {
      showToast('Ingresá el cliente del pedido nuevo.', 'error');
      return;
    }

    if (cantidadTotal > 1 && asignado !== cantidadTotal) {
      if (!window.confirm('Hay versiones sin asignar completamente (color/comentario). ¿Querés agregar la pieza igual?')) {
        return;
      }
    }

    const pz = presupuestoActual;

    const nuevaPieza = {
      id: getNewId(),
      nombre: nombre.trim() || 'Sin nombre',
      archivoNombre: pz.nombreArchivo || null,
      gcodeArchivos: pz.gcodeArchivos || null,
      costeFil: pz.costeFil || 0,
      filDetalle: pz.filDetalle || [],
      costeElec: pz.costeElec || 0,
      costeMant: pz.costeMant || 0,
      costeMO: pz.costeMO || 0,
      horas: pz.horas,
      impresoraNombre: pz.impresoraNombre || null,
      costoUnitario: pz.total,
      precioVenta: pz.precio || 0,
      cantidad: pz.cantidad,
      elaborados: 0,
      notas: '',
      versiones: versiones.map(v => ({
        id: Date.now() + Math.random(),
        cantidad: v.cantidad,
        color: v.color,
        comentario: v.comentario,
        realizados: 0
      }))
    };

    let pedidoDestinoId;

    if (destino === 'nuevo') {
      const clienteTrim = cliente.trim();
      const newIdVal = getNewId();
      const nuevo = {
        id: newIdVal,
        cliente: clienteTrim,
        desc: desc.trim(),
        estado: 'pendiente',
        fechaPedido: fechaPedido || new Date().toISOString().slice(0, 10),
        fechaEntrega: fechaEntrega || '',
        notaGeneral: '',
        piezas: [nuevaPieza],
        precioVenta: (nuevaPieza.precioVenta || 0) * nuevaPieza.cantidad,
        envio: 0,
        insumos: [],
        creado: new Date().toLocaleDateString('es-AR'),
        creadoTs: Date.now()
      };
      addPedido(nuevo);
      pedidoDestinoId = newIdVal;

      // Mismo criterio que ModalPedido.jsx: si el nombre de cliente no
      // coincide con ninguno ya cargado, se da de alta automáticamente
      // (con los datos de contacto vacíos, para completar después desde
      // Clientes) -- antes esto sólo pasaba creando el pedido desde
      // "Nuevo pedido", no desde acá.
      const existeCliente = clientes.some(c => c.nombre.trim().toLowerCase() === clienteTrim.toLowerCase());
      if (!existeCliente) {
        addCliente({
          id: getNewId(),
          nombre: clienteTrim,
          calle: '',
          altura: '',
          loc: '',
          cp: '',
          tel: '',
          email: '',
          fechaAlta: new Date().toLocaleDateString('es-AR'),
          fechaAltaTs: Date.now()
        });
        showToast('Cliente nuevo creado automáticamente. Completá sus datos en la sección Clientes.', 'info');
      }
    } else {
      const targetPedidoId = parseInt(destino, 10);
      updatePedido(targetPedidoId, (p) => {
        const piezas = [...p.piezas, nuevaPieza];
        const newPrecioVenta = piezas.reduce((s, x) => {
          const unit = x.precioVenta !== undefined ? x.precioVenta : (x.precioEstimado || 0);
          return s + (unit * x.cantidad);
        }, 0);
        return { ...p, piezas, precioVenta: newPrecioVenta };
      });
      pedidoDestinoId = targetPedidoId;
    }

    showToast(`Pieza "${nuevaPieza.nombre}" agregada con éxito`);
    onClose();

    if (onConfirm) {
      onConfirm(nuevaPieza.nombre, pedidoDestinoId);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Agregar pieza a pedido</div>
        <div className="modal-sub">Nombrá la pieza y elegí a qué pedido va (o creá uno nuevo).</div>

        <label className="fl">Nombre de la pieza</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Fuselaje delantero"
        />

        <label className="fl">Pedido destino</label>
        <select value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="nuevo">+ Crear pedido nuevo</option>
          {activePedidos.map(p => (
            <option key={p.id} value={p.id}>
              {p.cliente} — {p.desc || 'Sin descripción'} [{badgeText(p.estado)}]
            </option>
          ))}
        </select>

        {destino === 'nuevo' && (
          <div style={{ marginTop: '4px' }}>
            <label className="fl">Cliente</label>
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nombre del cliente"
            />

            <label className="fl">Descripción del proyecto</label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ej: Pedido de figuras"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="fl">Fecha del pedido</label>
                <input
                  type="date"
                  value={fechaPedido}
                  onChange={(e) => setFechaPedido(e.target.value)}
                />
              </div>
              <div>
                <label className="fl">Fecha max. entrega</label>
                <input
                  type="date"
                  value={fechaEntrega}
                  onChange={(e) => setFechaEntrega(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className="sep"></div>

        <div style={{ background: 'rgba(255,255,255,.03)', border: '1px dashed var(--border2)', borderRadius: '8px', padding: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Versiones ({cantidadTotal} unidad{cantidadTotal !== 1 ? 'es' : ''})
            </span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: restante === 0 ? 'var(--accent)' : 'var(--warn)' }}>
              {restante === 0 ? '✓ Completo' : `Faltan asignar ${restante}`}
            </span>
          </div>

          {versiones.map(v => (
            <div key={v.id} className="version-row">
              <input
                type="number"
                min="1"
                max={cantidadTotal}
                value={v.cantidad}
                onChange={(e) => handleVersionFieldChange(v.id, 'cantidad', e.target.value)}
              />
              <select
                value={v.color || ''}
                onChange={(e) => handleVersionFieldChange(v.id, 'color', e.target.value)}
              >
                <option value="">Sin color</option>
                {(cfg?.colores || []).map((col, ci) => (
                  <option key={ci} value={col.nombre}>{col.nombre}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Comentario..."
                value={v.comentario || ''}
                onChange={(e) => handleVersionFieldChange(v.id, 'comentario', e.target.value)}
              />
              {versiones.length > 1 && (
                <button className="btn btn-danger btn-sm" style={{ padding: '2px 5px' }} onClick={() => handleRemoveVersion(v.id)}>✕</button>
              )}
            </div>
          ))}

          {restante > 0 && (
            <button className="btn btn-sm" style={{ width: '100%', marginTop: '6px' }} onClick={handleAddVersion}>
              + Agregar versión (faltan {restante})
            </button>
          )}
        </div>

        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px',
          marginTop: '12px',
          fontSize: '12px',
          color: 'var(--text2)',
          fontFamily: 'var(--mono)'
        }}>
          Costo: <strong>{fmt(presupuestoActual.total * presupuestoActual.cantidad)}</strong> ·
          Precio sugerido: <strong>{fmt(presupuestoActual.precio * presupuestoActual.cantidad)}</strong> ·
          {presupuestoActual.cantidad} unidad(es)
          {presupuestoActual.gcodeArchivos && presupuestoActual.gcodeArchivos.length > 1 && (
            <div style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '11px' }}>
              Archivos: {presupuestoActual.gcodeArchivos.join(', ')}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            {destino === 'nuevo' ? 'Crear pedido y agregar' : 'Agregar pieza'}
          </button>
        </div>
      </div>
    </div>
  );
}
