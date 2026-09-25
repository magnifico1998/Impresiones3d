import React, { useCallback, useEffect, useRef, useState } from 'react';

// Diálogos propios (confirmar / avisar / pedir texto) en lugar de los
// window.confirm/alert/prompt nativos del navegador, que se ven genéricos y
// fuera de tono con la app. Se llaman como funciones que devuelven una
// promesa, desde cualquier lado (componentes, AppContext, utils):
//
//   if (!(await confirmar('¿Eliminar esta compra?', { peligro: true }))) return;
//   await avisar('No se pudo enviar el pedido.');
//   const email = await pedirTexto('Confirmá tu email', { tipoInput: 'email' });
//
// <Dialogos /> tiene que estar montado una vez donde se quiera verlos (ver
// main.jsx para la app y CatalogoPublico.jsx para el catálogo, que lo monta
// adentro de su contenedor para tomar la paleta de colores de la tienda).
// Si llegan varios a la vez se muestran de a uno, en orden.

const pendientes = [];
let mostrarSiguienteMontado = null;

function abrir(opciones) {
  return new Promise((resolve) => {
    // Sin <Dialogos /> montado no hay dónde mostrarlo: mejor el nativo que
    // una promesa que nunca se resuelve y deja la acción colgada.
    if (!mostrarSiguienteMontado) {
      if (opciones.tipo === 'confirmar') resolve(window.confirm(opciones.mensaje));
      else if (opciones.tipo === 'texto') resolve(window.prompt(opciones.mensaje, opciones.valorInicial || ''));
      else resolve(window.alert(opciones.mensaje));
      return;
    }
    pendientes.push({ ...opciones, resolve });
    mostrarSiguienteMontado();
  });
}

// opciones: { titulo, textoConfirmar, textoCancelar, peligro }
export const confirmar = (mensaje, opciones = {}) => abrir({ tipo: 'confirmar', mensaje, ...opciones });
// opciones: { titulo, textoConfirmar }
export const avisar = (mensaje, opciones = {}) => abrir({ tipo: 'avisar', mensaje, ...opciones });
// opciones: { titulo, valorInicial, placeholder, tipoInput, soloLectura, textoConfirmar }
// Devuelve el texto ingresado, o null si se cancela.
export const pedirTexto = (mensaje, opciones = {}) => abrir({ tipo: 'texto', mensaje, ...opciones });

const ESTILO_BOTON_PELIGRO = { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' };

export default function Dialogos() {
  const [actual, setActual] = useState(null);
  const [texto, setTexto] = useState('');
  // El diálogo abierto vive también en un ref: la cola se consume fuera de
  // los updaters de estado (StrictMode los ejecuta dos veces).
  const actualRef = useRef(null);
  const inputRef = useRef(null);

  const mostrarSiguiente = useCallback(() => {
    if (actualRef.current || pendientes.length === 0) return;
    actualRef.current = pendientes.shift();
    setTexto(actualRef.current.valorInicial || '');
    setActual(actualRef.current);
  }, []);

  useEffect(() => {
    mostrarSiguienteMontado = mostrarSiguiente;
    mostrarSiguiente();
    return () => {
      if (mostrarSiguienteMontado === mostrarSiguiente) mostrarSiguienteMontado = null;
    };
  }, [mostrarSiguiente]);

  const cerrar = useCallback((valor) => {
    const dialogo = actualRef.current;
    if (!dialogo) return;
    actualRef.current = null;
    setActual(null);
    dialogo.resolve(valor);
    mostrarSiguiente();
  }, [mostrarSiguiente]);

  const aceptar = useCallback(() => {
    const tipo = actualRef.current?.tipo;
    cerrar(tipo === 'confirmar' ? true : tipo === 'texto' ? texto : undefined);
  }, [cerrar, texto]);

  const cancelar = useCallback(() => {
    const tipo = actualRef.current?.tipo;
    cerrar(tipo === 'confirmar' ? false : tipo === 'texto' ? null : undefined);
  }, [cerrar]);

  useEffect(() => {
    if (!actual) return;
    if (actual.tipo === 'texto' && inputRef.current) {
      inputRef.current.focus();
      if (actual.soloLectura) inputRef.current.select();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
      // En el texto de sólo lectura (varias líneas) Enter no cierra.
      else if (e.key === 'Enter' && !(actual.tipo === 'texto' && actual.soloLectura)) { e.preventDefault(); aceptar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actual, aceptar, cancelar]);

  if (!actual) return null;

  const { tipo, titulo, mensaje, peligro, soloLectura } = actual;
  const textoConfirmar = actual.textoConfirmar || (tipo === 'avisar' || soloLectura ? 'Entendido' : 'Aceptar');
  const textoCancelar = actual.textoCancelar || 'Cancelar';

  return (
    <div className="modal-overlay open" style={{ zIndex: 1000, paddingTop: '18vh' }} onClick={cancelar}>
      <div className="modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {titulo && <div className="modal-title" style={{ marginBottom: '10px' }}>{titulo}</div>}
        <div style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{mensaje}</div>

        {tipo === 'texto' && (soloLectura ? (
          <textarea
            ref={inputRef}
            value={texto}
            readOnly
            rows={6}
            style={{ width: '100%', marginTop: '12px', fontSize: '12px', fontFamily: 'var(--mono)' }}
          />
        ) : (
          <input
            ref={inputRef}
            type={actual.tipoInput || 'text'}
            value={texto}
            placeholder={actual.placeholder || ''}
            onChange={(e) => setTexto(e.target.value)}
            style={{ width: '100%', marginTop: '12px' }}
          />
        ))}

        <div className="modal-footer">
          {tipo !== 'avisar' && !soloLectura && (
            <button className="btn" onClick={cancelar}>{textoCancelar}</button>
          )}
          <button
            className="btn btn-primary"
            style={peligro ? ESTILO_BOTON_PELIGRO : undefined}
            onClick={aceptar}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
