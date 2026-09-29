import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { confirmar } from './Dialogos';
import { useMovimientosInventario } from '../hooks/useMovimientosInventario';
import { formatoCantidad } from '../utils/inventario';
import { consumosDelPedido, ESTADOS_QUE_CONSUMEN } from '../utils/consumoPedido';
import ModalConsumoPedido from './modals/ModalConsumoPedido';

// Bloque "Inventario" del detalle del pedido: lo que ya se descontó (con
// opción de deshacer) o el botón para descontarlo. Si el pedido pasa a
// completado o enviado y todavía no se descontó, abre solo la propuesta.

export default function SeccionInventarioPedido({ pedido }) {
  const { cfg } = useApp();
  const { movimientos, borrarMovimiento } = useMovimientosInventario();
  const [abierto, setAbierto] = useState(false);
  const estadoAnterior = useRef(pedido.estado);

  const consumos = consumosDelPedido(movimientos, pedido.id);
  const yaDescontado = consumos.length > 0;

  // Sólo al CAMBIAR a completado/enviado (no al abrir un pedido que ya lo estaba).
  useEffect(() => {
    const antes = estadoAnterior.current;
    estadoAnterior.current = pedido.estado;
    if (antes !== pedido.estado && ESTADOS_QUE_CONSUMEN.includes(pedido.estado) && !yaDescontado) setAbierto(true);
  }, [pedido.estado, yaDescontado]);

  if (!cfg.inventarioHabilitado) return null;

  const deshacer = async () => {
    if (!(await confirmar('Se borran los consumos de este pedido y el stock vuelve a como estaba. Después podés volver a descontarlo.', { titulo: 'Deshacer descuento', peligro: true }))) return;
    for (const m of consumos) await borrarMovimiento(m.id);
  };

  return (
    <>
      <div className="sep"></div>
      <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
        Inventario
      </div>
      {yaDescontado ? (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', fontSize: '13px' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <span className="badge badge-ok">descontado</span>{' '}
            {consumos.map((m) => `${formatoCantidad(-m.cantidad, /filamento\|/.test(m.clave) ? 'g' : 'u')} ${m.nombre}`).join(' · ')}
          </div>
          <button className="btn btn-sm" onClick={deshacer}>Deshacer</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text2)' }}>
          Todavía no se descontó del inventario.
          <button className="btn btn-sm" onClick={() => setAbierto(true)}>Descontar del inventario</button>
        </div>
      )}
      {abierto && <ModalConsumoPedido pedido={pedido} onClose={() => setAbierto(false)} />}
    </>
  );
}
