import React, { useEffect, useRef, useState } from 'react';
import { confirmar, pedirTexto } from '../Dialogos';
import { useApp } from '../../context/AppContext';
import { functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { useCapaModal } from '../CapaModal';

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

// El botón "Ingresar a Manager3D" de los mails (BOTON en emailTemplates.js).
const BOTON_INGRESAR = '<p><a href="https://manager3d.com.ar/" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">Ingresar a Manager3D</a></p>';

function sustituirVariables(texto, vars) {
  return (texto || '').replace(/\{\{(\w+)\}\}/g, (_, clave) => (vars[clave] ?? `{{${clave}}}`));
}

// Las plantillas con una tabla armada por el sistema ({{filasTabla}} dentro
// de <table>) no se pueden editar en modo visual: el navegador saca el
// texto de adentro de la tabla al mostrarla y se rompería al guardar.
const admiteVisual = (html) => !/<table[^>]*>\s*\{\{/.test(html || '');

const HERRAMIENTAS = [
  { cmd: 'bold', etiqueta: 'B', titulo: 'Negrita', estilo: { fontWeight: 700 } },
  { cmd: 'italic', etiqueta: 'I', titulo: 'Cursiva', estilo: { fontStyle: 'italic' } },
  { cmd: 'underline', etiqueta: 'U', titulo: 'Subrayado', estilo: { textDecoration: 'underline' } },
  { cmd: 'formatBlock', valor: 'h2', etiqueta: 'Título', titulo: 'Título' },
  { cmd: 'formatBlock', valor: 'h3', etiqueta: 'Subtítulo', titulo: 'Subtítulo' },
  { cmd: 'formatBlock', valor: 'p', etiqueta: 'Párrafo', titulo: 'Texto normal' },
  { cmd: 'insertUnorderedList', etiqueta: '• Lista', titulo: 'Lista con viñetas' },
  { cmd: 'insertOrderedList', etiqueta: '1. Lista', titulo: 'Lista numerada' },
  { cmd: 'removeFormat', etiqueta: 'Sin formato', titulo: 'Quitar el formato del texto elegido' }
];

// Edición de una plantilla de mail. Dos modos:
//   - Visual: se escribe directo sobre el mail, tal como lo ve el
//     destinatario, con una barra de formato. Las {{variables}} se ven tal
//     cual y se reemplazan al enviar.
//   - HTML: el código del cuerpo, con la vista previa (datos de ejemplo) al lado.
// Ver functions/emailTemplates.js para el registro de plantillas y
// functions/http/plantillasEmail.js para guardar los cambios.
export default function ModalPlantillaEmail({ isOpen, onClose, plantilla, onGuardado }) {
  const capaModal = useCapaModal({ onClose, activo: isOpen });
  const { showToast } = useApp();
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [modo, setModo] = useState('visual');
  // Contenido con el que arranca el editor visual: sólo cambia al abrir o
  // al volver del modo HTML (si cambiara con cada tecla, se perdería el cursor).
  const [inicioVisual, setInicioVisual] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !plantilla) return;
    setSubject(plantilla.subject || '');
    setBodyHtml(plantilla.bodyHtml || '');
    setInicioVisual(plantilla.bodyHtml || '');
    setModo(admiteVisual(plantilla.bodyHtml) ? 'visual' : 'html');
  }, [isOpen, plantilla]);

  if (!isOpen || !plantilla) return null;

  const vars = plantilla.variables || {};
  const previewAsunto = sustituirVariables(subject, vars);
  const previewHtml = layoutPreview(sustituirVariables(bodyHtml, vars));
  const visualPosible = admiteVisual(bodyHtml);

  const cambiarModo = (nuevo) => {
    if (nuevo === 'visual') setInicioVisual(bodyHtml);
    setModo(nuevo);
  };

  // ---- Editor visual (un iframe con el cuerpo editable) ----
  const editor = () => {
    const doc = iframeRef.current?.contentDocument;
    return doc ? { doc, cuerpo: doc.getElementById('cuerpo') } : null;
  };

  const alCargarEditor = () => {
    const e = editor();
    if (!e?.cuerpo) return;
    e.doc.execCommand('defaultParagraphSeparator', false, 'p');
    e.cuerpo.addEventListener('input', () => setBodyHtml(e.cuerpo.innerHTML));
  };

  const ejecutar = (cmd, valor) => {
    const e = editor();
    if (!e?.cuerpo) return;
    e.cuerpo.focus();
    e.doc.execCommand(cmd, false, valor);
    setBodyHtml(e.cuerpo.innerHTML);
  };

  // Los diálogos de la app le sacan el foco al iframe: se guarda la
  // selección antes y se restaura después.
  const conSeleccion = async (fn) => {
    const e = editor();
    if (!e?.cuerpo) return;
    const sel = e.doc.getSelection();
    const rango = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const resultado = await fn();
    if (resultado == null) return;
    e.cuerpo.focus();
    if (rango) {
      sel.removeAllRanges();
      sel.addRange(rango);
    }
    return resultado;
  };

  const insertarLink = async () => {
    const url = await conSeleccion(() => pedirTexto('Dirección del link (https://...)', { titulo: 'Agregar link', placeholder: 'https://manager3d.com.ar/' }));
    if (url) ejecutar('createLink', /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`);
  };

  const insertarVariable = (clave) => {
    if (clave) ejecutar('insertText', `{{${clave}}}`);
  };

  const srcVisual = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff}
    #cuerpo{outline:none;min-height:240px}
    #cuerpo:focus{box-shadow:0 0 0 2px #e0e7ff;border-radius:4px}
  </style></head><body>${layoutPreview(`<div id="cuerpo" contenteditable="true">${inicioVisual}</div>`)}</body></html>`;

  // ---- Guardar / restablecer ----
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
    if (!(await confirmar('Se pierde la personalización guardada.', { titulo: '¿Volver al texto original?', textoConfirmar: 'Restablecer', peligro: true }))) return;
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

  const botonHerramienta = { fontSize: '12px', padding: '4px 9px' };

  return (
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal" style={{ maxWidth: '920px', width: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>Editar plantilla: {plantilla.label}</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn btn-sm periodo-btn ${modo === 'visual' ? 'active' : ''}`}
              disabled={!visualPosible}
              title={visualPosible ? 'Escribir sobre el mail' : 'Esta plantilla lleva una tabla armada por el sistema: se edita en HTML'}
              onClick={() => cambiarModo('visual')}
            >
              Visual
            </button>
            <button className={`btn btn-sm periodo-btn ${modo === 'html' ? 'active' : ''}`} onClick={() => cambiarModo('html')}>HTML</button>
          </div>
        </div>

        <label className="fl">Asunto</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
        {previewAsunto !== subject && (
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>Se ve así: <strong>{previewAsunto}</strong></div>
        )}

        {modo === 'visual' ? (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
              {HERRAMIENTAS.map((h) => (
                <button
                  key={h.etiqueta}
                  type="button"
                  className="btn btn-sm"
                  title={h.titulo}
                  style={{ ...botonHerramienta, ...h.estilo }}
                  // mousedown + preventDefault: el clic no le saca la selección al editor.
                  onMouseDown={(e) => { e.preventDefault(); ejecutar(h.cmd, h.valor); }}
                >
                  {h.etiqueta}
                </button>
              ))}
              <button type="button" className="btn btn-sm" style={botonHerramienta} onMouseDown={(e) => e.preventDefault()} onClick={insertarLink}>Link</button>
              <button type="button" className="btn btn-sm" style={botonHerramienta} onMouseDown={(e) => { e.preventDefault(); ejecutar('insertHTML', BOTON_INGRESAR); }} title="Botón Ingresar a Manager3D">
                + Botón
              </button>
              {Object.keys(vars).length > 0 && (
                <select value="" onChange={(e) => insertarVariable(e.target.value)} style={{ width: 'auto', fontSize: '12px', padding: '4px 6px' }} title="Se reemplaza por el dato real al enviar">
                  <option value="">+ Variable</option>
                  {Object.keys(vars).map((k) => <option key={k} value={k}>{`{{${k}}}`} (ej: {String(vars[k]).replace(/<[^>]*>/g, '').slice(0, 30)})</option>)}
                </select>
              )}
            </div>
            <iframe
              key={inicioVisual}
              ref={iframeRef}
              title="Editor del mail"
              srcDoc={srcVisual}
              onLoad={alCargarEditor}
              style={{ width: '100%', height: '460px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', background: '#fff' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
              Escribí directo sobre el mail. Las {'{{variables}}'} se reemplazan por el dato real al enviar. Ctrl+Z deshace.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'stretch', marginTop: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <label className="fl">Contenido (HTML)</label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                style={{ flex: 1, minHeight: '360px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
              />
              {Object.keys(vars).length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>
                  Variables: {Object.keys(vars).map((k) => `{{${k}}}`).join(', ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <label className="fl">Vista previa (con datos de ejemplo)</label>
              <iframe
                title="Vista previa del mail"
                srcDoc={previewHtml}
                style={{ flex: 1, minHeight: '360px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', background: '#fff' }}
              />
            </div>
          </div>
        )}

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn" onClick={handleRestablecer} disabled={restableciendo || guardando || !plantilla.personalizado} title={plantilla.personalizado ? '' : 'Ya usa el texto original'}>
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
