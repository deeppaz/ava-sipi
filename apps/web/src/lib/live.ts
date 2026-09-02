/**
 * Live series for the detail panel. Goes through the Worker when configured, otherwise
 * straight to upstream (USGS, NWPS, Open-Meteo, GWW all send `Access-Control-Allow-Origin: *`,
 * verified 2026-09-02).
 */

import { liveBase } from './env'
import { fetchJsonCached } from './fetch'

export type SeriesPoint = [string, number]
export interface Series {
  unit: 'm3/s' | 'm' | 'km2' | 'cm' | 'percentile'
  points: SeriesPoint[]
  forecast: SeriesPoint[]
  source: string
  sourceUrl: string
}

const CFS = 0.028316846592
const KCFS = 28.316846592
const FT = 0.3048

interface OgcFeature {
  properties: { time: string; value: string | number | null; unit_of_measure?: string }
}

export async function fetchUsgsSeries(
  siteId: string,
  days = 7,
  signal?: AbortSignal,
): Promise<Series> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19)
  const url =
    `${liveBase('usgs')}/collections/continuous/items?f=json&limit=10000&monitoring_location_id=${encodeURIComponent(siteId)}` +
    `&parameter_code=00060&datetime=${since}Z/..`
  const data = await fetchJsonCached<{ features: OgcFeature[] }>(url, 5 * 60_000, {
    signal,
    timeoutMs: 20000,
  })
  const points: SeriesPoint[] = []
  for (const f of data.features) {
    const p = f.properties
    if (p.value === null || p.value === '' || p.unit_of_measure !== 'ft^3/s') continue
    const v = Number(p.value)
    if (v < 0) continue
    points.push([p.time, v * CFS])
  }
  points.sort((a, b) => a[0].localeCompare(b[0]))
  return {
    unit: 'm3/s',
    points,
    forecast: [],
    source: 'USGS',
    sourceUrl: `https://waterdata.usgs.gov/monitoring-location/${siteId.replace('USGS-', '')}/`,
  }
}

interface StageFlow {
  observed?: {
    data?: { validTime: string; primary: number; secondary: number }[]
    primaryUnits?: string
    secondaryUnits?: string
  }
  forecast?: {
    data?: { validTime: string; primary: number; secondary: number }[]
    secondaryUnits?: string
  }
}

export async function fetchNwpsSeries(lid: string, signal?: AbortSignal): Promise<Series> {
  const url = `${liveBase('noaa')}/gauges/${encodeURIComponent(lid)}/stageflow`
  const data = await fetchJsonCached<StageFlow>(url, 5 * 60_000, { signal, timeoutMs: 20000 })
  const conv = (unit: string | undefined) =>
    unit === 'kcfs' ? KCFS : unit === 'cfs' ? CFS : Number.NaN
  const obsK = conv(data.observed?.secondaryUnits)
  const fcK = conv(data.forecast?.secondaryUnits ?? data.observed?.secondaryUnits)
  const toPts = (
    rows: { validTime: string; secondary: number }[] | undefined,
    k: number,
  ): SeriesPoint[] =>
    (rows ?? [])
      .filter((r) => Number.isFinite(k) && r.secondary !== null && r.secondary > -999)
      .map((r) => [r.validTime, r.secondary * k] as SeriesPoint)
  // Some gauges only report stage: fall back to stage in metres.
  let unit: Series['unit'] = 'm3/s'
  let points = toPts(data.observed?.data, obsK)
  let forecast = toPts(data.forecast?.data, fcK)
  if (points.length === 0 && data.observed?.primaryUnits === 'ft') {
    unit = 'm'
    points = (data.observed.data ?? [])
      .filter((r) => r.primary > -999)
      .map((r) => [r.validTime, r.primary * FT] as SeriesPoint)
    forecast = (data.forecast?.data ?? [])
      .filter((r) => r.primary > -999)
      .map((r) => [r.validTime, r.primary * FT] as SeriesPoint)
  }
  return {
    unit,
    points,
    forecast,
    source: 'NOAA NWPS',
    sourceUrl: `https://water.noaa.gov/gauges/${lid}`,
  }
}

interface FloodResp {
  daily?: { time: string[]; river_discharge: (number | null)[] }
}

export async function fetchRiverSeries(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Series> {
  const url = `${liveBase('openmeteo')}/flood?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=river_discharge&past_days=30&forecast_days=7`
  const data = await fetchJsonCached<FloodResp>(url, 30 * 60_000, { signal, timeoutMs: 20000 })
  const times = data.daily?.time ?? []
  const vals = data.daily?.river_discharge ?? []
  const today = new Date().toISOString().slice(0, 10)
  const points: SeriesPoint[] = []
  const forecast: SeriesPoint[] = []
  times.forEach((t, i) => {
    const v = vals[i]
    if (v === null || v === undefined) return
    ;(t <= today ? points : forecast).push([`${t}T00:00:00Z`, v])
  })
  return {
    unit: 'm3/s',
    points,
    forecast,
    source: 'Open-Meteo · GloFAS',
    sourceUrl: 'https://open-meteo.com/en/docs/flood-api',
  }
}

export async function fetchJsonSeries(
  url: string,
  signal?: AbortSignal,
): Promise<{ points: SeriesPoint[]; areaP95Km2?: number }> {
  const data = await fetchJsonCached<{ points: [string, number][]; areaP95Km2?: number }>(
    url,
    60 * 60_000,
    { signal },
  )
  return {
    points: data.points.map(([d, v]) => [d.length === 10 ? `${d}T00:00:00Z` : d, v]),
    ...(data.areaP95Km2 !== undefined ? { areaP95Km2: data.areaP95Km2 } : {}),
  }
}
