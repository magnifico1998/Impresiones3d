// Catálogo de países: define moneda, formato de teléfono y (a futuro,
// sin uso funcional hoy) zona horaria de referencia del emprendimiento.
// Mismo patrón que paletas.js: objeto por id + lista para iterar en UI.
export const paises = {
  AR: {
    id: 'AR', nombre: 'Argentina',
    moneda: 'ARS', localeMoneda: 'es-AR',
    codigoTelefono: '54', longitudTelefono: 10,
    mensajeTelefono: 'Celular a 10 dígitos, sin 0 ni 15 (ej: 3511234567)',
    timezone: 'America/Argentina/Buenos_Aires'
  },
  MX: {
    id: 'MX', nombre: 'México',
    moneda: 'MXN', localeMoneda: 'es-MX',
    codigoTelefono: '52', longitudTelefono: 10,
    mensajeTelefono: 'Teléfono a 10 dígitos (ej: 5512345678)',
    timezone: 'America/Mexico_City'
  },
  CL: {
    id: 'CL', nombre: 'Chile',
    moneda: 'CLP', localeMoneda: 'es-CL',
    codigoTelefono: '56', longitudTelefono: 9,
    mensajeTelefono: 'Teléfono a 9 dígitos (ej: 912345678)',
    timezone: 'America/Santiago'
  },
  UY: {
    id: 'UY', nombre: 'Uruguay',
    moneda: 'UYU', localeMoneda: 'es-UY',
    codigoTelefono: '598', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 91234567)',
    timezone: 'America/Montevideo'
  },
  CO: {
    id: 'CO', nombre: 'Colombia',
    moneda: 'COP', localeMoneda: 'es-CO',
    codigoTelefono: '57', longitudTelefono: 10,
    mensajeTelefono: 'Teléfono a 10 dígitos (ej: 3001234567)',
    timezone: 'America/Bogota'
  },
  PE: {
    id: 'PE', nombre: 'Perú',
    moneda: 'PEN', localeMoneda: 'es-PE',
    codigoTelefono: '51', longitudTelefono: 9,
    mensajeTelefono: 'Teléfono a 9 dígitos (ej: 912345678)',
    timezone: 'America/Lima'
  },
  EC: {
    id: 'EC', nombre: 'Ecuador',
    moneda: 'USD', localeMoneda: 'es-EC',
    codigoTelefono: '593', longitudTelefono: 9,
    mensajeTelefono: 'Teléfono a 9 dígitos (ej: 991234567)',
    timezone: 'America/Guayaquil'
  },
  BO: {
    id: 'BO', nombre: 'Bolivia',
    moneda: 'BOB', localeMoneda: 'es-BO',
    codigoTelefono: '591', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 71234567)',
    timezone: 'America/La_Paz'
  },
  PY: {
    id: 'PY', nombre: 'Paraguay',
    moneda: 'PYG', localeMoneda: 'es-PY',
    codigoTelefono: '595', longitudTelefono: 9,
    mensajeTelefono: 'Teléfono a 9 dígitos (ej: 981234567)',
    timezone: 'America/Asuncion'
  },
  VE: {
    id: 'VE', nombre: 'Venezuela',
    moneda: 'VES', localeMoneda: 'es-VE',
    codigoTelefono: '58', longitudTelefono: 10,
    mensajeTelefono: 'Teléfono a 10 dígitos (ej: 4121234567)',
    timezone: 'America/Caracas'
  },
  CR: {
    id: 'CR', nombre: 'Costa Rica',
    moneda: 'CRC', localeMoneda: 'es-CR',
    codigoTelefono: '506', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 81234567)',
    timezone: 'America/Costa_Rica'
  },
  PA: {
    id: 'PA', nombre: 'Panamá',
    moneda: 'PAB', localeMoneda: 'es-PA',
    codigoTelefono: '507', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 61234567)',
    timezone: 'America/Panama'
  },
  GT: {
    id: 'GT', nombre: 'Guatemala',
    moneda: 'GTQ', localeMoneda: 'es-GT',
    codigoTelefono: '502', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 51234567)',
    timezone: 'America/Guatemala'
  },
  HN: {
    id: 'HN', nombre: 'Honduras',
    moneda: 'HNL', localeMoneda: 'es-HN',
    codigoTelefono: '504', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 91234567)',
    timezone: 'America/Tegucigalpa'
  },
  SV: {
    id: 'SV', nombre: 'El Salvador',
    moneda: 'USD', localeMoneda: 'es-SV',
    codigoTelefono: '503', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 71234567)',
    timezone: 'America/El_Salvador'
  },
  NI: {
    id: 'NI', nombre: 'Nicaragua',
    moneda: 'NIO', localeMoneda: 'es-NI',
    codigoTelefono: '505', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 81234567)',
    timezone: 'America/Managua'
  },
  DO: {
    id: 'DO', nombre: 'República Dominicana',
    moneda: 'DOP', localeMoneda: 'es-DO',
    codigoTelefono: '1', longitudTelefono: 10,
    mensajeTelefono: 'Teléfono a 10 dígitos (ej: 8091234567)',
    timezone: 'America/Santo_Domingo'
  },
  CU: {
    id: 'CU', nombre: 'Cuba',
    moneda: 'CUP', localeMoneda: 'es-CU',
    codigoTelefono: '53', longitudTelefono: 8,
    mensajeTelefono: 'Teléfono a 8 dígitos (ej: 51234567)',
    timezone: 'America/Havana'
  },
  ES: {
    id: 'ES', nombre: 'España',
    moneda: 'EUR', localeMoneda: 'es-ES',
    codigoTelefono: '34', longitudTelefono: 9,
    mensajeTelefono: 'Teléfono a 9 dígitos (ej: 612345678)',
    timezone: 'Europe/Madrid'
  },
  US: {
    id: 'US', nombre: 'Estados Unidos',
    moneda: 'USD', localeMoneda: 'en-US',
    codigoTelefono: '1', longitudTelefono: 10,
    mensajeTelefono: 'Phone number, 10 digits (ej: 3055551234)',
    timezone: 'America/New_York'
  }
};

export const paisesList = Object.values(paises).map(p => ({ id: p.id, label: p.nombre }));

export const PAIS_DEFAULT = 'AR';

export function obtenerPais(paisId) {
  return paises[paisId] || paises[PAIS_DEFAULT];
}

export function validarTelefono(numero, paisId) {
  const pais = obtenerPais(paisId);
  const soloDigitos = String(numero || '').replace(/\D/g, '');
  return soloDigitos.length === pais.longitudTelefono;
}

export function formatearMoneda(monto, paisId) {
  const pais = obtenerPais(paisId);
  return new Intl.NumberFormat(pais.localeMoneda, {
    style: 'currency',
    currency: pais.moneda,
    maximumFractionDigits: 0
  }).format(Math.round(Number(monto) || 0));
}
