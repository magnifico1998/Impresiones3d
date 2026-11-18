import React, { useEffect, useRef, useState } from 'react';
import { usePreferenciasUi } from '../context/preferenciasUi';
import { agruparContiguas, alternarOculta, combinarLayout, moverSeccion } from '../utils/layoutPantalla';

// Dibuja las secciones de una pantalla en el orden que eligió la persona y deja
// que las acomode con "Personalizar pantalla": subir, bajar u ocultar cada una.
// Lo elegido se guarda en su cuenta (context/preferenciasUi.js) y llega solo a sus
// otros dispositivos.
//
//   pantalla:    clave de la pantalla en las preferencias ('calculadora', 'resumen'…).
//   secciones:   [{ id, titulo, nodo, fija?, grupo? }] en su orden por defecto.
//                  fija:  se puede mover pero no ocultar (alimenta un cálculo o tiene
//                         datos obligatorios).
//                  grupo: las contiguas con el mismo grupo se dibujan juntas dentro de un
//                         contenedor (por ejemplo, tres tarjetas en columnas).
//   grupos:      { [grupo]: className del contenedor }.
//   encabezado:  lo de arriba que no se mueve (título de la pantalla). El botón
//                "Personalizar pantalla" queda a su derecha.
//
// Mientras la persona está personalizando, los cambios que lleguen de otro
// dispositivo no le cambian nada por debajo; se guardan al terminar.
export default function SeccionesPersonalizables({ pantalla, secciones, grupos = {}, encabezado = null }) {
  const { layoutDe, guardarLayout } = usePreferenciasUi();
  const ids = secciones.map((s) => s.id);
  const fijas = secciones.filter((s) => s.fija).map((s) => s.id);
  const guardado = layoutDe(pantalla);

  const base = combinarLayout(ids, guardado, fijas);

  const [borrador, setBorrador] = useState(null); // null = no está personalizando
  const pendiente = useRef(null);                 // { temporizador, layout } del guardado con retraso
  const editando = borrador !== null;
  const layout = borrador || base;

  const volcar = () => {
    if (!pendiente.current) return;
    clearTimeout(pendiente.current.temporizador);
    guardarLayout(pantalla, pendiente.current.layout);
    pendiente.current = null;
  };

  // Cada clic se ve enseguida; al servidor viaja una sola vez cuando la persona se detiene.
  const cambiar = (nuevo) => {
    setBorrador(nuevo);
    if (pendiente.current) clearTimeout(pendiente.current.temporizador);
    pendiente.current = { layout: nuevo, temporizador: setTimeout(volcar, 600) };
  };

  const terminar = () => {
    volcar();
    setBorrador(null);
  };

  // Si la pantalla se cierra con un cambio todavía sin guardar, se guarda igual.
  useEffect(() => () => {
    if (pendiente.current) {
      clearTimeout(pendiente.current.temporizador);
      guardarLayout(pantalla, pendiente.current.layout);
      pendiente.current = null;
    }
  }, [pantalla, guardarLayout]);

  const porId = Object.fromEntries(secciones.map((s) => [s.id, s]));
  const visibles = layout.orden.filter((id) => !layout.ocultas.includes(id)).map((id) => porId[id]);
  const ocultas = layout.ocultas.map((id) => porId[id]).filter(Boolean);

  const mover = (id, delta) => cambiar({ ...layout, orden: moverSeccion(layout.orden, layout.ocultas, id, delta) });
  const alternar = (id) => cambiar({ ...layout, ocultas: alternarOculta(layout.ocultas, id, fijas) });
  const restaurar = () => cambiar({ orden: ids, ocultas: [] });

  const barra = (s) => {
    const i = visibles.findIndex((v) => v.id === s.id);
    return (
      <div className="seccion-barra">
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.titulo}</strong>
        <button type="button" className="btn btn-sm" disabled={i <= 0} onClick={() => mover(s.id, -1)} aria-label={`Subir ${s.titulo}`} title="Mover antes">↑</button>
        <button type="button" className="btn btn-sm" disabled={i === visibles.length - 1} onClick={() => mover(s.id, 1)} aria-label={`Bajar ${s.titulo}`} title="Mover después">↓</button>
        {s.fija ? (
          <span style={{ fontSize: '11px', color: 'var(--text3)' }} title="Esta sección alimenta el cálculo o tiene datos obligatorios: se puede mover pero no ocultar">necesaria</span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => alternar(s.id)} aria-label={`Ocultar ${s.titulo}`}>Ocultar</button>
        )}
      </div>
    );
  };

  // El contenedor existe siempre (así al entrar o salir de la personalización no se vuelve a montar la
  // sección ni pierde su estado) y sin personalizar es transparente: no cambia el diseño de la pantalla.
  const dibujar = (s) => (
    <div key={s.id} className={editando ? 'seccion-editable' : undefined} style={editando ? undefined : { display: 'contents' }}>
      {editando && barra(s)}
      {s.nodo}
    </div>
  );

  const bloques = agruparContiguas(visibles);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>{encabezado}</div>
        {!editando && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setBorrador(base)} title="Acomodá las secciones de esta pantalla a tu gusto">
            ⚙ Personalizar pantalla
          </button>
        )}
      </div>

      {editando && (
        <div className="seccion-panel">
          <div style={{ fontSize: '13px', flex: '1 1 260px' }}>
            <strong>Personalizando esta pantalla.</strong> Subí, bajá u ocultá cada sección. Se guarda en tu cuenta y se ve igual en tus otros dispositivos.
          </div>
          <button type="button" className="btn btn-sm" onClick={restaurar}>Restaurar orden original</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={terminar}>Listo</button>
          {ocultas.length > 0 && (
            <div style={{ flex: '1 1 100%', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
              <span style={{ color: 'var(--text3)' }}>Ocultas:</span>
              {ocultas.map((s) => (
                <button key={s.id} type="button" className="btn btn-sm" onClick={() => alternar(s.id)} title="Volver a mostrar">+ {s.titulo}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {bloques.map((b, i) => (b.grupo && grupos[b.grupo]
        ? <div key={`g${i}`} className={grupos[b.grupo]}>{b.secciones.map(dibujar)}</div>
        : b.secciones.map(dibujar)))}
    </>
  );
}
