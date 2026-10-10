import React from 'react';
import { tipoDeArchivo } from '../utils/formatoEnvio';

// Insignia chica con el tipo de un archivo (G-code, 3MF laminado, proyecto 3MF): ícono y color propios, para no
// confundir archivos que se llaman igual. Usa los colores de la paleta (info, acento y aviso).
export default function InsigniaArchivo({ archivo, solaIcono = false }) {
  const t = tipoDeArchivo(archivo);
  return (
    <span
      title={t.ayuda}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600, lineHeight: 1.5, whiteSpace: 'nowrap', color: t.color, background: t.fondo, border: `1px solid ${t.color}`, verticalAlign: 'middle' }}
    >
      <span aria-hidden="true">{t.icono}</span>{!solaIcono && t.etiqueta}
    </span>
  );
}
