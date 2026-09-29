import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { confirmar, avisar, pedirTexto } from './Dialogos';
import SelectorRangoFechas from './SelectorRangoFechas';
import { descargarPdfBase64 } from '../utils/facturacion';

// Listado de comprobantes de ARCA con filtros, tabla compacta, acciones y
// exportación a Excel. Lo usan el panel admin (sus facturas) y cada
// emprendimiento (las de sus pedidos): cambian las facturas, los orígenes
// posibles y las Cloud Functions de cada acción.
//
// props:
//   facturas: docs de facturas (con id), ya ordenados del más nuevo al más viejo.
//   origenes: { tipoDeOrigen: 'Texto' } para la columna y el filtro de origen.
//   referenciaDe(f): texto de referencia de cada comprobante (ej. "Pedido #0012").
//   funciones: nombres de las callables { pdf, mail, anular, reintentar }.
//   nombreExcel: prefijo del archivo exportado.
//   columnaExtra: { titulo, valor(f) } opcional, se muestra después de la
//     fecha y se exporta al Excel (ej. el número de pedido).

const VISIBLES_COLAPSADO = 5;
const filtrosVacios = { estado: 'todos', tipo: 'todos', origen: 'todos', desde: '', hasta: '', texto: '' };

const pesos = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaAR = (yyyymmdd) => yyyymmdd ? `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}` : '';
const numeroCbte = (f) => f.numero
  ? `${String(f.ptoVta).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`
  : 'sin número';

const BADGE_ESTADO = {
  emitida: ['badge-done', 'emitida'],
  error: ['badge-cancelled', 'error'],
  pendiente: ['badge-pending', 'pendiente'],
  emitiendo: ['badge-progress', 'emitiendo'],
  descartada: ['badge-cancelled', 'descartada']
};

// Fecha del comprobante (YYYYMMDD): la de emisión, o la de creación si
// todavía no se emitió.
const fechaDe = (f) => f.fecha || (f.creadoEl?.toDate ? f.creadoEl.toDate().toISOString().slice(0, 10).replace(/-/g, '') : '');

// Columnas del Excel: las de "Mis Comprobantes" de ARCA (fecha, tipo, punto
// de venta, número, CAE, receptor, importe) más el estado y el origen en
// Manager3D, para poder cruzarlo.
const TIPOS_CBTE = { 11: '11 - Factura C', 13: '13 - Nota de Crédito C' };
const DOC_TIPOS = { 80: 'CUIT', 96: 'DNI', 99: 'Consumidor final' };
const COLUMNAS_EXCEL = [
  { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
  { titulo: 'Tipo', ancho: 22 },
  { titulo: 'Punto de Venta', tipo: 'numero', ancho: 14 },
  { titulo: 'Número', tipo: 'numero', ancho: 12 },
  { titulo: 'CAE', ancho: 17 },
  { titulo: 'Vto. CAE', tipo: 'fecha', ancho: 12 },
  { titulo: 'Tipo Doc. Receptor', ancho: 18 },
  { titulo: 'Nro. Doc. Receptor', ancho: 16 },
  { titulo: 'Denominación Receptor', ancho: 30 },
  { titulo: 'Condición IVA Receptor', ancho: 24 },
  { titulo: 'Moneda', ancho: 8 },
  { titulo: 'Importe Total', tipo: 'moneda', ancho: 14 },
  { titulo: 'Estado', ancho: 14 },
  { titulo: 'Anulada por NC', ancho: 14 },
  { titulo: 'Origen', ancho: 26 },
  { titulo: 'Referencia', ancho: 24 },
  { titulo: 'Email receptor', ancho: 26 },
  { titulo: 'Entorno', ancho: 13 }
];

const IconoPdf = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '16px', height: '16px' }}>
    <path d="M5 2h7l3 3v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
    <path d="M12 2v3h3M10 8v6M7.5 11.5L10 14l2.5-2.5" />
  </svg>
);
const IconoMail = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '16px', height: '16px' }}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <path d="M3 5.5l7 5 7-5" />
  </svg>
);

const llamar = (nombre, datos) => httpsCallable(functions, nombre, { timeout: 300000 })(datos).then((r) => r.data);
const textoErrores = (r) => (r?.errores || []).map((e) => `${e.codigo}: ${e.mensaje}`).join('\n');

export default function TablaComprobantes({ facturas, origenes, referenciaDe = (f) => f.origen?.referencia || '', funciones, nombreExcel = 'comprobantes', columnaExtra, showToast }) {
  const [filtros, setFiltros] = useState(filtrosVacios);
  const [verTodos, setVerTodos] = useState(false);
  const [ocupada, setOcupada] = useState(null); // id de la factura con una acción en curso
  const [exportando, setExportando] = useState(false);

  const pasaFiltros = (f) => {
    if (filtros.estado === 'anulada' && !f.notaCreditoId) return false;
    if (filtros.estado === 'emitida' && (f.estado !== 'emitida' || f.notaCreditoId)) return false;
    if (filtros.estado === 'enCurso' && !['pendiente', 'emitiendo'].includes(f.estado)) return false;
    if (['error', 'descartada'].includes(filtros.estado) && f.estado !== filtros.estado) return false;
    if (filtros.tipo === 'factura' && f.tipoCbte !== 11) return false;
    if (filtros.tipo === 'notaCredito' && f.tipoCbte !== 13) return false;
    if (filtros.origen !== 'todos' && f.origen?.tipo !== filtros.origen) return false;
    const fecha = fechaDe(f);
    if (filtros.desde && fecha < filtros.desde.replace(/-/g, '')) return false;
    if (filtros.hasta && fecha > filtros.hasta.replace(/-/g, '')) return false;
    const texto = filtros.texto.trim().toLowerCase();
    if (texto) {
      const campos = [f.receptor?.nombre, f.receptor?.docNro, f.receptor?.email, referenciaDe(f), f.cae, f.numero && String(f.numero)];
      if (!campos.some((c) => c && String(c).toLowerCase().includes(texto))) return false;
    }
    return true;
  };

  const filtradas = facturas.filter(pasaFiltros);
  const visibles = verTodos ? filtradas : filtradas.slice(0, VISIBLES_COLAPSADO);
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(filtrosVacios);
  // Total facturado de lo filtrado: facturas emitidas menos sus notas de crédito.
  const totalFiltrado = filtradas
    .filter((f) => f.estado === 'emitida')
    .reduce((s, f) => s + (f.tipoCbte === 13 ? -1 : 1) * (Number(f.importeTotal) || 0), 0);

  const cambiarFiltro = (campo) => (e) => setFiltros((prev) => ({ ...prev, [campo]: e.target.value }));

  const accion = async (f, nombre, datos, mensajeOk) => {
    setOcupada(f.id);
    try {
      const r = await llamar(nombre, { id: f.id, ...datos });
      if (r?.estado && r.estado !== 'emitida') {
        await avisar(textoErrores(r) || 'No se pudo emitir.', { titulo: 'ARCA no autorizó el comprobante' });
      } else if (mensajeOk) {
        showToast(mensajeOk);
      }
      return r;
    } catch (e) {
      showToast(e?.message || 'No se pudo completar la acción.', 'error');
      return null;
    } finally {
      setOcupada(null);
    }
  };

  const descargar = async (f) => {
    const r = await accion(f, funciones.pdf, {});
    if (r?.base64) descargarPdfBase64(r.base64, r.nombre);
  };

  const reenviar = async (f) => {
    const email = await pedirTexto('Email al que se manda el comprobante', { tipoInput: 'email', valorInicial: f.receptor?.email || '' });
    if (email) await accion(f, funciones.mail, { email }, 'Mail enviado.');
  };

  const anular = async (f) => {
    if (!(await confirmar(`Se va a emitir una Nota de Crédito C por ${pesos(f.importeTotal)} que anula la factura ${numeroCbte(f)}. ¿Seguir?`, { titulo: 'Anular factura', peligro: true }))) return;
    await accion(f, funciones.anular, {}, 'Nota de crédito emitida.');
  };

  // Exporta TODO lo filtrado (no sólo lo visible).
  const exportar = async () => {
    setExportando(true);
    try {
      const { exportarExcel } = await import('../utils/exportarExcel');
      const hoy = new Date().toISOString().slice(0, 10);
      await exportarExcel({
        nombreArchivo: `${nombreExcel}-${hoy}.xlsx`,
        hoja: 'Comprobantes',
        columnas: columnaExtra
          ? [COLUMNAS_EXCEL[0], { titulo: columnaExtra.titulo, ancho: 12 }, ...COLUMNAS_EXCEL.slice(1)]
          : COLUMNAS_EXCEL,
        filas: filtradas.map((f) => [
          fechaDe(f),
          ...(columnaExtra ? [columnaExtra.valor(f) || ''] : []),
          TIPOS_CBTE[f.tipoCbte] || f.tipoCbte,
          f.ptoVta || '',
          f.numero || '',
          f.cae || '',
          f.caeVto || '',
          DOC_TIPOS[f.receptor?.docTipo] || '',
          f.receptor?.docTipo !== 99 ? f.receptor?.docNro : '',
          f.receptor?.nombre || '',
          f.receptor?.condicionIvaTexto || '',
          'PES',
          Number(f.importeTotal) || 0,
          f.estado,
          f.notaCreditoId ? 'Sí' : '',
          origenes[f.origen?.tipo] || f.origen?.tipo || '',
          referenciaDe(f),
          f.receptor?.email || '',
          f.entorno === 'produccion' ? 'Producción' : 'Homologación'
        ])
      });
    } catch (e) {
      console.error('Error al exportar comprobantes:', e);
      showToast('No se pudo generar el Excel.', 'error');
    } finally {
      setExportando(false);
    }
  };

  const input = { fontSize: '13px' };
  const etiqueta = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text2)' };
  const botonChico = { fontSize: '11px', padding: '4px 8px' };
  const botonIcono = { padding: '4px 6px' };

  return (
    <>
      {/* Anchos por filtro: el de tipo es corto y el de fechas necesita lugar para el rango. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
        <label style={{ ...etiqueta, flex: '2 1 200px' }}>Buscar
          <input type="text" style={input} value={filtros.texto} onChange={cambiarFiltro('texto')} placeholder="Cliente, documento, número, CAE…" />
        </label>
        <label style={{ ...etiqueta, flex: '1 1 150px' }}>Estado
          <select style={input} value={filtros.estado} onChange={cambiarFiltro('estado')}>
            <option value="todos">Todos</option>
            <option value="emitida">Emitidas vigentes</option>
            <option value="anulada">Anuladas</option>
            <option value="error">Con error</option>
            <option value="enCurso">Pendientes / emitiendo</option>
            <option value="descartada">Descartadas</option>
          </select>
        </label>
        <label style={{ ...etiqueta, flex: '0 1 120px' }}>Tipo
          <select style={input} value={filtros.tipo} onChange={cambiarFiltro('tipo')}>
            <option value="todos">Todos</option>
            <option value="factura">Facturas</option>
            <option value="notaCredito">Notas de crédito</option>
          </select>
        </label>
        <label style={{ ...etiqueta, flex: '1 1 160px' }}>Origen
          <select style={input} value={filtros.origen} onChange={cambiarFiltro('origen')}>
            <option value="todos">Todos</option>
            {Object.entries(origenes).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
          </select>
        </label>
        <div style={{ ...etiqueta, flex: '1.5 1 240px' }}>Fechas
          <SelectorRangoFechas
            desde={filtros.desde}
            hasta={filtros.hasta}
            onChange={(desde, hasta) => setFiltros((prev) => ({ ...prev, desde, hasta }))}
            style={{ ...input, width: '100%' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }}>
        <span>{filtradas.length} comprobante{filtradas.length === 1 ? '' : 's'} · total facturado {pesos(totalFiltrado)}</span>
        {hayFiltros && <button className="btn btn-ghost" style={botonChico} onClick={() => setFiltros(filtrosVacios)}>Limpiar filtros</button>}
        <button className="btn" style={{ ...botonChico, marginLeft: 'auto' }} disabled={exportando || filtradas.length === 0} onClick={exportar}>
          {exportando ? 'Exportando…' : `Exportar a Excel (${filtradas.length})`}
        </button>
      </div>
      {facturas.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Todavía no hay comprobantes.</div>}
      {facturas.length > 0 && filtradas.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Ningún comprobante coincide con los filtros.</div>}
      {filtradas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th>Fecha</th>
                {columnaExtra && <th>{columnaExtra.titulo}</th>}
                <th>Tipo</th>
                <th>N° comp.</th>
                <th>Cliente</th>
                <th>N° documento</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>CAE</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const [badge, textoEstado] = f.notaCreditoId
                  ? ['badge-cancelled', 'anulada']
                  : (BADGE_ESTADO[f.estado] || ['badge-pending', f.estado]);
                const esNC = f.tipoCbte === 13;
                // Errores y advertencias van en una fila aparte, debajo, para
                // no ensanchar la tabla.
                const notas = [
                  ...(f.estado === 'error' ? (f.errores || []).map((e) => ({ error: true, texto: `${e.codigo}: ${e.mensaje}` })) : []),
                  ...(f.advertencias || []).map((a) => ({ texto: `⚠ ${a}` })),
                  ...(f.errorMail ? [{ texto: `⚠ El mail no salió: ${f.errorMail}` }] : [])
                ];
                const origen = [origenes[f.origen?.tipo] || f.origen?.tipo, referenciaDe(f)].filter(Boolean).join(' · ');
                return (
                  <React.Fragment key={f.id}>
                    <tr title={origen}>
                      <td>{fechaAR(fechaDe(f)) || '—'}</td>
                      {columnaExtra && <td style={{ fontFamily: 'var(--mono)' }}>{columnaExtra.valor(f) || '—'}</td>}
                      <td>{esNC ? 'NC C' : 'Factura C'}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{numeroCbte(f)}</td>
                      <td>
                        {f.receptor?.nombre || 'Consumidor final'}
                        {f.mailEnviadoEl && <span title="Mail enviado" style={{ marginLeft: '4px', color: 'var(--text3)' }}>✉</span>}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{f.receptor?.docTipo !== 99 ? f.receptor?.docNro : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{pesos(f.importeTotal)}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{f.cae || '—'}</td>
                      <td>
                        <span className={`badge ${badge}`}>{textoEstado}</span>
                        {f.entorno === 'homologacion' && <span className="badge badge-pending" style={{ marginLeft: '4px' }}>prueba</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          {f.estado === 'emitida' && (
                            <>
                              <button className="btn btn-ghost" style={botonIcono} disabled={ocupada === f.id} onClick={() => descargar(f)} title="Descargar PDF" aria-label="Descargar PDF">
                                <IconoPdf />
                              </button>
                              <button className="btn btn-ghost" style={botonIcono} disabled={ocupada === f.id} onClick={() => reenviar(f)} title="Mandar por mail" aria-label="Mandar por mail">
                                <IconoMail />
                              </button>
                              {!esNC && !f.notaCreditoId && (
                                <button className="btn btn-danger" style={botonChico} disabled={ocupada === f.id} onClick={() => anular(f)}>Anular</button>
                              )}
                            </>
                          )}
                          {f.estado !== 'emitida' && f.estado !== 'descartada' && (
                            <button className="btn btn-ghost" style={botonChico} disabled={ocupada === f.id} onClick={() => accion(f, funciones.reintentar, {}, 'Comprobante emitido.')}>
                              {ocupada === f.id ? 'Emitiendo…' : 'Reintentar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {notas.length > 0 && (
                      <tr>
                        <td colSpan={columnaExtra ? 10 : 9} style={{ whiteSpace: 'normal', paddingTop: 0 }}>
                          {notas.map((n, i) => (
                            <div key={i} style={{ fontSize: '11px', color: n.error ? 'var(--danger)' : 'var(--text2)' }}>{n.texto}</div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtradas.length > VISIBLES_COLAPSADO && (
        <button className="btn btn-ghost" style={{ ...botonChico, marginTop: '8px' }} onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? `Mostrar sólo los últimos ${VISIBLES_COLAPSADO}` : `Ver los ${filtradas.length - VISIBLES_COLAPSADO} restantes`}
        </button>
      )}
    </>
  );
}
