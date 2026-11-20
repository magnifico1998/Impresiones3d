import React, { useEffect, useState } from 'react';
import { useConfig, useUi } from '../../context/contextos';
import { generarPdfPresupuesto } from '../../utils/presupuestoPDF';
import { useCapaModal } from '../CapaModal';
import CampoMoneda from '../CampoMoneda';
import CampoNumero from '../CampoNumero';

// Presupuesto de la página de inicio (sin sesión): toma el cálculo que está en
// la Calculadora y ofrece sólo bajar el PDF. No guarda nada: sin cuenta no hay
// dónde (para seguirlo y convertirlo en pedido hace falta registrarse).
export default function ModalPresupuestoPdf({ isOpen, onClose, calculo }) {
  const capaModal = useCapaModal({ onClose, activo: isOpen });
  const { fmt } = useConfig();
  const { showToast } = useUi();

  const [emprendimiento, setEmprendimiento] = useState('');
  const [cliente, setCliente] = useState('');
  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState(0);
  const [notas, setNotas] = useState('');
  const [generando, setGenerando] = useState(false);

  // El formulario se arma una sola vez, al abrirse, con lo que dio la calculadora.
  useEffect(() => {
    if (!isOpen) return;
    setProducto(calculo?.nombreArchivo || 'Producto impreso en 3D');
    setCantidad(calculo?.cantidad || 1);
    setPrecio(calculo?.precio || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const total = cantidad * precio;

  const descargar = async () => {
    if (!(cantidad > 0)) {
      showToast('Poné una cantidad mayor a 0.', 'error');
      return;
    }
    setGenerando(true);
    try {
      await generarPdfPresupuesto({
        empresa: { nombre: emprendimiento.trim() },
        fmt,
        numero: null,
        fecha: new Date().toLocaleDateString('es-AR'),
        cliente: cliente.trim(),
        telefono: '',
        email: '',
        notas: notas.trim(),
        items: [{ id: 1, nombre: producto.trim() || 'Producto', cantidad, precioUnitario: precio }]
      });
      showToast('PDF generado correctamente');
      onClose();
    } catch (e) {
      console.error('No se pudo generar el PDF del presupuesto:', e);
      showToast('No se pudo generar el PDF. Probá de nuevo.', 'error');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Presupuesto en PDF</div>
        <div className="modal-sub">Completá los datos y descargalo para enviarlo a tu cliente.</div>

        <label className="fl" style={{ marginTop: 0 }}>Tu emprendimiento</label>
        <input type="text" value={emprendimiento} onChange={(e) => setEmprendimiento(e.target.value)} placeholder="Nombre que sale en el PDF" />

        <label className="fl">Para (cliente)</label>
        <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del interesado" />

        <label className="fl">Producto</label>
        <input type="text" value={producto} onChange={(e) => setProducto(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label className="fl">Cantidad</label>
            <CampoNumero value={cantidad} onChange={(e) => setCantidad(Math.max(0, parseFloat(e.target.value) || 0))} min={1} step={1} />
          </div>
          <div>
            <label className="fl">Precio unitario</label>
            <CampoMoneda value={precio} onChange={(e) => setPrecio(Math.max(0, parseFloat(e.target.value) || 0))} />
          </div>
        </div>

        <label className="fl">Notas (opcional)</label>
        <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Plazo de entrega, forma de pago…" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontWeight: 600 }}>
          <span>Total</span>
          <span style={{ color: 'var(--accent2)', fontSize: '16px' }}>{fmt(total)}</span>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={descargar} disabled={generando}>
            {generando ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
