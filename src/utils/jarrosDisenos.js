// Diseños y estilos del jarro (Fase 7 del plan en docs/plan-generador-jarros.md): ESTILOS listos para usar, diseños que se
// GUARDAN en la cuenta y se reabren, y diseños que se COMPARTEN como archivo. Sin navegador: se prueba en Node.
//
// Un diseño es el objeto de parámetros del jarro (los mismos que usa la herramienta, ya saneados). Se guarda como texto JSON.
import { PARAMETROS_INICIALES, conForma, conFormaAsa, sanearParametros } from './jarros';

export const MAX_DISENOS = 30; // por cuenta
export const MAX_BYTES_DISENO = 700000; // en la cuenta (un doc de Firestore admite 1 MiB)
export const MAX_BYTES_ARCHIVO = 800000; // al abrir un archivo compartido
export const MAX_BYTES_MINIATURA = 60000;
export const FORMATO_ARCHIVO = 'manager3d-jarro';

// Lo que un estilo no toca: la lata (medidas y holguras), el cuerpo de base y los ajustes de impresión.
const CONSERVAR = ['latId', 'diametroHueco', 'altoHueco', 'holgura', 'pared', 'fondo', 'aberturaFondo', 'holguraEncastre', 'impresora'];

// Estilos: cada uno parte del jarro de fábrica (no del diseño actual) y cambia silueta, textura, asa, cartel, emblemas, aros y colores.
export const ESTILOS = [
  {
    id: 'cervecero', nombre: 'Cervecero', ayuda: 'Barril de duelas de madera con aros de metal y remaches, y un cartel "CERVEZA".',
    parametros: {
      forma: 'barril', textura: 'duelas', duelasCantidad: 18, duelasSeparacion: 1.4, duelasProfundidad: 1.1, duelasIrregularidad: 0.35, duelasVeta: 0.5,
      aroArriba: true, aroAbajo: true, aroRemaches: 16, aroAlto: 7,
      cartel: true, cartelTexto: 'CERVEZA', cartelMayusculas: 'mayus', cartelFuente: 'bebas', cartelForma: 'etiqueta', cartelRemaches: 2, cartelAlturaLetra: 11,
      asaForma: 'd', envoltura: true, envolturaEstilo: 'cuerda', envolturaCentro: 50, envolturaLargo: 50,
      colores: { cuerpo: '#8b5a2b', asa: '#4a4a4a', aro: '#3a3a3a', aroRemaches: '#c9a227', cartel: '#e9d8a6', letras: '#3a2a1a', borde: '#8a6b3b', remaches: '#c9a227', envoltura: '#6b4a2f', collarin: '#c9a227' }
    }
  },
  {
    id: 'vikingo', nombre: 'Vikingo', ayuda: 'Más ancho arriba, de tablones de madera, con dos escudos a los costados y un aro con remaches.',
    parametros: {
      forma: 'cono', textura: 'madera-tablones', texturaTamano: 16, texturaProfundidad: 0.8,
      emblema: true, emblemaSimbolo: 'escudo', emblemaRespaldo: 'etiqueta', emblemaCantidad: 2, emblemaAngulo: 180, emblemaTamano: 28, emblemaAltura: 95,
      aroArriba: true, aroRemaches: 12, aroAlto: 6,
      asaForma: 'angular', envoltura: true, envolturaEstilo: 'bandas', envolturaPaso: 7, envolturaLargo: 45,
      colores: { cuerpo: '#5a4632', asa: '#3d3d3d', emblema: '#7a7a7a', simbolo: '#d9d9d9', emblemaBorde: '#4a4a4a', aro: '#4a4a4a', aroRemaches: '#b0b0b0', envoltura: '#6b4a2f', collarin: '#b0b0b0' }
    }
  },
  {
    id: 'navideno', nombre: 'Navideño', ayuda: 'Rojo con aros blancos, una estrella dorada y el cartel "Feliz Navidad".',
    parametros: {
      aroArriba: true, aroAbajo: true, aroAlto: 6,
      emblema: true, emblemaSimbolo: 'estrella', emblemaRespaldo: 'ovalo', emblemaAngulo: 180, emblemaTamano: 26,
      cartel: true, cartelTexto: 'Feliz\nNavidad', cartelFuente: 'pacifico', cartelForma: 'pastilla', cartelAlturaLetra: 9,
      colores: { cuerpo: '#b3262d', asa: '#2f7d3a', aro: '#f4f4f4', cartel: '#f4f4f4', letras: '#2f7d3a', borde: '#2f7d3a', emblema: '#2f7d3a', simbolo: '#f2c744', emblemaBorde: '#f4f4f4' }
    }
  },
  {
    id: 'rustico', nombre: 'Rústico de madera', ayuda: 'Cuerpo recto de duelas de madera con un aro abajo y un cartel simple.',
    parametros: {
      textura: 'duelas', duelasCantidad: 12, duelasSeparacion: 1.2, duelasProfundidad: 1, duelasIrregularidad: 0.5, duelasVeta: 0.7,
      aroAbajo: true, aroAlto: 8, cartel: true, cartelTexto: 'Mi jarro', cartelFuente: 'roboto-slab', cartelForma: 'placa', cartelAlturaLetra: 10,
      asaForma: 'clasica',
      colores: { cuerpo: '#a9763f', asa: '#5a3d1f', aro: '#2f2f2f', cartel: '#3a2a1a', letras: '#e9d8a6', borde: '#8a6b3b' }
    }
  },
  {
    id: 'carbono', nombre: 'Fibra de carbono', ayuda: 'Negro con trama de carbono, asa y aro rojos y un cartel deportivo.',
    parametros: {
      textura: 'carbono-sargaFina', texturaTamano: 10, texturaProfundidad: 0.5, aroArriba: true, aroAlto: 5,
      cartel: true, cartelTexto: 'GARAGE', cartelMayusculas: 'mayus', cartelFuente: 'bebas', cartelForma: 'pastilla', cartelAlturaLetra: 11,
      asaForma: 'sinsoportes',
      colores: { cuerpo: '#1c1c1e', asa: '#c0392b', aro: '#c0392b', cartel: '#c0392b', letras: '#f2f2f2', borde: '#f2f2f2' }
    }
  },
  {
    id: 'panal', nombre: 'Panal de miel', ayuda: 'Amarillo con textura de panal, asa negra y un cartel "Miel".',
    parametros: {
      textura: 'geo-hexagonos', texturaTamano: 14, texturaProfundidad: 0.8, cartel: true, cartelTexto: 'Miel', cartelFuente: 'dancing', cartelForma: 'ovalo', cartelAlturaLetra: 13,
      colores: { cuerpo: '#f2b705', asa: '#1a1a1a', cartel: '#3a2a1a', letras: '#f2b705', borde: '#1a1a1a' }
    }
  },
  {
    id: 'minimalista', nombre: 'Minimalista', ayuda: 'Cuerpo liso con cintura, blanco y negro, y un cartel "Café".',
    parametros: {
      forma: 'cintura', cartel: true, cartelTexto: 'Café', cartelFuente: 'righteous', cartelForma: 'pastilla', cartelBorde: false, cartelAlturaLetra: 11,
      colores: { cuerpo: '#f2f2f2', asa: '#1a1a1a', cartel: '#1a1a1a', letras: '#f2f2f2' }
    }
  }
];

// El diseño que sale de aplicar un estilo: parte del jarro de fábrica, conserva la lata y los ajustes de impresión.
export function aplicarEstilo(actual, id) {
  const estilo = ESTILOS.find((x) => x.id === id);
  if (!estilo) throw new Error('No existe ese estilo.');
  const base = { ...PARAMETROS_INICIALES, colores: { ...PARAMETROS_INICIALES.colores } };
  for (const k of CONSERVAR) if (actual && actual[k] !== undefined) base[k] = actual[k];
  const { colores = {}, ...resto } = estilo.parametros;
  let d = { ...base, ...resto, colores: { ...base.colores, ...colores } };
  // La silueta y la forma del asa de lista traen sus puntos.
  if (resto.forma) d = conForma(d, resto.forma);
  if (resto.asaForma) d = conFormaAsa(d, resto.asaForma);
  return sanearParametros(d);
}

// ---------- Guardar en la cuenta ----------

export const limpiarNombreDiseno = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 60);

// Texto de un diseño para guardarlo en la cuenta (los parámetros saneados). Falla si pesa demasiado (por ejemplo, con un SVG enorme).
export function datosDeDiseno(parametros) {
  const datos = JSON.stringify(sanearParametros(parametros));
  if (datos.length > MAX_BYTES_DISENO) throw new Error('El diseño es demasiado pesado para guardarlo (probablemente por un SVG muy detallado): simplificalo.');
  return datos;
}

// Parámetros de un diseño guardado. Se sanean (vienen de la base): lo raro vuelve a su valor de siempre.
export function parametrosDeDatos(texto) {
  if (typeof texto !== 'string' || !texto || texto.length > MAX_BYTES_DISENO) throw new Error('El diseño guardado no se puede leer.');
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new Error('El diseño guardado no se puede leer.'); }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('El diseño guardado no se puede leer.');
  return sanearParametros(datos);
}

// ---------- Compartir como archivo ----------

export const nombreArchivoDiseno = (nombre) => `${limpiarNombreDiseno(nombre) || 'Jarro'}.jarro.json`;

// Contenido del archivo para compartir un diseño.
export function empaquetarDiseno(parametros, nombre) {
  return JSON.stringify({ formato: FORMATO_ARCHIVO, version: 1, nombre: limpiarNombreDiseno(nombre), parametros: sanearParametros(parametros) });
}

// Lee un archivo compartido: { nombre, parametros } saneado. Rechaza lo que no sea un diseño de Manager3D.
export function leerDiseno(texto) {
  if (typeof texto !== 'string' || texto.length > MAX_BYTES_ARCHIVO) throw new Error('El archivo es demasiado pesado para ser un diseño de jarro.');
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new Error('Ese archivo no es un diseño de jarro de Manager3D.'); }
  if (!datos || datos.formato !== FORMATO_ARCHIVO || !datos.parametros || typeof datos.parametros !== 'object') throw new Error('Ese archivo no es un diseño de jarro de Manager3D.');
  if (!(Number(datos.version) >= 1)) throw new Error('Ese archivo no es un diseño de jarro de Manager3D.');
  return { nombre: limpiarNombreDiseno(datos.nombre), parametros: sanearParametros(datos.parametros) };
}
