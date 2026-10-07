import React from 'react';
import { PanelEnvio, ListaEnvios } from '../EnvioImpresora';
import { useCapaModal } from '../CapaModal';

// Mandar a la impresora el archivo G-code de una pieza de un pedido (el botón
// "🖨 Enviar" del detalle del pedido, que sólo aparece si el producto tiene
// archivos guardados). Con el conector: utils/impresionDirecta.js.
//   pieza: la pieza del pedido; producto: el de la Biblioteca;
//   archivos: sus archivos listos.

export default function ModalEnviarPieza({ pieza, producto, archivos, soloLectura, onClose }) {
  const capaModal = useCapaModal({ onClose, activo: true });
  if (!pieza || !producto) return null;

  // Qué filamento cargar: las versiones de color del pedido.
  const versiones = (pieza.versiones || []).filter((v) => (v.cantidad || 0) > 0);
  const colores = versiones
    .map((v) => `${v.cantidad}× ${[v.color, v.colorSecundario].filter(Boolean).join(' + ') || 'sin color'}${v.comentario ? ` (${v.comentario})` : ''}`)
    .join(' · ');

  // Este modal va dentro del del pedido: el stopPropagation evita que un clic
  // afuera cierre a los dos.
  return (
    <div className="modal-overlay open" {...capaModal}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Enviar a imprimir · {pieza.nombre}</div>
        <div className="modal-sub" style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' }}>
          Pedidas: <b>{pieza.cantidad}</b>{pieza.elaborados ? ` · hechas: ${pieza.elaborados}` : ''}
          {colores && <> · Colores: {colores}</>}
          <div style={{ marginTop: '4px', color: 'var(--text3)' }}>Cada envío manda el archivo una vez (una placa): para más unidades, volvé a enviarlo cuando termine.</div>
        </div>

        {soloLectura ? (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Tu cuenta está en modo lectura: no se pueden mandar envíos.</div>
        ) : (
          <PanelEnvio archivos={archivos} alTerminar={onClose} />
        )}

        <ListaEnvios productoId={producto.id} soloLectura={soloLectura} />

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
