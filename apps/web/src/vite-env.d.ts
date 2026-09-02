/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_MANIFEST_URL?: string
  readonly VITE_WORKER_URL?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_BASEMAP_TILEJSON?: string
  readonly VITE_BASEMAP_PMTILES?: string
}
