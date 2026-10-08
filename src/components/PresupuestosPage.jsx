import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { confirmar } from './Dialogos';
import { fechaLocalHoy } from '../utils/fechaCompletado';
import { generarPdfPresupuesto } from '../utils/presupuestoPDF';
import { piezaDesdeBiblioteca, piezaDesdeCalculadora, piezaLibre } from '../utils/piezaPedido';
import { ESTADOS_PRESUPUESTO, ESTADOS_ABIERTOS } from '../utils/estadosPresupuesto';
import { borrarImagenDeFirebase } from '../utils/imageCompress';

// Presupuestos guardados (users/{uid}/presupuestos), separados de los
// pedidos: un presupuesto todavía no es una venta. Ciclo:
//   creado -> enviado (aguardando respuesta) -> aprobado | rechazado
// Aprobar crea el pedido (con las mismas reglas y límites del plan que
// cualquier otro, ver addPedido en AppContext.jsx) y lo deja vinculado en
// pedidoId. Un presupuesto aprobado ya no se edita ni se borra: su pedido
// es la fuente de verdad desde ahí.
const ABIERTOS = ESTADOS_ABIERTOS;

const fechaVisible = (yyyyMmDd) => (yyyyMmDd ? yyyyMmDd.split('-').reverse().join('/') : '');

// Fuera del componente a propósito: react-hooks/purity marca cualquier
// Date.now() dentro de él, aunque sólo corra al hacer clic (no en el render).
const ahoraMs = () => Date.now();

export default function PresupuestosPage({ onOpenNuevo, onOpenEditar, onVerPedido }) {
  const {
    presupuestos, updatePresupuesto, removePresupuesto,
    addPedido, pedidos, biblioteca, cfg, clientes, addCliente,
    getNewId, empresa, fmt, showToast
  } = useApp();

  const [filtroEstado, setFiltroEstado] = useState('abiertos');
  const [busqueda, setBusqueda] = useState('');
  const [aprobandoId, setAprobandoId] = useState(null);

  const stats = useMemo(() => ({
    total: presupuestos.length,
    aguardando: presupuestos.filter(p => p.estado === 'enviado').length,
    aprobados: presupuestos.filter(p => p.estado === 'aprobado').length,
    montoAprobado: presupuestos.filter(p => p.estado === 'aprobado').reduce((s, p) => s + (p.total || 0), 0)
  }), [presupuestos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return presupuestos
      .filter(p => filtroEstado === 'todos'
        || (filtroEstado === 'abiertos' ? ABIERTOS.includes(p.estado) : p.estado === filtroEstado))
      .filter(p => !q || (p.cliente || '').toLowerCase().includes(q) || String(p.numero).includes(q))
      .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  }, [presupuestos, filtroEstado, busqueda]);

  const cambiarEstado = async (p, estado) => {
    const ok = await updatePresupuesto(p.id, (actual) => ({ ...actual, estado, [`${estado}Ts`]: ahoraMs() }));
    if (ok) showToast(`Presupuesto N° ${p.numero}: ${ESTADOS_PRESUPUESTO[estado].texto.toLowerCase()}.`);
  };

  const construirPieza = (it) => {
    const base = { id: getNewId(), nombre: it.nombre, cantidad: it.cantidad, precioUnitario: it.precioUnitario };
    const prod = it.prodId != null ? biblioteca.find(b => b.id === it.prodId) : null;
    if (prod) return piezaDesdeBiblioteca(prod, base, cfg);
    if (it.calc) return piezaDesdeCalculadora(it.calc, base);
    return piezaLibre(base);
  };

  const aprobar = async (p) => {
    const ok = await confirmar(
      `Se va a crear un pedido para ${p.cliente} por ${fmt(p.total || 0)} con los productos del presupuesto. El presupuesto queda aprobado y ya no se puede editar.`,
      { titulo: `¿Aprobar el presupuesto N° ${p.numero}?`, textoConfirmar: 'Aprobar y crear pedido' }
    );
    if (!ok) return;

    setAprobandoId(p.id);
    const pedidoId = getNewId();
    const clienteTrim = (p.cliente || '').trim();
    const creado = await addPedido({
      id: pedidoId,
      cliente: clienteTrim || 'Sin nombre',
      desc: `Presupuesto N° ${p.numero}`,
      estado: 'pendiente',
      fechaPedido: fechaLocalHoy(),
      fechaEntrega: '',
      notaGeneral: p.notas || '',
      piezas: (p.items || []).map(construirPieza),
      precioVenta: p.total || 0,
      envio: 0,
      insumos: [],
      presupuestoId: p.id,
      creado: new Date().toLocaleDateString('es-AR'),
      creadoTs: ahoraMs()
    });
    if (!creado) {
      setAprobandoId(null);
      return; // addPedido ya mostró el motivo (límite del plan, modo lectura, red)
    }

    await updatePresupuesto(p.id, (actual) => ({ ...actual, estado: 'aprobado', aprobadoTs: ahoraMs(), pedidoId }));
    setAprobandoId(null);

    // Mismo criterio que ModalArmarPedido.jsx: si el cliente no existe, se da
    // de alta con los datos de contacto del presupuesto.
    const existeCliente = clienteTrim && clientes.some(c => c.nombre.trim().toLowerCase() === clienteTrim.toLowerCase());
    if (clienteTrim && !existeCliente) {
      addCliente({
        id: getNewId(),
        nombre: clienteTrim,
        calle: '',
        altura: '',
        loc: '',
        cp: '',
        tel: p.telefono || '',
        email: p.email || '',
        fechaAlta: new Date().toLocaleDateString('es-AR'),
        fechaAltaTs: ahoraMs()
      });
    }

    showToast(`✓ Presupuesto N° ${p.numero} aprobado: se creó el pedido.`);
    onVerPedido(pedidoId);
  };

  const eliminar = async (p) => {
    if (!(await confirmar(`Se borra el presupuesto N° ${p.numero} de ${p.cliente}. No se puede deshacer.`, { titulo: '¿Eliminar el presupuesto?', textoConfirmar: 'Eliminar', peligro: true }))) return;
    await removePresupuesto(p.id);
    // Las imágenes adjuntas no quedan huérfanas en Storage.
    for (const a of p.adjuntos || []) borrarImagenDeFirebase(a.url);
  };

  const bajarPdf = (p) => generarPdfPresupuesto({
    empresa, fmt,
    numero: p.numero,
    fecha: fechaVisible(p.fecha),
    cliente: p.cliente, telefono: p.telefono, email: p.email, notas: p.notas,
    items: p.items || [],
    adjuntos: p.adjuntos || [], adjuntosPorHoja: p.adjuntosPorHoja
  }).then(() => showToast('PDF generado correctamente'));

  const existePedido = (id) => pedidos.some(pd => pd.id === id);

  return (
    <div className="page active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="page-title">Presupuestos</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            Seguí cada presupuesto hasta que lo aprueben: al aprobarlo se crea el pedido.
          </div>
        </div>
        <button className="btn btn-primary" onClick={onOpenNuevo}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4v12M4 10h12" />
          </svg>
          Nuevo presupuesto
        </button>
      </div>

      <div className="grid4">
        <div className="metric">
          <div className="metric-label">Total</div>
          <div className="metric-value">{stats.total}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Aguardando respuesta</div>
          <div className="metric-value" style={{ color: 'var(--warn)' }}>{stats.aguardando}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Aprobados</div>
          <div className="metric-value accent">{stats.aprobados}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Monto aprobado</div>
          <div className="metric-value">{fmt(stats.montoAprobado)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: 'auto' }} aria-label="Filtrar por estado">
            <option value="abiertos">Abiertos (creados y aguardando respuesta)</option>
            <option value="todos">Todos</option>
            {Object.entries(ESTADOS_PRESUPUESTO).map(([id, e]) => <option key={id} value={id}>{e.texto}</option>)}
          </select>
          <div className="bib-search" style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <svg className="bib-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '14px', height: '14px' }}>
              <circle cx="9" cy="9" r="5" />
              <path d="M15 15l-3-3" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente o N°..."
              aria-label="Buscar presupuesto"
              style={{ fontSize: '13px' }}
            />
          </div>
        </div>
      </div>

      {!visibles.length ? (
        <div className="empty">
          {presupuestos.length
            ? 'No hay presupuestos con este filtro.'
            : 'Todavía no hay presupuestos. Creá uno con "Nuevo presupuesto" o desde la Calculadora o la Biblioteca.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(p => {
                const est = ESTADOS_PRESUPUESTO[p.estado] || ESTADOS_PRESUPUESTO.creado;
                const abierto = ABIERTOS.includes(p.estado);
                return (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{p.numero}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaVisible(p.fecha)}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.cliente}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        {(p.items || []).length} producto{(p.items || []).length !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(p.total || 0)}</td>
                    <td><span className={`badge ${est.badge}`}>{est.texto}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {abierto && (
                          <button className="btn btn-primary btn-sm" disabled={aprobandoId === p.id} onClick={() => aprobar(p)}>
                            {aprobandoId === p.id ? 'Creando pedido…' : 'Aprobar'}
                          </button>
                        )}
                        {p.estado === 'creado' && (
                          <button className="btn btn-sm" onClick={() => cambiarEstado(p, 'enviado')}>Marcar enviado</button>
                        )}
                        {abierto && <button className="btn btn-sm" onClick={() => onOpenEditar(p)}>Editar</button>}
                        {abierto && <button className="btn btn-sm" onClick={() => cambiarEstado(p, 'rechazado')}>Rechazar</button>}
                        {p.estado === 'rechazado' && (
                          <button className="btn btn-sm" onClick={() => cambiarEstado(p, 'enviado')}>Reabrir</button>
                        )}
                        {p.estado === 'aprobado' && p.pedidoId != null && existePedido(p.pedidoId) && (
                          <button className="btn btn-sm" onClick={() => onVerPedido(p.pedidoId)}>Ver pedido</button>
                        )}
                        <button className="btn btn-sm" onClick={() => bajarPdf(p)}>PDF</button>
                        {p.estado !== 'aprobado' && (
                          <button className="btn btn-danger btn-sm" onClick={() => eliminar(p)}>Eliminar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
