import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import Dialogos from './components/Dialogos.jsx'
import { instalarRegistroSoporte } from './utils/registroSoporte'

// El registro para los tickets de soporte arranca antes que la app, para
// capturar también los errores de la carga inicial.
instalarRegistroSoporte()

// La app de gestión (con login) en su propio módulo, para que main.jsx la
// cargue con import dinámico: así quien abre el catálogo público no
// descarga todo el panel, y viceversa.
export default function AppPrivada() {
  return (
    <AppProvider>
      <App />
      <Dialogos />
    </AppProvider>
  )
}
