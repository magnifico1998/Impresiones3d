import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import CatalogoPublico from './catalogo/CatalogoPublico.jsx'

// El catálogo público (/catalogo/{uid}) lo abre gente sin cuenta desde un
// link de WhatsApp, así que se monta AFUERA de AppProvider/App: App.jsx
// exige login de Google antes de renderizar cualquier página, y acá
// justamente no debe haber login. CatalogoPublico habla con Firestore
// directo (ver src/catalogo/CatalogoPublico.jsx), leyendo el uid de la
// tienda desde la URL y usando catalogoTiendas/{uid}/... — así cada
// tienda tiene su propio catálogo, no uno compartido entre todos.
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
