import React, { useEffect, useState } from 'react';
import { PanelEnvio, ListaEnvios } from '../EnvioImpresora';
import { useCapaModal } from '../CapaModal';
import { useApp } from '../../context/AppContext';
import { confirmar } from '../Dialogos';
import { escucharTrabajos } from '../../utils/impresionDirecta';
import { fechaCorta, marcaDeEnvio, resumenDeArchivo } from '../../utils/enviosPieza';
import { formatoBytes } from '../../utils/archivosGcode';

// Mandar a la impresora los archivos G-code de una pieza de un pedido (el botón
// "🖨 Enviar" del detalle del pedido, que sólo aparece si el producto tiene
// archivos guardados). Con el conector: utils/impresionDirecta.js.
//   pieza: la pieza del pedido; producto: el de la Biblioteca;
//   archivos: sus archivos listos (se muestran TODOS);
//   onEnviado(marca): el pedido guarda en la pieza qué se mandó, para marcar
//   los que ya salieron y no repetirlos por error (utils/enviosPieza.js).

export default function ModalEnviarPieza({ pieza, producto, archivos, soloLectura, onClose, onEnviado }) {
  const capaModal = useCapaModal({ onClose, activo: true });
  const { cuentaId } = useApp();
  const [trabajos, setTrabajos] = useState([]);
  const [ahora, setAhora] = useState(() => Date.now());
  const [elegido, setElegido] = useState(null); // archivo que se está por mandar

  useEffect(() => (cuentaId ? escucharTrabajos(cuentaId, setTrabajos) : undefined), [cuentaId]);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!pieza || !producto) return null;

  // Qué filamento cargar: las versiones de color del pedido.
  const versiones = (pieza.versiones || []).filter((v) => (v.cantidad || 0) > 0);
  const colores = versiones
    .map((v) => `${v.cantidad}× ${[v.color, v.colorSecundario].filter(Boolean).join(' + ') || 'sin color'}${v.comentario ? ` (${v.comentario})` : ''}`)
    .join(' · ');

  const resumenes = archivos.map((a) => ({ archivo: a, ...resumenDeArchivo(pieza, a.id, trabajos, ahora) }));
  const yaEnviados = resumenes.filter((r) => r.veces > 0).length;

  const mandar = async (archivo, resumen) => {
    if (resumen.veces > 0) {
      const ok = await confirmar(
        `"${archivo.nombre}" ya se mandó desde este pedido (${resumen.estado.texto.toLowerCase()}, ${fechaCorta(resumen.ultima.fecha)}${resumen.ultima.impresora ? ` · ${resumen.ultima.impresora}` : ''}). ¿Mandarlo de nuevo?`,
        { titulo: 'Este archivo ya se mandó', textoConfirmar: 'Mandar de nuevo', textoCancelar: 'No' }
      );
      if (!ok) return;
    }
    setElegido(archivo);
  };

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
        ) : elegido ? (
          <PanelEnvio
            archivos={[elegido]}
            alTerminar={(enviado, info) => {
              setElegido(null);
              if (enviado && info) onEnviado?.(marcaDeEnvio({ archivo: elegido, ...info }));
            }}
          />
        ) : (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
              {archivos.length === 1 ? 'Este producto tiene 1 archivo.' : `Este producto tiene ${archivos.length} archivos${yaEnviados ? ` · ya se mandaron ${yaEnviados} de ${archivos.length} desde este pedido` : ''}.`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {resumenes.map((r) => (
                <div
                  key={r.archivo.id}
                  style={{ display: 'flex', gap: '10px', alignItems: 'center', border: `1px solid ${r.veces > 0 ? 'var(--accent)' : 'var(--border2)'}`, borderRadius: '8px', padding: '10px 12px', background: 'var(--bg3)' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.archivo.nombre}>{r.archivo.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      {[r.archivo.formato === '3mf' ? '.3mf' : '.gcode', r.archivo.impresora, r.archivo.bytesContenido || r.archivo.bytes ? formatoBytes(r.archivo.bytesContenido || r.archivo.bytes) : ''].filter(Boolean).join(' · ')}
                    </div>
                    {r.ultima && (
                      <div style={{ fontSize: '12px', marginTop: '3px', color: r.estado.color, fontWeight: 600 }}>
                        {r.estado.enviado ? '✓ ' : '⚠ '}{r.estado.texto} · {fechaCorta(r.ultima.fecha)}{r.ultima.impresora ? ` · ${r.ultima.impresora}` : ''}
                        {r.veces > 1 && <span style={{ color: 'var(--warn)' }}> · mandado {r.veces} veces</span>}
                      </div>
                    )}
                  </div>
                  <button className={`btn btn-sm ${r.veces > 0 ? '' : 'btn-primary'}`} onClick={() => mandar(r.archivo, r)}>
                    {r.veces > 0 ? 'Mandar de nuevo' : 'Enviar'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <ListaEnvios productoId={producto.id} soloLectura={soloLectura} />

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
