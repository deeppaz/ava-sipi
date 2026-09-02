export type Source = 'usgs' | 'noaa' | 'gdacs' | 'openmeteo' | 'gww'

export const UPSTREAMS: Record<Source, string> = {
  usgs: 'https://api.waterdata.usgs.gov/ogcapi/v0',
  noaa: 'https://api.water.noaa.gov/nwps/v1',
  gdacs: 'https://www.gdacs.org/gdacsapi/api',
  openmeteo: 'https://flood-api.open-meteo.com/v1',
  gww: 'https://api.globalwaterwatch.earth',
}

/** Path prefixes allowed per source — keeps the proxy from becoming an open relay. */
const ALLOW: Record<Source, RegExp[]> = {
  usgs: [
    /^\/collections\/(latest-continuous|continuous|daily|monitoring-locations|latest-daily)\/items$/,
  ],
  noaa: [/^\/gauges(\/[A-Za-z0-9]{3,8}(\/stageflow)?)?$/],
  gdacs: [
    /^\/events\/geteventlist\/(SEARCH|MAP)$/,
    /^\/polygons\/getgeometry$/,
    /^\/events\/geteventdata$/,
  ],
  openmeteo: [/^\/flood$/],
  gww: [/^\/reservoir\/\d+(\/ts\/[a-z_]+)?$/, /^\/reservoir\/geometry$/],
}

export interface Route {
  source: Source
  path: string
}

export function resolveRoute(pathname: string): Route | null {
  const m = /^\/api\/live\/(usgs|noaa|gdacs|openmeteo|gww)(\/.*)?$/.exec(pathname)
  if (!m) return null
  const source = m[1] as Source
  const path = (m[2] ?? '/').replace(/\/+$/, '') || '/'
  if (!ALLOW[source].some((re) => re.test(path))) return null
  return { source, path }
}

export function buildUpstreamUrl(route: Route, params: URLSearchParams): URL {
  const url = new URL(UPSTREAMS[route.source] + route.path)
  for (const [k, v] of params) {
    if (k === 'apikey' || k === 'api_key') continue // never forward client-supplied keys
    url.searchParams.append(k, v)
  }
  return url
}
