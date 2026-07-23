import React from 'react';
import { useApp } from '../context/AppContext';

export default function Sidebar({ isOpen, onClose }) {
  const { activePage, setActivePage, isAdmin } = useApp();

  const handleNavigate = (id) => {
    setActivePage(id);
    // En mobile el sidebar es un drawer superpuesto: al elegir una sección
    // lo cerramos para volver a ver el contenido. En desktop onClose no
    // tiene efecto visual (el sidebar siempre está visible ahí), así que es
    // seguro llamarlo siempre sin distinguir el tamaño de pantalla acá.
    if (onClose) onClose();
  };

  const items = [
    {
      label: 'Navegación',
      links: [
        {
          id: 'resumen',
          name: 'Resumen',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="2,14 6,9 10,11 14,5 18,7" />
              <path d="M2 17h16" />
            </svg>
          )
        },
        {
          id: 'pedidos',
          name: 'Pedidos',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 5h12M4 10h8M4 15h10" />
            </svg>
          )
        },
        {
          id: 'clientes',
          name: 'Clientes',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 10a4 4 0 100-8 4 4 0 000 8zM2 20a8 8 0 0116 0" />
            </svg>
          )
        },
        {
          id: 'calc',
          name: 'Calculadora',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="14" height="14" rx="2" />
              <path d="M7 7h6M7 10h6M7 13h3" />
            </svg>
          )
        },
        {
          id: 'compras',
          name: 'Compras',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="16" r="1.5" />
              <circle cx="15" cy="16" r="1.5" />
              <path d="M1 1h3l2.5 10h9l2-7H6" />
            </svg>
          )
        },
        {
          id: 'biblioteca',
          name: 'Biblioteca',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="5" height="14" rx="1" />
              <rect x="10" y="3" width="5" height="9" rx="1" />
              <path d="M10 15h7M13 12v6" />
            </svg>
          )
        },
        {
          id: 'catalogoweb',
          name: 'Catálogo web',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="14" height="12" rx="2" />
              <path d="M3 8h14M7 12h2M11 12h2" />
            </svg>
          )
        }
      ]
    },
    {
      label: 'Sistema',
      links: [
        {
          id: 'config',
          name: 'Configuración',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
            </svg>
          )
        },
        {
          id: 'empresa',
          name: 'Mi emprendimiento',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 18V4a1 1 0 011-1h6a1 1 0 011 1v14M11 18v-7a1 1 0 011-1h4a1 1 0 011 1v7M6 6h.01M6 9h.01M6 12h.01M2 18h16" />
            </svg>
          )
        }
      ]
    },
    // Grupo visible sólo para usuarios definidos como admin en Firestore
    // (colección "admins"). No es sólo un tema de UI: las reglas de
    // Firestore también bloquean el acceso a los datos que vive detrás de
    // esta pestaña, así que ocultarla acá es nada más una comodidad visual.
    ...(isAdmin ? [{
      label: 'Administración',
      links: [
        {
          id: 'admin',
          name: 'Administrador',
          icon: (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 2l6 3v5c0 4-2.5 6.5-6 8-3.5-1.5-6-4-6-8V5l6-3z" />
              <path d="M7.5 10l1.8 1.8L13 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
        }
      ]
    }] : [])
  ];

  return (
    <>
      {/* Fondo oscuro detrás del drawer en mobile. No se renderiza en
          desktop porque ahí .sidebar-backdrop nunca se muestra (ver CSS),
          pero lo controlamos igual por isOpen para no dejarlo interceptando
          clicks cuando el menú está cerrado. */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <nav className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        {items.map((group, gi) => (
          <React.Fragment key={gi}>
            <div className="nav-label">{group.label}</div>
            {group.links.map(link => (
              <div 
                key={link.id} 
                className={`nav-item ${activePage === link.id ? 'active' : ''}`}
                onClick={() => handleNavigate(link.id)}
              >
                {link.icon}
                {link.name}
              </div>
            ))}
          </React.Fragment>
        ))}
      </nav>
    </>
  );
}
