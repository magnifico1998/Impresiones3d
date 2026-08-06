import React, { useEffect, useRef, useState } from 'react';
import { db, functions } from '../../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// La fecha se muestra en horario argentino: los Timestamps de vigencia se
// anclan a UTC-3 en el server (ver functions/http/codigosPromocionales.js),
// y con toISOString() (UTC) el fin de vigencia — guardado como 23:59:59 de
// Argentina — aparecía corrido al día siguiente. 'en-CA' formatea como
// YYYY-MM-DD, el formato que espera el input type="date".
const formValueFecha = (timestamp) => {
  if (!timestamp?.toDate) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(timestamp.toDate());
};

const formVacio = { codigo: '', comercioNombre: '', comercioContacto: '', planId: '', ciclos: '1', vigenciaInicio: '', vigenciaFin: '', cupoMaximo: '' };

// Agrupa fechas de activación en baldes por día/semana/mes, desde la
// primera activación hasta hoy. Recorta a los últimos 60 baldes para que
// una serie muy larga (ej. años de historia diaria) no sature el eje X.
function agruparActivaciones(fechas, granularidad) {
  if (!fechas.length) return [];
  const ordenadas = [...fechas].sort((a, b) => a - b);
  const hoy = new Date();
  const buckets = [];

  if (granularidad === 'dia') {
    const cur = new Date(ordenadas[0]); cur.setHours(0, 0, 0, 0);
    const fin = new Date(hoy); fin.setHours(0, 0, 0, 0);
    while (cur <= fin) {
      const desde = new Date(cur);
      const hasta = new Date(cur); hasta.setHours(23, 59, 59, 999);
      const iso = desde.toISOString();
      buckets.push({ label: iso.slice(8, 10) + '-' + iso.slice(5, 7), desde, hasta, total: 0 });
      cur.setDate(cur.getDate() + 1);
    }
  } else if (granularidad === 'semana') {
    const cur = new Date(ordenadas[0]); cur.setHours(0, 0, 0, 0);
    while (cur <= hoy) {
      const desde = new Date(cur);
      const hasta = new Date(cur); hasta.setDate(hasta.getDate() + 6); hasta.setHours(23, 59, 59, 999);
      const iso = desde.toISOString();
      buckets.push({ label: iso.slice(8, 10) + '-' + iso.slice(5, 7), desde, hasta, total: 0 });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    const cur = new Date(ordenadas[0].getFullYear(), ordenadas[0].getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    while (cur <= finMes) {
      const desde = new Date(cur);
      const hasta = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
      buckets.push({ label: String(cur.getMonth() + 1).padStart(2, '0') + '/' + String(cur.getFullYear()).slice(2), desde, hasta, total: 0 });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  ordenadas.forEach((f) => {
    const b = buckets.find(bk => f >= bk.desde && f <= bk.hasta);
    if (b) b.total++;
  });

  return buckets.length > 60 ? buckets.slice(-60) : buckets;
}

// Gráfico de líneas de activaciones a lo largo del tiempo, con selector de
// granularidad. Sigue el mismo patrón de canvas manual + variables CSS del
// tema que el gráfico de "Ventas acumuladas" en ResumenPage.jsx.
function GraficoActivaciones({ titulo, fechas }) {
  const canvasRef = useRef(null);
  const [granularidad, setGranularidad] = useState('semana');
  const puntos = agruparActivaciones(fechas, granularidad);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !puntos.length) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.offsetWidth || 500;
    const H = 200;

    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const raiz = getComputedStyle(document.documentElement);
    const leer = (nombre, fallback) => (raiz.getPropertyValue(nombre) || '').trim() || fallback;
    const cAccent = leer('--accent', '#6ee7b7');
    const cBorder = leer('--border', '#2a2f3e');
    const cText3 = leer('--text3', '#555d74');

    const PAD = { top: 20, right: 20, bottom: 30, left: 40 };
    const gW = W - PAD.left - PAD.right;
    const gH = H - PAD.top - PAD.bottom;
    const n = puntos.length;
    const maxTotal = Math.max(...puntos.map(p => p.total), 1);

    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = cBorder;
    ctx.lineWidth = 0.5;
    const pasos = Math.min(4, maxTotal);
    for (let i = 0; i <= pasos; i++) {
      const y = PAD.top + gH - (gH / pasos) * i;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + gW, y);
      ctx.stroke();

      ctx.fillStyle = cText3;
      ctx.font = '10px DM Mono,monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(maxTotal / pasos * i)), PAD.left - 6, y + 3);
    }

    const puntoX = (i) => PAD.left + (n === 1 ? gW / 2 : (gW / (n - 1)) * i);
    const puntoY = (v) => PAD.top + gH - (v / maxTotal) * gH;

    ctx.strokeStyle = cAccent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    puntos.forEach((p, i) => {
      const x = puntoX(i);
      const y = puntoY(p.total);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    puntos.forEach((p, i) => {
      ctx.fillStyle = cAccent;
      ctx.beginPath();
      ctx.arc(puntoX(i), puntoY(p.total), 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = cText3;
    ctx.font = '10px DM Mono,monospace';
    ctx.textAlign = 'center';
    puntos.forEach((p, i) => {
      if (n <= 12 || i % Math.ceil(n / 12) === 0) {
        ctx.fillText(p.label, puntoX(i), H - 8);
      }
    });
  }, [puntos.map(p => p.total + p.label).join(','), granularidad]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius2)', padding: '12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600 }}>{titulo}</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[{ v: 'dia', l: 'Día' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mes' }].map(g => (
            <button
              key={g.v}
              className={`btn btn-sm periodo-btn ${granularidad === g.v ? 'active' : ''}`}
              onClick={() => setGranularidad(g.v)}
            >
              {g.l}
            </button>
          ))}
        </div>
      </div>
      {!fechas.length ? (
        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px', fontFamily: 'var(--mono)' }}>
          Todavía no hay activaciones.
        </div>
      ) : (
        <canvas ref={canvasRef} height="200"></canvas>
      )}
    </div>
  );
}

// Sección admin de "Códigos promocionales" (comercios externos que
// regalan un plan a $0 durante N ciclos, ver
// functions/http/codigosPromocionales.js). Calcada del mismo patrón que
// la sección de Revendedores en AdminPage.jsx, pero como componente aparte
// porque ese archivo ya es enorme.
export default function SeccionCodigosPromocionales({ planes, showToast }) {
  const [codigos, setCodigos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState(false);

  const [form, setForm] = useState(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [codigoEditando, setCodigoEditando] = useState(null); // null = alta nueva
  const [cambiandoEstadoCodigo, setCambiandoEstadoCodigo] = useState(null);
  const [graficoAbierto, setGraficoAbierto] = useState(false);
  const [codigoSeleccionado, setCodigoSeleccionado] = useState('todos');
  const [eventosPorCodigo, setEventosPorCodigo] = useState({}); // { [codigo]: Date[] de activaciones }

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'codigosPromocionales'),
      (snap) => {
        setCodigos(snap.docs.map(d => ({ codigo: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Error al listar códigos promocionales:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Trae las fechas de activación de cada código (subcolección
  // "activaciones", un doc por mes con un array de items) para armar el
  // gráfico. Sólo se suscribe mientras el gráfico está desplegado, así no
  // queda escuchando de fondo en el resto del panel admin.
  const codigosKey = codigos.map(c => c.codigo).join(',');
  useEffect(() => {
    if (!graficoAbierto || !codigos.length) return;
    const unsubs = codigos.map(c => onSnapshot(
      collection(db, 'codigosPromocionales', c.codigo, 'activaciones'),
      (snap) => {
        const fechas = [];
        snap.forEach(d => {
          (d.data().items || []).forEach(it => {
            if (it.fecha?.toDate) fechas.push(it.fecha.toDate());
          });
        });
        setEventosPorCodigo(prev => ({ ...prev, [c.codigo]: fechas }));
      },
      (err) => console.error(`Error al leer activaciones de ${c.codigo}:`, err)
    ));
    return () => unsubs.forEach(u => u());
  }, [graficoAbierto, codigosKey]);

  const todosLosEventos = Object.values(eventosPorCodigo).flat();
  const eventosSeleccionados = codigoSeleccionado === 'todos' ? todosLosEventos : (eventosPorCodigo[codigoSeleccionado] || []);

  const editar = (c) => {
    setCodigoEditando(c.codigo);
    setForm({
      codigo: c.codigo,
      comercioNombre: c.comercio?.nombre || '',
      comercioContacto: c.comercio?.contacto || '',
      planId: c.planId || '',
      ciclos: String(c.ciclos ?? '1'),
      vigenciaInicio: formValueFecha(c.vigenciaInicio),
      vigenciaFin: formValueFecha(c.vigenciaFin),
      cupoMaximo: c.cupoMaximo != null ? String(c.cupoMaximo) : ''
    });
  };

  const cancelarEdicion = () => {
    setCodigoEditando(null);
    setForm(formVacio);
  };

  const guardar = async () => {
    if (!form.codigo.trim() || !form.planId || !form.ciclos || !form.vigenciaInicio || !form.vigenciaFin) {
      showToast('Completá código, plan, ciclos y la vigencia.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        codigo: form.codigo.trim().toUpperCase(),
        comercioNombre: form.comercioNombre.trim() || null,
        comercioContacto: form.comercioContacto.trim() || null,
        planId: form.planId,
        ciclos: Number(form.ciclos),
        vigenciaInicio: form.vigenciaInicio,
        vigenciaFin: form.vigenciaFin,
        cupoMaximo: form.cupoMaximo.trim() || null
      };
      const fn = httpsCallable(functions, codigoEditando ? 'actualizarCodigoPromocional' : 'crearCodigoPromocional');
      await fn(datos);
      showToast(codigoEditando ? 'Código actualizado.' : 'Código creado.');
      cancelarEdicion();
    } catch (e) {
      console.error('Error al guardar el código promocional:', e);
      showToast(e?.message || 'No se pudo guardar el código.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (c, activo) => {
    setCambiandoEstadoCodigo(c.codigo);
    try {
      const fn = httpsCallable(functions, 'desactivarCodigoPromocional');
      await fn({ codigo: c.codigo, activo });
      showToast(activo ? 'Código reactivado.' : 'Código desactivado.');
    } catch (e) {
      console.error('Error al cambiar el estado del código promocional:', e);
      showToast(e?.message || 'No se pudo cambiar el estado.', 'error');
    } finally {
      setCambiandoEstadoCodigo(null);
    }
  };

  return (
    <div className="card">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: abierta ? '14px' : 0, cursor: 'pointer' }}
        onClick={() => setAbierta(v => !v)}
      >
        <div className="card-title" style={{ marginBottom: 0 }}>
          {abierta ? '▾' : '▸'} Códigos promocionales {!loading && `(${codigos.length})`}
        </div>
      </div>

      {abierta && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 'var(--radius2)' }}>
            <input
              type="text"
              value={form.codigo}
              onChange={(e) => setForm(prev => ({ ...prev, codigo: e.target.value.toUpperCase() }))}
              placeholder="Código (ej COMERCIO20)"
              disabled={!!codigoEditando}
              style={{ fontSize: '12px', width: '160px' }}
            />
            <input
              type="text"
              value={form.comercioNombre}
              onChange={(e) => setForm(prev => ({ ...prev, comercioNombre: e.target.value }))}
              placeholder="Nombre del comercio"
              style={{ fontSize: '12px', width: '160px' }}
            />
            <input
              type="text"
              value={form.comercioContacto}
              onChange={(e) => setForm(prev => ({ ...prev, comercioContacto: e.target.value }))}
              placeholder="Contacto (opcional)"
              style={{ fontSize: '12px', width: '160px' }}
            />
            <select
              value={form.planId}
              onChange={(e) => setForm(prev => ({ ...prev, planId: e.target.value }))}
              style={{ fontSize: '12px' }}
            >
              <option value="">Plan a otorgar...</option>
              {planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <input
              type="number" min="1"
              value={form.ciclos}
              onChange={(e) => setForm(prev => ({ ...prev, ciclos: e.target.value }))}
              placeholder="Ciclos gratis"
              title="Cantidad de meses gratis"
              style={{ fontSize: '12px', width: '90px' }}
            />
            <input
              type="date"
              value={form.vigenciaInicio}
              onChange={(e) => setForm(prev => ({ ...prev, vigenciaInicio: e.target.value }))}
              title="Vigencia desde"
              style={{ fontSize: '12px' }}
            />
            <input
              type="date"
              value={form.vigenciaFin}
              onChange={(e) => setForm(prev => ({ ...prev, vigenciaFin: e.target.value }))}
              title="Vigencia hasta"
              style={{ fontSize: '12px' }}
            />
            <input
              type="number" min="1"
              value={form.cupoMaximo}
              onChange={(e) => setForm(prev => ({ ...prev, cupoMaximo: e.target.value }))}
              placeholder="Cupo (opcional)"
              title="Cantidad máxima de activaciones"
              style={{ fontSize: '12px', width: '100px' }}
            />
            <button className="btn btn-primary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={guardando} onClick={guardar}>
              {guardando ? 'Guardando...' : (codigoEditando ? 'Guardar cambios' : 'Crear código')}
            </button>
            {codigoEditando && (
              <button className="btn" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={cancelarEdicion}>
                Cancelar
              </button>
            )}
          </div>

          {!loading && codigos.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius2)', marginBottom: '14px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', padding: '10px 12px', cursor: 'pointer' }}
                onClick={() => setGraficoAbierto(v => !v)}
              >
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{graficoAbierto ? '▾' : '▸'} Actividad de activaciones</div>
                {graficoAbierto && (
                  <select
                    value={codigoSeleccionado}
                    onChange={(e) => setCodigoSeleccionado(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: '12px' }}
                  >
                    <option value="todos">Todos los códigos</option>
                    {codigos.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo}</option>)}
                  </select>
                )}
              </div>
              {graficoAbierto && (
                <div style={{ padding: '0 12px 12px' }}>
                  <GraficoActivaciones
                    titulo={codigoSeleccionado === 'todos' ? 'Todos los códigos' : codigoSeleccionado}
                    fechas={eventosSeleccionados}
                  />
                </div>
              )}
            </div>
          )}

          {loading && <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Cargando...</div>}
          {!loading && codigos.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Todavía no hay ningún código promocional creado.</div>
          )}

          {!loading && codigos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {codigos.map((c) => {
                const plan = planes.find(p => p.id === c.planId);
                return (
                  <div key={c.codigo} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius2)', padding: '12px', background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                          {c.codigo} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>— {c.comercio?.nombre || 'sin nombre'}</span>
                          {!c.activo && <span className="badge badge-cancelled" style={{ marginLeft: '8px' }}>inactivo</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
                          Plan {plan?.nombre || c.planId} gratis x {c.ciclos} ciclo{c.ciclos === 1 ? '' : 's'} · vigencia {formValueFecha(c.vigenciaInicio)} a {formValueFecha(c.vigenciaFin)}
                          {' '}· {c.activacionesTotal || 0} activación{(c.activacionesTotal || 0) === 1 ? '' : 'es'}{c.cupoMaximo != null ? ` de ${c.cupoMaximo}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => { setCodigoSeleccionado(c.codigo); setGraficoAbierto(true); }}
                        >
                          Ver actividad
                        </button>
                        <button className="btn" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => editar(c)}>
                          Editar
                        </button>
                        {c.activo ? (
                          <button
                            className="btn"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            disabled={cambiandoEstadoCodigo === c.codigo}
                            onClick={() => cambiarEstado(c, false)}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            className="btn"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            disabled={cambiandoEstadoCodigo === c.codigo}
                            onClick={() => cambiarEstado(c, true)}
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
