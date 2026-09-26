import React, { useRef, useState } from 'react';
import { confirmar } from './Dialogos';
import { useApp } from '../context/AppContext';
import { comprimirImagen, subirImagenAFirebase } from '../utils/imageCompress';
import { paisesList, PAIS_DEFAULT } from '../utils/paises';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import ModalSuscribirse from './modals/ModalSuscribirse';
import { sincronizarPagoMP } from '../utils/pagosMP';

// Texto del estado del débito automático de Mercado Pago
// (suscripcion.cobro.estado, lo mantiene el webhook).
function textoDebito(suscripcion) {
  const estado = suscripcion?.cobro?.estado;
  if (estado === 'authorized') return '💳 Débito automático mensual activo con Mercado Pago.';
  if (estado === 'paused') return 'Tu débito automático está pausado en Mercado Pago.';
  if (estado === 'cancelled' && suscripcion.estado === 'activa') return 'Débito automático cancelado: tu plan sigue activo hasta el fin del ciclo ya pago.';
  return 'Sin débito automático.';
}

// Nota: esto es el precio del PLAN de Manager3D (lo que le pagás a
// Manager3D), no un monto del negocio del usuario -- se muestra siempre
// en pesos argentinos independientemente del país elegido más abajo (ver
// selector de país), igual que el panel de AdminPage.
const fmtMoneda = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

// Barra de consumo de un ítem del plan. limite === null/undefined significa
// "sin límite" -- se muestra sin barra, sólo el número usado.
function BarraConsumo({ etiqueta, usado, limite, formatear = (n) => n.toLocaleString('es-AR') }) {
  const sinLimite = limite === null || limite === undefined;
  const pct = sinLimite ? 0 : Math.min(100, (Number(usado) / Math.max(1, Number(limite))) * 100);
  const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--accent)';

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
        <span style={{ color: 'var(--text2)' }}>{etiqueta}</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>
          {formatear(usado || 0)} {sinLimite ? '' : `/ ${formatear(limite)}`}
        </span>
      </div>
      {!sinLimite && (
        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px' }} />
        </div>
      )}
    </div>
  );
}

export default function EmpresaPage() {
  const {
    empresa, setEmpresa, showToast, cuentaId, esMiembro, miembros,
    agregarMiembro, quitarMiembro, salirDeCuentaCompartida, suscripcion, planContratado, consumoActual, biblioteca,
    guardarCatalogoConfig
  } = useApp();
  const fileInputRef = useRef(null);

  const [emailNuevo, setEmailNuevo] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [quitandoEmail, setQuitandoEmail] = useState(null);
  const [modalSuscribirseOpen, setModalSuscribirseOpen] = useState(false);
  const [cancelandoDebito, setCancelandoDebito] = useState(false);
  const [verificandoPago, setVerificandoPago] = useState(false);
  const debitoActivo = suscripcion?.cobro?.estado === 'authorized';

  const handleVerificarPago = async () => {
    setVerificandoPago(true);
    try {
      const { mensaje, tipo } = await sincronizarPagoMP();
      showToast(mensaje, tipo);
    } catch (e) {
      console.error('Error al verificar el pago con Mercado Pago:', e);
      showToast(e?.message || 'No se pudo verificar el pago.', 'error');
    } finally {
      setVerificandoPago(false);
    }
  };

  const handleCancelarDebito = async () => {
    if (!(await confirmar('Tu plan sigue activo hasta el fin del ciclo ya pago y después pasa a modo lectura.', {
      titulo: '¿Cancelar el débito automático?',
      textoConfirmar: 'Cancelar débito',
      textoCancelar: 'Volver',
      peligro: true
    }))) return;
    setCancelandoDebito(true);
    try {
      await httpsCallable(functions, 'cancelarSuscripcionMP')();
      showToast('Débito automático cancelado.');
    } catch (e) {
      console.error('Error al cancelar el débito automático:', e);
      showToast(e?.message || 'No se pudo cancelar el débito automático.', 'error');
    } finally {
      setCancelandoDebito(false);
    }
  };

  // Las invitaciones pendientes (todavía no aceptadas por el invitado)
  // también ocupan un lugar del plan: si no, se podría invitar a más gente
  // que el límite y que acepten todas después.
  const miembrosActivos = miembros.filter(m => m.estado === 'activo' || m.estado === 'pendiente');
  const limiteUsuarios = planContratado?.limites?.usuarios ?? null;
  const enLimite = limiteUsuarios !== null && (1 + miembrosActivos.length) >= limiteUsuarios;

  const handleAgregarMiembro = async () => {
    const email = emailNuevo.trim();
    if (!email) return;
    setAgregando(true);
    const ok = await agregarMiembro(email);
    setAgregando(false);
    if (ok) setEmailNuevo('');
  };

  const handleQuitarMiembro = async (email) => {
    if (!(await confirmar(`${email} deja de poder entrar a tu cuenta.`, { titulo: '¿Quitar el acceso?', textoConfirmar: 'Quitar acceso', peligro: true }))) return;
    setQuitandoEmail(email);
    await quitarMiembro(email);
    setQuitandoEmail(null);
  };

  const handleChange = (e) => {
    const { id, value } = e.target;
    setEmpresa(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // El país determina moneda y formato de teléfono en toda la app (ver
  // src/utils/paises.js). Se espeja también en catalogoTiendas/{uid} para
  // que el catálogo público (sin sesión) pueda formatear precios y
  // validar el teléfono del cliente sin depender del contexto de la
  // cuenta logueada.
  const handlePaisChange = (e) => {
    const pais = e.target.value;
    setEmpresa(prev => ({ ...prev, pais }));
    guardarCatalogoConfig({ pais });
  };

  const [subiendoLogo, setSubiendoLogo] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSubiendoLogo(true);
    try {
      const { dataUrl, bytes, originalBytes } = await comprimirImagen(file, {
        maxWidth: 300,
        maxHeight: 300,
        maxBytes: 80 * 1024
      });

      const logoUrl = await subirImagenAFirebase(dataUrl, {
        userId: cuentaId,
        fileName: `logo-${empresa.nombre || 'empresa'}.jpg`
      });

      setEmpresa(prev => ({
        ...prev,
        logo: logoUrl
      }));

      const reduccion = originalBytes > 0 ? Math.round((1 - bytes / originalBytes) * 100) : 0;
      showToast(
        reduccion > 0
          ? `Logo subido y optimizado (${(bytes / 1024).toFixed(0)}KB, -${reduccion}%)`
          : 'Logo subido con éxito'
      );
    } catch (err) {
      showToast(err.message || 'No se pudo procesar el logo.', 'error');
    } finally {
      setSubiendoLogo(false);
      if (e.target) e.target.value = '';
    }
  };

  // A propósito NO se borra el archivo de Storage acá: empresa.logo se
  // persiste por autosave con debounce (y se espeja al catálogo público),
  // así que si borráramos el archivo ya mismo y ese guardado fallara o no
  // llegara a correr, el perfil y el catálogo quedarían apuntando a una
  // imagen inexistente. El archivo huérfano queda en Storage, igual que
  // ya pasa al REEMPLAZAR el logo por uno nuevo (el anterior nunca se
  // borró) — son archivos de ~80KB, no vale el riesgo.
  const handleRemoveLogo = () => {
    setEmpresa(prev => ({
      ...prev,
      logo: ''
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('Logo removido', 'info');
  };

  return (
    <div className="page active">
      <div className="page-title">Mi emprendimiento</div>

      <div className="grid2" style={{ alignItems: 'flex-start' }}>
        <div>
          {/* Logo upload card */}
          <div className="card">
            <div className="card-title">Logo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div 
                id="emp-logo-preview" 
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '10px',
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
              >
                {empresa.logo ? (
                  <img src={empresa.logo} alt="Logo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="1.5" style={{ width: '28px', height: '28px' }}>
                    <polygon points="10,2 18,6 18,14 10,18 2,14 2,6" />
                    <polygon points="10,6 14,8 14,12 10,14 6,12 6,8" />
                  </svg>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-sm" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={subiendoLogo}
                >
                  {subiendoLogo ? 'Optimizando...' : 'Subir logo'}
                </button>
                {empresa.logo && (
                  <button className="btn btn-danger btn-sm" onClick={handleRemoveLogo}>Quitar</button>
                )}
              </div>
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={handleLogoUpload} 
              />
            </div>
          </div>

          {/* General business profile metadata card */}
          <div className="card">
            <div className="card-title">Datos generales</div>
            
            <label className="fl" style={{ marginTop: 0 }}>Nombre completo / del emprendimiento</label>
            <input 
              type="text" 
              id="nombre" 
              value={empresa.nombre || ''} 
              placeholder="Ej: Juan Pérez 3D Prints" 
              onChange={handleChange} 
            />
            
            <label className="fl">CUIT</label>
            <input 
              type="text" 
              id="cuit" 
              value={empresa.cuit || ''} 
              placeholder="Ej: 20-12345678-9" 
              onChange={handleChange} 
            />
            
            <label className="fl">Dirección</label>
            <input 
              type="text" 
              id="direccion" 
              value={empresa.direccion || ''} 
              placeholder="Ej: Av. Siempre Viva 742" 
              onChange={handleChange} 
            />
            
            <label className="fl">Código postal</label>
            <input
              type="text"
              id="cp"
              value={empresa.cp || ''}
              placeholder="Ej: X5000"
              onChange={handleChange}
            />

            <label className="fl">País del emprendimiento</label>
            <select id="pais" value={empresa.pais || PAIS_DEFAULT} onChange={handlePaisChange}>
              {paisesList.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              Define la moneda de los precios y el formato de teléfono en toda la app.
            </div>
          </div>
        </div>

        {/* Contact info card */}
        <div>
          <div className="card">
            <div className="card-title">Contacto</div>
            
            <label className="fl" style={{ marginTop: 0 }}>Dirección de mail</label>
            <input 
              type="email" 
              id="email" 
              value={empresa.email || ''} 
              placeholder="Ej: contacto@miemprendimiento.com" 
              onChange={handleChange} 
            />
            
            <label className="fl">Teléfono</label>
            <input 
              type="text" 
              id="telefono" 
              value={empresa.telefono || ''} 
              placeholder="Ej: +54 9 351 1234567" 
              onChange={handleChange} 
            />
            
            <label className="fl">Facebook</label>
            <input 
              type="text" 
              id="facebook" 
              value={empresa.facebook || ''} 
              placeholder="Ej: facebook.com/miemprendimiento" 
              onChange={handleChange} 
            />
            
            <label className="fl">Instagram</label>
            <input 
              type="text" 
              id="instagram" 
              value={empresa.instagram || ''} 
              placeholder="Ej: @miemprendimiento" 
              onChange={handleChange} 
            />
          </div>
        </div>
      </div>

      {/* ---- Plan contratado y consumo del ciclo actual ---- */}
      <div className="card">
        <div className="card-title">Tu plan y consumo</div>

        {!suscripcion && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>No se pudo cargar la información de tu suscripción.</div>
        )}

        {suscripcion?.estado === 'trial' && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            Estás en versión de prueba — todavía no tenés un plan contratado.
          </div>
        )}

        {suscripcion && suscripcion.estado !== 'trial' && !planContratado && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Todavía no tenés un plan asignado.</div>
        )}

        {planContratado && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{planContratado.nombre}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{fmtMoneda(planContratado.precioMensual)}/mes</div>
            </div>

            <BarraConsumo
              etiqueta="Pedidos este ciclo"
              usado={consumoActual?.pedidosCreados}
              limite={planContratado.limites?.pedidosMes}
            />
            <BarraConsumo
              etiqueta="Aperturas del catálogo web"
              usado={consumoActual?.aperturasCatalogo}
              limite={planContratado.limites?.aperturasCatalogoMes}
            />
            <BarraConsumo
              etiqueta="Monto facturado este ciclo"
              usado={consumoActual?.montoFacturado}
              limite={planContratado.limites?.montoFacturadoMes}
              formatear={fmtMoneda}
            />
            <BarraConsumo
              etiqueta="Usuarios"
              usado={1 + miembrosActivos.length}
              limite={planContratado.limites?.usuarios}
            />
            <BarraConsumo
              etiqueta="Productos en biblioteca"
              usado={biblioteca.length}
              limite={planContratado.limites?.productosBiblioteca}
            />
          </>
        )}

        {/* Pago del plan: sólo el dueño contrata (un miembro invitado usa el plan del dueño). */}
        {suscripcion && !esMiembro && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{textoDebito(suscripcion)}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-sm"
                disabled={verificandoPago}
                onClick={handleVerificarPago}
                title="Consulta a Mercado Pago si tu pago ya se acreditó y actualiza tu plan"
              >
                {verificandoPago ? 'Verificando...' : 'Verificar pago'}
              </button>
              {debitoActivo && (
                <button className="btn btn-sm" disabled={cancelandoDebito} onClick={handleCancelarDebito}>
                  {cancelandoDebito ? 'Cancelando...' : 'Cancelar débito'}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setModalSuscribirseOpen(true)}>
                {debitoActivo ? 'Cambiar plan' : 'Contratar plan'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Contacto del revendedor (si esta cuenta fue activada por uno) ---- */}
      {suscripcion?.revendedorContacto && (
        <div className="card">
          <div className="card-title">Tu ejecutivo</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
            {(suscripcion.revendedorContacto.nombre || suscripcion.revendedorContacto.apellido) && (
              <div>
                <strong style={{ color: 'var(--text)' }}>
                  {[suscripcion.revendedorContacto.nombre, suscripcion.revendedorContacto.apellido].filter(Boolean).join(' ')}
                </strong>
              </div>
            )}
            {suscripcion.revendedorContacto.email && <div>{suscripcion.revendedorContacto.email}</div>}
            {suscripcion.revendedorContacto.telefono && <div>{suscripcion.revendedorContacto.telefono}</div>}
          </div>
        </div>
      )}

      {/* ---- Usuarios con acceso a la cuenta ---- */}
      <div className="card">
        <div className="card-title">Usuarios con acceso</div>

        {esMiembro ? (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            Estás administrando la cuenta de otro emprendimiento — tenés acceso total, igual que su dueño.
            <div style={{ marginTop: '10px' }}>
              <button
                className="btn btn-sm btn-danger"
                onClick={async () => {
                  if (!(await confirmar('Vas a dejar de tener acceso a esta cuenta y volver a la tuya propia.', { titulo: '¿Salir de esta cuenta?', textoConfirmar: 'Salir', peligro: true }))) return;
                  await salirDeCuentaCompartida();
                }}
              >
                Salir de esta cuenta
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Vos (dueño)</div>
              </div>
            </div>

            {miembrosActivos.map(m => (
              <div key={m._docId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px' }}>
                  {m.email}
                  {m.estado === 'pendiente' && (
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text3)' }}>(pendiente de aceptar)</span>
                  )}
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  disabled={quitandoEmail === m.email}
                  onClick={() => handleQuitarMiembro(m.email)}
                >
                  {quitandoEmail === m.email ? 'Quitando...' : 'Quitar'}
                </button>
              </div>
            ))}

            <div style={{ marginTop: '14px' }}>
              <label className="fl" style={{ marginTop: 0 }}>Agregar usuario (Gmail)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  value={emailNuevo}
                  onChange={(e) => setEmailNuevo(e.target.value)}
                  placeholder="colaborador@gmail.com"
                  disabled={enLimite || agregando}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={enLimite || agregando || !emailNuevo.trim()}
                  onClick={handleAgregarMiembro}
                >
                  {agregando ? 'Agregando...' : 'Agregar'}
                </button>
              </div>
              {enLimite && (
                <div style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '6px' }}>
                  Llegaste al máximo de usuarios de tu plan ({limiteUsuarios}). Necesitás un plan superior para agregar más.
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                La persona que agregues tiene que entrar con esa cuenta de Google — ahí pasa a administrar tu cuenta con acceso total.
              </div>
            </div>
          </>
        )}
      </div>

      <ModalSuscribirse isOpen={modalSuscribirseOpen} onClose={() => setModalSuscribirseOpen(false)} />
    </div>
  );
}
