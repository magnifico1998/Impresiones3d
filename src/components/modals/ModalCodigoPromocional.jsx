import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';

// Canje de un código promocional de un comercio (ver
// functions/http/codigosPromocionales.js: sólo se puede activar durante el
// trial, y una única vez en la vida de la cuenta). A diferencia del código
// de revendedor (que sólo se registra en la solicitud de contacto para que
// un admin lo procese después), este lo aplica el propio usuario al toque.
export default function ModalCodigoPromocional({ isOpen, onClose }) {
  const { showToast } = useApp();
  const [codigo, setCodigo] = useState('');
  const [activando, setActivando] = useState(false);

  if (!isOpen) return null;

  const handleActivar = async () => {
    const codigoLimpio = codigo.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(codigoLimpio)) {
      showToast('El código debe tener entre 4 y 12 letras/números.', 'error');
      return;
    }
    setActivando(true);
    try {
      const activar = httpsCallable(functions, 'activarCodigoPromocional');
      await activar({ codigo: codigoLimpio });
      showToast('¡Código activado! Ya tenés tu plan promocional.');
      setCodigo('');
      onClose();
    } catch (e) {
      console.error('Error al activar el código promocional:', e);
      showToast(e?.message || 'No se pudo activar el código.', 'error');
    } finally {
      setActivando(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Activar código promocional</div>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.5 }}>
          Si un comercio te dio un código promocional, ingresalo acá para activar tu beneficio. Sólo se puede usar una vez por cuenta, mientras estés en período de prueba.
        </p>
        <div>
          <label className="fl">Código</label>
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="Ej: COMERCIO20"
            autoFocus
          />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleActivar} disabled={activando || !codigo.trim()}>
            {activando ? 'Activando...' : 'Activar'}
          </button>
        </div>
      </div>
    </div>
  );
}
