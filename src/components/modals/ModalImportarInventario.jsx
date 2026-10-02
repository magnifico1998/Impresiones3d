import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { confirmar as confirmarDialogo } from '../Dialogos';
import { useMovimientosInventario } from '../../hooks/useMovimientosInventario';
import { fechaLocalHoy } from '../../utils/fechaCompletado';
import { armarInventario, entrada, esLineaFilamento, formatoCantidad, juntarMarcas, nombreLinea } from '../../utils/inventario';
import { descargarPlantillaInventario, leerCSVInventario } from '../../utils/importarInventario';

// Carga inicial del inventario desde un CSV (formato en
// utils/importarInventario.js): lo que ya se tenía antes de cargar compras.
// Cada fila válida queda como un movimiento 'inicial', todos con el mismo
// `lote`, así una importación equivocada se deshace entera desde acá.

// Color inicial de un color nuevo, como en ModalCompra.
const COLOR_NUEVO_DEFAULT = '#9e9e9e';

// Configuración vieja: filamentos y colores podían ser strings sueltos.
const nombreDe = (x) => (typeof x === 'string' ? x : x?.nombre || '');
const hexDe = (x) => (typeof x === 'string' ? '' : x?.hex || '');
const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const fechaCorta = (f) => (f ? f.split('-').reverse().join('/') : '—');

// Excel en español suele guardar el CSV en Windows-1252, no en UTF-8: si el
// texto no es UTF-8 válido se relee así, para no romper los acentos.
async function leerArchivo(archivo) {
  const bytes = await archivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export default function ModalImportarInventario({ onClose }) {
  const { compras, cfg, setCfg, fmt, showToast } = useApp();
  const { movimientos, agregarMovimientos, borrarMovimientos } = useMovimientosInventario();
  const [archivo, setArchivo] = useState('');
  const [lectura, setLectura] = useState(null); // { error } | { filas }
  const [fecha, setFecha] = useState(fechaLocalHoy());
  const [agregarACfg, setAgregarACfg] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const colores = useMemo(() => (cfg.colores || []).map((c) => ({ nombre: nombreDe(c), hex: hexDe(c) })).filter((c) => c.nombre), [cfg.colores]);
  const inventario = useMemo(() => armarInventario(compras, movimientos), [compras, movimientos]);
  const clavesExistentes = useMemo(() => new Set(inventario.map((a) => a.clave)), [inventario]);

  const filas = lectura?.filas || [];
  const validas = filas.filter((f) => f.linea);
  const conError = filas.length - validas.length;

  // Importaciones anteriores, de la más nueva a la más vieja.
  const lotes = useMemo(() => {
    const porLote = new Map();
    for (const m of movimientos) {
      if (m.tipo !== 'inicial') continue;
      const k = m.lote || m.id;
      const l = porLote.get(k) || { lote: k, fecha: m.fecha || '', ids: [], creado: m.creadoEl?.toMillis?.() || 0 };
      l.ids.push(m.id);
      porLote.set(k, l);
    }
    return [...porLote.values()].sort((a, b) => b.creado - a.creado);
  }, [movimientos]);

  const elegirArchivo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // para poder volver a elegir el mismo archivo corregido
    if (!f) return;
    setArchivo(f.name);
    setLectura(leerCSVInventario(await leerArchivo(f), colores));
  };

  // Tipos de filamento, colores, marcas y artículos nuevos a la
  // configuración, como hace una compra (ver ModalCompra), para que
  // después se sugieran en compras y pedidos.
  const sumarAConfiguracion = (lineas) => {
    const filamentos = (cfg.filamentos || []).map(nombreDe);
    const tiposNuevos = [];
    const coloresNuevos = [];
    for (const l of lineas) {
      if (esLineaFilamento(l) && !filamentos.some((f) => igual(f, l.tipo)) && !tiposNuevos.some((t) => igual(t.nombre, l.tipo))) {
        tiposNuevos.push({ nombre: l.tipo, precio: l.precio });
      }
      if (l.color && !colores.some((c) => igual(c.nombre, l.color)) && !coloresNuevos.some((c) => igual(c.nombre, l.color))) {
        coloresNuevos.push({ nombre: l.color, hex: COLOR_NUEVO_DEFAULT, secundario: false });
      }
    }
    const articulosCfg = cfg.articulosCompra || {};
    const articulosNuevos = {};
    for (const l of lineas.filter((x) => !esLineaFilamento(x))) {
      const lista = articulosNuevos[l.cat] || articulosCfg[l.cat] || [];
      const junta = juntarMarcas(lista, [l.desc]);
      if (junta.length !== lista.length) articulosNuevos[l.cat] = junta;
    }
    const marcasCfg = cfg.marcasFilamento || [];
    const marcasNuevas = juntarMarcas(marcasCfg, lineas.map((l) => l.marca));
    if (!tiposNuevos.length && !coloresNuevos.length && !Object.keys(articulosNuevos).length && marcasNuevas.length === marcasCfg.length) return;
    setCfg((prev) => ({
      ...prev,
      marcasFilamento: marcasNuevas,
      filamentos: [...(prev.filamentos || []), ...tiposNuevos],
      colores: [...(prev.colores || []), ...coloresNuevos],
      articulosCompra: { ...(prev.articulosCompra || {}), ...articulosNuevos }
    }));
    const agregados = [
      tiposNuevos.length && `${tiposNuevos.length} filamento${tiposNuevos.length === 1 ? '' : 's'}`,
      coloresNuevos.length && `${coloresNuevos.length} color${coloresNuevos.length === 1 ? '' : 'es'} (con un gris provisorio: cambialo en Configuración)`
    ].filter(Boolean);
    if (agregados.length) showToast(`Se agregaron a la configuración: ${agregados.join(' y ')}.`);
  };

  const importar = async () => {
    if (!validas.length || !fecha) return;
    setGuardando(true);
    const lote = `${Date.now()}`;
    const nota = archivo ? `Importado de ${archivo}` : 'Carga inicial';
    const lista = validas.map(({ linea }) => {
      const e = entrada(linea);
      return { clave: e.clave, nombre: e.nombre, tipo: 'inicial', cantidad: e.qty, fecha, nota, lote, linea };
    });
    const ok = await agregarMovimientos(lista);
    if (ok && agregarACfg) sumarAConfiguracion(validas.map((f) => f.linea));
    setGuardando(false);
    if (ok) {
      showToast(`Se cargaron ${lista.length} artículo${lista.length === 1 ? '' : 's'} al inventario.`);
      onClose();
    }
  };

  const deshacerLote = async (l) => {
    if (!(await confirmarDialogo(`¿Deshacer la carga inicial del ${fechaCorta(l.fecha)} (${l.ids.length} artículo${l.ids.length === 1 ? '' : 's'})? El stock que sumó se resta; los consumos y ajustes posteriores quedan.`, { titulo: 'Deshacer carga inicial', peligro: true }))) return;
    setGuardando(true);
    if (await borrarMovimientos(l.ids)) showToast('Carga inicial deshecha.');
    setGuardando(false);
  };

  return createPortal(
    <div className="modal-overlay open" onClick={guardando ? undefined : onClose} style={{ zIndex: 120, padding: '20px 16px' }}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto', maxWidth: '860px' }}>
        <div className="modal-title">Importar inventario inicial</div>
        <div className="modal-sub">
          Cargá de una vez lo que ya tenés, para partir de una base. No se registra como compra ni como gasto: sólo suma stock.
          Si un artículo ya está en el inventario, la cantidad se le suma.
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: '12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>Formato del CSV</div>
          Una fila por artículo, con estas columnas (la primera fila es el encabezado):
          <div style={{ fontFamily: 'var(--mono)', margin: '4px 0' }}>categoria;nombre;marca;color;cantidad;peso_rollo_g;costo_unitario</div>
          <b>categoria</b>: Filamento, Insumo, Accesorio, Equipo u Otro · <b>nombre</b>: en filamento el tipo (PLA, PETG…), en el resto la descripción ·{' '}
          <b>cantidad</b>: unidades, o rollos en filamento (0,5 = medio rollo) · <b>peso_rollo_g</b>: sólo filamento, por defecto 1000 ·{' '}
          <b>costo_unitario</b>: por unidad o por rollo (opcional). Marca y color son opcionales; en filamento el color sirve para descontarlo de los pedidos.
          <div style={{ marginTop: '8px' }}>
            <button className="btn btn-sm" onClick={descargarPlantillaInventario}>Descargar plantilla</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div>
            <label className="fl">Archivo CSV</label>
            <label className="btn" style={{ cursor: 'pointer' }}>
              {archivo ? 'Elegir otro archivo' : 'Elegir archivo…'}
              <input type="file" accept=".csv,.txt,text/csv" onChange={elegirArchivo} style={{ display: 'none' }} />
            </label>
            {archivo && <span style={{ fontSize: '12px', color: 'var(--text2)', marginLeft: '8px' }}>{archivo}</span>}
          </div>
          <div>
            <label className="fl">Fecha de la carga</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: '160px' }} />
          </div>
        </div>

        {lectura?.error && (
          <div style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '12px' }}>{lectura.error}</div>
        )}

        {filas.length > 0 && (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>
              {validas.length} fila{validas.length === 1 ? '' : 's'} para importar
              {conError > 0 && <span style={{ color: 'var(--danger)' }}> · {conError} con error (no se importan: corregilas en el archivo y volvé a elegirlo)</span>}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Artículo</th>
                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th style={{ textAlign: 'right' }}>Costo unit.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    if (!f.linea) {
                      return (
                        <tr key={f.numero} style={{ background: 'var(--dangerDim)' }}>
                          <td style={{ fontFamily: 'var(--mono)' }}>{f.numero}</td>
                          <td colSpan={4} style={{ color: 'var(--danger)', fontSize: '12px' }}>{f.error}</td>
                        </tr>
                      );
                    }
                    const e = entrada(f.linea);
                    return (
                      <tr key={f.numero}>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{f.numero}</td>
                        <td>
                          {e.colorHex && (
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', marginRight: '6px', verticalAlign: '-1px', border: '1px solid var(--border2)', background: e.colorHex }} />
                          )}
                          {nombreLinea(f.linea)}
                          <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '6px' }}>{e.cat}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {formatoCantidad(e.qty, e.unidad)}
                          {e.filamento && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{f.linea.qty.toLocaleString('es-AR')} rollo{f.linea.qty === 1 ? '' : 's'}</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{f.linea.precio ? fmt(f.linea.precio) : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {clavesExistentes.has(e.clave) && <span className="badge badge-pending" title="Ya está en el inventario: la cantidad se le suma.">se suma</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text2)', marginTop: '10px', cursor: 'pointer' }}>
              <input type="checkbox" checked={agregarACfg} onChange={(e) => setAgregarACfg(e.target.checked)} />
              Agregar a Configuración los tipos de filamento, colores y marcas que no existan (como hace una compra)
            </label>
          </>
        )}

        {lotes.length > 0 && (
          <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text2)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>Cargas iniciales anteriores</div>
            {lotes.map((l) => (
              <div key={l.lote} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '2px 0' }}>
                <span style={{ fontFamily: 'var(--mono)' }}>{fechaCorta(l.fecha)}</span>
                <span>{l.ids.length} artículo{l.ids.length === 1 ? '' : 's'}</span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--text3)' }} disabled={guardando} onClick={() => deshacerLote(l)}>
                  Deshacer
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" disabled={guardando} onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" disabled={guardando || !validas.length || !fecha} onClick={importar}>
            {guardando ? 'Importando…' : `Importar${validas.length ? ` (${validas.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
