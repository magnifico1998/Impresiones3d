// Utilidades de facturación electrónica compartidas por la configuración
// ("Mi emprendimiento"), el detalle del pedido y la ficha del cliente.

// CUIT al que cada suscriptor delega en ARCA el servicio de Facturación
// Electrónica: el certificado de Manager3D es de este CUIT y firma por
// todos (ver functions/http/facturacionCuenta.js).
export const CUIT_MANAGER3D = '20262375065';

// Condiciones frente al IVA del receptor admitidas en Factura C (tabla de
// ARCA). Mismos ids que functions/facturacion.js.
export const CONDICIONES_IVA = [
  [5, 'Consumidor Final'],
  [6, 'Responsable Monotributo'],
  [1, 'IVA Responsable Inscripto'],
  [4, 'IVA Sujeto Exento'],
  [13, 'Monotributista Social'],
  [15, 'IVA No Alcanzado']
];

// Pestañas de "Mi emprendimiento". La elegida se recuerda en el navegador;
// el detalle del pedido la usa para abrir directo la de ARCA.
export const PESTANAS_EMPRESA = [
  { id: 'emprendimiento', nombre: 'Emprendimiento' },
  { id: 'arca', nombre: 'Facturación ARCA' }
];
const CLAVE_PESTANA_EMPRESA = 'empresa.pestana';

export function pestanaEmpresaGuardada() {
  try {
    const guardada = localStorage.getItem(CLAVE_PESTANA_EMPRESA);
    return PESTANAS_EMPRESA.some((p) => p.id === guardada) ? guardada : PESTANAS_EMPRESA[0].id;
  } catch {
    return PESTANAS_EMPRESA[0].id;
  }
}

export function guardarPestanaEmpresa(id) {
  try {
    localStorage.setItem(CLAVE_PESTANA_EMPRESA, id);
  } catch {
    // Sin almacenamiento: la pestaña sólo dura mientras la página está abierta.
  }
}

export const pesosAR = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const numeroComprobante = (ptoVta, numero) =>
  numero ? `${String(ptoVta).padStart(5, '0')}-${String(numero).padStart(8, '0')}` : 'sin número';

// Receptor precargado desde la ficha del cliente. El documento se guarda
// como texto libre: 11 dígitos = CUIT, 7 u 8 = DNI, otra cosa = consumidor
// final sin identificar.
export function receptorDesdeCliente(cliente, nombreFallback = '') {
  const doc = String(cliente?.documento || '').replace(/\D/g, '');
  const docTipo = doc.length === 11 ? '80' : (doc.length === 7 || doc.length === 8) ? '96' : '99';
  const condicion = docTipo === '80' ? String(cliente?.condicionIva || '5') : '5';
  const domicilio = [
    [cliente?.calle, cliente?.altura].filter(Boolean).join(' '),
    cliente?.loc, cliente?.prov
  ].filter(Boolean).join(', ');
  return {
    docTipo,
    docNro: docTipo === '99' ? '' : doc,
    nombre: cliente?.nombre || nombreFallback || '',
    condicionIvaId: condicion,
    domicilio,
    email: cliente?.email || ''
  };
}

function base64ABlob(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}

export function descargarPdfBase64(base64, nombre) {
  const url = URL.createObjectURL(base64ABlob(base64));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// Comparte el PDF con el menú del sistema (en el celular deja elegir
// WhatsApp con el archivo adjunto). Donde no se puede compartir archivos
// (la mayoría de las computadoras), lo descarga. Devuelve true si lo
// compartió.
export async function compartirPdfBase64(base64, nombre, texto) {
  const archivo = new File([base64ABlob(base64)], nombre, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], text: texto });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return true; // lo cerró el usuario
    }
  }
  descargarPdfBase64(base64, nombre);
  return false;
}
