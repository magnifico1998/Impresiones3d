import React, { useState } from 'react';
import FaqPage from './FaqPage';
import CalculadoraPage from './CalculadoraPage';
import ModalPresupuestoPdf from './modals/ModalPresupuestoPdf';
import Toasts from './Toasts';

// Página de inicio pública (antes de loguearse): un resumen simple de qué
// hace Manager3D, con un único botón "Ingresar" arriba que lleva a la
// pantalla de acceso. Usa sólo las variables de la paleta (tranqui por
// defecto) y estilos propios con prefijo `inicio-`.
//
// Las "capturas" son maquetas dibujadas con HTML (no imágenes): así siguen la
// paleta, no se desactualizan con un cambio de diseño y no hace falta una
// cuenta con datos para sacarlas. Los números son sólo de ejemplo.

const Ventana = ({ titulo, children }) => (
  <div className="cap" aria-hidden="true">
    <div className="cap-barra">
      <i /><i /><i />
      <span>{titulo}</span>
    </div>
    <div className="cap-cuerpo">{children}</div>
  </div>
);

const Fila = ({ a, b, fuerte }) => (
  <div className={`cap-fila${fuerte ? ' cap-fuerte' : ''}`}><span>{a}</span><span>{b}</span></div>
);

const CapturaCalculadora = () => (
  <Ventana titulo="Calculadora">
    <div className="cap-dos">
      <div>
        <Fila a="Material" b="$1.240" />
        <Fila a="Tiempo de impresión" b="3 h 20 min" />
        <Fila a="Energía" b="$180" />
        <Fila a="Margen" b="40 %" />
        <Fila a="Precio final" b="$3.870" fuerte />
      </div>
      <div className="cap-capas">
        {[34, 52, 66, 78, 88, 78, 64, 48].map((w, i) => (
          <span key={i} style={{ width: `${w}%`, opacity: 0.35 + i * 0.08 }} />
        ))}
      </div>
    </div>
  </Ventana>
);

const CapturaPresupuestos = () => (
  <Ventana titulo="Presupuesto Nº 0042">
    <Fila a="Soporte para auriculares × 2" b="$7.400" />
    <Fila a="Llavero personalizado × 10" b="$12.000" />
    <Fila a="Envío" b="$1.800" />
    <Fila a="Total" b="$21.200" fuerte />
    <div className="cap-pie"><span className="cap-pill cap-ok">Aprobado</span><span className="cap-nota">Se convirtió en pedido</span></div>
  </Ventana>
);

const CapturaPedidos = () => (
  <Ventana titulo="Pedidos">
    <div className="cap-fila"><span>Lucía M. · Maceta geométrica</span><span className="cap-pill cap-cola">En cola</span></div>
    <div className="cap-fila"><span>Tienda Norte · 25 llaveros</span><span className="cap-pill cap-imp">Imprimiendo</span></div>
    <div className="cap-fila"><span>Martín R. · Soporte de celular</span><span className="cap-pill cap-ok">Listo</span></div>
    <div className="cap-fila"><span>Café Sur · Posavasos × 40</span><span className="cap-pill cap-ok">Entregado</span></div>
  </Ventana>
);

const CapturaStock = () => (
  <Ventana titulo="Stock">
    {[
      ['PLA blanco', 82, '#e8e6df'],
      ['PLA negro', 55, '#2b2f2c'],
      ['PETG rojo', 18, '#c8503f'],
      ['PLA verde', 40, '#4f9a62']
    ].map(([n, v, c]) => (
      <div key={n} className="cap-stock">
        <i style={{ background: c }} />
        <span>{n}</span>
        <div className="cap-prog"><b style={{ width: `${v}%`, background: v < 25 ? 'var(--warn)' : 'var(--accent)' }} /></div>
        <em>{v} %</em>
      </div>
    ))}
  </Ventana>
);

const CapturaCatalogo = () => (
  <Ventana titulo="Tu catálogo web">
    <div className="cap-prods">
      {[
        ['Maceta', '$3.200', <path key="a" d="M6 8h12l-1.5 10h-9L6 8zM5 8h14M12 8V4m0 0c-2 0-3 1.2-3 2.5M12 4c2 0 3 1.2 3 2.5" />],
        ['Llavero', '$1.200', <path key="b" d="M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9v4M9 13h6v8H9z" />],
        ['Posavasos', '$900', <path key="c" d="M12 5c4.4 0 8 1.6 8 3.5S16.4 12 12 12 4 10.4 4 8.5 7.6 5 12 5zM4 8.5v3C4 13.4 7.6 15 12 15s8-1.6 8-3.5v-3" />],
        ['Soporte', '$3.700', <path key="d" d="M7 20h10M9 20l-1-8 5-8 3 1-1 3-4 8M7 12h4" />]
      ].map(([n, p, icono]) => (
        <div key={n} className="cap-prod">
          <div className="cap-foto">
            <svg viewBox="0 0 24 24" width="76%" height="76%" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">{icono}</svg>
          </div>
          <span>{n}</span><b>{p}</b>
        </div>
      ))}
    </div>
    <div className="cap-pie"><span className="cap-pill cap-ok">Pedir por WhatsApp</span></div>
  </Ventana>
);

const CapturaFacturacion = () => (
  <Ventana titulo="Facturación">
    <Fila a="Factura C 0001-00000128" b="$21.200" />
    <Fila a="Factura C 0001-00000127" b="$7.400" />
    <Fila a="Factura C 0001-00000126" b="$12.000" />
    <Fila a="Facturado del mes" b="$40.600" fuerte />
  </Ventana>
);

const funciones = [
  {
    titulo: 'Calculadora de costos',
    texto: 'Material, tiempo de impresión, energía y margen en un solo cálculo. Importás el G-code y te completa los datos.',
    captura: <CapturaCalculadora />
  },
  {
    titulo: 'Presupuestos',
    texto: 'Armalos en minutos, mandalos al cliente y, al aprobarlos, se convierten en pedido.',
    captura: <CapturaPresupuestos />
  },
  {
    titulo: 'Pedidos y clientes',
    texto: 'Seguí cada pedido de punta a punta, con su estado, sus piezas y el historial de cada cliente.',
    captura: <CapturaPedidos />
  },
  {
    titulo: 'Stock e inventario',
    texto: 'Filamentos e insumos al día, con descuento automático según lo que imprimís.',
    captura: <CapturaStock />
  },
  {
    titulo: 'Catálogo web',
    texto: 'Un catálogo online con tu marca para compartir por WhatsApp y recibir pedidos.',
    captura: <CapturaCatalogo />
  },
  {
    titulo: 'Facturación',
    texto: 'Comprobantes y control de tus compras y ventas, sin planillas sueltas.',
    captura: <CapturaFacturacion />
  }
];

const pasos = [
  { n: '1', titulo: 'Calculás', texto: 'Cargás la pieza y ves el costo real.' },
  { n: '2', titulo: 'Presupuestás', texto: 'Se lo mandás al cliente en un toque.' },
  { n: '3', titulo: 'Producís y cobrás', texto: 'Pedido, stock y facturación en el mismo lugar.' }
];

const estilos = `
.inicio{min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--sans)}
.inicio *{box-sizing:border-box}
.inicio-wrap{max-width:1160px;margin:0 auto;padding:0 20px}
.inicio-nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.inicio-marca{display:flex;align-items:center;gap:10px;font-weight:600;font-size:16px;letter-spacing:-.2px}
.inicio-logo{width:32px;height:32px;border-radius:9px;background:var(--accentDim);display:flex;align-items:center;justify-content:center;color:var(--accent)}
.inicio-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:var(--sans);font-weight:600;font-size:14px;padding:10px 22px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;transition:background .15s,border-color .15s}
.inicio-btn:hover{background:var(--accent2);border-color:var(--accent2)}
.inicio-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.inicio-hero{text-align:center;padding:72px 0 56px}
.inicio-etiqueta{display:inline-block;font-size:12px;color:var(--accent2);background:var(--accentDim);border-radius:999px;padding:5px 12px;margin-bottom:22px}
.inicio-hero h1{font-size:clamp(30px,5.2vw,48px);line-height:1.12;font-weight:600;letter-spacing:-1.2px;max-width:700px;margin:0 auto 18px}
.inicio-hero p{font-size:clamp(15px,2vw,17px);line-height:1.6;color:var(--text2);max-width:560px;margin:0 auto}
.inicio-nota{margin-top:18px!important;font-size:13px!important;color:var(--text3)!important}
.inicio-seccion{padding:48px 0;border-top:1px solid var(--border)}
.inicio-seccion h2{font-size:clamp(22px,3.2vw,28px);font-weight:600;letter-spacing:-.6px;text-align:center;margin-bottom:8px}
.inicio-sub{text-align:center;color:var(--text2);font-size:15px;max-width:520px;margin:0 auto 32px;line-height:1.55}
.inicio-grilla{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.inicio-tarjeta{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);padding:20px;display:flex;flex-direction:column;gap:16px}
.inicio-tarjeta h3{font-size:16px;font-weight:600;margin-bottom:4px}
.inicio-tarjeta p{font-size:14px;line-height:1.55;color:var(--text2)}
.inicio-pasos{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.inicio-paso{text-align:center;padding:6px 12px}
.inicio-num{width:34px;height:34px;border-radius:50%;border:1px solid var(--accent);color:var(--accent2);font-weight:600;font-size:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px}
.inicio-paso h3{font-size:15px;font-weight:600;margin-bottom:4px}
.inicio-paso p{font-size:14px;color:var(--text2);line-height:1.5}
.inicio-pie{padding:20px 0 32px;text-align:center;font-size:12px;color:var(--text3);border-top:1px solid var(--border)}
.inicio-faq,.inicio-calc{text-align:left}
.inicio-faq .page{display:block}

/* Capturas (maquetas) */
.cap{background:var(--bg);border:1px solid var(--border2);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(19,39,28,.04),0 6px 18px rgba(19,39,28,.06);font-size:12.5px;user-select:none;pointer-events:none}
.cap-barra{display:flex;align-items:center;gap:5px;padding:8px 12px;background:var(--bg3);border-bottom:1px solid var(--border)}
.cap-barra i{width:8px;height:8px;border-radius:50%;background:var(--border2)}
.cap-barra span{margin-left:8px;font-size:11.5px;color:var(--text3);font-weight:500}
.cap-cuerpo{padding:12px 14px;min-height:178px;display:flex;flex-direction:column;justify-content:center}
.cap-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);color:var(--text2)}
.cap-fila:last-child{border-bottom:0}
.cap-fila>span:last-child{color:var(--text);font-weight:500;white-space:nowrap}
.cap-fuerte{color:var(--text)!important;font-weight:600}
.cap-fuerte>span:last-child{color:var(--accent2)!important;font-size:14px}
.cap-dos{display:grid;grid-template-columns:1.5fr 1fr;gap:14px;align-items:center}
.cap-capas{display:flex;flex-direction:column-reverse;align-items:center;gap:3px;padding:6px}
.cap-capas span{height:7px;border-radius:3px;background:var(--accent)}
.cap-pill{font-size:11px;font-weight:600;border-radius:999px;padding:3px 10px;white-space:nowrap}
.cap-ok{background:var(--accentDim);color:var(--accent2)}
.cap-cola{background:var(--bg3);color:var(--text2)}
.cap-imp{background:var(--infoDim);color:var(--info)}
.cap-pie{display:flex;align-items:center;gap:10px;margin-top:10px}
.cap-nota{font-size:11.5px;color:var(--text3)}
.cap-stock{display:grid;grid-template-columns:12px 84px 1fr 36px;align-items:center;gap:10px;padding:7px 0;color:var(--text2)}
.cap-stock i{width:12px;height:12px;border-radius:50%;border:1px solid var(--border2)}
.cap-stock em{font-style:normal;text-align:right;color:var(--text);font-weight:500}
.cap-prog{height:6px;border-radius:99px;background:var(--bg3);overflow:hidden}
.cap-prog b{display:block;height:100%;border-radius:99px}
.cap-prods{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.cap-prod{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--text2)}
.cap-prod b{color:var(--text);font-weight:600}
.cap-foto{aspect-ratio:1;border-radius:8px;background:var(--accentDim2);border:1px solid var(--border);color:var(--accent);display:flex;align-items:center;justify-content:center}

@media (max-width:760px){
  .inicio-grilla,.inicio-pasos{grid-template-columns:1fr}
  .inicio-hero{padding:48px 0 40px}
}
`;

export default function PaginaInicio({ onIngresar }) {
  const [pdfAbierto, setPdfAbierto] = useState(false);

  return (
    <div className="inicio">
      <style dangerouslySetInnerHTML={{ __html: estilos }} />
      <div className="inicio-wrap">
        <header className="inicio-nav">
          <div className="inicio-marca">
            <span className="inicio-logo">
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <polygon points="10,2 18,6 18,14 10,18 2,14 2,6" />
                <polygon points="10,6 14,8 14,12 10,14 6,12 6,8" />
              </svg>
            </span>
            Manager3D
          </div>
          <button type="button" className="inicio-btn" onClick={onIngresar}>Ingresar</button>
        </header>

        <section className="inicio-hero">
          <span className="inicio-etiqueta">Para emprendimientos de impresión 3D</span>
          <h1>Todo tu emprendimiento 3D, en un solo lugar</h1>
          <p>
            Calculá costos, armá presupuestos, seguí tus pedidos y llevá el stock y la facturación sin planillas ni vueltas.
          </p>
          <p className="inicio-nota">Gratis para siempre con el plan Boceto · 7 días con todas las funciones · Sin tarjeta</p>
        </section>

        <section className="inicio-seccion" aria-labelledby="inicio-funciones">
          <h2 id="inicio-funciones">Lo que podés hacer</h2>
          <p className="inicio-sub">Las herramientas del día a día, pensadas para quien imprime y vende.</p>
          <div className="inicio-grilla">
            {funciones.map((f) => (
              <article key={f.titulo} className="inicio-tarjeta">
                {f.captura}
                <div>
                  <h3>{f.titulo}</h3>
                  <p>{f.texto}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="inicio-seccion" aria-labelledby="inicio-calc">
          <h2 id="inicio-calc">Probá la calculadora</h2>
          <p className="inicio-sub">
            Completá los datos a mano (o importá un G-code para ver la vista previa 3D) y descargá el presupuesto en PDF. No hace falta cuenta.
          </p>
          <div className="inicio-calc">
            <CalculadoraPage publico onOpenPresupuesto={() => setPdfAbierto(true)} />
          </div>
        </section>

        <section className="inicio-seccion" aria-labelledby="inicio-como">
          <h2 id="inicio-como">Cómo funciona</h2>
          <p className="inicio-sub">Del cálculo al cobro, un camino corto.</p>
          <div className="inicio-pasos">
            {pasos.map((p) => (
              <div key={p.n} className="inicio-paso">
                <span className="inicio-num">{p.n}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="inicio-seccion" aria-labelledby="inicio-faq">
          <h2 id="inicio-faq">Preguntas frecuentes</h2>
          <p className="inicio-sub">Dudas comunes, con guías paso a paso.</p>
          <div className="inicio-faq">
            <FaqPage publico />
          </div>
        </section>

        <footer className="inicio-pie">Manager3D · Todo para emprender en 3D</footer>
      </div>

      <ModalPresupuestoPdf
        isOpen={pdfAbierto}
        onClose={() => setPdfAbierto(false)}
        calculo={window._currentPresupuesto || null}
      />
      <Toasts />
    </div>
  );
}
