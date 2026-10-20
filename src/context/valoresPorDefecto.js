import { PAIS_DEFAULT } from '../utils/paises';

export const defaultCfg = {
  palette: 'tranqui',
  filamentos: [
    { nombre: 'PLA Blanco', precio: 17000 },
    { nombre: 'PLA Negro', precio: 18000 },
    { nombre: 'PLA Rojo', precio: 18500 },
    { nombre: 'PLA Azul', precio: 18500 },
    { nombre: 'PETG Transparente', precio: 22000 },
    { nombre: 'ABS Gris', precio: 19000 },
    { nombre: 'TPU', precio: 28000 }
  ],
  impresoras: [
    { nombre: 'Bambu X1', watts: 350, mant: 200 },
    { nombre: 'Prusa MK4', watts: 200, mant: 150 },
    { nombre: 'Ender 3', watts: 120, mant: 80 }
  ],
  insumos: [
    { nombre: 'Soporte/raft', precio: 500 },
    { nombre: 'Adhesivo de cama', precio: 300 },
    { nombre: 'Lijado', precio: 800 },
    { nombre: 'Pintado', precio: 1500 },
    { nombre: 'Empaque / envío', precio: 700 }
  ],
  colores: [
    { nombre: 'Blanco', hex: '#f5f5f5', secundario: false },
    { nombre: 'Negro', hex: '#1a1a1a', secundario: false },
    { nombre: 'Rojo', hex: '#e53935', secundario: false },
    { nombre: 'Azul', hex: '#1e88e5', secundario: false },
    { nombre: 'Verde', hex: '#43a047', secundario: false },
    { nombre: 'Gris', hex: '#9e9e9e', secundario: false },
    { nombre: 'Amarillo', hex: '#fdd835', secundario: false }
  ],
  metodosEnvio: [
    { nombre: 'Correo Argentino', urlSeguimiento: 'https://www.correoargentino.com.ar/seguimiento', incluirCodigo: false },
    { nombre: 'Andreani', urlSeguimiento: 'https://www.andreani.com/#!/informacionEnvio/{codigo}' },
    { nombre: 'Retiro en persona', urlSeguimiento: '' },
    { nombre: 'Envío propio', urlSeguimiento: '' }
  ],
  kwh: 120,
  mo: 500,
  margen: 100,
  desperdicio: 5,
  // Si está activo, "Gastos" en Resumen suma todos los ítems de costo del
  // producto (filamento, insumos, mantenimiento, electricidad, MO) y la
  // fórmula de rentabilidad deja de restar "Gastos compras" (para no
  // duplicar filamento/insumos que ya se compraron y cargaron ahí).
  costoCompletoActivo: false,
  // Habilita la pestaña "Inventario" en Compras (Configuración → Aplicación).
  inventarioHabilitado: false,
  // Orden manual de categorías (arrastrar para reordenar en Biblioteca).
  // Lista de nombres de categoría; las que no aparecen acá se agregan al
  // final ordenadas alfabéticamente. Se persiste igual que el resto de cfg.
  categoriaOrden: [],
  // Pares de colores predefinidos ({color, colorSecundario}) para
  // productos en modo "combinaciones" (ver proyeccionCatalogoProducto):
  // el cliente elige la combinación completa de un único selector, no
  // colores sueltos.
  combinacionesColores: [],
  // Capacidad de producción instalada (impresoras y horario de trabajo),
  // etapa 1 de la estimación de ETA de pedidos: por ahora sólo define la
  // capacidad, el cálculo en sí se suma en una etapa aparte. Independiente
  // de la lista nombrada `impresoras` de arriba (esa es sólo para costeo
  // eléctrico). diasLaborables: 0=Dom .. 6=Sáb.
  capacidadProduccion: {
    habilitado: false,
    cantidadImpresoras: 1,
    horasPorDia: 8,
    horaInicio: 9,
    diasLaborables: [1, 2, 3, 4, 5, 6]
  }
};

export const defaultEmpresa = {
  nombre: '',
  cuit: '',
  direccion: '',
  cp: '',
  email: '',
  telefono: '',
  facebook: '',
  instagram: '',
  logo: '',
  pais: PAIS_DEFAULT
};
