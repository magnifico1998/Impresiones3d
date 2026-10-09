import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

// Identificador de cada build (en Vercel, el commit; si no, la hora). Va dentro de la app
// (__BUILD_ID__) y en /version.json: la app abierta lo compara con el publicado para
// avisar que hay una versión nueva (ver src/utils/avisoVersionNueva.js).
const idBuild = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const versionJson = () => ({
  name: 'version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: idBuild, version }) })
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), versionJson()],
  define: { __BUILD_ID__: JSON.stringify(idBuild) },
})
