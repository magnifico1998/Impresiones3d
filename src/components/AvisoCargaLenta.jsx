import React, { useEffect, useState } from 'react';

// Texto debajo del círculo de carga: si pasan unos segundos sin terminar, avisa que la
// conexión es lenta o inestable (en vez de dejar al usuario mirando un círculo sin
// explicación). La carga sigue intentando sola.
export default function AvisoCargaLenta({ segundos = 6 }) {
  const [lenta, setLenta] = useState(false);
  const [sinRed, setSinRed] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    const t = setTimeout(() => setLenta(true), segundos * 1000);
    const alVolver = () => setSinRed(false);
    const alIrse = () => setSinRed(true);
    window.addEventListener('online', alVolver);
    window.addEventListener('offline', alIrse);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', alVolver);
      window.removeEventListener('offline', alIrse);
    };
  }, [segundos]);

  if (!lenta && !sinRed) return null;
  return (
    <div style={{ position: 'absolute', top: 'calc(50% + 40px)', left: 0, right: 0, textAlign: 'center', padding: '0 24px', fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)' }}>
      {sinRed ? 'Sin conexión a internet. Seguimos intentando conectar…' : 'La conexión está tardando más de lo normal. Seguimos intentando…'}
    </div>
  );
}
