import React, { useState } from 'react';
import { useApp } from './context/AppContext';

// Layout and views
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ResumenPage from './components/ResumenPage';
import PedidosPage from './components/PedidosPage';
import ClientesPage from './components/ClientesPage';
import CalculadoraPage from './components/CalculadoraPage';
import ComprasPage from './components/ComprasPage';
import BibliotecaPage from './components/BibliotecaPage';
import CatalogoAdminPage from './components/CatalogoAdminPage';
import ConfiguracionPage from './components/ConfiguracionPage';
import EmpresaPage from './components/EmpresaPage';
import AdminPage from './components/AdminPage';
import FaqPage from './components/FaqPage';
import Toasts from './components/Toasts';

// Modals
import ModalCliente from './components/modals/ModalCliente';
import ModalClienteDetalle from './components/modals/ModalClienteDetalle';
import ModalCompra from './components/modals/ModalCompra';
import ModalPedido from './components/modals/ModalPedido';
import ModalPedidoDetalle from './components/modals/ModalPedidoDetalle';
import ModalAgregarPieza from './components/modals/ModalAgregarPieza';
import ModalBibGuardar from './components/modals/ModalBibGuardar';
import ModalBibEditarCat from './components/modals/ModalBibEditarCat';
import ModalBibUsar from './components/modals/ModalBibUsar';
import ModalArmarPedido from './components/modals/ModalArmarPedido';
import ModalContacto from './components/modals/ModalContacto';
import ModalFaqGuardar from './components/modals/ModalFaqGuardar';
import ModalFaqOrdenCategorias from './components/modals/ModalFaqOrdenCategorias';

function App() {
  const {
    user,
    isAdmin,
    esRevendedor,
    loading,
    loginWithGoogle,
    loginWithEmailLink,
    activePage,
    setActivePage,
    showToast,
    loadError,
    datosCargadosOk,
    reintentarCargaDatos,
    logout,
    suscripcion
  } = useApp();

  // Cuenta bloqueada: se muestra en vez de la pantalla genérica de "no
  // pudimos cargar tus datos" (que igual dispara, porque las reglas de
  // Firestore ya no dejan leer nada -- ver cuentaPuedeLeer en
  // firestore.rules -- una vez que pasaron los 30 días de modo lectura).
  // La suscripción se sigue pudiendo leer siempre (no está gateada), así
  // que esta pantalla se puede armar con datos reales incluso con el resto
  // de la app bloqueada.
  const [modalContactoOpen, setModalContactoOpen] = useState(false);

  // Login por link de email (alternativa a Google para cuando el popup
  // falla por bloqueos del navegador). mostrarFormEmail alterna entre el
  // botón "Ingresar con email" y el input; emailLinkEnviado muestra el
  // cartel de confirmación con la leyenda de "mismo dispositivo".
  const [mostrarFormEmail, setMostrarFormEmail] = useState(false);
  const [emailLinkInput, setEmailLinkInput] = useState('');
  const [emailLinkEnviando, setEmailLinkEnviando] = useState(false);
  const [emailLinkEnviado, setEmailLinkEnviado] = useState(false);

  const handleEnviarEmailLink = async (e) => {
    e.preventDefault();
    if (!emailLinkInput.trim()) return;
    setEmailLinkEnviando(true);
    try {
      await loginWithEmailLink(emailLinkInput.trim());
      setEmailLinkEnviado(true);
    } catch (e) {
      // el toast de error ya lo muestra loginWithEmailLink
    } finally {
      setEmailLinkEnviando(false);
    }
  };

  // Modals visibility state
  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [modalClienteEditId, setModalClienteEditId] = useState(null);

  const [modalClienteDetalleOpen, setModalClienteDetalleOpen] = useState(false);
  const [modalClienteDetalleId, setModalClienteDetalleId] = useState(null);

  const [modalCompraOpen, setModalCompraOpen] = useState(false);
  const [modalCompraEditId, setModalCompraEditId] = useState(null);

  const [modalPedidoOpen, setModalPedidoOpen] = useState(false);
  const [modalPedidoEditId, setModalPedidoEditId] = useState(null);
  const [modalPedidoSavedCallback, setModalPedidoSavedCallback] = useState(null);
  // Datos frescos para inicializar ModalPedido cuando se llega desde
  // "Editar" en el detalle del pedido: el borrador recién guardado ahí
  // puede no haberse reflejado todavía en `pedidos` (el listener de
  // Firestore tarda un instante), y sin esto el formulario se armaba con
  // los datos viejos y al guardar los pisaba.
  const [modalPedidoDatosIniciales, setModalPedidoDatosIniciales] = useState(null);

  const [modalPedidoDetalleOpen, setModalPedidoDetalleOpen] = useState(false);
  const [modalPedidoDetalleId, setModalPedidoDetalleId] = useState(null);

  const [modalAgregarPiezaOpen, setModalAgregarPiezaOpen] = useState(false);
  const [modalAgregarPiezaPedidoId, setModalAgregarPiezaPedidoId] = useState(null);

  // Sube cada vez que se guarda un producto en biblioteca o se agrega una
  // pieza a un pedido desde la Calculadora, para que ésta limpie sola los
  // datos del G-code importado (ver CalculadoraPage.jsx) y no arrastre
  // archivos del producto anterior al siguiente.
  const [calcResetTick, setCalcResetTick] = useState(0);

  const [modalBibGuardarOpen, setModalBibGuardarOpen] = useState(false);
  const [modalBibGuardarPresupuesto, setModalBibGuardarPresupuesto] = useState(null);

  const [modalBibEditarCatOpen, setModalBibEditarCatOpen] = useState(false);
  const [modalBibEditarCatId, setModalBibEditarCatId] = useState(null);

  const [modalFaqGuardarOpen, setModalFaqGuardarOpen] = useState(false);
  const [modalFaqGuardarEditId, setModalFaqGuardarEditId] = useState(null);

  const [modalFaqOrdenCategoriasOpen, setModalFaqOrdenCategoriasOpen] = useState(false);

  const [modalBibUsarOpen, setModalBibUsarOpen] = useState(false);
  
  const [modalArmarPedidoOpen, setModalArmarPedidoOpen] = useState(false);
  const [modalArmarPedidoSelectedIds, setModalArmarPedidoSelectedIds] = useState(new Set());

  // Link selected products context targeting order
  const [pedidoObjetivoBib, setPedidoObjetivoBib] = useState(null);

  // Drawer de navegación en mobile (el sidebar de desktop se oculta con
  // CSS por debajo de 700px; este estado controla el hamburguesa/drawer
  // que lo reemplaza en pantallas chicas).
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Authentication Loading Spinner
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#0f1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  // Not authenticated Google login screen
  if (!user) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '20px'
      }}>
        <div className="header-logo" style={{
          width: '56px',
          height: '56px',
          background: 'var(--accentDim)',
          border: '1px solid var(--accent)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '32px', height: '32px', color: 'var(--accent)' }}>
            <polygon points="10,2 18,6 18,14 10,18 2,14 2,6" />
            <polygon points="10,6 14,8 14,12 10,14 6,12 6,8" />
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--sans)', fontSize: '24px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-.5px', marginBottom: '6px' }}>
            Manager3D - Todo para emprender en 3D
          </h1>
          <p style={{ fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)' }}>
            Ingresá con tu cuenta para sincronizar tus datos en la nube
          </p>
        </div>
        <button 
          onClick={loginWithGoogle}
          className="btn btn-primary" 
          style={{
            fontSize: '14px',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderRadius: 'var(--radius2)',
            boxShadow: 'var(--shadow)'
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
          </svg>
          Iniciar sesión con Google
        </button>

        {emailLinkEnviado ? (
          <div style={{
            maxWidth: '320px',
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--text2)',
            fontFamily: 'var(--sans)',
            background: 'var(--accentDim)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius2)',
            padding: '12px 16px'
          }}>
            Te enviamos un link a <strong>{emailLinkInput.trim()}</strong>.
            Abrilo <strong>desde este mismo dispositivo y navegador</strong> para completar el ingreso
            (si lo abrís desde otro celular o PC, te vamos a pedir el email de nuevo).
          </div>
        ) : mostrarFormEmail ? (
          <form onSubmit={handleEnviarEmailLink} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '260px' }}>
            <input
              type="email"
              id="email-link-login"
              name="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="tu@email.com"
              value={emailLinkInput}
              onChange={(e) => setEmailLinkInput(e.target.value)}
              className="input"
              style={{ fontSize: '14px', padding: '10px 12px', borderRadius: 'var(--radius2)' }}
            />
            <button
              type="submit"
              disabled={emailLinkEnviando}
              className="btn"
              style={{ fontSize: '13px', padding: '9px 16px', borderRadius: 'var(--radius2)' }}
            >
              {emailLinkEnviando ? 'Enviando...' : 'Enviarme el link de acceso'}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setMostrarFormEmail(true)}
            className="btn"
            style={{
              fontSize: '13px',
              padding: '9px 16px',
              borderRadius: 'var(--radius2)',
              background: 'transparent',
              color: 'var(--text2)'
            }}
          >
            Ingresar con email (sin contraseña)
          </button>
        )}
      </div>
    );
  }

  // Cuenta suspendida (pasaron los 30 días de modo lectura sin
  // reactivarse): ni lectura ni escritura, en vez del error genérico de
  // conexión. Va ANTES del chequeo de loadError porque, al estar
  // suspendida, la carga de datos real (pedidos/biblioteca/etc.) también
  // va a fallar con permission-denied -- este cartel explica por qué.
  if (suscripcion?.estado === 'suspendida' && !isAdmin) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          background: 'var(--dangerDim)',
          border: '1px solid var(--danger)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="var(--danger)" strokeWidth="1.5" style={{ width: '30px', height: '30px' }}>
            <rect x="4" y="9" width="12" height="8" rx="1.5" />
            <path d="M7 9V6a3 3 0 0 1 6 0v3" />
          </svg>
        </div>
        <div>
          <h1 style={{ fontFamily: 'var(--sans)', fontSize: '20px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
            Tu cuenta está bloqueada
          </h1>
          <p style={{ fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)', maxWidth: '380px', lineHeight: 1.5 }}>
            Pasaron los 30 días de modo lectura sin que se reactivara la suscripción, así que ya no podés acceder a tu información. Contactate con el área comercial para regularizar tu situación y recuperar el acceso — tus datos siguen guardados.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setModalContactoOpen(true)}
            className="btn btn-primary"
            style={{ fontSize: '14px', padding: '10px 20px', borderRadius: 'var(--radius2)' }}
          >
            Contactate con el área comercial
          </button>
          <button
            onClick={logout}
            className="btn"
            style={{ fontSize: '14px', padding: '10px 20px', borderRadius: 'var(--radius2)' }}
          >
            Cerrar sesión
          </button>
        </div>
        <ModalContacto isOpen={modalContactoOpen} onClose={() => setModalContactoOpen(false)} />
      </div>
    );
  }

  // Fallo al cargar los datos desde Firestore: bloqueamos la app en vez de
  // dejar pasar al usuario con estado vacío. Si lo dejáramos pasar, cualquier
  // cambio que hiciera dispararía el autosave y pisaría la nube con arrays
  // vacíos, borrando todo su historial real. Ver AppContext.jsx.
  if (loadError && !datosCargadosOk) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          background: 'var(--dangerDim)',
          border: '1px solid var(--danger)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="var(--danger)" strokeWidth="1.5" style={{ width: '30px', height: '30px' }}>
            <path d="M10 6v5M10 14h.01" strokeLinecap="round" />
            <circle cx="10" cy="10" r="8" />
          </svg>
        </div>
        <div>
          <h1 style={{ fontFamily: 'var(--sans)', fontSize: '20px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
            No pudimos cargar tus datos
          </h1>
          <p style={{ fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)', maxWidth: '360px', lineHeight: 1.5 }}>
            No se pudo conectar con la nube para traer tu información. Por seguridad, no dejamos continuar para evitar sobrescribir tus datos guardados. Revisá tu conexión a internet y volvé a intentar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={reintentarCargaDatos}
            className="btn btn-primary"
            style={{ fontSize: '14px', padding: '10px 20px', borderRadius: 'var(--radius2)' }}
          >
            ↺ Reintentar
          </button>
          <button
            onClick={logout}
            className="btn"
            style={{ fontSize: '14px', padding: '10px 20px', borderRadius: 'var(--radius2)' }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // App details pages routing
  const renderActivePage = () => {
    switch (activePage) {
      case 'resumen':
        return <ResumenPage />;
      
      case 'pedidos':
        return (
          <PedidosPage 
            onOpenNewOrder={() => {
              setModalPedidoEditId(null);
              setModalPedidoSavedCallback(null);
              setModalPedidoDatosIniciales(null);
              setModalPedidoOpen(true);
            }}
            onOpenOrderDetail={(id) => {
              setModalPedidoDetalleId(id);
              setModalPedidoDetalleOpen(true);
            }}
          />
        );
      
      case 'clientes':
        return (
          <ClientesPage 
            onOpenNewClient={() => {
              setModalClienteEditId(null);
              setModalClienteOpen(true);
            }}
            onOpenClientDetail={(id) => {
              setModalClienteDetalleId(id);
              setModalClienteDetalleOpen(true);
            }}
          />
        );
      
      case 'calc':
        return (
          <CalculadoraPage 
            onOpenBibUsar={() => setModalBibUsarOpen(true)}
            onOpenBibGuardar={(presupuesto) => {
              setModalBibGuardarPresupuesto(presupuesto);
              setModalBibGuardarOpen(true);
            }}
            onOpenAgregarPieza={(orderId) => {
              // If orderId is provided (e.g. from post-save callbacks), use that, else let select choose
              setModalAgregarPiezaPedidoId(orderId);
              setModalAgregarPiezaOpen(true);
            }}
            resetTick={calcResetTick}
          />
        );
      
      case 'compras':
        return (
          <ComprasPage 
            onOpenNewCompra={() => {
              setModalCompraEditId(null);
              setModalCompraOpen(true);
            }}
            onOpenEditCompra={(id) => {
              setModalCompraEditId(id);
              setModalCompraOpen(true);
            }}
          />
        );
      
      case 'biblioteca':
        return (
          <BibliotecaPage 
            onLoadInCalculator={(id) => {
              // Will load item in calculator Page and switch navigation tab
              setActivePage('calc');
              // Delay loading item slightly to let page mount and update refs
              setTimeout(() => {
                const event = new CustomEvent('load-bib-item', { detail: { id } });
                window.dispatchEvent(event);
              }, 100);
            }}
            onOpenEditCat={(id) => {
              setModalBibEditarCatId(id);
              setModalBibEditarCatOpen(true);
            }}
            onOpenArmarPedido={(selectedIds) => {
              setModalArmarPedidoSelectedIds(selectedIds);
              setModalArmarPedidoOpen(true);
            }}
          />
        );
      
      case 'catalogoweb':
        return <CatalogoAdminPage />;

      case 'faq':
        return (
          <FaqPage
            onOpenNuevo={() => {
              setModalFaqGuardarEditId(null);
              setModalFaqGuardarOpen(true);
            }}
            onOpenEditar={(id) => {
              setModalFaqGuardarEditId(id);
              setModalFaqGuardarOpen(true);
            }}
            onOpenOrdenCategorias={() => setModalFaqOrdenCategoriasOpen(true)}
          />
        );

      case 'config':
        return <ConfiguracionPage />;
      
      case 'empresa':
        return <EmpresaPage />;

      case 'admin':
        // Defensa en profundidad: aunque el Sidebar ya oculta este ítem a
        // quien no es admin, activePage es un simple useState y nada
        // impide que quede seteado en 'admin' por otra vía. Volvemos a
        // chequear isAdmin acá antes de renderizar. Los datos reales detrás
        // de esta pantalla ya están protegidos aparte por firestore.rules.
        return isAdmin ? <AdminPage /> : <ResumenPage />;

      case 'revendedor':
        // Misma defensa en profundidad que 'admin' de arriba: el Sidebar
        // ya oculta este ítem a quien no es revendedor, pero volvemos a
        // chequearlo acá. SIEMPRE con modoRevendedor=true (acotado a su
        // propia cartera) -- si la cuenta también es admin, para la vista
        // completa ya está la pestaña "Administrador" aparte.
        return esRevendedor ? <AdminPage modoRevendedor /> : <ResumenPage />;

      default:
        return <ResumenPage />;
    }
  };

  return (
    <>
      <Header onToggleMenu={() => setMobileMenuOpen(o => !o)} />
      <div className="layout">
        <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <main className="main">
          {renderActivePage()}
        </main>
      </div>

      {/* TOAST PANEL */}
      <Toasts />

      {/* MODAL POPUPS */}
      <ModalCliente 
        isOpen={modalClienteOpen} 
        onClose={() => setModalClienteOpen(false)} 
        editId={modalClienteEditId} 
      />

      <ModalClienteDetalle 
        isOpen={modalClienteDetalleOpen} 
        onClose={() => setModalClienteDetalleOpen(false)} 
        clientId={modalClienteDetalleId}
        onEdit={(id) => {
          setModalClienteDetalleOpen(false);
          setModalClienteEditId(id);
          setModalClienteOpen(true);
        }}
        onViewOrder={(id) => {
          setModalClienteDetalleOpen(false);
          setModalPedidoDetalleId(id);
          setModalPedidoDetalleOpen(true);
        }}
      />

      <ModalCompra 
        isOpen={modalCompraOpen} 
        onClose={() => setModalCompraOpen(false)} 
        editId={modalCompraEditId} 
      />

      <ModalPedido
        isOpen={modalPedidoOpen}
        onClose={() => {
          setModalPedidoOpen(false);
          setModalPedidoDatosIniciales(null);
        }}
        editId={modalPedidoEditId}
        datosIniciales={modalPedidoDatosIniciales}
        onSaved={(id) => {
          if (modalPedidoSavedCallback) {
            modalPedidoSavedCallback(id);
            setModalPedidoSavedCallback(null);
          }
        }}
      />

      <ModalPedidoDetalle 
        isOpen={modalPedidoDetalleOpen} 
        onClose={() => setModalPedidoDetalleOpen(false)} 
        pedidoId={modalPedidoDetalleId}
        onEditOrder={(id, borrador) => {
          setModalPedidoDetalleOpen(false);
          setModalPedidoEditId(id);
          setModalPedidoDatosIniciales(borrador || null);
          setModalPedidoOpen(true);
        }}
        onAddProduct={(pedidoId) => {
          // Trigger the select-and-append workflow
          setPedidoObjetivoBib(pedidoId);
          setModalPedidoDetalleOpen(false);
          setActivePage('biblioteca');
          showToast('Seleccioná los productos de la biblioteca para agregarlos a este pedido.', 'info');
        }}
      />

      {/* Modal to add parts to order: loads the current calculated part from calculator page */}
      <ModalAgregarPieza 
        isOpen={modalAgregarPiezaOpen}
        onClose={() => {
          setModalAgregarPiezaOpen(false);
          setModalAgregarPiezaPedidoId(null);
        }}
        presupuestoActual={window._currentPresupuesto || null}
        defaultPedidoId={modalAgregarPiezaPedidoId}
        onConfirm={(name, orderId) => {
          setCalcResetTick(t => t + 1);
          // Confirm window redirect workflow
          if (window.confirm(`✓ Pieza "${name}" agregada. ¿Ver el pedido?`)) {
            setActivePage('pedidos');
            setTimeout(() => {
              setModalPedidoDetalleId(orderId);
              setModalPedidoDetalleOpen(true);
            }, 100);
          }
        }}
      />

      {/* Modal to save calculated product to library */}
      <ModalBibGuardar 
        isOpen={modalBibGuardarOpen}
        onClose={() => {
          setModalBibGuardarOpen(false);
          setModalBibGuardarPresupuesto(null);
        }}
        presupuestoActual={modalBibGuardarPresupuesto}
        onGuardado={() => setCalcResetTick(t => t + 1)}
      />

      <ModalBibEditarCat
        isOpen={modalBibEditarCatOpen}
        onClose={() => {
          setModalBibEditarCatOpen(false);
          setModalBibEditarCatId(null);
        }}
        editId={modalBibEditarCatId}
      />

      <ModalFaqGuardar
        isOpen={modalFaqGuardarOpen}
        onClose={() => {
          setModalFaqGuardarOpen(false);
          setModalFaqGuardarEditId(null);
        }}
        editId={modalFaqGuardarEditId}
      />

      <ModalFaqOrdenCategorias
        isOpen={modalFaqOrdenCategoriasOpen}
        onClose={() => setModalFaqOrdenCategoriasOpen(false)}
      />

      <ModalBibUsar 
        isOpen={modalBibUsarOpen}
        onClose={() => setModalBibUsarOpen(false)}
        onSelectProduct={(id) => {
          // Dispatches event to let Calculator page load the library item
          const event = new CustomEvent('load-bib-item', { detail: { id } });
          window.dispatchEvent(event);
        }}
      />

      <ModalArmarPedido 
        isOpen={modalArmarPedidoOpen}
        onClose={() => setModalArmarPedidoOpen(false)}
        selectedProdIds={modalArmarPedidoSelectedIds}
        fixedOrderId={pedidoObjetivoBib}
        onClearSelection={(nextSet) => {
          setModalArmarPedidoSelectedIds(nextSet);
          if (nextSet.size === 0) {
            setPedidoObjetivoBib(null);
            // Sin productos no queda nada que armar: se cierra de verdad
            // (no sólo dejar de renderizar), así ModalArmarPedido ve la
            // transición cerrado -> abierto y reinicializa su formulario
            // la próxima vez que se abra con una selección nueva.
            setModalArmarPedidoOpen(false);
          }
        }}
        onViewOrder={(id) => {
          setPedidoObjetivoBib(null);
          setModalPedidoDetalleId(id);
          setModalPedidoDetalleOpen(true);
        }}
      />
    </>
  );
}

export default App;
