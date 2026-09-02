import { cpSync, existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const dataDir = join(repoRoot, 'data')
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.parquet': 'application/vnd.apache.parquet',
  '.pmtiles': 'application/vnd.pmtiles',
  '.png': 'image/png',
  '.md': 'text/markdown',
}

/**
 * Serves the monorepo's data/ (manifests + samples) at /data in dev/preview and copies it into
 * dist/data at build time, so `pnpm dev` works offline with zero configuration (spec §1.4).
 * Supports HTTP range requests, which PMTiles and parquet readers rely on.
 */
function serveData(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/data/')) return next()
    const rel = decodeURIComponent(req.url.split('?')[0] ?? '').slice('/data/'.length)
    const file = normalize(join(dataDir, rel))
    if (!file.startsWith(normalize(dataDir)) || !existsSync(file) || statSync(file).isDirectory()) {
      res.statusCode = 404
      return res.end('not found')
    }
    const buf = readFileSync(file)
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-cache')
    const range =
      typeof req.headers.range === 'string' ? /bytes=(\d+)-(\d*)/.exec(req.headers.range) : null
    if (range) {
      const start = Number(range[1])
      const end = range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${buf.length}`)
      res.setHeader('Content-Length', end - start + 1)
      return res.end(buf.subarray(start, end + 1))
    }
    res.setHeader('Content-Length', buf.length)
    res.end(buf)
  }
  return {
    name: 'ava-sipi-serve-data',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
    closeBundle() {
      const out = resolve(fileURLToPath(new URL('./dist/data', import.meta.url)))
      for (const sub of ['manifests', 'samples']) {
        if (existsSync(join(dataDir, sub)))
          cpSync(join(dataDir, sub), join(out, sub), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveData()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true, fs: { allow: [repoRoot] } },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // keep Vite's preload helper out of the lazy deck chunk so deck.gl never becomes an initial import
            { name: 'preload', test: /preload-helper/, priority: 100 },
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
            {
              name: 'deck',
              test: /node_modules[\\/]@(deck\.gl|luma\.gl|math\.gl|probe\.gl|loaders\.gl)/,
            },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
