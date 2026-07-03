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
        const normalized = JSON.parse(JSON.stringify(original));
        normalized.piezas = (normalized.piezas || []).map(pz => ({
          ...pz,
          versiones: (pz.versiones && pz.versiones.length)
            ? pz.versiones
            : [{ id: Date.now() + Math.random(), cantidad: pz.cantidad || 1, color: '', comentario: '', realizados: 0 }]
        }));
        setDraft(normalized);
      }
    } else {
      setDraft(null);
    }
  }, [isOpen, pedidoId, pedidos]);

  if (!isOpen || !draft) return null;

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');



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
  
  const descuentoNombre = draft.descuentoNombre || '';
  const descuentoMonto = parseFloat(draft.descuentoMonto) || 0;
  const descuentoPct = Math.max(0, Math.min(100, parseFloat(draft.descuentoPct) || 0));
  const descuentoTotal = descuentoMonto > 0
    ? descuentoMonto
    : ((draft.precioVenta || 0) * (descuentoPct / 100));
  const precioVentaNeto = Math.max(0, (draft.precioVenta || 0) - descuentoTotal);
  const ganancia = precioVentaNeto ? precioVentaNeto - costoTotal : 0;
  const totalAbonar = precioVentaNeto + (parseFloat(draft.envio) || 0);

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

  const handleDescuentoMontoChange = (value) => {
    setDraft(prev => {
      const monto = value === '' ? '' : String(Math.round((parseFloat(value) || 0) * 100) / 100);
      const precioVenta = parseFloat(prev.precioVenta) || 0;
      const pct = monto !== '' && precioVenta > 0
        ? String(Math.round((parseFloat(monto) / precioVenta) * 1000) / 10)
        : '';
      return { ...prev, descuentoMonto: monto, descuentoPct: pct };
    });
  };

  const handleDescuentoPctChange = (value) => {
    setDraft(prev => {
      const pctVal = value === '' ? '' : String(Math.max(0, Math.min(100, parseFloat(value) || 0)));
      const precioVenta = parseFloat(prev.precioVenta) || 0;
      const monto = pctVal !== '' && precioVenta > 0
        ? String(Math.round((parseFloat(pctVal) / 100) * precioVenta * 100) / 100)
        : '';
      return { ...prev, descuentoPct: pctVal, descuentoMonto: monto };
    });
  };

  const getNextPedidoEstado = (prevEstado, piezas) => {
    if (prevEstado === 'completado' || prevEstado === 'cancelado') {
      return prevEstado;
    }

    const allDone = piezas.every(pz => (pz.elaborados || 0) >= pz.cantidad);
    const someDone = piezas.some(pz => (pz.elaborados || 0) > 0);

    if (allDone && piezas.length > 0) {
      return 'listo';
    }
    if (someDone) {
      return 'progreso';
    }
    return 'pendiente';
  };

  const commitPedidoEstado = (newEstado) => {
    setDraft(prev => ({ ...prev, estado: newEstado }));
  };

  // Piece actions
  const handleUpdatePartQty = (piezaId, qty) => {
    const newQty = parseInt(qty) || 1;
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          // Adjust unit price and subtotal
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

      const nextEstado = getNextPedidoEstado(prev.estado, piezas);
      if (nextEstado !== prev.estado) {
        commitPedidoEstado(nextEstado);
      }
      return { ...prev, piezas, precioVenta: newPrecioVenta, estado: nextEstado };
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

      const nextEstado = getNextPedidoEstado(prev.estado, piezas);
      if (nextEstado === 'listo' && prev.estado !== 'listo') {
        showToast('¡Todas las piezas listas! Pedido listo para entregar.', 'success');
      }
      if (nextEstado === 'progreso' && prev.estado === 'pendiente') {
        showToast('Pedido puesto en progreso.', 'info');
      }
      if (nextEstado !== prev.estado) {
        commitPedidoEstado(nextEstado);
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

        const nextEstado = getNextPedidoEstado(prev.estado, piezas);
        return { ...prev, piezas, precioVenta: newPrecioVenta, estado: nextEstado };
      });
      showToast('Pieza eliminada');
    }
  };

  // Version actions
  const handleUpdateVersion = (piezaId, verId, field, value) => {
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          const versiones = pz.versiones.map(v => {
            if (v.id === verId) {
              const val = field === 'cantidad' || field === 'realizados' ? (parseInt(value) || 0) : value;
              return { ...v, [field]: val };
            }
            return v;
          });

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

      const nextEstado = getNextPedidoEstado(prev.estado, piezas);
      if (nextEstado !== prev.estado) {
        commitPedidoEstado(nextEstado);
      }
      return { ...prev, piezas, estado: nextEstado };
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

      const nextEstado = getNextPedidoEstado(prev.estado, piezas);
      if (nextEstado !== prev.estado) {
        commitPedidoEstado(nextEstado);
      }
      return { ...prev, piezas, estado: nextEstado };
    });
  };

  const handleAddVersion = (piezaId) => {
    setDraft(prev => {
      const piezas = prev.piezas.map(pz => {
        if (pz.id === piezaId) {
          const sumAsignado = (pz.versiones || []).reduce((s, v) => s + v.cantidad, 0);
          const faltanAsignar = pz.cantidad - sumAsignado;
          const newQty = faltanAsignar > 0 ? faltanAsignar : 1;
          const newVer = {
            id: Date.now(),
            cantidad: newQty,
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

  const handleToggleInsumo = (name, price, checked) => {
    setDraft(prev => {
      let insumos = [...(prev.insumos || [])];
      if (checked) {
        if (!insumos.some(i => i.nombre === name)) {
          insumos.push({ nombre: name, precio: price, qty: 1 });
        }
      } else {
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
      } catch { /* empty */ }
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
    if (empresa.email) { doc.text(empresa.email, pageW - marginX, ey, { align: 'right' }); }

    y += 10;
    doc.setDrawColor(210); doc.setLineWidth(0.3); doc.line(marginX, y, pageW - marginX, y);
    y += 7;

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
    const boxBodyH = maxLines * 4.7 + 4;
    doc.setDrawColor(220); doc.rect(marginX, y, boxW, boxBodyH); doc.rect(boxX2, y, boxW, boxBodyH);
    doc.setTextColor(40, 40, 40); doc.setFontSize(9);
    vendLines.forEach((l, i) => { doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.text(l, marginX + 3, y + 4.5 + i * 4.7, { maxWidth: boxW - 6 }); });
    cliLines.forEach((l, i) => { doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.text(l, boxX2 + 3, y + 4.5 + i * 4.7, { maxWidth: boxW - 6 }); });
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
    (p.piezas || []).forEach((pz, i) => {
      const unit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado || 0);
      const subtotal = unit * pz.cantidad;
      let descExtra = '';
      if (pz.versiones && pz.versiones.length) {
        descExtra = pz.versiones.map(v => `${v.cantidad}× ${v.color || 'sin color'}${v.comentario ? ' (' + v.comentario + ')' : ''}`).join(', ');
      }

      // Wrap description and extra lines to compute dynamic height
      const maxDescWidth = colDesc - 4;
      const nameLines = doc.splitTextToSize(pz.nombre || 'Producto', maxDescWidth);
      const extraLines = descExtra ? doc.splitTextToSize(descExtra, maxDescWidth) : [];
      const textLines = [...nameLines, ...extraLines];
      const lineH = 3.6;
      const rowH = Math.max(6.5, textLines.length * lineH + 1.8);

      checkPageBreak(rowH);
      if (i % 2 === 1) { doc.setFillColor(248, 248, 250); doc.rect(marginX, y, contentW, rowH, 'F'); }
      doc.setDrawColor(225); doc.rect(marginX, y, contentW, rowH);

      // Left column: index
      doc.setTextColor(40, 40, 40); doc.setFontSize(8.8); doc.setFont('helvetica', 'normal');
      const topTextY = y + 3.2;
      doc.text(String(i + 1), xN + 2, topTextY + 0.8);

      // Description (name + extra lines)
      doc.setFontSize(8.8); doc.setTextColor(40, 40, 40);
      doc.text(nameLines, xDesc + 2, topTextY);
      if (extraLines.length) {
        doc.setFontSize(7.2); doc.setTextColor(120, 120, 120);
        doc.text(extraLines, xDesc + 2, topTextY + nameLines.length * lineH - 0.6);
      }

      // Numeric columns: right align within fixed widths and vertically center
      const centerY = y + rowH / 2;
      doc.setFontSize(8.8); doc.setTextColor(40, 40, 40);
      doc.text(String(pz.cantidad), xCant + colCant - 2, centerY, { baseline: 'middle', align: 'right' });
      doc.text(fmt(unit), xPU + colPU - 2, centerY, { baseline: 'middle', align: 'right' });
      doc.text(fmt(subtotal), xTot + colTot - 2, centerY, { baseline: 'middle', align: 'right' });

      y += rowH;
    });

    // Totals box (numeric columns right-aligned to avoid overlap with long labels)
    y += 2;
    checkPageBreak(25);
    const descuentoNombrePdf = p.descuentoNombre || '';
    const descuentoMontoPdf = parseFloat(p.descuentoMonto) || 0;
    const descuentoPctPdf = Math.max(0, Math.min(100, parseFloat(p.descuentoPct) || 0));
    const descuentoTotalPdf = descuentoMontoPdf > 0
      ? descuentoMontoPdf
      : ((p.precioVenta || 0) * (descuentoPctPdf / 100));
    const precioVentaNetoPdf = Math.max(0, (p.precioVenta || 0) - descuentoTotalPdf);
    const descuentoLabelPdf = descuentoNombrePdf ? `${descuentoNombrePdf}${descuentoPctPdf > 0 ? ` (${descuentoPctPdf}%)` : ''}` : `Descuento${descuentoPctPdf > 0 ? ` (${descuentoPctPdf}%)` : ''}`;

    // define totals columns anchored to right margin
    const totalColTot = 36; // width for total amount
    const totalColPU = 44; // width for label/secondary column (will host some labels)
    const xTotR = pageW - marginX - totalColTot; // rightmost numeric column X
    const xPUR = xTotR - totalColPU; // left numeric/label column X
    const labelWidth = xPUR - marginX; // available width for long labels

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
    // SUBTOTAL row
    let rowH = 6.5;
    checkPageBreak(rowH);
    doc.setDrawColor(225); doc.rect(xPUR, y, totalColPU, rowH); doc.rect(xTotR, y, totalColTot, rowH);
    doc.text('SUBTOTAL', xPUR + 2, y + 4.5); doc.text(fmt(p.precioVenta || 0), xTotR + 2, y + 4.5);
    y += rowH;

    if (descuentoTotalPdf > 0) {
      // wrap discount label within available labelWidth
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const labelLines = doc.splitTextToSize(descuentoLabelPdf, labelWidth - 4);
      const labelLineH = 5; // mm per line approx
      const discRowH = Math.max(7, labelLines.length * labelLineH + 4);
      checkPageBreak(discRowH);

      doc.setDrawColor(225); doc.rect(xPUR, y, totalColPU, discRowH); doc.rect(xTotR, y, totalColTot, discRowH);
      doc.text(labelLines, xPUR + 2, y + 5);
      // amount vertically centered in discount row
      const amountY = y + Math.max(5, discRowH / 2 + 1);
      doc.text(`-${fmt(descuentoTotalPdf)}`, xTotR + 2, amountY);
      y += discRowH;

      // SUBTOTAL neto row
      rowH = 7;
      checkPageBreak(rowH);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.setDrawColor(225); doc.rect(xPUR, y, totalColPU, rowH); doc.rect(xTotR, y, totalColTot, rowH);
      doc.text('SUBTOTAL neto', xPUR + 2, y + 5); doc.text(fmt(precioVentaNetoPdf), xTotR + 2, y + 5);
      y += rowH;
    }

    if (p.envio > 0) {
      rowH = 7;
      checkPageBreak(rowH);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.setDrawColor(225); doc.rect(xPUR, y, totalColPU, rowH); doc.rect(xTotR, y, totalColTot, rowH);
      doc.text('ENVÍO', xPUR + 2, y + 5); doc.text(fmt(p.envio), xTotR + 2, y + 5);
      y += rowH;
    }

    // TOTAL final highlighted box
    rowH = 8;
    checkPageBreak(rowH + 10);
    doc.setFillColor(...lightGray);
    doc.rect(xPUR, y, totalColPU, rowH, 'F'); doc.rect(xTotR, y, totalColTot, rowH, 'F');
    doc.setDrawColor(180); doc.rect(xPUR, y, totalColPU, rowH); doc.rect(xTotR, y, totalColTot, rowH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text('TOTAL', xPUR + 2, y + 5.5);
    doc.text(fmt(precioVentaNetoPdf + (p.envio || 0)), xTotR + 2, y + 5.5);
    y += rowH + 10;

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

    const nameFile = `Pedido_${(p.cliente || 'cliente')}_${String(p.id).padStart(4, '0')}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
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

                const tieneVersiones = true;
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

          <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="fl" style={{ marginTop: 0 }}>Nombre del descuento</label>
                <input 
                  type="text" 
                  value={descuentoNombre} 
                  placeholder="Ej: Cliente VIP, Mayorista" 
                  onChange={(e) => handleFieldChange('descuentoNombre', e.target.value)} 
                />
              </div>
              <div>
                <label className="fl" style={{ marginTop: 0 }}>Monto de descuento ($)</label>
                <input 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={draft.descuentoMonto || ''} 
                  placeholder="0" 
                  onChange={(e) => handleDescuentoMontoChange(e.target.value)} 
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'end' }}>
              <div>
                <label className="fl" style={{ marginTop: 0 }}>Porcentaje de descuento (%)</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  step="0.1" 
                  value={draft.descuentoPct || ''} 
                  placeholder="0" 
                  onChange={(e) => handleDescuentoPctChange(e.target.value)} 
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'right' }}>
                Total descuento: <strong>{fmt(descuentoTotal)}</strong>
              </div>
            </div>
          </div>

          {descuentoTotal > 0 && (
            <>
              <div className="cost-line" style={{ marginTop: '6px' }}>
                <span>{descuentoNombre.trim() || 'Descuento aplicado'}</span>
                <span>-{fmt(descuentoTotal)}</span>
              </div>
              <div className="cost-line" style={{ marginTop: '6px' }}>
                <span>Precio neto</span>
                <span>{fmt(precioVentaNeto)}</span>
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
            <div>
              <label className="fl" style={{ marginTop: 0 }}>
                Ganancia ($)
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
                Precio de venta neto
              </div>
              <div id="det-ganancia" style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                {fmt(precioVentaNeto)}
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
