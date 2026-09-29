import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { fechaLocalHoy } from '../../utils/fechaCompletado';
import { CATEGORIAS_INVENTARIO, armarInventario, marcasUsadas, resumenFilamentos } from '../../utils/inventario';

// Una compra puede ser de un solo producto (desc/precio/qty) o, en Insumos
// del tipo Filamento, un "carrito" de líneas (tipo, marca, color, cantidad,
// precio). En ese caso se guardan las líneas en `items` y además desc, qty,
// precio y total resumidos, para que el listado y los totales de Compras
// sigan funcionando igual.

// Configuración vieja: filamentos y colores podían ser strings sueltos.
const nombreDe = (x) => (typeof x === 'string' ? x : x?.nombre || '');
const hexDe = (x) => (typeof x === 'string' ? '' : x?.hex || '');

const formVacio = (inventarioHabilitado) => ({
  desc: '',
  cat: 'Insumos',
  tipoInsumo: 'Otro',
  items: [],
  precio: '',
  qty: 1,
  proveedor: '',
  fecha: fechaLocalHoy(),
  notas: '',
  // Compra nueva con el inventario habilitado: suma por defecto.
  alInventario: !!inventarioHabilitado
});

export default function ModalCompra({ isOpen, onClose, editId }) {
  const { compras, addCompra, updateCompra, getNewId, showToast, cfg } = useApp();

  const filamentos = (cfg.filamentos || []).map((f) => ({ nombre: nombreDe(f), precio: Number(f?.precio) || 0 })).filter((f) => f.nombre);
  const colores = (cfg.colores || []).map((c) => ({ nombre: nombreDe(c), hex: hexDe(c) })).filter((c) => c.nombre);

  // Línea nueva del carrito: copia la anterior (se suelen cargar varios
  // colores del mismo tipo y marca) o arranca con el primer filamento.
  const lineaNueva = (anterior) => {
    if (anterior) return { ...anterior, color: '', qty: '1' };
    const f = filamentos[0];
    return { tipo: f?.nombre || '', marca: '', color: '', qty: '1', precio: f ? String(f.precio) : '' };
  };

  const [form, setForm] = useState(() => formVacio(cfg.inventarioHabilitado));

  useEffect(() => {
    if (isOpen) {
      if (editId !== null) {
        const c = compras.find(x => x.id === editId);
        if (c) {
          const esFilamento = c.subtipo === 'Filamento' && Array.isArray(c.items);
          setForm({
            desc: esFilamento ? '' : (c.desc || ''),
            cat: c.cat || 'Insumos',
            tipoInsumo: esFilamento ? 'Filamento' : 'Otro',
            items: esFilamento ? c.items.map((it) => ({ ...it, qty: String(it.qty), precio: String(it.precio) })) : [],
            precio: esFilamento ? '' : (c.precio || ''),
            qty: esFilamento ? 1 : (c.qty || 1),
            proveedor: c.proveedor || '',
            fecha: c.fecha || '',
            notas: c.notas || '',
            // Al editar se respeta lo que ya tenía: una compra vieja no pasa
            // al inventario sólo por corregirle un dato.
            alInventario: !!c.alInventario
          });
        }
      } else {
        setForm(formVacio(cfg.inventarioHabilitado));
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

  const esFilamento = form.cat === 'Insumos' && form.tipoInsumo === 'Filamento';

  const elegirTipoInsumo = (tipo) => setForm((prev) => ({
    ...prev,
    tipoInsumo: tipo,
    items: tipo === 'Filamento' && prev.items.length === 0 ? [lineaNueva()] : prev.items
  }));

  const cambiarLinea = (i, campo, valor) => setForm((prev) => ({
    ...prev,
    items: prev.items.map((it, j) => {
      if (j !== i) return it;
      const nueva = { ...it, [campo]: valor };
      // Al cambiar el tipo se propone el precio de ese filamento en la configuración.
      if (campo === 'tipo') {
        const f = filamentos.find((x) => x.nombre === valor);
        if (f?.precio) nueva.precio = String(f.precio);
      }
      return nueva;
    })
  }));
  const agregarLinea = () => setForm((prev) => ({ ...prev, items: [...prev.items, lineaNueva(prev.items[prev.items.length - 1])] }));
  const quitarLinea = (i) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, j) => j !== i) }));

  const totalFilamentos = form.items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.precio) || 0), 0);

  const handleSave = () => {
    let datos;
    if (esFilamento) {
      const items = form.items
        .map((it) => ({
          tipo: it.tipo,
          marca: (it.marca || '').trim(),
          color: it.color || '',
          colorHex: colores.find((c) => c.nombre === it.color)?.hex || '',
          qty: parseInt(it.qty) || 0,
          precio: parseFloat(it.precio) || 0
        }))
        .filter((it) => it.tipo && it.qty > 0);
      if (!items.length) {
        showToast('Agregá al menos un filamento con cantidad.', 'error');
        return;
      }
      const qty = items.reduce((s, it) => s + it.qty, 0);
      const total = items.reduce((s, it) => s + it.qty * it.precio, 0);
      datos = {
        subtipo: 'Filamento',
        items,
        desc: resumenFilamentos(items),
        qty,
        // Precio unitario promedio: el listado de Compras muestra precio x cantidad.
        precio: qty ? Math.round((total / qty) * 100) / 100 : 0,
        total
      };
    } else {
      const precioNum = parseFloat(form.precio) || 0;
      const qtyNum = parseInt(form.qty) || 1;
      datos = {
        subtipo: null,
        items: null,
        desc: form.desc.trim() || 'Sin descripción',
        precio: precioNum,
        qty: qtyNum,
        total: precioNum * qtyNum
      };
    }

    const c = {
      id: editId !== null ? editId : getNewId(),
      cat: form.cat,
      ...datos,
      proveedor: form.proveedor,
      fecha: form.fecha,
      notas: form.notas,
      // Sólo Insumos y Accesorios se inventarían.
      alInventario: !!form.alInventario && CATEGORIAS_INVENTARIO.includes(form.cat)
    };

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

  const muestraInventario = !!cfg.inventarioHabilitado && CATEGORIAS_INVENTARIO.includes(form.cat);
  // Sugerencias para la descripción: los artículos que ya están en el
  // inventario, así una compra nueva del mismo producto suma al mismo.
  const articulos = muestraInventario && !esFilamento ? armarInventario(compras).filter((a) => !a.filamento) : [];
  const marcas = esFilamento ? marcasUsadas(compras) : [];
  const unidades = esFilamento ? form.items.reduce((s, it) => s + (parseInt(it.qty) || 0), 0) : (parseInt(form.qty) || 1);
  const fmtPesos = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className={`modal ${esFilamento ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editId !== null ? 'Editar compra' : 'Nueva compra'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: form.cat === 'Insumos' ? '1fr 1fr' : '1fr', gap: '10px' }}>
          <div>
            <label className="fl">Categoría</label>
            <select id="cat" value={form.cat} onChange={handleChange}>
              <option value="Insumos">Insumos</option>
              <option value="Equipos">Equipos</option>
              <option value="Accesorios">Accesorios</option>
              <option value="Impuestos">Impuestos</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          {form.cat === 'Insumos' && (
            <div>
              <label className="fl">Tipo de insumo</label>
              <select value={form.tipoInsumo} onChange={(e) => elegirTipoInsumo(e.target.value)}>
                <option value="Filamento">Filamento</option>
                <option value="Otro">Otro insumo</option>
              </select>
            </div>
          )}
        </div>

        {esFilamento ? (
          <>
            <label className="fl">Filamentos</label>
            {filamentos.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '8px' }}>
                No hay filamentos cargados en Configuración → Herramientas → Filamentos.
              </div>
            )}
            <datalist id="marcas-filamento">
              {marcas.map((m) => <option key={m} value={m} />)}
            </datalist>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Marca</th>
                    <th>Color</th>
                    <th style={{ width: '70px' }}>Cant.</th>
                    <th style={{ width: '110px' }}>Precio unit.</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, i) => {
                    const hex = colores.find((c) => c.nombre === it.color)?.hex;
                    return (
                      <tr key={i}>
                        <td style={{ minWidth: '130px' }}>
                          <select value={it.tipo} onChange={(e) => cambiarLinea(i, 'tipo', e.target.value)}>
                            {!filamentos.some((f) => f.nombre === it.tipo) && it.tipo && <option value={it.tipo}>{it.tipo}</option>}
                            {filamentos.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
                          </select>
                        </td>
                        <td style={{ minWidth: '120px' }}>
                          <input type="text" list="marcas-filamento" value={it.marca} placeholder="Marca" onChange={(e) => cambiarLinea(i, 'marca', e.target.value)} />
                        </td>
                        <td style={{ minWidth: '140px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              title={it.color || 'Sin color'}
                              style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, border: '1px solid var(--border2)', background: hex || 'transparent' }}
                            />
                            <select value={it.color} onChange={(e) => cambiarLinea(i, 'color', e.target.value)}>
                              <option value="">— Color —</option>
                              {!colores.some((c) => c.nombre === it.color) && it.color && <option value={it.color}>{it.color}</option>}
                              {colores.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                            </select>
                          </div>
                        </td>
                        <td><input type="number" min="1" step="1" value={it.qty} onChange={(e) => cambiarLinea(i, 'qty', e.target.value)} /></td>
                        <td><input type="number" min="0" step="100" value={it.precio} onChange={(e) => cambiarLinea(i, 'precio', e.target.value)} /></td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {fmtPesos((parseFloat(it.qty) || 0) * (parseFloat(it.precio) || 0))}
                        </td>
                        <td>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => quitarLinea(i)} title="Quitar">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn btn-sm" onClick={agregarLinea}>+ Agregar filamento</button>
              <strong style={{ fontSize: '14px' }}>Total: {fmtPesos(totalFilamentos)}</strong>
            </div>
          </>
        ) : (
          <>
            <label className="fl">Descripción del producto</label>
            <input
              type="text"
              id="desc"
              value={form.desc}
              onChange={handleChange}
              placeholder="Ej: Rollo PLA 1kg blanco"
              list={articulos.length ? 'articulos-inventario' : undefined}
            />
            {articulos.length > 0 && (
              <datalist id="articulos-inventario">
                {articulos.map((a) => <option key={a.clave} value={a.nombre} />)}
              </datalist>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="fl">Precio unitario ($)</label>
                <input
                  type="number"
                  id="precio"
                  value={form.precio}
                  onChange={handleChange}
                  placeholder="0"
                  step="100"
                />
              </div>
              <div>
                <label className="fl">Cantidad</label>
                <input
                  type="number"
                  id="qty"
                  value={form.qty}
                  onChange={handleChange}
                  min="1"
                  step="1"
                />
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="fl">Proveedor (opcional)</label>
            <input
              type="text"
              id="proveedor"
              value={form.proveedor}
              onChange={handleChange}
              placeholder="Ej: MercadoLibre"
            />
          </div>
          <div>
            <label className="fl">Fecha de compra</label>
            <input
              type="date"
              id="fecha"
              value={form.fecha}
              onChange={handleChange}
            />
          </div>
        </div>

        <label className="fl">Notas (opcional)</label>
        <input
          type="text"
          id="notas"
          value={form.notas}
          onChange={handleChange}
          placeholder="Notas adicionales"
        />

        {muestraInventario && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
            <input
              type="checkbox"
              id="alInventario"
              checked={form.alInventario}
              onChange={(e) => setForm(prev => ({ ...prev, alInventario: e.target.checked }))}
            />
            <label htmlFor="alInventario" style={{ fontSize: '13px' }}>
              Sumar al inventario ({unidades} u.)
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
