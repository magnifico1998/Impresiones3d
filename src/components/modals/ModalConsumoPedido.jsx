import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { useMovimientosInventario } from '../../hooks/useMovimientosInventario';
import { fechaLocalHoy } from '../../utils/fechaCompletado';
import { armarInventario, formatoCantidad } from '../../utils/inventario';
import { estimarConsumoPedido, sugerirFilamento, sugerirInsumo } from '../../utils/consumoPedido';
import SelectorBuscable from '../SelectorBuscable';
import { confirmar as confirmarDialogo } from '../Dialogos';

// "Descontar del inventario" de un pedido: propone cuánto filamento usó
// cada versión de cada producto (en los multicolor, por material) y los
// insumos del pedido, sugiere de qué artículo del inventario sale cada cosa,
// y al confirmar registra los consumos vinculados al pedido, uno por
// artículo. Todo se puede corregir antes de confirmar.

export default function ModalConsumoPedido({ pedido, onClose }) {
  const { compras, biblioteca, cfg, showToast } = useApp();
  const { movimientos, agregarMovimiento } = useMovimientosInventario();
  const [guardando, setGuardando] = useState(false);

  const inventario = useMemo(() => armarInventario(compras, movimientos), [compras, movimientos]);
  const filamentos = inventario.filter((a) => a.filamento);
  const otros = inventario.filter((a) => !a.filamento && a.cat !== 'Equipos');

  // Estimación inicial (una sola vez al abrir: después manda lo que se edite).
  const [filas, setFilas] = useState(() => {
    const { lineas, insumos } = estimarConsumoPedido(pedido, biblioteca, cfg);
    return {
      filamento: lineas.map((l) => ({ ...l, cantidad: l.gramos ? String(l.gramos) : '', articulo: sugerirFilamento(l, inventario) })),
      insumos: insumos.map((i) => ({ ...i, cantidad: String(i.cantidad), articulo: sugerirInsumo(i, inventario) }))
    };
  });

  const cambiar = (grupo, i, campo, valor) => setFilas((prev) => ({
    ...prev,
    [grupo]: prev[grupo].map((f, j) => (j === i ? { ...f, [campo]: valor } : f))
  }));

  const articuloDe = (clave) => inventario.find((a) => a.clave === clave);
  const aDescontar = [...filas.filamento, ...filas.insumos].filter((f) => f.articulo && parseFloat(f.cantidad) > 0);

  const confirmar = async () => {
    const numero = `Pedido #${String(pedido.id).padStart(4, '0')}`;
    // Sin nada elegido: se confirma y queda la marca de que se revisó, así el
    // pedido no vuelve a pedir el descuento (se deshace desde su detalle).
    if (aDescontar.length === 0) {
      if (!(await confirmarDialogo('No elegiste ningún rollo ni insumo: no se va a descontar nada del inventario. El pedido queda marcado como "sin descuento" y no te lo vuelve a proponer.', { titulo: 'Confirmar sin descontar', textoConfirmar: 'Confirmar sin descontar' }))) return;
      setGuardando(true);
      const ok = await agregarMovimiento({
        clave: '', nombre: '', tipo: 'sinDescuento', cantidad: 0,
        fecha: fechaLocalHoy(), pedidoId: String(pedido.id), nota: [numero, pedido.cliente].filter(Boolean).join(' · ')
      });
      setGuardando(false);
      if (ok) {
        showToast('Pedido marcado sin descuento de inventario.');
        onClose();
      }
      return;
    }
    setGuardando(true);
    // Un movimiento por artículo: si dos líneas salen del mismo rollo, se suman.
    const porArticulo = new Map();
    for (const f of aDescontar) porArticulo.set(f.articulo, (porArticulo.get(f.articulo) || 0) + parseFloat(f.cantidad));
    let ok = true;
    for (const [clave, cantidad] of porArticulo) {
      const a = articuloDe(clave);
      ok = (await agregarMovimiento({
        clave, nombre: a?.nombre || clave, tipo: 'consumo', cantidad: -Math.round(cantidad * 10) / 10,
        fecha: fechaLocalHoy(), pedidoId: String(pedido.id), nota: [numero, pedido.cliente].filter(Boolean).join(' · ')
      })) && ok;
    }
    setGuardando(false);
    if (ok) {
      showToast(`Se descontaron ${porArticulo.size} artículo${porArticulo.size === 1 ? '' : 's'} del inventario.`);
      onClose();
    }
  };

  const muestra = (hex) => (
    <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, border: '1px solid var(--border2)', background: hex || 'transparent' }} />
  );

  // Stock que queda después de lo que ya se eligió descontar de ese artículo.
  const stockRestante = (clave) => {
    const a = articuloDe(clave);
    if (!a) return null;
    const usado = aDescontar.filter((f) => f.articulo === clave).reduce((s, f) => s + parseFloat(f.cantidad), 0);
    return a.stock - usado;
  };

  const selectorArticulo = (grupo, i, f, opciones) => {
    const restante = f.articulo ? stockRestante(f.articulo) : null;
    const a = articuloDe(f.articulo);
    return (
      <>
        <SelectorBuscable
          value={f.articulo}
          onChange={(v) => cambiar(grupo, i, 'articulo', v)}
          textoVacio="— No descontar —"
          placeholder="Escribí el color o el tipo…"
          opciones={opciones.map((o) => ({ valor: o.clave, texto: o.nombre, muestra: o.colorHex, detalle: formatoCantidad(o.stock, o.unidad) }))}
        />
        {restante !== null && restante < 0 && (
          <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '2px' }}>
            No alcanza: faltan {formatoCantidad(-restante, a.unidad)}. Igual se puede descontar y ajustar después.
          </div>
        )}
      </>
    );
  };

  return createPortal(
    <div className="modal-overlay open" onClick={guardando ? undefined : onClose} style={{ zIndex: 120, padding: '20px 16px' }}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto', maxWidth: '820px' }}>
        <div className="modal-title">Descontar del inventario · Pedido #{String(pedido.id).padStart(4, '0')}</div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
          Estimado con los gramos de cada producto y los colores de cada versión (incluye el desperdicio). En los multicolor, el material con más gramos
          va al color principal de la versión y el siguiente al color 2. Revisá y corregí lo que haga falta: si dos filas salen del mismo rollo, se descuentan juntas.
        </div>

        <div className="card-title" style={{ marginTop: 0 }}>Filamento</div>
        {filas.filamento.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>El pedido no tiene piezas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table tabla-lineas-compra" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Color</th>
                  <th style={{ minWidth: '100px' }}>Gramos</th>
                  <th style={{ width: '100%' }}>Descontar de</th>
                </tr>
              </thead>
              <tbody>
                {filas.filamento.map((f, i) => (
                  <React.Fragment key={f.clave}>
                  {/* Encabezado de cada producto. */}
                  {(i === 0 || filas.filamento[i - 1].pieza !== f.pieza) && (
                    <tr>
                      <td colSpan={4} style={{ fontWeight: 600, fontSize: '12px', background: 'var(--bg3)', paddingTop: '6px', paddingBottom: '6px' }}>{f.pieza}</td>
                    </tr>
                  )}
                  <tr>
                    {f.primeraDeVersion && (
                      <td rowSpan={f.filasVersion} style={{ whiteSpace: 'nowrap', verticalAlign: 'top', color: 'var(--text2)' }}>{f.version}</td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* En multicolor: el color del material en el archivo → el color asignado. */}
                        {f.material && (
                          <span title={`Material ${f.material.numero} del archivo`} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text3)', fontSize: '11px' }}>
                            {muestra(f.material.colorHex)}M{f.material.numero} →
                          </span>
                        )}
                        {muestra(f.colorHex)}
                        <span>{f.colorNombre || 'Sin color'}{f.tipo ? ` · ${f.tipo}` : ''}</span>
                      </div>
                    </td>
                    <td>
                      <input type="number" min="0" step="1" value={f.cantidad} placeholder="g" onChange={(e) => cambiar('filamento', i, 'cantidad', e.target.value)} />
                      {f.sinDatos && (
                        <div style={{ fontSize: '11px', color: 'var(--warn)', marginTop: '2px' }}>Sin gramos en el producto: cargalos.</div>
                      )}
                    </td>
                    <td>{selectorArticulo('filamento', i, f, filamentos)}</td>
                  </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filamentos.length === 0 && filas.filamento.length > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '6px' }}>
            Todavía no hay filamento en el inventario: cargá una compra de filamento para poder descontarlo.
          </div>
        )}

        {filas.insumos.length > 0 && (
          <>
            <div className="card-title" style={{ marginTop: '18px' }}>Insumos del pedido</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table tabla-lineas-compra" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th style={{ minWidth: '90px' }}>Cantidad</th>
                    <th style={{ width: '100%' }}>Descontar de</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.insumos.map((f, i) => (
                    <tr key={`${f.nombre}-${i}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>{f.nombre}</td>
                      <td><input type="number" min="0" step="1" value={f.cantidad} onChange={(e) => cambiar('insumos', i, 'cantidad', e.target.value)} /></td>
                      <td>{selectorArticulo('insumos', i, f, otros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="btn" disabled={guardando} onClick={onClose}>Ahora no</button>
          <button className="btn btn-primary" disabled={guardando} onClick={confirmar} title={aDescontar.length ? '' : 'No hay nada elegido: marca el pedido sin descuento'}>
            {guardando ? 'Guardando…' : aDescontar.length ? `Descontar (${aDescontar.length})` : 'Confirmar sin descontar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
