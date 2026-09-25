import React, { useMemo, useState, useEffect, useRef } from 'react';
import { confirmar } from './Dialogos';
import { useApp } from '../context/AppContext';
import { obtenerBloques } from '../utils/faqBloques';
import { borrarImagenDeFirebase } from '../utils/imageCompress';
import { rutaDeFaq, compararSegmentosCategoria } from '../utils/faqCategoriaPath';

// Separador de la clave de "colapsadas" -- une los segmentos de la ruta de
// un nodo del árbol. No puede aparecer en un nombre de categoría escrito a
// mano, así que no hay riesgo de colisión entre nodos de distinta ruta.
const SEP_RUTA = '␟';

// Arma el árbol de categorías a partir de la ruta de cada pregunta (ver
// rutaDeFaq): cada nodo tiene sus propias preguntas (las que terminan
// exactamente en ese nivel) y sus hijos (niveles más profundos). Una
// pregunta con ruta de 1 solo segmento y otra con ruta de 3 segmentos que
// comparte el primero conviven en el mismo árbol sin problema.
function construirArbolFaq(faq) {
  const raiz = { nombre: null, rutaCompleta: [], preguntas: [], hijos: new Map() };
  [...faq]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .forEach(item => {
      let nodo = raiz;
      rutaDeFaq(item).forEach(segmento => {
        if (!nodo.hijos.has(segmento)) {
          nodo.hijos.set(segmento, { nombre: segmento, rutaCompleta: nodo.rutaCompleta.concat(segmento), preguntas: [], hijos: new Map() });
        }
        nodo = nodo.hijos.get(segmento);
      });
      nodo.preguntas.push(item);
    });
  return raiz;
}

function hijosOrdenados(nodo) {
  return Array.from(nodo.hijos.values()).sort((a, b) => compararSegmentosCategoria(a.nombre, b.nombre));
}

// Primera pregunta del árbol en profundidad (propia del nodo si tiene, si
// no la del primer hijo ordenado) -- usada para preseleccionar algo al
// entrar a la pantalla.
function primeraPreguntaDe(nodo) {
  if (nodo.preguntas[0]) return nodo.preguntas[0];
  for (const hijo of hijosOrdenados(nodo)) {
    const encontrada = primeraPreguntaDe(hijo);
    if (encontrada) return encontrada;
  }
  return null;
}

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

export default function FaqPage({ onOpenNuevo, onOpenEditar }) {
  const { faq, isAdmin, removeFaq, showToast } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  // Categorías colapsadas: sólo estado local de la pantalla (no se
  // persiste) -- es una comodidad de navegación, no contenido que un admin
  // necesite definir para los demás. Clave = ruta completa del nodo unida
  // con SEP_RUTA, así funciona para cualquier profundidad.
  const [colapsadas, setColapsadas] = useState(() => new Set());

  const toggleColapsada = (rutaCompleta) => {
    const key = rutaCompleta.join(SEP_RUTA);
    setColapsadas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Árbol de categorías de profundidad libre -- ver construirArbolFaq. El
  // orden de hermanos en cada nivel es siempre alfanumérico (no hay más
  // orden manual: quien necesite forzar un orden antepone un número al
  // nombre, ej. "1. Pedidos").
  const raiz = useMemo(() => construirArbolFaq(faq), [faq]);
  const nivel1 = useMemo(() => hijosOrdenados(raiz), [raiz]);

  // Al entrar a la pantalla arranca con el primer nodo de nivel 1 abierto
  // (para que se vea contenido de entrada) y el resto colapsado -- sólo una
  // vez, cuando `faq` ya trajo datos; después el usuario decide qué abrir o
  // cerrar, sin que se vuelvan a colapsar solas.
  const colapsadoInicial = useRef(false);
  useEffect(() => {
    if (colapsadoInicial.current || nivel1.length === 0) return;
    colapsadoInicial.current = true;
    setColapsadas(new Set(nivel1.slice(1).map(n => n.rutaCompleta.join(SEP_RUTA))));
  }, [nivel1]);

  // Si la pregunta seleccionada desaparece (la borró un admin en otra
  // pestaña) o todavía no hay ninguna elegida, seleccionamos la primera
  // pregunta del primer nodo de nivel 1 (el que queda abierto de entrada)
  // para que lo resaltado en la lista coincida con lo que se ve a la derecha.
  useEffect(() => {
    if (faq.some(f => f.id === selectedId)) return;
    const primeraPregunta = nivel1[0] ? primeraPreguntaDe(nivel1[0]) : null;
    setSelectedId(primeraPregunta?.id ?? faq[0]?.id ?? null);
  }, [faq, selectedId, nivel1]);

  const seleccionada = faq.find(f => f.id === selectedId) || null;

  const handleBorrar = async (f) => {
    if (!(await confirmar(`"${f.pregunta}"`, { titulo: '¿Borrar esta pregunta?', textoConfirmar: 'Borrar', peligro: true }))) return;
    const imagenes = obtenerBloques(f).filter(b => b.tipo === 'imagen' && b.url);
    await Promise.all(imagenes.map(b => borrarImagenDeFirebase(b.url)));
    await removeFaq(f.id);
    showToast('Pregunta borrada.');
  };

  // Render recursivo de un nodo del árbol de categorías (ver
  // construirArbolFaq): profundidad 1 = categoría de primer nivel, mismo
  // estilo visual que antes; profundidad 2+ generaliza el estilo que antes
  // era exclusivo de "subcategoría", con más sangría por cada nivel extra.
  const renderNodo = (nodo, profundidad) => {
    const key = nodo.rutaCompleta.join(SEP_RUTA);
    const abierta = !colapsadas.has(key);
    const esNivel1 = profundidad === 1;

    return (
      <div key={key}>
        <div
          onClick={() => toggleColapsada(nodo.rutaCompleta)}
          style={esNivel1 ? {
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', userSelect: 'none',
            padding: '16px 20px 6px', fontSize: '13.5px', fontWeight: 700, color: 'var(--text)',
            borderLeft: '2px solid var(--accent)'
          } : {
            padding: `9px 20px 3px ${12 + profundidad * 8}px`, fontSize: '10.5px', fontWeight: 600,
            color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.5px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '5px', userSelect: 'none'
          }}
        >
          <span style={{
            display: 'inline-block', transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform .15s',
            fontSize: esNivel1 ? '9px' : '7px', color: esNivel1 ? 'var(--accent)' : undefined
          }}>▶</span>
          {nodo.nombre}
        </div>
        {abierta && (
          <>
            {nodo.preguntas.map(f => (
              <div
                key={f.id}
                className={`nav-item ${selectedId === f.id ? 'active' : ''}`}
                style={esNivel1 ? undefined : { paddingLeft: `${20 + profundidad * 8}px`, fontSize: '12.5px' }}
                onClick={() => setSelectedId(f.id)}
              >
                {f.pregunta}
              </div>
            ))}
            {hijosOrdenados(nodo).map(hijo => renderNodo(hijo, profundidad + 1))}
          </>
        )}
      </div>
    );
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
            {nivel1.map(nodo => renderNodo(nodo, 1))}
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
