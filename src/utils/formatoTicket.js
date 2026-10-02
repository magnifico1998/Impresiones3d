// Formato de los tickets de soporte, compartido por la app (panel admin,
// "Copiar para análisis") y por scripts/ticket.mjs. Sin imports a
// propósito: el script lo carga directo con Node.

export const CATEGORIAS_TICKET = { error: 'Error', consulta: 'Consulta', facturacion: 'Facturación', sugerencia: 'Sugerencia' };
export const ESTADOS_TICKET = { abierto: 'Abierto', analisis: 'En análisis', respondido: 'Respondido', cerrado: 'Cerrado' };

export const numeroTicket = (n) => `TKT-${String(n || 0).padStart(4, '0')}`;

const ETIQUETAS_CONTEXTO = {
  version: 'Versión',
  seccion: 'Sección',
  url: 'URL',
  email: 'Email',
  cuentaId: 'Cuenta',
  esMiembro: 'Miembro del equipo',
  plan: 'Plan',
  estadoSuscripcion: 'Estado de la suscripción',
  inventario: 'Inventario habilitado',
  navegador: 'Navegador',
  pantalla: 'Pantalla',
  idioma: 'Idioma',
  zonaHoraria: 'Zona horaria',
  online: 'Con conexión'
};

const fechaHora = (ms) => (ms ? new Date(ms).toLocaleString('es-AR', { hour12: false }) : '—');
const hora = (ms) => {
  const d = new Date(ms);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
const valorContexto = (v) => (v === true ? 'sí' : v === false ? 'no' : v === null || v === undefined || v === '' ? '—' : String(v));

// Una línea por evento: hora, segundos desde el primero, tipo y mensaje.
export function lineasLog(eventos = []) {
  const t0 = eventos[0]?.t || 0;
  return eventos.map((e) => {
    const delta = `+${((e.t - t0) / 1000).toFixed(1)}s`.padStart(8);
    const extra = e.extra ? ` ${JSON.stringify(e.extra)}` : '';
    return `${hora(e.t)} ${delta}  ${e.tipo.toUpperCase().padEnd(9)} ${e.msg}${extra}`;
  });
}

// Texto completo para analizar un ticket. `ticket.creadoEl` en ms.
export function textoParaAnalisis(ticket, log) {
  const eventos = log?.eventos || [];
  const contexto = log?.contexto || {};
  const partes = [
    `# ${numeroTicket(ticket.numero)} · ${CATEGORIAS_TICKET[ticket.categoria] || ticket.categoria} · ${ticket.asunto}`,
    '',
    `- Estado: ${ESTADOS_TICKET[ticket.estado] || ticket.estado}`,
    `- Creado: ${fechaHora(ticket.creadoEl)}`,
    `- Email: ${ticket.email || '—'}`,
    `- Cuenta: ${ticket.cuentaId}${ticket.uid !== ticket.cuentaId ? ` (lo creó el miembro ${ticket.uid})` : ''}`,
    ticket.errorOrigen ? `- Reportado desde el aviso: "${ticket.errorOrigen}"` : null,
    '',
    '## Comentario',
    '',
    ticket.comentario || '(sin comentario)',
    '',
    '## Contexto',
    '',
    ...Object.keys(contexto).map((k) => `- ${ETIQUETAS_CONTEXTO[k] || k}: ${valorContexto(contexto[k])}`),
    '',
    `## Log (${eventos.length} eventos, ${log?.grabado ? 'grabado por el usuario' : 'últimos minutos antes del ticket'})`,
    '',
    '```',
    ...lineasLog(eventos),
    '```'
  ];
  if (ticket.respuestas?.length) {
    partes.push('', '## Respuestas', '');
    for (const r of ticket.respuestas) partes.push(`- ${fechaHora(r.fecha)} (${r.autor || 'admin'}): ${r.texto}`);
  }
  return partes.filter((p) => p !== null).join('\n');
}
