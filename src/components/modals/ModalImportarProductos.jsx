import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBiblioteca, useConfig, useCuenta, useUi } from '../../context/contextos';
import { useCapaModal } from '../CapaModal';
import { comprimirImagen, subirImagenAFirebase, borrarImagenDeFirebase } from '../../utils/imageCompress';
import {
  MAX_IMAGENES_POR_PRODUCTO, MAX_PRODUCTOS_POR_CARGA, MAX_ZIP_BYTES,
  archivoDeImagen, armarProducto, descargarPlantillaProductos, leerZipProductos, lugarEnPlan, validarProductosCSV
} from '../../utils/importarProductos';

// Carga masiva de productos sin impresión desde un ZIP (CSV + fotos): formato y reglas en utils/importarProductos.js.
// Primero se lee y se valida todo sin subir nada: la vista previa muestra cada producto con sus errores y se puede
// destildar productos o cancelar. Recién con "Importar" se suben las fotos y se guardan los productos, de a uno.

// Configuración vieja: los colores podían ser strings sueltos.
const nombreDe = (x) => (typeof x === 'string' ? x : x?.nombre || '');

export default function ModalImportarProductos({ onClose }) {
  const { biblioteca, addProducto } = useBiblioteca();
  const { cfg, getNewId, fmt } = useConfig();
  const { cuentaId, planContratado } = useCuenta();
  const { showToast } = useUi();
  const [archivo, setArchivo] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState(null); // { error } | { productos, sueltas }
  const [excluidos, setExcluidos] = useState(() => new Set());
  const [progreso, setProgreso] = useState(null); // { hecho, total, actual }
  const [resultado, setResultado] = useState(null); // { guardados, fallidos, detenido }
  const zipRef = useRef(null);
  const imagenesRef = useRef(new Map());
  const detenerRef = useRef(false);
  const importando = !!progreso;
  const capaModal = useCapaModal({ onClose, activo: true, bloqueado: importando });

  const colores = useMemo(() => (cfg.colores || []).map(nombreDe).filter(Boolean), [cfg.colores]);
  const productos = lectura?.productos || [];
  const sueltas = lectura?.sueltas || [];
  const validos = productos.filter((p) => !p.errores.length);
  const aImportar = validos.filter((p) => !excluidos.has(p.clave));
  const limitePlan = planContratado?.limites?.productosBiblioteca;
  const lugar = lugarEnPlan(limitePlan, biblioteca.length);
  const excedePlan = lugar != null && aImportar.length > lugar;
  const fotosTotal = aImportar.reduce((s, p) => s + p.imagenes.length, 0);

  const elegirArchivo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // para poder volver a elegir el mismo archivo corregido
    if (!f) return;
    setArchivo(f.name);
    setResultado(null);
    setExcluidos(new Set());
    zipRef.current = null;
    if (f.size > MAX_ZIP_BYTES) {
      setLectura({ error: `El ZIP pesa más de ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB. Reducí las fotos o dividí la carga en varios archivos.` });
      return;
    }
    setLeyendo(true);
    try {
      const zip = await leerZipProductos(await f.arrayBuffer());
      if (zip.error) { setLectura({ error: zip.error }); return; }
      zipRef.current = zip.zip;
      imagenesRef.current = zip.imagenes;
      setLectura(validarProductosCSV(zip.csv, { imagenes: zip.imagenes, colores, existentes: biblioteca.map((b) => b.nombre) }));
    } catch (err) {
      setLectura({ error: err.message || 'No se pudo leer el archivo.' });
    } finally {
      setLeyendo(false);
    }
  };

  const alternar = (k) => setExcluidos((prev) => {
    const sig = new Set(prev);
    if (sig.has(k)) sig.delete(k); else sig.add(k);
    return sig;
  });

  // Sube las fotos del producto (comprimidas, como en el alta común) y lo guarda. Si algo falla, borra las fotos que ya
  // había subido para no dejar archivos sueltos en Storage.
  const importarUno = async (p) => {
    const urls = {};
    const subidas = [];
    const resultados = await Promise.allSettled(p.imagenes.map(async (nombre, i) => {
      const entrada = [...imagenesRef.current.values()].find((x) => x.nombre === nombre);
      const { dataUrl } = await comprimirImagen(await archivoDeImagen(zipRef.current, entrada), { maxWidth: 640, maxHeight: 640, maxBytes: 90 * 1024 });
      // El número evita que dos nombres que se limpian igual ("a b.jpg" y "a_b.jpg") pisen el mismo archivo.
      const url = await subirImagenAFirebase(dataUrl, { userId: cuentaId, fileName: `${i}-${nombre}` });
      subidas.push(url);
      urls[nombre] = url;
    }));
    try {
      const falla = resultados.find((r) => r.status === 'rejected');
      if (falla) throw new Error(`Foto: ${falla.reason?.message || 'no se pudo subir'}`);
      const ok = await addProducto(armarProducto(p, { id: getNewId(), fecha: new Date().toLocaleDateString('es-AR'), urls }));
      if (ok === false) throw new Error('No se pudo guardar en la nube.');
    } catch (err) {
      for (const url of subidas) await borrarImagenDeFirebase(url);
      throw err;
    }
  };

  const importar = async () => {
    if (!aImportar.length || excedePlan) return;
    detenerRef.current = false;
    let guardados = 0;
    const fallidos = [];
    let detenido = false;
    for (let i = 0; i < aImportar.length; i++) {
      if (detenerRef.current) { detenido = true; break; }
      const p = aImportar[i];
      setProgreso({ hecho: i, total: aImportar.length, actual: p.nombre });
      try {
        await importarUno(p);
        guardados++;
      } catch (err) {
        fallidos.push({ nombre: p.nombre, motivo: err.message || 'Error desconocido' });
      }
    }
    setProgreso(null);
    setResultado({ guardados, fallidos, detenido, sinProcesar: detenido ? aImportar.length - guardados - fallidos.length : 0 });
    if (guardados) showToast(`✓ Se importaron ${guardados} producto${guardados === 1 ? '' : 's'} a la Biblioteca.`);
  };

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  return createPortal(
    <div className="modal-overlay open" {...capaModal} style={{ zIndex: 120, padding: '20px 16px' }}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} style={{ margin: 'auto', maxWidth: '980px' }}>
        <div className="modal-title">Cargar productos desde un ZIP</div>
        <div className="modal-sub">
          Cargá varios productos sin impresión de una vez, con su stock por color y sus fotos. Antes de importar vas a ver una
          vista previa y podés cancelar sin que se suba nada.
        </div>

        {!resultado && (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: '12px', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>Cómo se arma el ZIP</div>
              Un ZIP con <b>productos.csv</b> (una fila por color) y las fotos, que se indican por <b>nombre de archivo</b> (no por ruta: el
              navegador no puede abrir carpetas de tu PC). Máximo {MAX_PRODUCTOS_POR_CARGA} productos por carga y {MAX_IMAGENES_POR_PRODUCTO} fotos por producto.
              Los colores tienen que existir en Configuración y un producto que ya está en la Biblioteca se rechaza.
              <div style={{ fontFamily: 'var(--mono)', margin: '4px 0', wordBreak: 'break-word' }}>
                codigo;nombre;categoria;subcategoria;subsubcategoria;desc_corta;desc_larga;notas_internas;costo;margen;precio;color;stock;foto_principal;fotos_extra;foto_color
              </div>
              La plantilla trae un ejemplo y un LEEME con todas las reglas.
              <div style={{ marginTop: '8px' }}>
                <button className="btn btn-sm" onClick={descargarPlantillaProductos}>Descargar plantilla (.zip)</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
              <label className="btn" style={{ cursor: importando ? 'default' : 'pointer', opacity: importando ? 0.5 : 1 }}>
                {archivo ? 'Elegir otro ZIP' : 'Elegir ZIP…'}
                <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={elegirArchivo} disabled={importando || leyendo} style={{ display: 'none' }} />
              </label>
              {archivo && <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{archivo}</span>}
              {leyendo && <span style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>Leyendo y validando…</span>}
            </div>

            {lectura?.error && <div style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '12px' }}>{lectura.error}</div>}

            {productos.length > 0 && (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', lineHeight: 1.6 }}>
                  {plural(productos.length, 'producto', 'productos')} en el archivo · <b>{plural(aImportar.length, 'se importa', 'se importan')}</b>
                  {aImportar.length > 0 && <> ({plural(fotosTotal, 'foto', 'fotos')})</>}
                  {productos.length - validos.length > 0 && <span style={{ color: 'var(--danger)' }}> · {plural(productos.length - validos.length, 'rechazado', 'rechazados')} por errores (corregí el archivo y volvé a elegirlo)</span>}
                  {validos.length - aImportar.length > 0 && <span> · {plural(validos.length - aImportar.length, 'destildado', 'destildados')}</span>}
                  {limitePlan != null && <> · Tu plan permite {limitePlan} productos en la Biblioteca (tenés {biblioteca.length}; entran {lugar} más)</>}
                </div>
                {excedePlan && (
                  <div style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '6px' }}>
                    Con estos productos pasás el máximo de tu plan: destildá {aImportar.length - lugar} o borrá productos de la Biblioteca.
                  </div>
                )}
                <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '28px' }}></th>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Colores y stock</th>
                        <th style={{ textAlign: 'right' }}>Costo</th>
                        <th style={{ textAlign: 'right' }}>Precio</th>
                        <th style={{ textAlign: 'center' }}>Fotos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.map((p) => {
                        const mal = p.errores.length > 0;
                        return (
                          <React.Fragment key={p.clave + p.filas[0]}>
                            <tr style={{ background: mal ? 'var(--dangerDim)' : undefined, opacity: !mal && excluidos.has(p.clave) ? 0.5 : 1 }}>
                              <td>
                                {!mal && <input type="checkbox" checked={!excluidos.has(p.clave)} onChange={() => alternar(p.clave)} disabled={importando} title="Importar este producto" />}
                              </td>
                              <td>
                                <b>{p.nombre || '(sin nombre)'}</b>
                                <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                                  {p.codigo ? `${p.codigo} · ` : ''}fila{p.filas.length > 1 ? 's' : ''} {p.filas.join(', ')}
                                </div>
                              </td>
                              <td style={{ fontSize: '12px' }}>{[p.cat || 'General', p.subcat, p.subsubcat].filter(Boolean).join(' › ')}</td>
                              <td style={{ fontSize: '12px' }}>
                                {p.colores.map((c, i) => (
                                  <span key={i} style={{ display: 'inline-block', marginRight: '8px', whiteSpace: 'nowrap' }}>{c.color || 'Sin color'} <b>{c.stock}</b></span>
                                ))}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmt(p.costo)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{p.precio ? fmt(p.precio) : '—'}</td>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{p.imagenes.length}</td>
                            </tr>
                            {mal && (
                              <tr style={{ background: 'var(--dangerDim)' }}>
                                <td></td>
                                <td colSpan={6} style={{ color: 'var(--danger)', fontSize: '12px', lineHeight: 1.5 }}>
                                  {p.errores.map((m, i) => <div key={i}>• {m}</div>)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {sueltas.length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>
                    {sueltas.map((s) => <div key={s.numero}>Fila {s.numero}: {s.error} (no se importa).</div>)}
                  </div>
                )}
              </>
            )}

            {importando && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                Importando {progreso.hecho + 1} de {progreso.total}: {progreso.actual}…
                <div style={{ height: '6px', background: 'var(--bg3)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${(progreso.hecho / progreso.total) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
                </div>
                <div style={{ fontFamily: 'var(--font, inherit)', marginTop: '6px' }}>Los productos ya guardados quedan en la Biblioteca aunque detengas la carga.</div>
              </div>
            )}
          </>
        )}

        {resultado && (
          <div style={{ fontSize: '13px', lineHeight: 1.7 }}>
            <div style={{ color: resultado.guardados ? 'var(--text)' : 'var(--danger)' }}>
              <b>{plural(resultado.guardados, 'producto importado', 'productos importados')}</b> a la Biblioteca.
            </div>
            {resultado.detenido && <div style={{ color: 'var(--text2)' }}>Detuviste la carga: {plural(resultado.sinProcesar, 'producto quedó', 'productos quedaron')} sin importar.</div>}
            {resultado.fallidos.length > 0 && (
              <div style={{ color: 'var(--danger)', marginTop: '6px' }}>
                {plural(resultado.fallidos.length, 'producto no se pudo importar', 'productos no se pudieron importar')} (no quedó nada guardado de ellos):
                {resultado.fallidos.map((f, i) => <div key={i}>• {f.nombre}: {f.motivo}</div>)}
              </div>
            )}
            <div style={{ color: 'var(--text2)', marginTop: '8px' }}>
              Los productos no se publican solos en el catálogo: publicalos desde Catálogo cuando quieras.
            </div>
          </div>
        )}

        <div className="modal-footer">
          {importando ? (
            <button className="btn" onClick={() => { detenerRef.current = true; }}>Detener carga</button>
          ) : (
            <button className="btn" onClick={onClose}>{resultado ? 'Cerrar' : 'Cancelar'}</button>
          )}
          {!resultado && (
            <button className="btn btn-primary" disabled={importando || leyendo || !aImportar.length || excedePlan} onClick={importar}>
              {importando ? 'Importando…' : `Importar${aImportar.length ? ` (${aImportar.length})` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
