# Pase a producción: cómo se hace, en orden

Producción es `main` (Vercel lo publica solo). Los datos viven en el proyecto Firebase `print3d-manager-73846`
(alias `prod`); `manager3d-test` (alias `test`) es el de prueba. Este documento es el recorrido completo para pasar
`develop` a `main` sin sorpresas. Los comandos de PowerShell van de a uno por línea.

> Regla: los `firebase deploy` a **prod** y el push a **main** necesitan el OK explícito de Gustavo. El pase
> programado (más abajo) es esa autorización, dada de antemano para un commit puntual y una hora puntual.

## 0. Qué cambia en el servidor con cada pase

Vercel sólo publica la **web**. Lo que vive en Firebase se despliega aparte y **antes** de la web, siempre
compatible con la versión vieja (mientras dura la transición hay gente con la app abierta):

```powershell
git diff main develop --stat -- firestore.rules storage.rules firestore.indexes.json functions
```

- Si no muestra nada: el pase es sólo web. Seguí al punto 2.
- Si muestra algo: primero se prueba en `test` (`firebase deploy --only firestore:rules --project test`, etc.),
  se corre `node scripts/probar-reglas-firestore.cjs` y `node scripts/probar-reglas-storage.cjs`, y recién después
  se despliega a `prod` con el OK, **antes** de programar el pase de la web.

## 1. Preparar develop (días antes)

1. Traer main a develop, para que main quede dentro de develop (el pase es un avance sin mezcla):
   ```powershell
   git checkout develop
   git merge main
   ```
2. Terminar de probar en `https://manager3dtest.vercel.app` con [pruebas-de-humo.md](pruebas-de-humo.md).
3. Cuando ya no entran cambios: subir la versión (regla en CLAUDE.md: deploy con funciones nuevas → versión mayor,
   `package.json` y `package-lock.json`) y escribir la entrada en `src/utils/novedades.js` (sólo lo que cambia para
   los suscriptores). Si la versión no trae nada para ellos, declararlo en este archivo con `SIN_NOVEDADES_V<n>`.
4. Verificar todo desde tu PC (usa tu sesión de `firebase login` para las reglas):
   ```powershell
   npm run verificar-pase -- --con-reglas
   ```
   Tiene que terminar en "✔ Todo verificado". Revisa lint, pruebas automáticas, build, que la versión sea mayor que la
   de main, que estén las novedades y que no queden `.env` ni marcas de conflicto.

## 2. Avisar a los suscriptores

Panel de administración → Negocio → **Aviso de actualización**: fecha, hora (de Argentina) y, si querés, un
mensaje. Se publica y lo ven todos los que tengan la app abierta, desde ese momento hasta 2 horas después de la
hora fijada. Conviene publicarlo con al menos 2 o 3 días de anticipación, y repetirlo por el boletín de mail si el
cambio es grande.

## 3. Programar el pase

```powershell
npm run programar-pase -- --sha HEAD --desde 2026-10-11T11:00:00Z --descripcion "v15.0"
git add release/programado.json
git commit -m "Aprueba el pase programado"
git push origin develop
```

- `--sha HEAD` es el commit que se publica (el último de develop, el que se verificó). Lo que se sume a develop
  **después** no sale en este pase.
- `--desde` va en UTC: Argentina es UTC−3 todo el año, así que **08:00 hs = 11:00 UTC** (`T11:00:00Z`).
- El workflow `.github/workflows/pase-programado.yml` (que tiene que estar en `main`) corre con un cron en UTC
  (`0 11 11 10 *` = 11/10 a las 11:00 UTC). Si cambia el día, hay que cambiar el cron en el workflow **y**
  `--desde`, y el cambio del workflow tiene que estar en `main` antes de esa fecha.
- Para cancelarlo: `npm run programar-pase -- --cancelar`, commit y push a develop.

### Qué hace el workflow a la hora

1. Lee `release/programado.json` de develop. Si no hay pase activo, o la hora no llegó, o pasaron más de 12 horas, no hace nada.
2. Comprueba que el commit esté en develop y que main sea ancestro (avance sin mezcla).
3. Instala, corre `npm run verificar-pase` sobre **ese** commit (sin las reglas, que necesitan tu sesión).
4. Si todo da bien, publica el commit en `main`; Vercel despliega solo. Si algo falla: **main no se toca** y GitHub
   manda un mail por el fallo.
5. Desactiva el pase en develop (`activo: false`) para que no se repita.

También se puede lanzar a mano: GitHub → Actions → "Pase programado a producción" → Run workflow → escribir `PASAR`.

Requisitos del repositorio: Actions habilitado, y la rama `main` **sin** protección que obligue a pull requests
(el workflow empuja directo con el permiso del repositorio).

## 4. Después del pase (domingo 08:00)

1. GitHub → Actions: el último "Pase programado a producción" tiene que estar en verde; el resumen dice a qué commit quedó main.
2. Vercel → Deployments: el de `main` en "Ready".
3. Abrir `https://www.manager3d.com.ar` con Ctrl + Shift + R: la versión del encabezado tiene que ser la nueva.
4. Recorrido rápido de producción (con una cuenta propia, sin cargar datos reales de clientes): entrar, ver pedidos, abrir uno,
   crear y cancelar un presupuesto de prueba, generar un PDF, abrir el catálogo público.
5. Las pestañas que estaban abiertas ven el cartel "Hay una versión nueva… recargá".
6. Quitar el aviso de actualización del panel admin.

## 5. Si hay que volver atrás

- **Más rápido:** Vercel → Deployments → el último que estaba bien → "Promote to Production" (rollback instantáneo,
  sin tocar git). Los datos no se tocan: el pase no migra nada.
- **Después:** `git revert` del pase en `main` (y en develop) para que git quede alineado con lo que está publicado.
- Si el pase incluyó cambios de reglas o functions, volver también a las reglas/functions anteriores con
  `firebase deploy --project prod` desde el commit viejo (con el OK).
