import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';

// Mismo wrapper que arma functions/emailTemplates.js -> layout(): si cambia
// uno, hay que cambiar el otro para que la vista previa no mienta.
function layoutPreview(cuerpoHtml) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <div style="font-size: 14px; line-height: 1.6;">${cuerpoHtml}</div>
      <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        Manager3D · Todo para emprender en 3D
      </p>
    </div>
  `;
}

function sustituirVariables(texto, vars) {
  return (texto || '').replace(/\{\{(\w+)\}\}/g, (_, clave) => (vars[clave] ?? `{{${clave}}}`));
}

// Edición de una plantilla de mail transaccional: HTML libre del cuerpo con
// vista previa en vivo (usando datos de ejemplo para las {{variables}}), tal
// como lo vería el destinatario real. Ver functions/emailTemplates.js para
// el registro de plantillas y functions/http/plantillasEmail.js para las
// Cloud Functions que leen/guardan los overrides en Firestore.
export default function ModalPlantillaEmail({ isOpen, onClose, plantilla, onGuardado }) {
  const { showToast } = useApp();
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);

  useEffect(() => {
    if (!isOpen || !plantilla) return;
    setSubject(plantilla.subject || '');
    setBodyHtml(plantilla.bodyHtml || '');
  }, [isOpen, plantilla]);

  if (!isOpen || !plantilla) return null;

  const vars = plantilla.variables || {};
  const previewAsunto = sustituirVariables(subject, vars);
  const previewHtml = layoutPreview(sustituirVariables(bodyHtml, vars));

  const handleGuardar = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      showToast('Falta el asunto o el contenido del mail.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const guardar = httpsCallable(functions, 'guardarPlantillaEmail');
      await guardar({ id: plantilla.id, subject: subject.trim(), bodyHtml: bodyHtml.trim() });
      showToast('Plantilla guardada.');
      onGuardado?.();
      onClose();
    } catch (e) {
      console.error('Error al guardar la plantilla de mail:', e);
      showToast(e?.message || 'No se pudo guardar la plantilla.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleRestablecer = async () => {
    if (!window.confirm('¿Volver esta plantilla al texto original? Se pierde la personalización guardada.')) return;
    setRestableciendo(true);
    try {
      const restablecer = httpsCallable(functions, 'restablecerPlantillaEmail');
      await restablecer({ id: plantilla.id });
      showToast('Plantilla restablecida a su valor por defecto.');
      onGuardado?.();
      onClose();
    } catch (e) {
      console.error('Error al restablecer la plantilla de mail:', e);
      showToast(e?.message || 'No se pudo restablecer la plantilla.', 'error');
    } finally {
      setRestableciendo(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '920px', width: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Editar plantilla: {plantilla.label}</div>

        {Object.keys(vars).length > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }}>
            Variables disponibles en esta plantilla: {Object.keys(vars).map(k => `{{${k}}}`).join(', ')}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
            <div>
              <label className="fl">Asunto</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label className="fl">Contenido (HTML)</label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                style={{ flex: 1, minHeight: '320px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
            <label className="fl">Vista previa (con datos de ejemplo)</label>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
              Asunto: <strong>{previewAsunto}</strong>
            </div>
            <iframe
              title="Vista previa del mail"
              srcDoc={previewHtml}
              style={{ flex: 1, minHeight: '320px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', background: '#fff' }}
            />
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn" onClick={handleRestablecer} disabled={restableciendo || guardando}>
            {restableciendo ? 'Restableciendo...' : 'Restablecer a valores por defecto'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando || restableciendo}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
