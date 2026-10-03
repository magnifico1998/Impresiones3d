import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { pedirTexto } from './Dialogos';
import TarjetaColapsable from './TarjetaColapsable';
import {
  acumulado12, categoriaPara, categoriasOrdenadas, ingresosPorMes, mesActual, nombreMes,
  proximaRecategorizacion, proyeccionAlCierre, sumarMeses
} from '../utils/monotributo';

// "Facturación y monotributo" en Mi emprendimiento → Facturación ARCA:
// lo facturado por mes, el acumulado de los últimos 12 meses contra el tope
// de la categoría del suscriptor y la proyección a la próxima
// recategorización (cálculos en utils/monotributo.js). La categoría y los
// ingresos facturados fuera de la app se guardan en `empresa`
// (categoriaMonotributo, ingresosExternos: { 'YYYY-MM': monto }).
//
// Para un admin, con "Incluir las facturas de Manager3D" tildado
// (empresa.totalizadorConFacturasAdmin) se suman también los comprobantes
// del panel admin (colección facturas: suscripciones y facturas manuales),
// que salen del mismo CUIT y cuentan para el mismo tope.

const MESES_A_LEER = 24; // alcanza para los dos semestres de recategorización

// Verde hasta el 70 % del tope, amarillo hasta el 90 %, rojo después.
const COLORES = { ok: '#16a34a', cerca: '#d97706', pasado: '#ef4444' };
const nivel = (pct) => (pct >= 90 ? 'pasado' : pct >= 70 ? 'cerca' : 'ok');

const leerNumero = (t) => parseFloat(String(t).replace(/\$|\s/g, '').replace(/\./g, '').replace(',', '.'));

export default function TotalizadorMonotributo() {
  const { cuentaId, empresa, setEmpresa, fmt, isAdmin } = useApp();
  const [facturasCuenta, setFacturasCuenta] = useState([]);
  const [facturasAdmin, setFacturasAdmin] = useState([]);
  const conFacturasAdmin = isAdmin && !!empresa.totalizadorConFacturasAdmin;
  const [tabla, setTabla] = useState(null);

  const desdeLectura = () => {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - MESES_A_LEER);
    return Timestamp.fromDate(desde);
  };

  useEffect(() => {
    if (!cuentaId) return undefined;
    return onSnapshot(
      query(collection(db, 'users', cuentaId, 'facturas'), where('creadoEl', '>=', desdeLectura())),
      (snap) => setFacturasCuenta(snap.docs.map((d) => d.data())),
      (err) => console.error('Error al leer los comprobantes para el totalizador:', err)
    );
  }, [cuentaId]);

  useEffect(() => {
    if (!conFacturasAdmin) {
      setFacturasAdmin([]);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'facturas'), where('creadoEl', '>=', desdeLectura())),
      (snap) => setFacturasAdmin(snap.docs.map((d) => d.data())),
      (err) => console.error('Error al leer las facturas del admin para el totalizador:', err)
    );
  }, [conFacturasAdmin]);

  const facturas = useMemo(() => [...facturasCuenta, ...facturasAdmin], [facturasCuenta, facturasAdmin]);

  useEffect(() => onSnapshot(
    doc(db, 'monotributo', 'categorias'),
    (snap) => setTabla(snap.exists() ? snap.data() : { categorias: [] }),
    (err) => console.error('Error al leer las categorías de monotributo:', err)
  ), []);

  const otros = useMemo(() => empresa.ingresosExternos || {}, [empresa.ingresosExternos]);
  const meses = useMemo(() => ingresosPorMes(facturas, otros), [facturas, otros]);
  const categorias = categoriasOrdenadas(tabla);
  const miCategoria = categorias.find((c) => c.letra === empresa.categoriaMonotributo) || null;

  const actual = mesActual();
  const ultimos12 = Array.from({ length: 12 }, (_, i) => sumarMeses(actual, -i));
  const maxMes = Math.max(1, ...ultimos12.map((k) => meses[k]?.total || 0));
  const acumulado = acumulado12(meses, actual);
  const corresponde = categorias.length ? categoriaPara(acumulado, categorias) : null;
  const { cierre, mesRecategorizacion } = proximaRecategorizacion();
  const proy = proyeccionAlCierre(meses);
  const correspondeProy = categorias.length ? categoriaPara(proy.proyectado, categorias) : null;
  const pct = miCategoria ? (acumulado / miCategoria.topeAnual) * 100 : 0;
  const pctProy = miCategoria ? (proy.proyectado / miCategoria.topeAnual) * 100 : 0;

  // Semestres que se evalúan en las recategorizaciones (el cerrado más
  // reciente y el próximo).
  const cierreAnterior = sumarMeses(cierre, -6);
  const semestres = [cierreAnterior, cierre].map((c) => ({ cierre: c, total: acumulado12(meses, c), enCurso: c === cierre }));

  const cargarOtros = async (k) => {
    const respuesta = await pedirTexto(
      `Ingresos de ${nombreMes(k)} facturados fuera de Manager3D (otro punto de venta, el portal de ARCA…). Vacío o 0 para borrar.`,
      { titulo: 'Otros ingresos del mes', valorInicial: otros[k] ? String(otros[k]) : '', tipoInput: 'text', placeholder: 'Ej: 150000' }
    );
    if (respuesta === null) return;
    const monto = respuesta.trim() ? leerNumero(respuesta) : 0;
    if (!Number.isFinite(monto) || monto < 0) return;
    // 0 en vez de borrar la clave: la configuración se guarda con merge.
    setEmpresa((prev) => ({ ...prev, ingresosExternos: { ...(prev.ingresosExternos || {}), [k]: Math.round(monto * 100) / 100 } }));
  };

  const barra = (porcentaje, color) => (
    <div style={{ height: '10px', background: 'var(--bg3)', borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ width: `${Math.min(100, porcentaje)}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  );

  // Visible con la tarjeta cerrada: lo esencial de un vistazo.
  const resumenTarjeta = `últimos 12 meses ${fmt(acumulado)}${miCategoria ? ` · categoría ${miCategoria.letra} al ${Math.round(pct)} %` : ''}`;

  return (
    <TarjetaColapsable titulo="Facturación y monotributo" resumen={resumenTarjeta} clave="arca.monotributo">

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <label className="fl" style={{ marginTop: 0 }}>Tu categoría de monotributo</label>
          <select
            value={empresa.categoriaMonotributo || ''}
            onChange={(e) => setEmpresa((prev) => ({ ...prev, categoriaMonotributo: e.target.value }))}
            style={{ width: 'auto', minWidth: '220px' }}
          >
            <option value="">— Elegí tu categoría —</option>
            {categorias.map((c) => <option key={c.letra} value={c.letra}>{c.letra} · hasta {fmt(c.topeAnual)} al año</option>)}
          </select>
        </div>
        {tabla?.vigencia && <div style={{ fontSize: '11px', color: 'var(--text3)', paddingBottom: '8px' }}>Topes vigentes desde {tabla.vigencia}</div>}
      </div>
      {isAdmin && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!empresa.totalizadorConFacturasAdmin}
            onChange={(e) => setEmpresa((prev) => ({ ...prev, totalizadorConFacturasAdmin: e.target.checked }))}
          />
          Incluir las facturas de Manager3D (suscripciones y facturas manuales del panel admin)
        </label>
      )}
      {tabla && !categorias.length && (
        <div style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '12px' }}>Todavía no están cargadas las categorías del monotributo. Avisanos por Soporte.</div>
      )}

      {/* Acumulado de los últimos 12 meses contra el tope */}
      <div style={{ padding: '12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', fontSize: '13px', marginBottom: '6px' }}>
          <span>Últimos 12 meses ({nombreMes(sumarMeses(actual, -11))} a {nombreMes(actual)})</span>
          <strong style={{ fontFamily: 'var(--mono)' }}>
            {fmt(acumulado)}{miCategoria ? ` de ${fmt(miCategoria.topeAnual)} (${Math.round(pct)} %)` : ''}
          </strong>
        </div>
        {miCategoria && barra(pct, COLORES[nivel(pct)])}
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '8px', lineHeight: 1.5 }}>
          {!miCategoria && categorias.length > 0 && 'Elegí tu categoría para comparar con su tope. '}
          {corresponde
            ? <>Por lo facturado, te corresponde la categoría <strong>{corresponde.letra}</strong>.</>
            : categorias.length > 0 && <strong style={{ color: COLORES.pasado }}>Superás el tope de la categoría más alta: consultá con tu contador.</strong>}
          {miCategoria && corresponde && corresponde.letra !== miCategoria.letra && (
            <strong style={{ color: corresponde.topeAnual > miCategoria.topeAnual ? COLORES.pasado : COLORES.ok }}>
              {' '}{corresponde.topeAnual > miCategoria.topeAnual ? `Pasaste el tope de la ${miCategoria.letra}.` : `Podrías bajar desde la ${miCategoria.letra}.`}
            </strong>
          )}
        </div>
      </div>

      {/* Próxima recategorización */}
      <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
          Próxima recategorización: {nombreMes(mesRecategorizacion)} (12 meses al {cierre.endsWith('06') ? '30/06' : '31/12'}/{cierre.slice(0, 4)})
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', lineHeight: 1.5 }}>
          Si seguís al ritmo de los últimos 3 meses ({fmt(proy.promedio)} por mes), vas a llegar a{' '}
          <strong style={{ fontFamily: 'var(--mono)' }}>{fmt(proy.proyectado)}</strong>
          {correspondeProy ? <>, que corresponde a la categoría <strong>{correspondeProy.letra}</strong>.</> : categorias.length ? <>, <strong style={{ color: COLORES.pasado }}>por encima de la categoría más alta</strong>.</> : '.'}
        </div>
        {miCategoria && barra(pctProy, COLORES[nivel(pctProy)])}
      </div>

      {/* Por mes */}
      <label className="fl">Facturado por mes</label>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <thead>
            <tr>
              <th>Mes</th>
              <th style={{ textAlign: 'right' }}>Facturas</th>
              <th style={{ textAlign: 'right' }}>Notas de crédito</th>
              <th style={{ textAlign: 'right' }}>Otros ingresos</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ width: '30%' }}></th>
            </tr>
          </thead>
          <tbody>
            {ultimos12.map((k) => {
              const m = meses[k] || { facturas: 0, notasCredito: 0, facturado: 0, notas: 0, otros: 0, total: 0 };
              return (
                <tr key={k}>
                  <td style={{ whiteSpace: 'nowrap' }}>{nombreMes(k)}{k === actual && <span style={{ color: 'var(--text3)' }}> (en curso)</span>}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{m.facturas ? `${m.facturas} · ${fmt(m.facturado)}` : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: m.notas ? 'var(--danger)' : undefined }}>{m.notasCredito ? `${m.notasCredito} · -${fmt(m.notas)}` : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '12px', fontFamily: 'var(--mono)', padding: '2px 6px' }} onClick={() => cargarOtros(k)} title="Cargar lo facturado fuera de la app">
                      {m.otros ? fmt(m.otros) : '+ cargar'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(m.total)}</td>
                  <td>
                    <div style={{ height: '8px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, (m.total / maxMes) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Semestres de recategorización */}
      <label className="fl" style={{ marginTop: '14px' }}>Períodos de recategorización</label>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {semestres.map((s) => {
          const cat = categorias.length ? categoriaPara(s.total, categorias) : null;
          return (
            <div key={s.cierre} style={{ flex: '1 1 220px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', fontSize: '12px' }}>
              <div style={{ color: 'var(--text2)' }}>
                12 meses al {s.cierre.endsWith('06') ? '30/06' : '31/12'}/{s.cierre.slice(0, 4)} · {s.enCurso ? 'en curso' : 'cerrado'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '15px', fontWeight: 600, margin: '2px 0' }}>{fmt(s.total)}</div>
              <div style={{ color: 'var(--text3)' }}>{cat ? `Categoría ${cat.letra}` : categorias.length ? 'Por encima de la más alta' : ''}{s.enCurso ? ' (hasta hoy)' : ''}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '12px', lineHeight: 1.5 }}>
        Suma las facturas emitidas en producción desde Manager3D (también las anuladas) y resta sus notas de crédito{conFacturasAdmin ? ', incluidas las de las suscripciones' : ''}. Lo que facturaste por otro lado,
        cargalo en "Otros ingresos". Es una ayuda para anticiparte: la recategorización también mira otros parámetros (superficie, energía, alquileres) y la
        confirmás con tu contador.
      </div>
    </TarjetaColapsable>
  );
}
