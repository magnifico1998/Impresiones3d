import React from 'react';

// Detecta URLs sueltas dentro de un texto libre (ej. la descripción extendida
// de un producto del catálogo) y las convierte en <a> clickeables, dejando el
// resto del texto tal cual. No cambia lo que el dueño escribió, sólo envuelve
// las partes que matchean con un link. Lo usan las dos vistas del catálogo
// (lista y tienda), para que se comporten igual.
//
// Los signos de puntuación del final ("mirá https://sitio.com/a.", "(www.x.com)")
// quedan fuera del link: son parte de la oración, no de la dirección.
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s]+)/gi;
const ES_URL_REGEX = /^(?:https?:\/\/|www\.)[^\s]+$/i;
const PUNTUACION_FINAL = /[.,;:!?)\]}'"»]+$/;

export function linkificar(texto) {
  if (!texto) return texto;
  return texto.split(URL_REGEX).map((parte, i) => {
    if (!ES_URL_REGEX.test(parte)) return parte;
    const cola = parte.match(PUNTUACION_FINAL)?.[0] || '';
    const url = cola ? parte.slice(0, -cola.length) : parte;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return (
      <React.Fragment key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {url}
        </a>
        {cola}
      </React.Fragment>
    );
  });
}
