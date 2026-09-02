import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { jsPDF } from 'jspdf';
import { loadImageAsBase64 } from '../../utils/loadImageAsBase64';

// Presupuesto para un potencial cliente, sin crear ningún pedido: no toca
// `clientes`, no persiste nada en Firestore -- se arma la lista de
// productos (importados de Biblioteca/Calculadora o tipeados a mano) y se
// genera un PDF al vuelo. A propósito no tiene versiones/color por ítem
// (a diferencia de un pedido real): acá sólo interesa nombre/cantidad/precio.
export default function ModalPresupuesto({ isOpen, onClose, selectedProdIds, presupuestoActual }) {
  const { biblioteca, empresa, fmt, showToast } = useApp();

  const [items, setItems] = useState([]);
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [notas, setNotas] = useState('');

  // Mismo criterio que ModalArmarPedido.jsx: el formulario se arma UNA
  // sola vez en la transición cerrado -> abierto, nunca mientras sigue
  // abierto (si no, cualquier cambio de referencia en selectedProdIds
  // pisaría precios/cantidades ya editados a mano).
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const recienAbierto = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!recienAbierto) return;

    let itemsIniciales = [];
    if (selectedProdIds && selectedProdIds.size > 0) {
      itemsIniciales = Array.from(selectedProdIds).map(id => {
        const prod = biblioteca.find(p => p.id === id);
        if (!prod) return null;
        return {
          id: Date.now() + Math.random(),
          nombre: prod.nombre,
          cantidad: prod.cantidad || 1,
          precioUnitario: prod.precioSugUnitario || prod.costoUnitario || 0
        };
      }).filter(Boolean);
    } else if (presupuestoActual) {
      itemsIniciales = [{
        id: Date.now() + Math.random(),
        nombre: presupuestoActual.nombreArchivo || 'Producto',
        cantidad: presupuestoActual.cantidad || 1,
        precioUnitario: presupuestoActual.precio || 0
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

  const handleItemChange = (id, campo, valor) => {
    setItems(prev => prev.map(it => it.id === id
      ? { ...it, [campo]: campo === 'nombre' ? valor : Math.max(0, parseFloat(valor) || 0) }
      : it));
  };

  const handleRemoveItem = (id) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const handleAddItemLibre = () => {
    setItems(prev => [...prev, { id: Date.now() + Math.random(), nombre: '', cantidad: 1, precioUnitario: 0 }]);
  };

  const total = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);

  const generarPdf = async () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, marginX = 15, contentW = pageW - marginX * 2;
    const navy = [40, 48, 61], lightGray = [235, 237, 240];
    let y = 18;

    function checkPageBreak(neededH) {
      if (y + neededH > 278) {
        doc.addPage();
        y = 20;
      }
    }

    // Logo (if exists) + Title
    let titleX = marginX;
    if (empresa.logo) {
      try {
        const { dataUrl } = await loadImageAsBase64(empresa.logo);
        doc.addImage(dataUrl, 'JPEG', marginX, y - 9, 14, 14);
        titleX = marginX + 18;
      } catch (err) {
        console.error('No se pudo cargar el logo para el PDF del presupuesto:', err);
      }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(30, 33, 40);
    doc.text('PRESUPUESTO', titleX, y);

    // Business details
    let ey = y - 6;
    doc.setFontSize(9);
    if (empresa.nombre) {
      doc.setFont('helvetica', 'bold');
      doc.text(empresa.nombre, pageW - marginX, ey, { align: 'right' });
      ey += 4.5;
      doc.setFont('helvetica', 'normal');
    }
    const dirLine = [empresa.direccion, empresa.cp].filter(Boolean).join(', ');
    if (dirLine) { doc.text(dirLine, pageW - marginX, ey, { align: 'right' }); ey += 4.2; }
    if (empresa.telefono) { doc.text(empresa.telefono, pageW - marginX, ey, { align: 'right' }); ey += 4.2; }
    if (empresa.email) { doc.text(empresa.email, pageW - marginX, ey, { align: 'right' }); }

    y += 10;
    doc.setDrawColor(210); doc.setLineWidth(0.3); doc.line(marginX, y, pageW - marginX, y);
    y += 7;

    // Fecha (sin N°: nada se persiste, no hay un correlativo real)
    doc.setFontSize(10); doc.setTextColor(30, 33, 40);
    doc.setFont('helvetica', 'bold'); doc.text('Fecha:', marginX, y);
    doc.setFont('helvetica', 'normal'); doc.text(new Date().toLocaleDateString('es-AR'), marginX + 15, y);
    y += 10;

    // Seller / Buyer Header
    const boxW = (contentW - 6) / 2, boxX2 = marginX + boxW + 6, headerH = 7;
    doc.setFillColor(...navy);
    doc.rect(marginX, y, boxW, headerH, 'F'); doc.rect(boxX2, y, boxW, headerH, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('VENDEDOR', marginX + 3, y + 5); doc.text('INTERESADO', boxX2 + 3, y + 5);
    y += headerH;

    const vendLines = [empresa.nombre || '—', [empresa.direccion, empresa.cp].filter(Boolean).join(', '), empresa.telefono || '', empresa.email || ''].filter(l => l !== '');
    const cliLines = [nombreCliente || '—', telefono || '', email || ''].filter(l => l !== '');

    doc.setTextColor(40, 40, 40); doc.setFontSize(9);
    const wrapLines = (lines) => {
      const out = [];
      lines.forEach((l, i) => {
        doc.splitTextToSize(l, boxW - 6).forEach(w => out.push({ text: w, bold: i === 0 }));
      });
      return out;
    };
    const vendWrapped = wrapLines(vendLines);
    const cliWrapped = wrapLines(cliLines);
    const maxLines = Math.max(vendWrapped.length, cliWrapped.length, 1);
    const boxBodyH = maxLines * 4.7 + 4;
    doc.setDrawColor(220); doc.rect(marginX, y, boxW, boxBodyH); doc.rect(boxX2, y, boxW, boxBodyH);
    vendWrapped.forEach((l, i) => { doc.setFont('helvetica', l.bold ? 'bold' : 'normal'); doc.text(l.text, marginX + 3, y + 4.5 + i * 4.7); });
    cliWrapped.forEach((l, i) => { doc.setFont('helvetica', l.bold ? 'bold' : 'normal'); doc.text(l.text, boxX2 + 3, y + 4.5 + i * 4.7); });
    y += boxBodyH + 6;

    // Products table header
    checkPageBreak(20);
    doc.setFillColor(...navy);
    doc.rect(marginX, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('PRODUCTOS', marginX + 3, y + 5);
    y += 7;

    const colN = 8, colDesc = 86, colCant = 18, colPU = 34, colTot = 32;
    const xN = marginX, xDesc = xN + colN, xCant = xDesc + colDesc, xPU = xCant + colCant, xTot = xPU + colPU;
    doc.setFillColor(...lightGray);
    doc.rect(marginX, y, contentW, 6, 'F');
    doc.setTextColor(40, 40, 40); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.text('N°', xN + 2, y + 4.5);
    doc.text('DESCRIPCIÓN', xDesc + 2, y + 4.5);
    doc.text('CANT.', xCant + colCant - 2, y + 4.5, { align: 'right' });
    doc.text('PRECIO UNIT.', xPU + colPU - 2, y + 4.5, { align: 'right' });
    doc.text('TOTAL', xTot + colTot - 2, y + 4.5, { align: 'right' });
    y += 6;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
    items.forEach((it, i) => {
      const subtotal = it.cantidad * it.precioUnitario;
      const maxDescWidth = colDesc - 4;
      const nameLines = doc.splitTextToSize(it.nombre || 'Producto', maxDescWidth);
      const lineH = 3.6;
      const rowH = Math.max(6.5, nameLines.length * lineH + 1.8);

      checkPageBreak(rowH);
      if (i % 2 === 1) { doc.setFillColor(248, 248, 250); doc.rect(marginX, y, contentW, rowH, 'F'); }
      doc.setDrawColor(225); doc.rect(marginX, y, contentW, rowH);

      doc.setTextColor(40, 40, 40); doc.setFontSize(8.8); doc.setFont('helvetica', 'normal');
      const topTextY = y + 3.2;
      doc.text(String(i + 1), xN + 2, topTextY + 0.8);
      doc.text(nameLines, xDesc + 2, topTextY);

      const centerY = y + rowH / 2;
      doc.text(String(it.cantidad), xCant + colCant - 2, centerY, { baseline: 'middle', align: 'right' });
      doc.text(fmt(it.precioUnitario), xPU + colPU - 2, centerY, { baseline: 'middle', align: 'right' });
      doc.text(fmt(subtotal), xTot + colTot - 2, centerY, { baseline: 'middle', align: 'right' });

      y += rowH;
    });

    // TOTAL final destacado (sin descuento/envío/pagos: eso es de un pedido real)
    y += 2;
    const totalColTot = 36, totalColPU = 44;
    const xTotR = pageW - marginX - totalColTot;
    const xPUR = xTotR - totalColPU;
    const rowH = 8;
    checkPageBreak(rowH + 10);
    doc.setFillColor(...lightGray);
    doc.rect(xPUR, y, totalColPU, rowH, 'F'); doc.rect(xTotR, y, totalColTot, rowH, 'F');
    doc.setDrawColor(180); doc.rect(xPUR, y, totalColPU, rowH); doc.rect(xTotR, y, totalColTot, rowH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(40, 40, 40);
    doc.text('TOTAL', xPUR + 2, y + 5.5);
    doc.text(fmt(total), xTotR + totalColTot - 2, y + 5.5, { align: 'right' });
    y += rowH + 10;

    // Notas
    if (notas) {
      checkPageBreak(20);
      doc.setFillColor(...navy);
      doc.rect(marginX, y, contentW, 7, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('COMENTARIOS', marginX + 3, y + 5);
      y += 7;
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(notas, contentW - 6);
      const bh = lines.length * 5 + 4;
      checkPageBreak(bh);
      doc.setDrawColor(220); doc.rect(marginX, y, contentW, bh);
      doc.text(lines, marginX + 3, y + 5.5);
      y += bh + 8;
    }

    // Footer
    doc.setFontSize(9); doc.setTextColor(130, 130, 130); doc.setFont('helvetica', 'normal');
    doc.text(empresa.nombre || '', marginX, pageH - 14);

    // Date.now() sólo corre acá al tocar "Generar PDF" (nunca durante el
    // render) -- react-hooks/purity no distingue eso y marca cualquier
    // llamada impura dentro de una función async definida en el
    // componente, así que se desactiva puntualmente para esta línea.
    // eslint-disable-next-line react-hooks/purity
    const marcaTiempo = Date.now();
    const nameFile = `Presupuesto_${(nombreCliente || 'cliente')}_${marcaTiempo}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    doc.save(nameFile + '.pdf');
    showToast('PDF generado correctamente');
  };

  const handleGenerar = () => {
    if (!nombreCliente.trim()) {
      showToast('Ingresá el nombre del interesado.', 'error');
      return;
    }
    if (!items.length || !items.some(it => it.cantidad > 0)) {
      showToast('Agregá al menos un producto con cantidad mayor a 0.', 'error');
      return;
    }
    generarPdf();
    onClose();
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Nuevo presupuesto</div>
        <div className="modal-sub">Genera un PDF de presupuesto sin crear un pedido ni tocar Clientes.</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Nombre del interesado *</label>
            <input type="text" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Nombre y apellido" />
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
                  <button className="btn btn-danger btn-sm" style={{ padding: '2px 5px' }} onClick={() => handleRemoveItem(it.id)}>✕</button>
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
          <button className="btn btn-primary" onClick={handleGenerar}>Generar PDF</button>
        </div>
      </div>
    </div>
  );
}
