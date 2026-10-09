import { useEffect, useState } from 'react';

// App instalable (PWA): el navegador avisa con `beforeinstallprompt` cuando se puede
// instalar y esto guarda el evento para ofrecer un botón "Instalar app" (Chrome/Edge en
// Windows y Android). En iPhone/iPad no existe el evento: se instala a mano desde
// Safari (Compartir → Agregar a inicio). Una vez instalada o abierta como app
// (display-mode: standalone) no se ofrece nada.
export default function useInstalarApp() {
  const [evento, setEvento] = useState(null);
  const [instalada, setInstalada] = useState(
    typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
  );

  useEffect(() => {
    const alOfrecer = (e) => { e.preventDefault(); setEvento(e); };
    const alInstalar = () => { setEvento(null); setInstalada(true); };
    window.addEventListener('beforeinstallprompt', alOfrecer);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  const instalar = async () => {
    if (!evento) return;
    evento.prompt();
    await evento.userChoice.catch(() => null);
    setEvento(null);
  };

  return { puedeInstalar: !!evento && !instalada, instalar };
}
