import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import Dialogos from './components/Dialogos.jsx'

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
