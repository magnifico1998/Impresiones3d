import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useApp } from '../context/AppContext';
import { confirmar, avisar, pedirTexto } from './Dialogos';
import ModalFacturarPedido from './modals/ModalFacturarPedido';
import { numeroComprobante, pesosAR, descargarPdfBase64, compartirPdfBase64 } from '../utils/facturacion';

// Bloque "Factura electrónica" del detalle del pedido. El estado sale de
// users/{cuenta}/facturasPorPedido/{pedidoId}, que mantiene el servidor
// (ver functions/facturacion.js, actualizarResumenPedido).

const llamar = (nombre, datos) => httpsCallable(functions, nombre, { timeout: 300000 })(datos).then((r) => r.data);

const textoErrores = (errores) => (errores || []).map((e) => `${e.codigo}: ${e.mensaje}`).join('\n');

export default function SeccionFacturaPedido({ pedido, cliente, precioVentaNeto, persistirBorrador }) {
  const { cuentaId, planContratado, showToast, setActivePage } = useApp();
  const [config, setConfig] = useState(undefined);
  const [resumen, setResumen] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const habilitada = !!planContratado?.facturacionElectronica;
  const pedidoId = String(pedido.id);

  useEffect(() => {
    if (!cuentaId || !habilitada) return undefined;
    const quitarConfig = onSnapshot(doc(db, 'users', cuentaId, 'facturacion', 'config'),
      (s) => setConfig(s.exists() ? s.data() : null), () => setConfig(null));
    const quitarResumen = onSnapshot(doc(db, 'users', cuentaId, 'facturasPorPedido', pedidoId),
      (s) => setResumen(s.exists() ? s.data() : null), () => setResumen(null));
    return () => { quitarConfig(); quitarResumen(); };
  }, [cuentaId, habilitada, pedidoId]);

  if (!habilitada || config === undefined) return null;

  const accion = async (nombre, datos, mensajeOk) => {
    setOcupado(true);
    try {
      const r = await llamar(nombre, datos);
      if (r?.estado && r.estado !== 'emitida') {
        await avisar(textoErrores(r.errores) || 'No se pudo emitir.', { titulo: 'ARCA no autorizó el comprobante' });
      } else if (mensajeOk) {
        showToast(mensajeOk);
      }
      return r;
    } catch (e) {
      showToast(e?.message || 'No se pudo completar la acción.', 'error');
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const pdf = async (id, compartir) => {
    const r = await accion('descargarFacturaCuentaPDF', { id });
    if (!r?.base64) return;
    if (compartir) await compartirPdfBase64(r.base64, r.nombre, `Factura de tu pedido #${pedidoId.padStart(4, '0')}`);
    else descargarPdfBase64(r.base64, r.nombre);
  };

  const mandarMail = async () => {
    const email = await pedirTexto('Email al que se manda la factura', { tipoInput: 'email', valorInicial: cliente?.email || '' });
    if (email) await accion('enviarFacturaCuentaMail', { id: resumen.facturaId, email }, 'Factura enviada por mail.');
  };

  const anular = async () => {
    if (!(await confirmar(`Se va a emitir una Nota de Crédito C por ${pesosAR(resumen.importeTotal)} que anula la factura ${numeroComprobante(resumen.ptoVta, resumen.numero)}. Después vas a poder volver a facturar el pedido.`, { titulo: 'Anular factura', textoConfirmar: 'Anular', peligro: true }))) return;
    await accion('anularFacturaCuenta', { id: resumen.facturaId }, 'Factura anulada con nota de crédito.');
  };

  const descartar = async () => {
    if (!(await confirmar('Se descarta el intento con error (no llegó a ARCA) y vas a poder armar la factura de nuevo.', { titulo: 'Descartar factura' }))) return;
    await accion('descartarFacturaCuenta', { id: resumen.facturaId }, 'Listo, podés volver a facturar.');
  };

  const abrirFacturar = () => {
    // Se guarda el borrador para que la factura salga con lo que se ve.
    persistirBorrador();
    setAbierto(true);
  };

  const titulo = (
    <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
      Factura electrónica
    </div>
  );
  const fila = { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' };

  let contenido;
  if (!config?.verificado) {
    contenido = (
      <div style={{ ...fila, fontSize: '13px', color: 'var(--text2)' }}>
        Para facturar este pedido, primero configurá la facturación.
        <button className="btn btn-sm" onClick={() => setActivePage('empresa')}>Ir a Mi emprendimiento</button>
      </div>
    );
  } else if (!resumen || resumen.estado === 'anulada') {
    const bloqueado = ['cancelado', 'en_verificacion'].includes(pedido.estado);
    contenido = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {resumen?.estado === 'anulada' && (
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
            La factura {numeroComprobante(resumen.ptoVta, resumen.numero)} se anuló con la nota de crédito {numeroComprobante(resumen.ptoVta, resumen.notaCreditoNumero)}.
          </div>
        )}
        <div style={fila}>
          <button className="btn btn-primary btn-sm" disabled={bloqueado} onClick={abrirFacturar}>Facturar pedido</button>
          {bloqueado && <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Un pedido sin confirmar o cancelado no se factura.</span>}
        </div>
      </div>
    );
  } else if (resumen.estado === 'emitida') {
    const ncConError = resumen.notaCreditoId && resumen.notaCreditoEstado !== 'emitida';
    contenido = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px' }}>
          <span className="badge badge-done">facturado</span>{' '}
          Factura C {numeroComprobante(resumen.ptoVta, resumen.numero)} · {pesosAR(resumen.importeTotal)}
        </div>
        {ncConError && (
          <div style={{ fontSize: '12px', color: 'var(--danger)' }}>
            La nota de crédito para anularla quedó con error. {textoErrores(resumen.notaCreditoErrores)}
          </div>
        )}
        <div style={fila}>
          <button className="btn btn-sm" disabled={ocupado} onClick={() => pdf(resumen.facturaId, false)}>Descargar PDF</button>
          <button className="btn btn-sm" disabled={ocupado} onClick={() => pdf(resumen.facturaId, true)}>Compartir (WhatsApp)</button>
          <button className="btn btn-sm" disabled={ocupado} onClick={mandarMail}>Mandar por mail</button>
          {ncConError
            ? <button className="btn btn-sm" disabled={ocupado} onClick={() => accion('reintentarFacturaCuenta', { id: resumen.notaCreditoId }, 'Factura anulada con nota de crédito.')}>Reintentar anulación</button>
            : !resumen.notaCreditoId && <button className="btn btn-danger btn-sm" disabled={ocupado} onClick={anular}>Anular</button>}
        </div>
      </div>
    );
  } else if (resumen.estado === 'error') {
    contenido = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px' }}><span className="badge badge-cancelled">con error</span> ARCA no autorizó la factura:</div>
        <div style={{ fontSize: '12px', color: 'var(--danger)', whiteSpace: 'pre-line' }}>{textoErrores(resumen.errores)}</div>
        <div style={fila}>
          <button className="btn btn-sm" disabled={ocupado} onClick={() => accion('reintentarFacturaCuenta', { id: resumen.facturaId }, 'Factura emitida.')}>
            {ocupado ? 'Reintentando…' : 'Reintentar'}
          </button>
          <button className="btn btn-sm" disabled={ocupado} onClick={descartar}>Descartar y corregir</button>
        </div>
      </div>
    );
  } else {
    contenido = (
      <div style={{ ...fila, fontSize: '13px' }}>
        <span className="badge badge-progress">emitiendo</span> Se está autorizando en ARCA…
        <button className="btn btn-sm" disabled={ocupado} onClick={() => accion('reintentarFacturaCuenta', { id: resumen.facturaId }, 'Factura emitida.')}>Revisar</button>
      </div>
    );
  }

  return (
    <>
      <div className="sep"></div>
      {titulo}
      {contenido}
      {abierto && (
        <ModalFacturarPedido pedido={pedido} cliente={cliente} precioVentaNeto={precioVentaNeto} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}
