import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { jsPDF } from 'jspdf';

export default function ModalPedidoDetalle({ isOpen, onClose, pedidoId, onEditOrder, onAddProduct }) {
  const { 
    pedidos, 
    setPedidos, 
    cfg, 
    clientes, 
    empresa, 
    showToast 
  } = useApp();

  const [draft, setDraft] = useState(null);

  // Initialize draft when modal opens
  useEffect(() => {
    if (isOpen && pedidoId !== null) {
      const original = pedidos.find(x => x.id === pedidoId);
      if (original) {
        // Deep copy the order to create a draft
        setDraft(JSON.parse(JSON.stringify(original)));
      }
    } else {
      setDraft(null);
    }
  }, [isOpen, pedidoId, pedidos]);

  if (!isOpen || !draft) return null;

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const formatH = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  };

  const getClientContact = () => {
    const c = clientes.find(x => x.name === draft.cliente || x.nombre === draft.cliente);
    if (!c) return '';
    return [c.tel, c.email].filter(Boolean).join(' | ');
  };

  // Math calculations
  const getCostoPieza = (pz) => {
    return (pz.costoUnitario || pz.total || 0) * pz.cantidad;
  };

  const costoPiezasTotal = draft.piezas.reduce((s, pz) => s + getCostoPieza(pz), 0);
  const costoInsumosTotal = (draft.insumos || []).reduce((s, ins) => s + (ins.precio * (ins.qty || 1)), 0);
  const costoTotal = costoPiezasTotal + costoInsumosTotal;
  
  const ganancia = draft.precioVenta ? draft.precioVenta - costoTotal : 0;
  const totalAbonar = (draft.precioVenta || 0) + (parseFloat(draft.envio) || 0);

  // Totals of pieces progress bar
  const totalUnidades = draft.piezas.reduce((s, pz) => s + pz.cantidad, 0);
  const totalElaboradas = draft.piezas.reduce((s, pz) => s + (pz.elaborados || 0), 0);
  const pct = totalUnidades > 0 ? Math.round((totalElaboradas / totalUnidades) * 100) : 0;

  // Actions
  const handleSave = () => {
    setPedidos(prev => prev.map(p => p.id === draft.id ? draft : p));
    showToast('Cambios guardados con éxito');
    onClose();
  };

  const handleDeletePedido = () => {
    if (window.confirm('¿Eliminar este pedido y todas sus piezas?')) {
      setPedidos(prev => prev.filter(p => p.id !== draft.id));
      showToast('Pedido eliminado', 'info');
      onClose();
    }
  };

  const handleFieldChange = (field, val) => {
    setDraft(prev => ({ ...prev, [field]: val }));
  };

  // Piece actions
  const handleUpdatePartQty = (piezaId, qty) => {
    const newQty = parseInt(qty) || 1;
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          // Adjust unit price and subtotal
          const unit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0);
          const oldElab = pz.elaborados || 0;
          return {
            ...pz,
            cantidad: newQty,
            elaborados: Math.min(oldElab, newQty)
          };
        }
        return pz;
      });

      // Recalculate order sale price
      const newPrecioVenta = piezas.reduce((s, pz) => {
        const unit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0);
        return s + (unit * pz.cantidad);
      }, 0);

      return { ...prev, piezas, precioVenta: newPrecioVenta };
    });
  };

  const handleUpdatePartElaborados = (piezaId, elab) => {
    const newElab = parseInt(elab) || 0;
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          return {
            ...pz,
            elaborados: Math.min(newElab, pz.cantidad),
            completada: newElab >= pz.cantidad
          };
        }
        return pz;
      });

      // Auto update status to list for delivery if all units are done
      let nextEstado = prev.estado;
      const allDone = piezas.every(pz => (pz.elaborados || 0) >= pz.cantidad);
      if (allDone && prev.estado === 'progreso') {
        nextEstado = 'listo';
        showToast('¡Todas las piezas listas! Pedido listo para entregar.', 'success');
      }

      return { ...prev, piezas, estado: nextEstado };
    });
  };

  const handleUpdatePartVenta = (piezaId, subtotalVal) => {
    const totalVenta = parseFloat(subtotalVal) || 0;
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          return {
            ...pz,
            precioVenta: totalVenta / pz.cantidad
          };
        }
        return pz;
      });

      // Recalculate order sale price
      const newPrecioVenta = piezas.reduce((s, pz) => {
        const unit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0);
        return s + (unit * pz.cantidad);
      }, 0);

      return { ...prev, piezas, precioVenta: newPrecioVenta };
    });
  };

  const handleUpdatePartNotes = (piezaId, text) => {
    setDraft(prev => ({
      ...prev,
      piezas: prev.piezas.map(pz => pz.id === piezaId ? { ...pz, notas: text } : pz)
    }));
  };

  const handleDeletePart = (piezaId) => {
    if (window.confirm('¿Eliminar esta pieza del pedido?')) {
      setDraft(prev => {
        const piezas = prev.piezas.filter(pz => pz.id !== piezaId);
        
        // Recalculate order sale price
        const newPrecioVenta = piezas.reduce((s, pz) => {
          const unit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0);
          return s + (unit * pz.cantidad);
        }, 0);

        return { ...prev, piezas, precioVenta: newPrecioVenta };
      });
      showToast('Pieza eliminada');
    }
  };

  // Version actions
  const handleUpdateVersion = (piezaId, verId, field, value) => {
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          let versiones = pz.versiones.map(v => {
            if (v.id === verId) {
              const val = field === 'cantidad' || field === 'realizados' ? (parseInt(value) || 0) : value;
              return { ...v, [field]: val };
            }
            return v;
          });

          // Recalculate part's total elaborados from versions
          const newElab = versiones.reduce((s, v) => s + (v.realizados || 0), 0);

          return { 
            ...pz, 
            versiones, 
            elaborados: newElab,
            completada: newElab >= pz.cantidad
          };
        }
        return pz;
      });

      return { ...prev, piezas };
    });
  };

  const handleAddVersion = (piezaId) => {
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          const sumAsignado = (pz.versiones || []).reduce((s, v) => s + v.cantidad, 0);
          const left = pz.cantidad - sumAsignado;
          if (left <= 0) return pz;

          const newVer = {
            id: Date.now() + Math.random(),
            cantidad: left,
            realizados: 0,
            color: '',
            comentario: ''
          };

          return {
            ...pz,
            versiones: [...(pz.versiones || []), newVer]
          };
        }
        return pz;
      });
      return { ...prev, piezas };
    });
  };

  const handleDeleteVersion = (piezaId, verId) => {
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          const versiones = pz.versiones.filter(v => v.id !== verId);
          const newElab = versiones.reduce((s, v) => s + (v.realizados || 0), 0);
          return { 
            ...pz, 
            versiones,
            elaborados: newElab,
            completada: newElab >= pz.cantidad
          };
        }
        return pz;
      });
      return { ...prev, piezas };
    });
  };

  // Consumables (Insumos) actions
  const handleToggleInsumo = (name, price, checked) => {
    setDraft(prev => {
      let insumos = [...(prev.insumos || [])];
      if (checked) {
        // Add if not present
        if (!insumos.some(i => i.nombre === name)) {
          insumos.push({ nombre: name, precio: price, qty: 1 });
        }
      } else {
        // Remove
        insumos = insumos.filter(i => i.nombre !== name);
      }
      return { ...prev, insumos };
    });
  };

  const handleUpdateInsumoQty = (name, qty) => {
    const newQty = parseFloat(qty) || 1;
    setDraft(prev => ({
      ...prev,
      insumos: (prev.insumos || []).map(i => i.nombre === name ? { ...i, qty: newQty } : i)
    }));
  };

  const colorHexPorNombre = (nombre) => {
    return cfg.colores?.find(c => c.nombre === nombre)?.hex || '';
  };

  // PDF Generation function (jsPDF integration)
  const generatePdf = () => {
    const p = draft;
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
        const fmtImg = empresa.logo.includes('image/png') ? 'PNG' : (empresa.logo.includes('image/jpeg') || empresa.logo.includes('image/jpg')) ? 'JPEG' : 'PNG';
        doc.addImage(empresa.logo, fmtImg, marginX, y - 9, 14, 14);
        titleX = marginX + 18;
      } catch (e) {}
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(30, 33, 40);
    doc.text('PEDIDO', titleX, y);

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
    if (empresa.email) { doc.text(empresa.email, pageW - marginX, ey, { align: 'right' }); ey += 4.2; }

    y += 12;
    doc.setDrawColor(210); doc.setLineWidth(0.3); doc.line(marginX, y, pageW - marginX, y);
    y += 8;

    // Order number and date
    doc.setFontSize(10); doc.setTextColor(30, 33, 40);
    doc.setFont('helvetica', 'bold'); doc.text('N° de pedido:', marginX, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(p.id).padStart(4, '0'), marginX + 30, y);
    doc.setFont('helvetica', 'bold'); doc.text('Fecha:', marginX + 90, y);
    doc.setFont('helvetica', 'normal'); doc.text(p.fechaPedido || new Date().toLocaleDateString('es-AR'), marginX + 105, y);
    y += 10;

    // Seller / Buyer Header
    const boxW = (contentW - 6) / 2, boxX2 = marginX + boxW + 6, headerH = 7;
    doc.setFillColor(...navy);
    doc.rect(marginX, y, boxW, headerH, 'F'); doc.rect(boxX2, y, boxW, headerH, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('VENDEDOR', marginX + 3, y + 5); doc.text('CLIENTE', boxX2 + 3, y + 5);
    y += headerH;

    const cliente = clientes.find(c => c.nombre === p.cliente);
    const vendLines = [empresa.nombre || '—', [empresa.direccion, empresa.cp].filter(Boolean).join(', '), empresa.telefono || '', empresa.email || ''].filter(l => l !== '');
    const cliDireccion = cliente ? [cliente.calle, cliente.altura].filter(Boolean).join(' ') : '';
    const cliLines = [p.cliente || '—', [cliDireccion, cliente?.loc, cliente?.cp].filter(Boolean).join(', '), cliente?.tel || '', cliente?.email || ''].filter(l => l !== '');
    const maxLines = Math.max(vendLines.length, cliLines.length, 1);
    const boxBodyH = maxLines * 5.2 + 4;
    doc.setDrawColor(220); doc.rect(marginX, y, boxW, boxBodyH); doc.rect(boxX2, y, boxW, boxBodyH);
    doc.setTextColor(40, 40, 40); doc.setFontSize(9);
    vendLines.forEach((l, i) => { doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.text(l, marginX + 3, y + 5 + i * 5.2, { maxWidth: boxW - 6 }); });
    cliLines.forEach((l, i) => { doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.text(l, boxX2 + 3, y + 5 + i * 5.2, { maxWidth: boxW - 6 }); });
    y += boxBodyH + 8;

    // Products table header
    checkPageBreak(20);
    doc.setFillColor(...navy);
    doc.rect(marginX, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('PRODUCTOS', marginX + 3, y + 5);
    y += 7;

    const colN = 10, colDesc = 95, colCant = 20, colPU = 27, colTot = 28;
    const xN = marginX, xDesc = xN + colN, xCant = xDesc + colDesc, xPU = xCant + colCant, xTot = xPU + colPU;
    doc.setFillColor(...lightGray);
    doc.rect(marginX, y, contentW, 7, 'F');
    doc.setTextColor(40, 40, 40); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.text('N°', xN + 2, y + 5); doc.text('DESCRIPCIÓN', xDesc + 2, y + 5); doc.text('CANT.', xCant + 2, y + 5); doc.text('PRECIO UNIT.', xPU + 2, y + 5); doc.text('TOTAL', xTot + 2, y + 5);
    y += 7;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    (p.piezas || []).forEach((pz, i) => {
      const unit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0);
      const subtotal = unit * pz.cantidad;
      let descExtra = '';
      if (pz.versiones && pz.versiones.length) {
        descExtra = pz.versiones.map(v => `${v.cantidad}× ${v.color || 'sin color'}${v.comentario ? ' (' + v.comentario + ')' : ''}`).join(', ');
      }
      const rowH = descExtra ? 11 : 7;
      checkPageBreak(rowH);
      if (i % 2 === 1) { doc.setFillColor(248, 248, 250); doc.rect(marginX, y, contentW, rowH, 'F'); }
      doc.setDrawColor(225); doc.rect(marginX, y, contentW, rowH);
      doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(String(i + 1), xN + 2, y + 5);
      doc.text(pz.nombre || 'Producto', xDesc + 2, y + 5, { maxWidth: colDesc - 4 });
      if (descExtra) { doc.setFontSize(7.5); doc.setTextColor(120, 120, 120); doc.text(descExtra, xDesc + 2, y + 9.5, { maxWidth: colDesc - 4 }); }
      doc.setFontSize(9); doc.setTextColor(40, 40, 40);
      doc.text(String(pz.cantidad), xCant + 2, y + 5);
      doc.text(fmt(unit), xPU + 2, y + 5);
      doc.text(fmt(subtotal), xTot + 2, y + 5);
      y += rowH;
    });

    // Totals box
    y += 2;
    checkPageBreak(25);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
    doc.setDrawColor(225); doc.rect(xPU, y, colPU, 7); doc.rect(xTot, y, colTot, 7);
    doc.text('SUBTOTAL', xPU + 2, y + 5); doc.text(fmt(p.precioVenta || 0), xTot + 2, y + 5);
    y += 7;
    if (p.envio > 0) {
      doc.setFont('helvetica', 'normal');
      doc.rect(xPU, y, colPU, 7); doc.rect(xTot, y, colTot, 7);
      doc.text('ENVÍO', xPU + 2, y + 5); doc.text(fmt(p.envio), xTot + 2, y + 5);
      y += 7;
    }
    doc.setFillColor(...lightGray);
    doc.rect(xPU, y, colPU, 8, 'F'); doc.rect(xTot, y, colTot, 8, 'F');
    doc.setDrawColor(180); doc.rect(xPU, y, colPU, 8); doc.rect(xTot, y, colTot, 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text('TOTAL', xPU + 2, y + 5.5); doc.text(fmt((p.precioVenta || 0) + (p.envio || 0)), xTot + 2, y + 5.5);
    y += 8 + 10;

    // Shipping info
    if (p.metodoEnvio || p.numeroSeguimiento) {
      checkPageBreak(20);
      doc.setFillColor(...navy);
      doc.rect(marginX, y, contentW, 7, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('DATOS DE ENVÍO', marginX + 3, y + 5);
      y += 7;
      const bodyLines = [];
      if (p.metodoEnvio) bodyLines.push(`Método: ${p.metodoEnvio}`);
      if (p.numeroSeguimiento) bodyLines.push(`N° de seguimiento: ${p.numeroSeguimiento}`);
      const bh = bodyLines.length * 6 + 4;
      doc.setDrawColor(220); doc.rect(marginX, y, contentW, bh);
      doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      bodyLines.forEach((l, i) => doc.text(l, marginX + 3, y + 5 + i * 6));
      y += bh + 8;
    }

    // Notes general
    if (p.notaGeneral) {
      checkPageBreak(20);
      doc.setFillColor(...navy);
      doc.rect(marginX, y, contentW, 7, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('COMENTARIOS', marginX + 3, y + 5);
      y += 7;
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(p.notaGeneral, contentW - 6);
      const bh = lines.length * 5 + 4;
      checkPageBreak(bh);
      doc.setDrawColor(220); doc.rect(marginX, y, contentW, bh);
      doc.text(lines, marginX + 3, y + 5.5);
      y += bh + 8;
    }

    // Footer business details
    doc.setFontSize(9); doc.setTextColor(130, 130, 130); doc.setFont('helvetica', 'normal');
    doc.text(empresa.nombre || '', marginX, pageH - 14);

    const nameFile = `Pedido_${(p.cliente || 'cliente')}_${String(p.id).padStart(4, '0')}`.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    doc.save(nameFile + '.pdf');
    showToast('PDF generado correctamente');
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px' }}>
          <div>
            <div className="modal-title" style={{ fontSize: '18px' }}>
              {draft.cliente} {draft.desc && `— ${draft.desc}`}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
              Pedido #{String(draft.id).padStart(4, '0')} | Creado: {draft.creado || '—'}
              {getClientContact() && ` | ${getClientContact()}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button className="btn btn-sm" onClick={() => { onClose(); onEditOrder(draft.id); }}>Editar</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Pieces checklist section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Piezas / G-codes
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { onClose(); onAddProduct(draft.id); }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Agregar producto
          </button>
        </div>

        <div id="det-piezas">
          {!draft.piezas || !draft.piezas.length ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'var(--mono)' }}>
              Sin piezas todavía. Usá la calculadora para agregar G-codes.
            </div>
          ) : (
            <>
              {/* Fabrication Progress Bar */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Progreso de fabricación</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 600, color: pct === 100 ? 'var(--accent)' : 'var(--text2)' }}>
                    {totalElaboradas}/{totalUnidades} unidades — {pct}%
                  </span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width .4s ease' }}></div>
                </div>
              </div>

              {/* Pieces cards list */}
              {draft.piezas.map(pz => {
                const isCompletada = (pz.elaborados || 0) >= pz.cantidad;
                const costoTotalPieza = getCostoPieza(pz);
                const costoNotaHTML = (
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '6px' }}>
                    Costo: {fmt(costoTotalPieza)}
                  </div>
                );
                const faltan = pz.cantidad - (pz.elaborados || 0);

                const tieneVersiones = pz.cantidad > 1;
                const precioVentaUnit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0);
                const ventaSubtotal = precioVentaUnit * pz.cantidad;

                return (
                  <div key={pz.id} className={`pieza-card ${isCompletada ? 'completada' : ''}`}>
                    <div className="pieza-header">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '13px', textDecoration: isCompletada ? 'line-through' : 'none', color: isCompletada ? 'var(--text3)' : 'var(--text)' }}>
                          {pz.nombre}
                        </div>
                        {pz.archivoNombre && (
                          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                            {pz.archivoNombre}
                          </div>
                        )}
                        {pz.gcodeArchivos && pz.gcodeArchivos.length > 1 && (
                          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                            Archivos: {pz.gcodeArchivos.join(', ')}
                          </div>
                        )}
                        {pz.impresoraNombre && (
                          <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: '4px' }}>
                            🖨 {pz.impresoraNombre}
                          </div>
                        )}
                        {pz.precioEstimado && (
                          <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: '2px' }}>
                            Precio est. {fmt(pz.precioEstimado)}/u
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <input 
                          type="number" 
                          value={Math.round(ventaSubtotal)} 
                          min="0" 
                          step="1"
                          title="Precio de venta (editable)"
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: '14px',
                            fontWeight: 700,
                            color: 'var(--accent)',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'right',
                            width: '90px',
                            padding: '2px 0',
                            outline: 'none'
                          }}
                          onChange={(e) => handleUpdatePartVenta(pz.id, e.target.value)}
                        />
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeletePart(pz.id)}>✕</button>
                      </div>
                    </div>

                    {/* Production controls */}
                    {tieneVersiones && pz.versiones && pz.versiones.length > 0 ? (
                      <div className="prod-control">
                        <label>Cantidad</label>
                        <input 
                          type="number" 
                          value={pz.cantidad} 
                          min="1" 
                          onChange={(e) => handleUpdatePartQty(pz.id, e.target.value)} 
                        />
                        <label>Realizados</label>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, padding: '0 4px' }}>
                          {pz.elaborados}/{pz.cantidad}
                        </span>
                        {isCompletada ? (
                          <div className="prod-status prod-status-ok">✓ COMPLETADO</div>
                        ) : (
                          faltan > 0 && <div className="prod-status prod-status-faltan">FALTAN {faltan}</div>
                        )}
                      </div>
                    ) : (
                      <div className="prod-control">
                        <label>Cantidad</label>
                        <input 
                          type="number" 
                          value={pz.cantidad} 
                          min="1" 
                          onChange={(e) => handleUpdatePartQty(pz.id, e.target.value)} 
                        />
                        <label>Elaborados</label>
                        <input 
                          type="number" 
                          value={pz.elaborados || 0} 
                          min="0" 
                          max={pz.cantidad} 
                          onChange={(e) => handleUpdatePartElaborados(pz.id, e.target.value)} 
                        />
                        {isCompletada ? (
                          <div className="prod-status prod-status-ok">✓ COMPLETADO</div>
                        ) : (
                          faltan > 0 && <div className="prod-status prod-status-faltan">FALTAN {faltan}</div>
                        )}
                      </div>
                    )}

                    {/* Versions list */}
                    {tieneVersiones && (
                      <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', fontFamily: 'var(--mono)' }}>
                            Versiones
                          </span>
                          <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                            Realizadas: <strong>{(pz.versiones || []).reduce((s, v) => s + (v.realizados || 0), 0)}/{pz.cantidad}</strong>
                          </span>
                        </div>
                        
                        {(() => {
                          const sumAsignado = (pz.versiones || []).reduce((s, v) => s + v.cantidad, 0);
                          const faltanAsignar = pz.cantidad - sumAsignado;
                          return (
                            <>
                              <div style={{ marginBottom: '6px', fontSize: '11px', fontFamily: 'var(--mono)', color: faltanAsignar === 0 ? 'var(--accent)' : 'var(--warn)' }}>
                                {faltanAsignar === 0 ? '✓ Cantidades asignadas completas' : `⚠ Faltan asignar ${faltanAsignar} unidad(es) entre versiones`}
                              </div>
                              
                              <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: '4px', display: 'grid', gridTemplateColumns: '84px 1fr 1fr auto', gap: '6px' }}>
                                <span>Real / Total</span>
                                <span>Color</span>
                                <span>Comentario</span>
                                <span></span>
                              </div>

                              {(pz.versiones || []).map(v => {
                                const hex = colorHexPorNombre(v.color);
                                const vDone = (v.realizados || 0) >= v.cantidad;
                                return (
                                  <div key={v.id} className="det-ver-row">
                                    <div className="det-ver-realizados">
                                      <input 
                                        type="number" 
                                        value={v.realizados || 0} 
                                        min="0" 
                                        max={v.cantidad}
                                        onChange={(e) => handleUpdateVersion(pz.id, v.id, 'realizados', e.target.value)} 
                                      />
                                      <span>
                                        / <input 
                                          type="number" 
                                          value={v.cantidad} 
                                          min="1" 
                                          max={pz.cantidad - (pz.versiones || []).filter(x => x.id !== v.id).reduce((s, x) => s + x.cantidad, 0)} 
                                          style={{ width: '34px', fontSize: '11px', padding: '2px 3px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', textAlign: 'center' }}
                                          onChange={(e) => handleUpdateVersion(pz.id, v.id, 'cantidad', e.target.value)} 
                                        />
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      {hex && (
                                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: hex, border: '1px solid var(--border)', flexShrink: 0, marginRight: '3px' }}></span>
                                      )}
                                      <select 
                                        value={v.color || ''}
                                        style={{ flex: 1, fontSize: '11px', padding: '3px 4px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                                        onChange={(e) => handleUpdateVersion(pz.id, v.id, 'color', e.target.value)}
                                      >
                                        <option value="">Sin color</option>
                                        {(cfg.colores || []).map((col, ci) => (
                                          <option key={ci} value={col.nombre}>{col.nombre}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <input 
                                      type="text" 
                                      value={v.comentario || ''} 
                                      placeholder="Comentario..."
                                      style={{ fontSize: '11px', padding: '3px 6px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', width: '100%' }}
                                      onChange={(e) => handleUpdateVersion(pz.id, v.id, 'comentario', e.target.value)} 
                                    />
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                      {vDone ? (
                                        <span className="det-ver-badge ok">✓ LISTO</span>
                                      ) : (
                                        <span className="det-ver-badge pend">{v.realizados || 0}/{v.cantidad}</span>
                                      )}
                                      <button className="btn btn-danger btn-sm" style={{ padding: '1px 5px', fontSize: '11px' }} onClick={() => handleDeleteVersion(pz.id, v.id)}>✕</button>
                                    </div>
                                  </div>
                                );
                              })}

                              {faltanAsignar > 0 && (
                                <button className="btn btn-sm" style={{ marginTop: '8px', width: '100%', fontSize: '11px' }} onClick={() => handleAddVersion(pz.id)}>
                                  + Agregar versión (faltan {faltanAsignar})
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* cost footer */}
                    {costoNotaHTML}

                    <div style={{ marginTop: '8px' }}>
                      <input 
                        type="text" 
                        className="pieza-nota-input" 
                        placeholder="Añadir nota a esta pieza (color, detalle...)" 
                        value={pz.notas || ''} 
                        onChange={(e) => handleUpdatePartNotes(pz.id, e.target.value)} 
                      />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="sep"></div>

        {/* Consumables (Insumos) checklist section */}
        <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>
          Insumos del pedido
        </div>
        <div id="det-insumos">
          {!cfg.insumos || !cfg.insumos.length ? (
            <div className="empty">Sin insumos configurados.</div>
          ) : (
            cfg.insumos.map((ins, i) => {
              const matchedDraft = (draft.insumos || []).find(x => x.nombre === ins.nombre);
              const isChecked = !!matchedDraft;
              const quantity = matchedDraft ? matchedDraft.qty : 1;

              return (
                <div key={i} className="insumo-row">
                  <input 
                    type="checkbox" 
                    checked={isChecked} 
                    onChange={(e) => handleToggleInsumo(ins.nombre, ins.precio, e.target.checked)} 
                  />
                  <span style={{ flex: 1 }}>{ins.nombre} <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>({fmt(ins.precio)})</span></span>
                  {isChecked && (
                    <input 
                      type="number" 
                      className="insumo-qty det-ins-qty" 
                      min="0.1" 
                      step="0.1" 
                      value={quantity} 
                      onChange={(e) => handleUpdateInsumoQty(ins.nombre, e.target.value)} 
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="sep"></div>

        {/* Totals Summary */}
        <div className="total-section">
          <div className="cost-line">
            <span>Costo piezas</span>
            <span>{fmt(costoPiezasTotal)}</span>
          </div>
          <div className="cost-line">
            <span>Insumos</span>
            <span>{fmt(costoInsumosTotal)}</span>
          </div>
          <div className="cost-line strong">
            <span>Costo total</span>
            <span>{fmt(costoTotal)}</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
            <div>
              <label className="fl" style={{ marginTop: 0 }}>
                Ganancia ($) <span style={{ color: 'var(--text3)', textTransform: 'none' }}>— venta menos costo total</span>
              </label>
              <input 
                type="text" 
                readOnly 
                value={fmt(ganancia)}
                style={{ background: 'var(--bg)', color: 'var(--text2)', cursor: 'not-allowed' }} 
              />
            </div>
            <div style={{ textAlign: 'right', paddingTop: '14px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                Precio de venta
              </div>
              <div id="det-ganancia" style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                {fmt(draft.precioVenta || 0)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
            <div>
              <label className="fl" style={{ marginTop: 0 }}>
                Envío ($) <span style={{ color: 'var(--text3)', textTransform: 'none' }}>opcional, no se cuenta como venta</span>
              </label>
              <input 
                type="number" 
                value={draft.envio || ''} 
                placeholder="0" 
                onChange={(e) => handleFieldChange('envio', e.target.value)} 
              />
            </div>
            <div style={{ textAlign: 'right', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Total a abonar (c/envío)
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                {fmt(totalAbonar)}
              </div>
            </div>
          </div>
        </div>

        <div className="sep"></div>

        {/* Shipping details */}
        <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          Datos de envío
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Método de envío</label>
            <select 
              value={draft.metodoEnvio || ''} 
              onChange={(e) => handleFieldChange('metodoEnvio', e.target.value)}
            >
              <option value="">— Sin especificar —</option>
              {(cfg.metodosEnvio || []).map((metodo, mi) => (
                <option key={mi} value={metodo}>{metodo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Número de seguimiento</label>
            <input 
              type="text" 
              value={draft.numeroSeguimiento || ''} 
              placeholder="Ej: AR123456789" 
              onChange={(e) => handleFieldChange('numeroSeguimiento', e.target.value)} 
            />
          </div>
        </div>

        {/* Comment general */}
        <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          Nota general del pedido
        </div>
        <textarea 
          placeholder="Ej: Envío por correo, abonó seña 50%, pagar con transferencia..." 
          value={draft.notaGeneral || ''}
          style={{
            width: '100%',
            background: 'var(--bg3)',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontFamily: 'var(--sans)',
            fontSize: '13px',
            padding: '8px 10px',
            outline: 'none',
            resize: 'vertical',
            minHeight: '70px',
            transition: 'border-color .15s',
            lineHeight: '1.5'
          }}
          onChange={(e) => handleFieldChange('notaGeneral', e.target.value)}
        />

        <div className="modal-footer">
          <button className="btn btn-danger btn-sm" onClick={handleDeletePedido}>Eliminar pedido</button>
          
          <button className="btn" onClick={generatePdf} title="Generar PDF para enviar por WhatsApp">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '14px', height: '14px', marginRight: '4px', display: 'inline-block', verticalAlign: '-2px' }}>
              <path d="M5 2h7l3 3v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
              <path d="M12 2v3h3M7 11h6M7 14h4" />
            </svg>
            Generar PDF
          </button>
          
          <button className="btn" onClick={onClose}>Cerrar</button>
          
          <button className="btn btn-primary" onClick={handleSave}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}
