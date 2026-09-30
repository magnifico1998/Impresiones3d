import React, { useState } from 'react';
import ModalContacto from './modals/ModalContacto';

// Bloqueo de página completa para funciones que NO tienen ninguna
// protección propia a nivel de Firestore (Calculadora, Presupuestos): a
// diferencia de pedidos/biblioteca/clientes/compras, que Firestore ya
// rechaza solo en modo lectura (ver cuentaPuedeEscribir en
// firestore.rules), calcular un presupuesto no escribe nada en la nube,
// así que hay que cortarlo a mano acá en el cliente.
export default function AvisoModoLectura({ titulo = 'Función no disponible en modo lectura' }) {
  const [modalContactoOpen, setModalContactoOpen] = useState(false);

  return (
    <div className="page active">
      <div className="card" style={{ background: 'var(--dangerDim)', border: '1px solid var(--danger)', maxWidth: '480px', margin: '60px auto', textAlign: 'center', padding: '28px' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>{titulo}</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '18px', lineHeight: 1.5 }}>
          Tu cuenta está en <strong>modo lectura</strong> por falta de pago. Completá tu perfil y activá el plan gratuito <strong>Boceto</strong> para seguir usando Manager3D sin costo.
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* Abre "Completá tu perfil" (lo monta App.jsx). */}
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('abrir-completar-perfil'))}>
            Seguir gratis con Boceto
          </button>
          <button className="btn" onClick={() => setModalContactoOpen(true)}>
            Contactar
          </button>
        </div>
      </div>
      <ModalContacto isOpen={modalContactoOpen} onClose={() => setModalContactoOpen(false)} />
    </div>
  );
}
