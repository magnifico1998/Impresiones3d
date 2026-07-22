import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import CatalogoPublico from './catalogo/CatalogoPublico.jsx'

// El catálogo público (/catalogo) lo abre gente sin cuenta desde un link
// de WhatsApp, así que se monta AFUERA de AppProvider/App: App.jsx exige
// login de Google antes de renderizar cualquier página, y acá justamente
// no debe haber login. CatalogoPublico habla con Firestore directo (ver
// src/catalogo/CatalogoPublico.jsx) usando colecciones públicas separadas.
const esCatalogoPublico = window.location.pathname.startsWith('/catalogo')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {esCatalogoPublico ? (
      <CatalogoPublico />
    ) : (
      <AppProvider>
        <App />
      </AppProvider>
    )}
  </StrictMode>,
)
