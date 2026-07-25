import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ordenarCategorias } from '../utils/categoriaOrden';
import { obtenerBloques } from '../utils/faqBloques';
import { borrarImagenDeFirebase } from '../utils/imageCompress';

// Convierte una URL de YouTube (watch?v=, youtu.be/, /embed/, /shorts/) en su
// ID de video. Devuelve null si no reconoce el formato, para no romper el
// embed con una URL cualquiera pegada por error.
function extraerYoutubeId(url) {
  if (!url) return null;
  const patrones = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/
  ];
  for (const re of patrones) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// Parser chico de formato básico para la respuesta: líneas que empiezan con
// "- " se agrupan en una lista, el resto son párrafos; dentro de cada línea
// **texto** se muestra en negrita. Nada de HTML crudo ni librería de
// markdown -- alcanza con esto para lo que pide la sección.
function renderTextoConNegrita(linea, key) {
  const partes = linea.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <React.Fragment key={key}>
      {partes.map((parte, i) =>
        parte.startsWith('**') && parte.endsWith('**')
          ? <strong key={i}>{parte.slice(2, -2)}</strong>
          : <React.Fragment key={i}>{parte}</React.Fragment>
      )}
    </React.Fragment>
  );
}

function renderBloqueTexto(texto) {
  if (!texto) return null;
  const lineas = texto.split('\n');
  const bloques = [];
  let listaActual = null;

  lineas.forEach((linea, idx) => {
    if (linea.trim().startsWith('- ')) {
      if (!listaActual) {
        listaActual = [];
        bloques.push({ tipo: 'lista', items: listaActual });
      }
      listaActual.push(linea.trim().slice(2));
    } else {
      listaActual = null;
      if (linea.trim() === '') {
        bloques.push({ tipo: 'espacio', key: idx });
      } else {
        bloques.push({ tipo: 'parrafo', texto: linea, key: idx });
      }
    }
  });

  return bloques.map((b, i) => {
    if (b.tipo === 'lista') {
      return (
        <ul key={i} style={{ margin: '8px 0', paddingLeft: '22px' }}>
          {b.items.map((item, j) => (
            <li key={j} style={{ marginBottom: '4px' }}>{renderTextoConNegrita(item, j)}</li>
          ))}
        </ul>
      );
    }
    if (b.tipo === 'espacio') return <div key={i} style={{ height: '8px' }} />;
    return (
      <p key={i} style={{ margin: '0 0 8px 0', lineHeight: 1.5 }}>
        {renderTextoConNegrita(b.texto, i)}
      </p>
    );
  });
}

export default function FaqPage({ onOpenNuevo, onOpenEditar, onOpenOrdenCategorias }) {
  const { faq, faqCategoriaOrden, isAdmin, removeFaq, showToast } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  // Categorías colapsadas: sólo estado local de la pantalla (no se
  // persiste) -- es una comodidad de navegación, no contenido que un admin
  // necesite definir para los demás.
  const [colapsadas, setColapsadas] = useState(() => new Set());

  const toggleColapsada = (cat) => {
    setColapsadas(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Agrupa por categoría (orden manual vía faqCategoriaOrden, mismo
  // mecanismo que Biblioteca) y, dentro de cada categoría, por
  // subcategoría opcional -- las preguntas sin subcategoría (null) van
  // primero, sueltas, y el resto se agrupa bajo su subcategoría.
  const categorias = useMemo(() => {
    const porCategoria = new Map();
    [...faq]
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .forEach(f => {
        const cat = f.categoria || 'General';
        if (!porCategoria.has(cat)) porCategoria.set(cat, []);
        porCategoria.get(cat).push(f);
      });

    const nombresOrdenados = ordenarCategorias(Array.from(porCategoria.keys()), faqCategoriaOrden);

    return nombresOrdenados.map(cat => {
      const preguntas = porCategoria.get(cat);
      const sinSubcat = preguntas.filter(f => !f.subcategoria);
      const porSubcat = new Map();
      preguntas.forEach(f => {
        if (!f.subcategoria) return;
        if (!porSubcat.has(f.subcategoria)) porSubcat.set(f.subcategoria, []);
        porSubcat.get(f.subcategoria).push(f);
      });
      const gruposSubcat = Array.from(porSubcat.entries()).sort((a, b) =>
        a[0].localeCompare(b[0], 'es', { sensitivity: 'base' })
      );
      return { cat, sinSubcat, gruposSubcat };
    });
  }, [faq, faqCategoriaOrden]);

  // Al entrar a la pantalla arranca con todas las categorías colapsadas
  // (sólo una vez, cuando `faq` ya trajo datos) -- después el usuario
  // decide cuáles abrir, sin que se vuelvan a colapsar solas.
  const colapsadoInicial = useRef(false);
  useEffect(() => {
    if (colapsadoInicial.current || categorias.length === 0) return;
    colapsadoInicial.current = true;
    setColapsadas(new Set(categorias.map(({ cat }) => cat)));
  }, [categorias]);

  // Si la pregunta seleccionada desaparece (la borró un admin en otra
  // pestaña) o todavía no hay ninguna elegida, seleccionamos la primera
  // disponible para no dejar la columna derecha vacía sin motivo.
  useEffect(() => {
    if (faq.some(f => f.id === selectedId)) return;
    setSelectedId(faq[0]?.id ?? null);
  }, [faq, selectedId]);

  const seleccionada = faq.find(f => f.id === selectedId) || null;

  const handleBorrar = async (f) => {
    if (!window.confirm(`¿Borrar la pregunta "${f.pregunta}"?`)) return;
    const imagenes = obtenerBloques(f).filter(b => b.tipo === 'imagen' && b.url);
    await Promise.all(imagenes.map(b => borrarImagenDeFirebase(b.url)));
    await removeFaq(f.id);
    showToast('Pregunta borrada.');
  };

  return (
    <div className="page active">
      <div className="page-title">Preguntas frecuentes</div>
      <div className="page-sub">Dudas comunes agrupadas por tema, con videos explicativos cuando corresponde.</div>

      {isAdmin && (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary btn-sm" onClick={() => onOpenNuevo?.()}>
            + Agregar pregunta
          </button>
          <button className="btn btn-sm" onClick={() => onOpenOrdenCategorias?.()}>
            Ordenar categorías
          </button>
        </div>
      )}

      {faq.length === 0 ? (
        <div className="card">
          <div style={{ color: 'var(--text2)', fontSize: '13px' }}>
            Todavía no hay preguntas cargadas.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px', alignItems: 'flex-start' }}>
          <div className="card" style={{ padding: '10px 0' }}>
            {categorias.map(({ cat, sinSubcat, gruposSubcat }) => {
              const abierta = !colapsadas.has(cat);
              return (
                <div key={cat}>
                  <div
                    onClick={() => toggleColapsada(cat)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      userSelect: 'none',
                      padding: '16px 20px 6px',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: 'var(--text)',
                      borderLeft: '2px solid var(--accent)'
                    }}
                  >
                    <span style={{ display: 'inline-block', transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform .15s', fontSize: '9px', color: 'var(--accent)' }}>▶</span>
                    {cat}
                  </div>
                  {abierta && (
                    <>
                      {sinSubcat.map(f => (
                        <div
                          key={f.id}
                          className={`nav-item ${selectedId === f.id ? 'active' : ''}`}
                          onClick={() => setSelectedId(f.id)}
                        >
                          {f.pregunta}
                        </div>
                      ))}
                      {gruposSubcat.map(([subcat, preguntas]) => {
                        const subcatKey = `${cat}::${subcat}`;
                        const subcatAbierta = !colapsadas.has(subcatKey);
                        return (
                          <div key={subcat}>
                            <div
                              onClick={() => toggleColapsada(subcatKey)}
                              style={{ padding: '9px 20px 3px 28px', fontSize: '10.5px', fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', userSelect: 'none' }}
                            >
                              <span style={{ display: 'inline-block', transform: subcatAbierta ? 'rotate(90deg)' : 'none', transition: 'transform .15s', fontSize: '7px' }}>▶</span>
                              {subcat}
                            </div>
                            {subcatAbierta && preguntas.map(f => (
                              <div
                                key={f.id}
                                className={`nav-item ${selectedId === f.id ? 'active' : ''}`}
                                style={{ paddingLeft: '36px', fontSize: '12.5px' }}
                                onClick={() => setSelectedId(f.id)}
                              >
                                {f.pregunta}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card">
            {seleccionada ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text)', marginBottom: '12px' }}>
                    {seleccionada.pregunta}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-sm" onClick={() => onOpenEditar?.(seleccionada.id)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleBorrar(seleccionada)}>Borrar</button>
                    </div>
                  )}
                </div>

                <div style={{ color: 'var(--text2)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {obtenerBloques(seleccionada).map((bloque, i) => {
                    if (bloque.tipo === 'texto') {
                      return <div key={i}>{renderBloqueTexto(bloque.texto)}</div>;
                    }
                    if (bloque.tipo === 'imagen') {
                      return (
                        <img
                          key={i}
                          src={bloque.url}
                          alt=""
                          style={{ maxWidth: '100%', borderRadius: 'var(--radius2)', border: '1px solid var(--border)', display: 'block' }}
                        />
                      );
                    }
                    if (bloque.tipo === 'video') {
                      const videoId = extraerYoutubeId(bloque.url);
                      if (!videoId) return null;
                      return (
                        <div key={i} style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 'var(--radius2)', overflow: 'hidden', background: 'var(--bg3)' }}>
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title={`Video - ${seleccionada.pregunta}`}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text2)', fontSize: '13px' }}>Elegí una pregunta de la lista.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
