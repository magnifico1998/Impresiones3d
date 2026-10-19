import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { instalarAvisoVersionNueva, vigilarVersionNueva } from './utils/avisoVersionNueva'
import { esRutaDeCatalogo } from './utils/nombreCatalogo'

instalarAvisoVersionNueva()
// El catálogo público no se interrumpe con avisos de versión: lo ve gente armando un pedido.
if (!esRutaDeCatalogo(window.location.pathname)) vigilarVersionNueva()

// App instalable: el service worker (public/sw.js) sólo guarda la pantalla de la app para
// que abra rápido y sin red; no toca los datos. Ver docs/arquitectura.md.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('No se pudo registrar el service worker:', e));
  });
}

// El catálogo público (/catalogo/{uid}) lo abre gente sin cuenta desde un
// link de WhatsApp, así que se monta AFUERA de AppProvider/App: App.jsx
// exige login de Google antes de renderizar cualquier página, y acá
// justamente no debe haber login. CatalogoPublico habla con Firestore
// directo (ver src/catalogo/CatalogoPublico.jsx), leyendo el uid de la
// tienda desde la URL y usando catalogoTiendas/{uid}/... — así cada
// tienda tiene su propio catálogo, no uno compartido entre todos.
//
// Cada lado se carga con import dinámico (code splitting): antes todo iba
// en un único bundle de ~1,8 MB, y un cliente que abría el catálogo desde
// el celular descargaba también el panel entero, jsPDF, etc.
const CatalogoPublico = lazy(() => import('./catalogo/CatalogoPublico.jsx'))
const AppPrivada = lazy(() => import('./AppPrivada.jsx'))

// /catalogo/{uid} (el link de siempre) o /{nombre} (la dirección con el nombre del emprendimiento).
const esCatalogoPublico = esRutaDeCatalogo(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      {esCatalogoPublico ? <CatalogoPublico /> : <AppPrivada />}
    </Suspense>
  </StrictMode>,
)
