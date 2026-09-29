import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { fechaLocalHoy } from '../../utils/fechaCompletado';
import {
  CATEGORIAS_INVENTARIO, esLineaFilamento, juntarMarcas, lineasDeCompra, marcasUsadas, resumenCompra, subtotalLinea
} from '../../utils/inventario';
import SelectorConAlta from '../SelectorConAlta';

// Una compra es un ingreso tipo carrito: varias líneas, cada una con su
// categoría (un mismo pedido al proveedor puede traer filamentos y
// boquillas). Las líneas de filamento llevan tipo, marca y color; el resto,
// una descripción. Se guardan en `lineas`, más un resumen en desc, cat,
// qty, precio y total para los listados y los totales (ver utils/inventario.js).

// Opciones de categoría de una línea: "Filamento" es Insumos con subtipo.
const CLASES = [
  { id: 'Filamento', nombre: 'Filamento', cat: 'Insumos', subtipo: 'Filamento' },
  { id: 'Insumos', nombre: 'Insumo', cat: 'Insumos', subtipo: null },
  { id: 'Accesorios', nombre: 'Accesorio', cat: 'Accesorios', subtipo: null },
  { id: 'Equipos', nombre: 'Equipo', cat: 'Equipos', subtipo: null },
  { id: 'Impuestos', nombre: 'Impuesto', cat: 'Impuestos', subtipo: null },
  { id: 'Otros', nombre: 'Otro', cat: 'Otros', subtipo: null }
];
const claseDe = (l) => (esLineaFilamento(l) ? 'Filamento' : (l.cat || 'Insumos'));
const datosClase = (id) => CLASES.find((x) => x.id === id) || CLASES[1];

// Color inicial de un color nuevo (se cambia tocando la muestra).
const COLOR_NUEVO_DEFAULT = '#9e9e9e';

// Configuración vieja: filamentos y colores podían ser strings sueltos.
const nombreDe = (x) => (typeof x === 'string' ? x : x?.nombre || '');
const hexDe = (x) => (typeof x === 'string' ? '' : x?.hex || '');
const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export default function ModalCompra({ isOpen, onClose, editId }) {
  const { compras, addCompra, updateCompra, getNewId, showToast, cfg, setCfg } = useApp();

  const filamentos = (cfg.filamentos || []).map((f) => ({ nombre: nombreDe(f), precio: Number(f?.precio) || 0 })).filter((f) => f.nombre);
  const colores = (cfg.colores || []).map((c) => ({ nombre: nombreDe(c), hex: hexDe(c) })).filter((c) => c.nombre);

  const lineaVacia = (clase) => {
    const f = filamentos[0];
    return {
      clase, tipo: clase === 'Filamento' ? (f?.nombre || '') : '', marca: '', color: '', colorHex: '', desc: '',
      qty: '1', precio: clase === 'Filamento' && f ? String(f.precio) : ''
    };
  };

  const formVacio = () => ({
    lineas: [lineaVacia(filamentos.length ? 'Filamento' : 'Insumos')],
    proveedor: '',
    fecha: fechaLocalHoy(),
    notas: '',
    // Compra nueva con el inventario habilitado: suma por defecto.
    alInventario: !!cfg.inventarioHabilitado
  });

  const [form, setForm] = useState(formVacio);

  useEffect(() => {
    if (isOpen) {
      const c = editId !== null ? compras.find(x => x.id === editId) : null;
      if (c) {
        setForm({
          lineas: lineasDeCompra(c).map((l) => ({
            clase: claseDe(l), tipo: l.tipo || '', marca: l.marca || '', color: l.color || '', colorHex: l.colorHex || '',
            desc: l.desc || '', qty: String(l.qty ?? 1), precio: String(l.precio ?? '')
          })),
          proveedor: c.proveedor || '',
          fecha: c.fecha || '',
          notas: c.notas || '',
          // Al editar se respeta lo que ya tenía: una compra vieja no pasa
          // al inventario sólo por corregirle un dato.
          alInventario: !!c.alInventario
        });
      } else {
        setForm(formVacio());
      }
    }
    // A propósito sin `compras` en las dependencias: ver misma nota que en
    // ModalCliente.jsx — evita pisar el formulario a mitad de edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const cambiarLinea = (i, campo, valor) => setForm((prev) => ({
    ...prev,
    lineas: prev.lineas.map((l, j) => {
      if (j !== i) return l;
      // Cambiar de categoría conserva cantidad, marca y color; el nombre se
      // vuelve a elegir porque sale de otra lista.
      if (campo === 'clase') return { ...lineaVacia(valor), qty: l.qty, marca: l.marca, color: l.color, colorHex: l.colorHex };
      const nueva = { ...l, [campo]: valor };
      // Al elegir un tipo existente se propone su precio de la configuración.
      if (campo === 'tipo') {
        const f = filamentos.find((x) => x.nombre === valor);
        if (f?.precio) nueva.precio = String(f.precio);
      }
      // Color: el de la configuración si existe; si es nuevo, se elige a mano
      // (se mantiene el que ya se había elegido para esta línea).
      if (campo === 'color') {
        const c = colores.find((x) => igual(x.nombre, valor));
        const elegidoAMano = l.colorHex && !colores.some((x) => x.hex === l.colorHex);
        nueva.colorHex = c ? c.hex : (elegidoAMano ? l.colorHex : COLOR_NUEVO_DEFAULT);
      }
      return nueva;
    })
  }));

  // Línea nueva: misma categoría que la anterior y, si es filamento, mismo
  // tipo, marca y precio (se suelen cargar varios colores de lo mismo).
  const agregarLinea = () => setForm((prev) => {
    const ultima = prev.lineas[prev.lineas.length - 1];
    const nueva = !ultima
      ? lineaVacia('Insumos')
      : ultima.clase === 'Filamento'
        ? { ...ultima, color: '', colorHex: '', qty: '1' }
        : lineaVacia(ultima.clase);
    return { ...prev, lineas: [...prev.lineas, nueva] };
  });
  const quitarLinea = (i) => setForm((prev) => ({ ...prev, lineas: prev.lineas.filter((_, j) => j !== i) }));

  const total = form.lineas.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.precio) || 0), 0);

  const handleSave = () => {
    // Todas las líneas guardan marca y color; el nombre va en `tipo` para
    // filamento y en `desc` para el resto.
    const lineas = form.lineas.map((l) => {
      const clase = datosClase(l.clase);
      const color = (l.color || '').trim();
      const base = {
        cat: clase.cat,
        subtipo: clase.subtipo,
        marca: (l.marca || '').trim(),
        color,
        colorHex: color ? (colores.find((c) => igual(c.nombre, color))?.hex || l.colorHex || '') : '',
        qty: parseInt(l.qty) || 0,
        precio: parseFloat(l.precio) || 0
      };
      return clase.subtipo === 'Filamento'
        ? { ...base, tipo: (l.tipo || '').trim() }
        : { ...base, desc: (l.desc || '').trim() };
    });

    const incompleta = lineas.findIndex((l) => !(l.qty > 0) || (esLineaFilamento(l) ? !l.tipo : !l.desc));
    if (!lineas.length || incompleta !== -1) {
      showToast(lineas.length
        ? `Completá la línea ${incompleta + 1}: ${esLineaFilamento(lineas[incompleta]) ? 'tipo de filamento' : 'descripción'} y cantidad.`
        : 'Agregá al menos un ítem.', 'error');
      return;
    }

    const qty = lineas.reduce((s, l) => s + l.qty, 0);
    const totalCompra = lineas.reduce((s, l) => s + subtotalLinea(l), 0);
    const cats = [...new Set(lineas.map((l) => l.cat))];
    const c = {
      id: editId !== null ? editId : getNewId(),
      lineas,
      desc: resumenCompra(lineas),
      // Categoría de la compra: la única de sus líneas, o "Varios".
      cat: cats.length === 1 ? cats[0] : 'Varios',
      qty,
      // Precio unitario promedio: el listado muestra precio x cantidad.
      precio: qty ? Math.round((totalCompra / qty) * 100) / 100 : 0,
      total: totalCompra,
      // Formato anterior de las compras de filamento: se limpia al guardar.
      subtipo: null,
      items: null,
      proveedor: form.proveedor,
      fecha: form.fecha,
      notas: form.notas,
      alInventario: !!form.alInventario && lineas.some((l) => CATEGORIAS_INVENTARIO.includes(l.cat))
    };

    // Artículos nuevos de las demás líneas (accesorios, insumos, etc.):
    // quedan en la configuración por categoría (cfg.articulosCompra), así se
    // siguen sugiriendo aunque se borre la compra donde aparecieron.
    const articulosCfg = cfg.articulosCompra || {};
    const articulosNuevos = {};
    for (const l of lineas.filter((x) => !esLineaFilamento(x))) {
      const lista = articulosNuevos[l.cat] || articulosCfg[l.cat] || [];
      const junta = juntarMarcas(lista, [l.desc]);
      if (junta.length !== lista.length) articulosNuevos[l.cat] = junta;
    }
    if (Object.keys(articulosNuevos).length) {
      setCfg((prev) => ({ ...prev, articulosCompra: { ...(prev.articulosCompra || {}), ...articulosNuevos } }));
    }

    // Lo nuevo de cualquier línea queda en la configuración: las marcas
    // (cfg.marcasFilamento, compartidas por todas las categorías, para
    // seguir sugiriéndolas aunque se borre la compra), los tipos de
    // filamento en Filamentos (con el precio de la línea como referencia) y
    // los colores en Colores (con el tono elegido).
    const marcasCfg = cfg.marcasFilamento || [];
    const marcasNuevas = juntarMarcas(marcasCfg, lineas.map((l) => l.marca));
    const tiposNuevos = [];
    const coloresNuevos = [];
    for (const l of lineas) {
      if (esLineaFilamento(l) && !filamentos.some((f) => igual(f.nombre, l.tipo)) && !tiposNuevos.some((t) => igual(t.nombre, l.tipo))) {
        tiposNuevos.push({ nombre: l.tipo, precio: l.precio });
      }
      if (l.color && !colores.some((x) => igual(x.nombre, l.color)) && !coloresNuevos.some((x) => igual(x.nombre, l.color))) {
        coloresNuevos.push({ nombre: l.color, hex: l.colorHex || COLOR_NUEVO_DEFAULT, secundario: false });
      }
    }
    if (marcasNuevas.length !== marcasCfg.length || tiposNuevos.length || coloresNuevos.length) {
      setCfg((prev) => ({
        ...prev,
        marcasFilamento: marcasNuevas,
        filamentos: [...(prev.filamentos || []), ...tiposNuevos],
        colores: [...(prev.colores || []), ...coloresNuevos]
      }));
      const agregados = [
        tiposNuevos.length && `${tiposNuevos.length} filamento${tiposNuevos.length === 1 ? '' : 's'}`,
        coloresNuevos.length && `${coloresNuevos.length} color${coloresNuevos.length === 1 ? '' : 'es'}`
      ].filter(Boolean);
      if (agregados.length) showToast(`Se agregaron a la configuración: ${agregados.join(' y ')}.`);
    }

    if (editId !== null) {
      updateCompra(editId, c);
      showToast('Compra actualizada con éxito');
    } else {
      addCompra(c);
      showToast('Compra guardada con éxito');
    }

    onClose();
  };

  if (!isOpen) return null;

  // Sugerencias:
  //  - marcas: las guardadas en la configuración, las de compras anteriores
  //    y las de las OTRAS líneas de esta compra (la propia no, para no
  //    sugerir lo que se está escribiendo);
  //  - descripciones: las guardadas en la configuración para esa categoría,
  //    las ya usadas en compras anteriores y las de las OTRAS líneas de esta
  //    compra, así el mismo producto suma siempre al mismo artículo del
  //    inventario.
  const marcasGuardadas = juntarMarcas(cfg.marcasFilamento || [], marcasUsadas(compras));
  const marcasParaLinea = (i) => juntarMarcas(
    marcasGuardadas,
    form.lineas.filter((l, j) => j !== i).map((l) => l.marca)
  );
  const descripcionesPara = (i) => {
    const cat = datosClase(form.lineas[i].clase).cat;
    return juntarMarcas(
      (cfg.articulosCompra || {})[cat] || [],
      compras.flatMap((c) => lineasDeCompra(c).filter((l) => l.cat === cat && !esLineaFilamento(l)).map((l) => l.desc)),
      form.lineas.filter((l, j) => j !== i && l.clase !== 'Filamento' && datosClase(l.clase).cat === cat).map((l) => l.desc)
    );
  };

  const inventariables = form.lineas.filter((l) => CATEGORIAS_INVENTARIO.includes(datosClase(l.clase).cat));
  const muestraInventario = !!cfg.inventarioHabilitado && inventariables.length > 0;
  const unidadesInventario = inventariables.reduce((s, l) => s + (parseInt(l.qty) || 0), 0);
  const fmtPesos = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const muestraColor = (hex, extra) => ({
    width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
    border: '1px solid var(--border2)', background: hex || 'transparent', ...extra
  });

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-wide" style={{ maxWidth: '1100px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editId !== null ? 'Editar compra' : 'Nueva compra'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Proveedor (opcional)</label>
            <input type="text" id="proveedor" value={form.proveedor} onChange={handleChange} placeholder="Ej: MercadoLibre" />
          </div>
          <div>
            <label className="fl" style={{ marginTop: 0 }}>Fecha de compra</label>
            <input type="date" id="fecha" value={form.fecha} onChange={handleChange} />
          </div>
        </div>

        <label className="fl">Ítems</label>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table tabla-lineas-compra" style={{ fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '130px' }}>Categoría</th>
                <th style={{ width: '100%' }}>Detalle</th>
                <th style={{ minWidth: '80px' }}>Cant.</th>
                <th style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>Precio unit.</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.lineas.map((l, i) => {
                const colorCfg = colores.find((c) => igual(c.nombre, l.color));
                const hex = colorCfg ? colorCfg.hex : l.colorHex;
                const colorNuevo = !!(l.color || '').trim() && !colorCfg;
                return (
                  <tr key={i}>
                    <td>
                      <select value={l.clase} onChange={(e) => cambiarLinea(i, 'clase', e.target.value)}>
                        {CLASES.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>
                    <td>
                      {/* Mismos datos en todas las categorías: nombre (tipo de filamento o
                          descripción), marca y color. Marca y color son opcionales. */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.4fr) minmax(120px, 1fr) minmax(150px, 1.1fr)', gap: '6px' }}>
                          {l.clase === 'Filamento' ? (
                            <SelectorConAlta value={l.tipo} opciones={filamentos.map((f) => f.nombre)} placeholder="Tipo de filamento" onChange={(v) => cambiarLinea(i, 'tipo', v)} />
                          ) : (
                            <SelectorConAlta value={l.desc} opciones={descripcionesPara(i)} placeholder="Descripción (ej: Boquilla 0.4 mm)" onChange={(v) => cambiarLinea(i, 'desc', v)} />
                          )}
                          <SelectorConAlta value={l.marca} opciones={marcasParaLinea(i)} placeholder="Marca" onChange={(v) => cambiarLinea(i, 'marca', v)} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {colorNuevo ? (
                              // Color nuevo: la muestra abre el selector de color del sistema.
                              <label
                                title="Color nuevo: tocá para elegirlo"
                                style={{ ...muestraColor(hex || COLOR_NUEVO_DEFAULT), position: 'relative', cursor: 'pointer', border: '2px dashed var(--accent)' }}
                              >
                                <input
                                  type="color"
                                  value={hex || COLOR_NUEVO_DEFAULT}
                                  onChange={(e) => cambiarLinea(i, 'colorHex', e.target.value)}
                                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
                                />
                              </label>
                            ) : (
                              <span title={l.color || 'Sin color'} style={muestraColor(hex)} />
                            )}
                            <SelectorConAlta
                              value={l.color}
                              opciones={colores.map((c) => c.nombre)}
                              placeholder="Color"
                              onChange={(v) => cambiarLinea(i, 'color', v)}
                              antesDeOpcion={(nombre) => (
                                <span style={muestraColor(colores.find((c) => c.nombre === nombre)?.hex, { width: '12px', height: '12px' })} />
                              )}
                            />
                          </div>
                      </div>
                    </td>
                    <td><input type="number" min="1" step="1" value={l.qty} onChange={(e) => cambiarLinea(i, 'qty', e.target.value)} /></td>
                    <td><input type="number" min="0" step="100" value={l.precio} placeholder="0" onChange={(e) => cambiarLinea(i, 'precio', e.target.value)} /></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {fmtPesos((parseFloat(l.qty) || 0) * (parseFloat(l.precio) || 0))}
                    </td>
                    <td>
                      {form.lineas.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => quitarLinea(i)} title="Quitar">✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <button type="button" className="btn btn-sm" onClick={agregarLinea}>+ Agregar ítem</button>
          <strong style={{ fontSize: '15px' }}>Total: {fmtPesos(total)}</strong>
        </div>
        {filamentos.length === 0 && form.lineas.some((l) => l.clase === 'Filamento') && (
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>
            Todavía no hay filamentos en Configuración: escribí el tipo y se agrega al guardar.
          </div>
        )}

        <label className="fl">Notas (opcional)</label>
        <input type="text" id="notas" value={form.notas} onChange={handleChange} placeholder="Notas adicionales" />

        {muestraInventario && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
            <input
              type="checkbox"
              id="alInventario"
              checked={form.alInventario}
              onChange={(e) => setForm(prev => ({ ...prev, alInventario: e.target.checked }))}
            />
            <label htmlFor="alInventario" style={{ fontSize: '13px' }}>
              Sumar al inventario ({unidadesInventario} u.; los impuestos no suman)
            </label>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar compra</button>
        </div>
      </div>
    </div>
  );
}
