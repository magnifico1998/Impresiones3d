// Formato de números para mostrar en pantalla: separador de miles y coma decimal
// (es-AR), siempre con el mismo criterio. Para plata usar `fmt` de useApp() (o
// formatearMoneda de utils/paises.js); esto es para cantidades, gramos, horas y
// porcentajes. Nunca mostrar un número con .toFixed(): sale con punto decimal y sin
// separador de miles (1234.5 en vez de 1.234,5).

export function formatoNumero(n, decimales = 0) {
  const x = Number(n);
  return (Number.isFinite(x) ? x : 0).toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: true
  });
}

// "1.234,5 g"
export const formatoGramos = (g, decimales = 1) => `${formatoNumero(g, decimales)} g`;
