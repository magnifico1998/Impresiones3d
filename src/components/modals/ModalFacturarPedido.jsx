import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { confirmar, avisar } from '../Dialogos';
import { CONDICIONES_IVA, pesosAR, receptorDesdeCliente } from '../../utils/facturacion';
import { useCapaModal } from '../CapaModal';
import CampoMoneda from '../CampoMoneda';

// Arma la Factura C de un pedido, precargada con sus piezas, la
// bonificación y el envío, y el receptor desde la ficha del cliente. Todo
// se puede ajustar antes de emitir (por ejemplo, facturar sólo la seña).
// La emisión la hace el servidor (facturarPedido).

function armarInicial(pedido, cliente, precioVentaNeto) {
  const items = (pedido.piezas || [])
    .filter((pz) => (pz.cantidad || 0) > 0)
    .map((pz) => ({
      descripcion: pz.nombre || 'Producto',
      cantidad: String(pz.cantidad),
      precioUnitario: String(pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0))
    }));
  const subtotalPiezas = items.reduce((s, it) => s + Number(it.cantidad) * Number(it.precioUnitario), 0);
  // La bonificación es lo que separa la suma de las piezas del precio neto
  // del pedido (descuento en monto o porcentaje, o un precio ajustado a mano).
  const descuento = Math.max(0, Math.round((subtotalPiezas - precioVentaNeto) * 100) / 100);
  const envio = parseFloat(pedido.envio) || 0;
  if (envio > 0) items.push({ descripcion: 'Envío', cantidad: '1', precioUnitario: String(envio) });
  return {
    receptor: receptorDesdeCliente(cliente, pedido.cliente),
    items: items.length ? items : [{ descripcion: '', cantidad: '1', precioUnitario: '' }],
    descuento: descuento ? String(descuento) : '',
    enviarMail: !!cliente?.email,
    guardarEnCliente: false
  };
}

export default function ModalFacturarPedido({ pedido, cliente, precioVentaNeto, onClose }) {
  const { updateCliente, showToast } = useApp();
  const [form, setForm] = useState(() => armarInicial(pedido, cliente, precioVentaNeto));
  const [emitiendo, setEmitiendo] = useState(false);
  const capaModal = useCapaModal({ onClose, activo: true, bloqueado: emitiendo });

  const r = form.receptor;
  const subtotal = form.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0), 0);
  const total = Math.round((subtotal - (Number(form.descuento) || 0)) * 100) / 100;

  const cambiarReceptor = (campo) => (e) => {
    const valor = e.target.value;
    setForm((prev) => {
      const receptor = { ...prev.receptor, [campo]: valor };
      // Sin CUIT, ARCA sólo acepta consumidor final.
      if (campo === 'docTipo' && valor !== '80') receptor.condicionIvaId = '5';
      return { ...prev, receptor };
    });
  };
  const cambiarItem = (i, campo) => (e) => setForm((prev) => ({
    ...prev, items: prev.items.map((it, j) => (j === i ? { ...it, [campo]: e.target.value } : it))
  }));

  const emitir = async () => {
    if (!(await confirmar(`Se va a emitir una Factura C por ${pesosAR(total)} a ${r.nombre || 'consumidor final'}. Queda informada en ARCA y sólo se puede anular con una nota de crédito.`, { titulo: 'Emitir factura', textoConfirmar: 'Emitir' }))) return;
    setEmitiendo(true);
    try {
      // Se guarda en la ficha antes de emitir: si ARCA la rechaza, los datos
      // del cliente igual quedan corregidos para el próximo intento.
      if (form.guardarEnCliente && cliente) {
        await updateCliente(cliente.id, {
          ...cliente,
          documento: r.docTipo === '99' ? cliente.documento || '' : r.docNro,
          condicionIva: r.condicionIvaId,
          email: r.email || cliente.email || ''
        });
      }
      const res = await httpsCallable(functions, 'facturarPedido', { timeout: 300000 })({
        pedidoId: String(pedido.id),
        receptor: { ...r, docTipo: Number(r.docTipo), condicionIvaId: Number(r.condicionIvaId) },
        items: form.items.map((it) => ({ descripcion: it.descripcion, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario) })),
        descuento: Number(form.descuento) || 0,
        enviarMail: form.enviarMail && !!r.email
      });
      if (res.data.estado === 'emitida') {
        showToast(`Factura emitida · CAE ${res.data.cae}`);
        onClose();
      } else {
        await avisar((res.data.errores || []).map((e) => `${e.codigo}: ${e.mensaje}`).join('\n') || 'No se pudo emitir.', { titulo: 'ARCA no autorizó la factura' });
        onClose();
      }
    } catch (e) {
      showToast(e?.message || 'No se pudo emitir la factura.', 'error');
    } finally {
      setEmitiendo(false);
    }
  };

  // Portal al body: se abre desde el detalle del pedido, y su animación
  // (transform) haría que este overlay "fixed" quede anclado a ese modal en
  // vez de a la pantalla. margin auto lo centra y, si es más alto que la
  // pantalla, deja scrollear sin cortar el principio.
  return createPortal(
    <div className="modal-overlay open" {...capaModal} style={{ zIndex: 120, padding: '20px 16px' }}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto' }}>
        <div className="modal-title">Facturar pedido #{String(pedido.id).padStart(4, '0')}</div>

        <div className="card-title" style={{ marginTop: 0 }}>Cliente</div>
        <div className="grid2">
          <div>
            <label className="fl">Documento</label>
            <select value={r.docTipo} onChange={cambiarReceptor('docTipo')}>
              <option value="99">Consumidor final sin identificar</option>
              <option value="96">DNI</option>
              <option value="80">CUIT</option>
            </select>
          </div>
          {r.docTipo !== '99' && (
            <div>
              <label className="fl">Número</label>
              <input type="text" value={r.docNro} onChange={cambiarReceptor('docNro')} />
            </div>
          )}
          <div>
            <label className="fl">Condición frente al IVA</label>
            <select value={r.condicionIvaId} onChange={cambiarReceptor('condicionIvaId')} disabled={r.docTipo !== '80'}>
              {CONDICIONES_IVA.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
            </select>
          </div>
          <div>
            <label className="fl">Nombre / razón social</label>
            <input type="text" value={r.nombre} onChange={cambiarReceptor('nombre')} />
          </div>
          <div>
            <label className="fl">Domicilio</label>
            <input type="text" value={r.domicilio} onChange={cambiarReceptor('domicilio')} />
          </div>
          <div>
            <label className="fl">Email</label>
            <input type="email" value={r.email} onChange={cambiarReceptor('email')} />
          </div>
        </div>
        {cliente && (
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', marginTop: '10px' }}>
            <input type="checkbox" checked={form.guardarEnCliente} onChange={(e) => setForm((p) => ({ ...p, guardarEnCliente: e.target.checked }))} />
            Guardar documento, condición y email en la ficha de {cliente.nombre}
          </label>
        )}

        <div className="card-title" style={{ marginTop: '18px' }}>Detalle</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {form.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" style={{ flex: '1 1 220px', width: 'auto' }} placeholder="Descripción" value={it.descripcion} onChange={cambiarItem(i, 'descripcion')} />
              <input type="number" style={{ width: '80px' }} min="1" placeholder="Cant." value={it.cantidad} onChange={cambiarItem(i, 'cantidad')} />
              <CampoMoneda sinSimbolo type="number" style={{ width: '130px' }} min="0" step="0.01" placeholder="Precio unit." value={it.precioUnitario} onChange={cambiarItem(i, 'precioUnitario')} />
              {form.items.length > 1 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))}>Quitar</button>
              )}
            </div>
          ))}
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setForm((p) => ({ ...p, items: [...p.items, { descripcion: '', cantidad: '1', precioUnitario: '' }] }))}>+ Ítem</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '12px' }}>
          <div style={{ width: '160px' }}>
            <label className="fl">Bonificación ($)</label>
            <CampoMoneda sinSimbolo type="number" min="0" step="0.01" value={form.descuento} onChange={(e) => setForm((p) => ({ ...p, descuento: e.target.value }))} />
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Subtotal {pesosAR(subtotal)}</div>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>Total {pesosAR(total)}</div>
        </div>

        {r.email && (
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', marginTop: '12px' }}>
            <input type="checkbox" checked={form.enviarMail} onChange={(e) => setForm((p) => ({ ...p, enviarMail: e.target.checked }))} />
            Mandarle el PDF por mail a {r.email}
          </label>
        )}

        <div className="modal-footer">
          <button className="btn" disabled={emitiendo} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={emitiendo || !(total > 0)} onClick={emitir}>
            {emitiendo ? 'Emitiendo en ARCA…' : `Emitir Factura C por ${pesosAR(total)}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
