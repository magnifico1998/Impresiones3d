import React, { useEffect, useState } from 'react';
import { db, functions } from '../../firebase';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { confirmar, avisar, pedirTexto } from '../Dialogos';
import SelectorRangoFechas from '../SelectorRangoFechas';

// Facturación electrónica con ARCA (fase 1: el admin factura como
// monotributista, siempre Factura C). La emisión y los números los maneja
// el servidor (functions/facturacion.js); desde acá sólo se configura el
// emisor, se emite a mano y se gestionan las facturas.

const CONDICIONES_IVA = [
  [5, 'Consumidor Final'],
  [6, 'Responsable Monotributo'],
  [1, 'IVA Responsable Inscripto'],
  [4, 'IVA Sujeto Exento'],
  [13, 'Monotributista Social'],
  [15, 'IVA No Alcanzado']
];

const configVacia = {
  cuit: '', ptoVta: '', razonSocial: '', domicilio: '', iibb: '', inicioActividades: '',
  entorno: 'homologacion', facturarSuscripciones: false
};
const itemVacio = { descripcion: '', cantidad: '1', precioUnitario: '' };
const formVacio = {
  docTipo: '96', docNro: '', nombre: '', condicionIvaId: '5', domicilio: '', email: '', enviarMail: true,
  concepto: 'productos', servicioDesde: '', servicioHasta: '', referencia: '', items: [itemVacio]
};

const pesos = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaAR = (yyyymmdd) => yyyymmdd ? `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}` : '';
const numeroCbte = (f) => f.numero
  ? `${String(f.ptoVta).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`
  : 'sin número';

const BADGE_ESTADO = {
  emitida: ['badge-done', 'emitida'],
  error: ['badge-cancelled', 'error'],
  pendiente: ['badge-pending', 'pendiente'],
  emitiendo: ['badge-progress', 'emitiendo']
};

const ORIGENES = { suscripcionMP: 'Suscripción (Mercado Pago)', manual: 'Manual', notaCredito: 'Anulación' };

// Filtros de "Comprobantes". Se trabaja sobre los últimos
// MAX_COMPROBANTES (más que suficiente para el volumen de un admin) y se
// filtra acá, sin índices compuestos en Firestore.
const MAX_COMPROBANTES = 500;
const VISIBLES_COLAPSADO = 5;
const filtrosVacios = { estado: 'todos', tipo: 'todos', origen: 'todos', desde: '', hasta: '', texto: '' };

// Fecha del comprobante (YYYYMMDD): la de emisión, o la de creación si
// todavía no se emitió.
const fechaDe = (f) => f.fecha || (f.creadoEl?.toDate ? f.creadoEl.toDate().toISOString().slice(0, 10).replace(/-/g, '') : '');

function pasaFiltros(f, filtros) {
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
    const campos = [f.receptor?.nombre, f.receptor?.docNro, f.receptor?.email, f.origen?.referencia, f.cae, f.numero && String(f.numero)];
    if (!campos.some((c) => c && String(c).toLowerCase().includes(texto))) return false;
  }
  return true;
}

// Íconos de las acciones de la tabla de comprobantes (mismo trazo que los
// del menú lateral).
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

// abiertaInicial: en su propia pestaña del panel arranca desplegada.
export default function SeccionFacturacion({ showToast, abiertaInicial = false }) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const [config, setConfig] = useState(configVacia);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [probando, setProbando] = useState(false);
  const [form, setForm] = useState(formVacio);
  const [emitiendo, setEmitiendo] = useState(false);
  const [facturas, setFacturas] = useState([]);
  const [ocupada, setOcupada] = useState(null); // id de la factura con una acción en curso
  const [filtros, setFiltros] = useState(filtrosVacios);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    if (!abierta) return undefined;
    getDoc(doc(db, 'configFacturacion', 'emisor')).then((s) => {
      if (s.exists()) setConfig({ ...configVacia, ...s.data(), ptoVta: String(s.data().ptoVta || '') });
    });
    const q = query(collection(db, 'facturas'), orderBy('creadoEl', 'desc'), limit(MAX_COMPROBANTES));
    return onSnapshot(q, (snap) => setFacturas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [abierta]);

  const filtradas = facturas.filter((f) => pasaFiltros(f, filtros));
  const visibles = verTodos ? filtradas : filtradas.slice(0, VISIBLES_COLAPSADO);
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(filtrosVacios);
  // Total facturado de lo filtrado: facturas emitidas menos sus notas de crédito.
  const totalFiltrado = filtradas
    .filter((f) => f.estado === 'emitida')
    .reduce((s, f) => s + (f.tipoCbte === 13 ? -1 : 1) * (Number(f.importeTotal) || 0), 0);
  const cambiarFiltro = (campo) => (e) => setFiltros((prev) => ({ ...prev, [campo]: e.target.value }));

  const cambiarConfig = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setConfig((prev) => ({ ...prev, [campo]: valor }));
  };
  const cambiarForm = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => {
      const nuevo = { ...prev, [campo]: valor };
      // Sin CUIT, ARCA sólo acepta consumidor final.
      if (campo === 'docTipo' && valor !== '80') nuevo.condicionIvaId = '5';
      return nuevo;
    });
  };
  const cambiarItem = (i, campo) => (e) => setForm((prev) => ({
    ...prev,
    items: prev.items.map((it, j) => (j === i ? { ...it, [campo]: e.target.value } : it))
  }));

  const guardarConfig = async () => {
    const cuit = config.cuit.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cuit)) { showToast('El CUIT tiene que tener 11 dígitos.', 'error'); return; }
    if (!(Number(config.ptoVta) > 0)) { showToast('Cargá el punto de venta.', 'error'); return; }
    if (config.entorno === 'produccion' && !(await confirmar(
      'En producción las facturas son reales y quedan informadas en ARCA. ¿Ya cargaste el certificado de producción?',
      { titulo: 'Pasar a producción', textoConfirmar: 'Sí, guardar' }
    ))) return;
    setGuardandoConfig(true);
    try {
      await setDoc(doc(db, 'configFacturacion', 'emisor'), {
        ...config, cuit, ptoVta: Number(config.ptoVta),
        razonSocial: config.razonSocial.trim(), domicilio: config.domicilio.trim(), iibb: config.iibb.trim()
      });
      showToast('Configuración guardada.');
    } catch (e) {
      console.error('Error al guardar la configuración de facturación:', e);
      showToast('No se pudo guardar la configuración.', 'error');
    } finally {
      setGuardandoConfig(false);
    }
  };

  const probarConexion = async () => {
    setProbando(true);
    try {
      const r = await llamar('probarConexionArca');
      await avisar(
        `Conexión OK con ARCA (${r.entorno}).\nServidores: app ${r.servidores.AppServer}, base ${r.servidores.DbServer}, auth ${r.servidores.AuthServer}.\nÚltima Factura C: ${r.ultimaFactura} · Última Nota de Crédito C: ${r.ultimaNotaCredito}.`,
        { titulo: 'Probar conexión' }
      );
    } catch (e) {
      await avisar(e?.message || 'No se pudo conectar.', { titulo: 'Error de conexión con ARCA' });
    } finally {
      setProbando(false);
    }
  };

  const total = form.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0), 0);

  const emitir = async () => {
    if (!(await confirmar(`¿Emitir una Factura C por ${pesos(total)} en ${config.entorno === 'produccion' ? 'PRODUCCIÓN' : 'homologación'}?`, { titulo: 'Emitir factura' }))) return;
    setEmitiendo(true);
    try {
      const r = await llamar('emitirFacturaManual', {
        receptor: {
          docTipo: Number(form.docTipo), docNro: form.docNro, nombre: form.nombre,
          condicionIvaId: Number(form.condicionIvaId), domicilio: form.domicilio, email: form.email
        },
        concepto: form.concepto,
        servicioDesde: form.servicioDesde,
        servicioHasta: form.servicioHasta,
        items: form.items.map((it) => ({ descripcion: it.descripcion, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario) })),
        enviarMail: form.enviarMail,
        referencia: form.referencia
      });
      if (r.estado === 'emitida') {
        showToast(`Factura emitida: ${String(r.numero).padStart(8, '0')} · CAE ${r.cae}`);
        setForm(formVacio);
      } else {
        await avisar((r.errores || []).map((e) => `${e.codigo}: ${e.mensaje}`).join('\n') || 'No se pudo emitir.', { titulo: 'ARCA no autorizó la factura' });
      }
    } catch (e) {
      showToast(e?.message || 'No se pudo emitir la factura.', 'error');
    } finally {
      setEmitiendo(false);
    }
  };

  const accion = async (f, nombre, datos, mensajeOk) => {
    setOcupada(f.id);
    try {
      const r = await llamar(nombre, { id: f.id, ...datos });
      if (r?.estado && r.estado !== 'emitida') {
        await avisar((r.errores || []).map((e) => `${e.codigo}: ${e.mensaje}`).join('\n') || 'No se pudo emitir.', { titulo: 'ARCA no autorizó el comprobante' });
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
    const r = await accion(f, 'descargarFacturaPDF', {});
    if (!r?.base64) return;
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = r.nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reenviar = async (f) => {
    const email = await pedirTexto('Email al que se manda el comprobante', { tipoInput: 'email', valorInicial: f.receptor?.email || '' });
    if (email) await accion(f, 'reenviarFacturaMail', { email }, 'Mail enviado.');
  };

  const anular = async (f) => {
    if (!(await confirmar(`Se va a emitir una Nota de Crédito C por ${pesos(f.importeTotal)} que anula la factura ${numeroCbte(f)}. ¿Seguir?`, { titulo: 'Anular factura', peligro: true }))) return;
    await accion(f, 'anularFactura', {}, 'Nota de crédito emitida.');
  };

  const facturarPago = async () => {
    const paymentId = await pedirTexto('Id del pago de Mercado Pago (el de pagosMP)', { placeholder: 'Ej: 123456789' });
    if (!paymentId) return;
    try {
      const r = await llamar('facturarPagoMP', { paymentId: paymentId.trim() });
      if (r.estado === 'emitida') showToast('Factura emitida.');
      else await avisar((r.errores || []).map((e) => `${e.codigo}: ${e.mensaje}`).join('\n') || 'Quedó con error.', { titulo: 'ARCA no autorizó la factura' });
    } catch (e) {
      showToast(e?.message || 'No se pudo facturar el pago.', 'error');
    }
  };

  const input = { fontSize: '13px' };
  const etiqueta = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text2)' };
  const bloque = { padding: '12px', border: '1px dashed var(--border)', borderRadius: 'var(--radius2)', marginBottom: '14px' };
  const grilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' };
  const botonChico = { fontSize: '11px', padding: '4px 8px' };
  const botonIcono = { padding: '4px 6px' };

  return (
    <div className="card">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: abierta ? '14px' : 0, cursor: 'pointer' }}
        onClick={() => setAbierta((v) => !v)}
      >
        <div className="card-title" style={{ marginBottom: 0 }}>
          {abierta ? '▾' : '▸'} Facturación electrónica (ARCA)
          {abierta && config.entorno !== 'produccion' && <span className="badge badge-pending" style={{ marginLeft: '8px' }}>homologación</span>}
        </div>
      </div>

      {abierta && (
        <>
          <div style={bloque}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Datos del emisor</div>
            <div style={grilla}>
              <label style={etiqueta}>CUIT<input type="text" style={input} value={config.cuit} onChange={cambiarConfig('cuit')} placeholder="20123456789" /></label>
              <label style={etiqueta}>Punto de venta (Web Services)<input style={input} type="number" min="1" value={config.ptoVta} onChange={cambiarConfig('ptoVta')} /></label>
              <label style={etiqueta}>Razón social / nombre<input type="text" style={input} value={config.razonSocial} onChange={cambiarConfig('razonSocial')} /></label>
              <label style={etiqueta}>Domicilio comercial<input type="text" style={input} value={config.domicilio} onChange={cambiarConfig('domicilio')} /></label>
              <label style={etiqueta}>Ingresos Brutos<input type="text" style={input} value={config.iibb} onChange={cambiarConfig('iibb')} placeholder="Nro. o Exento" /></label>
              <label style={etiqueta}>Inicio de actividades<input style={input} type="date" value={config.inicioActividades} onChange={cambiarConfig('inicioActividades')} /></label>
              <label style={etiqueta}>Entorno
                <select style={input} value={config.entorno} onChange={cambiarConfig('entorno')}>
                  <option value="homologacion">Homologación (pruebas)</option>
                  <option value="produccion">Producción</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', marginTop: '10px' }}>
              <input type="checkbox" checked={!!config.facturarSuscripciones} onChange={cambiarConfig('facturarSuscripciones')} />
              Facturar automáticamente cada cobro de suscripción por Mercado Pago (y mandarle el PDF al suscriptor)
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={guardandoConfig} onClick={guardarConfig}>{guardandoConfig ? 'Guardando…' : 'Guardar'}</button>
              <button className="btn" disabled={probando} onClick={probarConexion}>{probando ? 'Probando…' : 'Probar conexión'}</button>
              <button className="btn" onClick={facturarPago}>Facturar un cobro de Mercado Pago</button>
            </div>
          </div>

          <div style={bloque}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Nueva Factura C</div>
            <div style={grilla}>
              <label style={etiqueta}>Documento
                <select style={input} value={form.docTipo} onChange={cambiarForm('docTipo')}>
                  <option value="96">DNI</option>
                  <option value="80">CUIT</option>
                  <option value="99">Consumidor final sin identificar</option>
                </select>
              </label>
              {form.docTipo !== '99' && (
                <label style={etiqueta}>Número<input type="text" style={input} value={form.docNro} onChange={cambiarForm('docNro')} /></label>
              )}
              <label style={etiqueta}>Condición frente al IVA
                <select style={input} value={form.condicionIvaId} onChange={cambiarForm('condicionIvaId')} disabled={form.docTipo !== '80'}>
                  {CONDICIONES_IVA.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
                </select>
              </label>
              <label style={etiqueta}>Nombre / razón social<input type="text" style={input} value={form.nombre} onChange={cambiarForm('nombre')} /></label>
              <label style={etiqueta}>Domicilio<input type="text" style={input} value={form.domicilio} onChange={cambiarForm('domicilio')} /></label>
              <label style={etiqueta}>Email (opcional)<input style={input} type="email" value={form.email} onChange={cambiarForm('email')} /></label>
              <label style={etiqueta}>Concepto
                <select style={input} value={form.concepto} onChange={cambiarForm('concepto')}>
                  <option value="productos">Productos</option>
                  <option value="servicios">Servicios</option>
                  <option value="productosYServicios">Productos y servicios</option>
                </select>
              </label>
              {form.concepto !== 'productos' && (
                <>
                  <label style={etiqueta}>Período desde<input style={input} type="date" value={form.servicioDesde} onChange={cambiarForm('servicioDesde')} /></label>
                  <label style={etiqueta}>Período hasta<input style={input} type="date" value={form.servicioHasta} onChange={cambiarForm('servicioHasta')} /></label>
                </>
              )}
              <label style={etiqueta}>Referencia interna (opcional)<input type="text" style={input} value={form.referencia} onChange={cambiarForm('referencia')} placeholder="Ej: pedido #123" /></label>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {form.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="text" style={{ ...input, flex: '1 1 220px' }} placeholder="Descripción" value={it.descripcion} onChange={cambiarItem(i, 'descripcion')} />
                  <input style={{ ...input, width: '70px' }} type="number" min="1" placeholder="Cant." value={it.cantidad} onChange={cambiarItem(i, 'cantidad')} />
                  <input style={{ ...input, width: '120px' }} type="number" min="0" step="0.01" placeholder="Precio unit." value={it.precioUnitario} onChange={cambiarItem(i, 'precioUnitario')} />
                  {form.items.length > 1 && (
                    <button className="btn btn-ghost" style={botonChico} onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))}>Quitar</button>
                  )}
                </div>
              ))}
              <div>
                <button className="btn btn-ghost" style={botonChico} onClick={() => setForm((p) => ({ ...p, items: [...p.items, itemVacio] }))}>+ Ítem</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '14px' }}>Total: {pesos(total)}</strong>
              {form.email && (
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
                  <input type="checkbox" checked={form.enviarMail} onChange={cambiarForm('enviarMail')} /> Mandar el PDF por mail
                </label>
              )}
              <button className="btn btn-primary" disabled={emitiendo || total <= 0} onClick={emitir}>{emitiendo ? 'Emitiendo…' : 'Emitir factura'}</button>
            </div>
          </div>

          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Comprobantes</div>
          {/* Anchos por filtro (no la grilla pareja del resto de la sección): el
              selector de tipo es corto y el de fechas necesita lugar para el rango. */}
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
                {Object.entries(ORIGENES).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
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
          </div>
          {facturas.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Todavía no hay comprobantes.</div>}
          {facturas.length > 0 && filtradas.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Ningún comprobante coincide con los filtros.</div>}
          {filtradas.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
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
                    const origen = [ORIGENES[f.origen?.tipo] || f.origen?.tipo, f.origen?.referencia].filter(Boolean).join(' · ');
                    return (
                      <React.Fragment key={f.id}>
                        <tr title={origen}>
                          <td>{fechaAR(f.fecha) || '—'}</td>
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
                                <button className="btn btn-ghost" style={botonChico} disabled={ocupada === f.id} onClick={() => accion(f, 'reintentarFactura', {}, 'Comprobante emitido.')}>
                                  {ocupada === f.id ? 'Emitiendo…' : 'Reintentar'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {notas.length > 0 && (
                          <tr>
                            <td colSpan={9} style={{ whiteSpace: 'normal', paddingTop: 0 }}>
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
      )}
    </div>
  );
}
