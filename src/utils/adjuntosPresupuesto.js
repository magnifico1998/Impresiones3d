// Imágenes adjuntas de un presupuesto: límites y distribución en las hojas de
// anexo del PDF. Se guardan en presupuestos/{id}.adjuntos = [{ id, url, comentario }]
// y adjuntosPorHoja (1, 2 o 4). Las imágenes viven en Storage, carpeta presupuestos.

export const MAX_ADJUNTOS = 8;
export const MAX_COMENTARIO_ADJUNTO = 300;
export const POR_HOJA_DEFECTO = 1;
export const OPCIONES_POR_HOJA = [
  { n: 1, ayuda: 'una grande por hoja, para imágenes con detalle' },
  { n: 2, ayuda: 'dos por hoja, una arriba de la otra' },
  { n: 4, ayuda: 'cuatro por hoja, para cosas simples' }
];

export const porHojaDe = (valor) => (OPCIONES_POR_HOJA.some((o) => o.n === Number(valor)) ? Number(valor) : POR_HOJA_DEFECTO);

export const hojasDeAnexo = (cantidad, porHoja) => Math.ceil(cantidad / porHojaDe(porHoja));

// Lo que se guarda de cada adjunto (sin claves undefined: Firestore las rechaza).
export const adjuntoParaGuardar = (a) => ({ id: a.id, url: a.url, comentario: String(a.comentario || '').trim().slice(0, MAX_COMENTARIO_ADJUNTO) });
