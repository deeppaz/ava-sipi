/** Build-time configuration (Vite env). No secrets ever live here (spec §8). */

export const env = {
  /** Remote root manifest. Empty → offline sample mode served from /data. */
  manifestUrl: (import.meta.env.VITE_MANIFEST_URL as string | undefined)?.trim() || '',
  /** Cloudflare Worker base for live sources. Empty → direct upstream calls. */
  workerUrl:
    (import.meta.env.VITE_WORKER_URL as string | undefined)?.trim().replace(/\/$/, '') || '',
  sentryDsn: (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() || '',
  /** Vector basemap TileJSON (keyless). */
  basemapTileJson:
    (import.meta.env.VITE_BASEMAP_TILEJSON as string | undefined)?.trim() ||
    'https://tiles.openfreemap.org/planet',
  /** Optional Protomaps PMTiles basemap archive (self-host). Takes precedence when set. */
  basemapPmtiles: (import.meta.env.VITE_BASEMAP_PMTILES as string | undefined)?.trim() || '',
  isDev: import.meta.env.DEV,
} as const

export const SAMPLE_MANIFEST_URL = '/data/manifests/manifest.json'
export const SAMPLE_DATA_BASE = '/data/samples/'

/** Upstream bases used when no Worker is configured (all verified CORS-enabled, see docs/DEVIATIONS.md). */
export const UPSTREAM = {
  usgs: 'https://api.waterdata.usgs.gov/ogcapi/v0',
  noaa: 'https://api.water.noaa.gov/nwps/v1',
  openmeteo: 'https://flood-api.open-meteo.com/v1',
  gww: 'https://api.globalwaterwatch.earth',
} as const

export function liveBase(source: keyof typeof UPSTREAM): string {
  return env.workerUrl ? `${env.workerUrl}/api/live/${source}` : UPSTREAM[source]
}
