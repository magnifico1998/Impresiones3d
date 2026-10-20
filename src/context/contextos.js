// Contextos por área de la app. AppProvider (AppContext.jsx) sigue siendo el
// único dueño del estado y de la carga/guardado en Firestore; acá sólo se
// reparte lo que ve cada componente, para que un cambio en un área (un toast,
// un pedido) no vuelva a dibujar a los que usan otra.
//
// En cada área, los DATOS cambian con el estado y las ACCIONES son funciones
// estables que siempre llaman a la versión más reciente (ver AppContext.jsx).
// Cada componente usa el hook del área que necesita; useApp() sigue
// existiendo y junta todas (se vuelve a dibujar con cualquier cambio).

import { createContext, useContext } from 'react';

export const CuentaCtx = createContext(null);       // sesión, plan, usuarios con acceso, carga, backup
export const UiCtx = createContext(null);           // página activa y avisos (toasts)
export const ConfigCtx = createContext(null);       // empresa, configuración, país y moneda, ids
export const PedidosCtx = createContext(null);
export const ComprasCtx = createContext(null);
export const PresupuestosCtx = createContext(null);
export const BibliotecaCtx = createContext(null);
export const ClientesCtx = createContext(null);
export const FaqCtx = createContext(null);
export const CatalogoCtx = createContext(null);     // catálogo web y solicitudes de la tienda

export const useCuenta = () => useContext(CuentaCtx);
export const useUi = () => useContext(UiCtx);
export const useConfig = () => useContext(ConfigCtx);
export const usePedidos = () => useContext(PedidosCtx);
export const useCompras = () => useContext(ComprasCtx);
export const usePresupuestos = () => useContext(PresupuestosCtx);
export const useBiblioteca = () => useContext(BibliotecaCtx);
export const useClientes = () => useContext(ClientesCtx);
export const useFaq = () => useContext(FaqCtx);
export const useCatalogo = () => useContext(CatalogoCtx);
