import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import TablaComprobantes from './TablaComprobantes';

// Comprobantes de la cuenta (facturas de sus pedidos y sus notas de
// crédito), en la pestaña "Facturación ARCA" de "Mi emprendimiento". Mismo
// listado que el panel admin, con las funciones de la cuenta.

// Se trabaja sobre los últimos MAX_COMPROBANTES y se filtra en la tabla,
// sin índices compuestos en Firestore.
const MAX_COMPROBANTES = 500;

const ORIGENES = { pedido: 'Pedido', notaCredito: 'Anulación' };

const FUNCIONES = {
  pdf: 'descargarFacturaCuentaPDF',
  mail: 'enviarFacturaCuentaMail',
  anular: 'anularFacturaCuenta',
  reintentar: 'reintentarFacturaCuenta'
};

// "Pedido #0012 · Juana Pérez": la nota de crédito guarda el pedido de la
// factura que anula.
const referenciaDe = (f) => {
  const pedidoId = f.origen?.pedidoId;
  if (!pedidoId) return '';
  return [`Pedido #${String(pedidoId).padStart(4, '0')}`, f.origen?.cliente].filter(Boolean).join(' · ');
};

export default function ComprobantesCuenta() {
  const { cuentaId, showToast } = useApp();
  const [facturas, setFacturas] = useState([]);

  useEffect(() => {
    if (!cuentaId) return undefined;
    const q = query(collection(db, 'users', cuentaId, 'facturas'), orderBy('creadoEl', 'desc'), limit(MAX_COMPROBANTES));
    return onSnapshot(q,
      (snap) => setFacturas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Error al escuchar los comprobantes de la cuenta:', err));
  }, [cuentaId]);

  return (
    <div className="card">
      <div className="card-title">Comprobantes</div>
      <TablaComprobantes
        facturas={facturas}
        origenes={ORIGENES}
        referenciaDe={referenciaDe}
        funciones={FUNCIONES}
        nombreExcel="comprobantes"
        showToast={showToast}
      />
    </div>
  );
}
