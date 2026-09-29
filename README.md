# Manager3D

App web para emprendimientos de impresión 3D: calculadora de costos,
presupuestos (que se convierten en pedidos al aprobarse), pedidos, clientes,
compras, biblioteca de productos y un catálogo web público por tienda. Se
cobra por suscripción mensual (Mercado Pago) y se vende también a través de
revendedores.

- **Producción:** https://manager3d.com.ar
- **Stack:** React 19 + Vite (Vercel) · Firebase Auth, Firestore, Storage y
  Cloud Functions (Node 22) · Mercado Pago · Gmail

## Documentación

| Documento | Para qué |
|---|---|
| [docs/reglas-de-negocio.md](docs/reglas-de-negocio.md) | Cómo funcionan las suscripciones, los cobros, los revendedores, los códigos promocionales y los límites de los planes |
| [docs/arquitectura.md](docs/arquitectura.md) | Qué hay en cada parte: frontend, Cloud Functions, colecciones de Firestore, seguridad |
| [docs/operacion.md](docs/operacion.md) | Cómo publicar, secrets, logs y qué revisar cuando algo falla |

## Arranque rápido

```powershell
npm install
npm run dev      # http://localhost:5173 (usa el Firebase REAL)
```

Ramas: `develop` (integración) y `main` (producción, la publica Vercel). Las
functions y las reglas se deployan aparte con `firebase deploy`: ver
[docs/operacion.md](docs/operacion.md).
