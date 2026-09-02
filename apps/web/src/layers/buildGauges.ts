import type { Gauge, GaugesLatest } from '@ava-sipi/schema'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { ScatterplotLayer } from '@deck.gl/layers'
import { hexToRgba, percentileColor, TOKENS } from '@/lib/color'
import { type BuildContext, interleave, pulsePhase } from './context'

export interface GaugeCluster {
  key: string
  lon: number
  lat: number
  n: number
  medianPercentile: number | undefined
  flood: boolean
  ids: string[]
}

const clusterCache = new WeakMap<GaugesLatest, Map<number, GaugeCluster[]>>()

/** Zoom below which stations collapse into 1° cells (spec §5.3: 4, raised under load). */
export function clusterZoomThreshold(perfLevel: number): number {
  return 4 + perfLevel
}

export function clusterGauges(data: GaugesLatest, cellDeg = 1): GaugeCluster[] {
  let byCell = clusterCache.get(data)
  if (!byCell) {
    byCell = new Map()
    clusterCache.set(data, byCell)
  }
  const cached = byCell.get(cellDeg)
  if (cached) return cached
  const cells = new Map<
    string,
    { lon: number; lat: number; n: number; p: number[]; flood: boolean; ids: string[] }
  >()
  for (const g of data.gauges) {
    const key = `${Math.floor(g.lon / cellDeg)}:${Math.floor(g.lat / cellDeg)}`
    let c = cells.get(key)
    if (!c) {
      c = { lon: 0, lat: 0, n: 0, p: [], flood: false, ids: [] }
      cells.set(key, c)
    }
    c.lon += g.lon
    c.lat += g.lat
    c.n += 1
    if (g.percentile !== undefined) c.p.push(g.percentile)
    if (g.floodCategory && g.floodCategory !== 'none') c.flood = true
    c.ids.push(g.id)
  }
  const out: GaugeCluster[] = []
  for (const [key, c] of cells) {
    const sorted = c.p.sort((a, b) => a - b)
    const mid = sorted.length ? (sorted[Math.floor(sorted.length / 2)] as number) : undefined
    out.push({
      key,
      lon: c.lon / c.n,
      lat: c.lat / c.n,
      n: c.n,
      medianPercentile: mid,
      flood: c.flood,
      ids: c.ids,
    })
  }
  byCell.set(cellDeg, out)
  return out
}

export function buildGauges(ctx: BuildContext): Layer[] {
  const data = ctx.data.gauges
  if (!ctx.layers.includes('gauges') || !data) return []
  const dim = ctx.forecastDays > 0 ? 0.35 : 1
  const selectedId = ctx.selection?.layer === 'gauges' ? ctx.selection.id : null
  const clustered = ctx.zoom < clusterZoomThreshold(ctx.perfLevel)
  const layers: Layer[] = []

  if (clustered) {
    const clusters = clusterGauges(data)
    layers.push(
      new ScatterplotLayer<GaugeCluster>({
        id: 'gauges-clusters',
        data: clusters,
        getPosition: (c) => [c.lon, c.lat],
        getRadius: (c) => 3.5 + 1.6 * Math.log2(c.n + 1),
        radiusUnits: 'pixels',
        getFillColor: (c) => percentileColor(c.medianPercentile, 200),
        getLineColor: hexToRgba(TOKENS.abyss, 180),
        stroked: true,
        lineWidthMinPixels: 1,
        opacity: dim,
        pickable: true,
        ...interleave(ctx),
        onHover: (info: PickingInfo<GaugeCluster>) => {
          const c = info.object
          if (!c) return ctx.onHover(null)
          ctx.onHover({
            layer: 'gauges',
            id: c.key,
            title: ctx.fmt.t('gauge.cluster', {
              n: c.n,
              p: c.medianPercentile === undefined ? '—' : Math.round(c.medianPercentile),
            }),
            x: info.x,
            y: info.y,
          })
        },
        onClick: (info: PickingInfo<GaugeCluster>) => {
          const c = info.object
          if (!c) return false
          // zoom into the cell instead of selecting
          ctx.onSelect(null)
          window.dispatchEvent(
            new CustomEvent('ava:flyto', {
              detail: { lon: c.lon, lat: c.lat, zoom: Math.max(ctx.zoom + 2.5, 5) },
            }),
          )
          return true
        },
      }),
    )
    const flooding = clusters.filter((c) => c.flood)
    if (flooding.length)
      layers.push(pulseRing('gauges-cluster-pulse', flooding, (c) => [c.lon, c.lat], 8, ctx, 2))
    return layers
  }

  layers.push(
    new ScatterplotLayer<Gauge>({
      id: 'gauges-points',
      data: data.gauges,
      getPosition: (g) => [g.lon, g.lat],
      getRadius: (g) => (g.id === selectedId ? 6 : 4),
      radiusUnits: 'pixels',
      getFillColor: (g) => percentileColor(g.percentile, 230),
      getLineColor: (g) =>
        g.id === selectedId ? hexToRgba(TOKENS.foam) : hexToRgba(TOKENS.abyss, 200),
      stroked: true,
      lineWidthMinPixels: 1,
      opacity: dim,
      pickable: true,
      autoHighlight: true,
      highlightColor: hexToRgba(TOKENS.foam, 120),
      updateTriggers: { getRadius: [selectedId], getLineColor: [selectedId] },
      ...interleave(ctx),
      onHover: (info: PickingInfo<Gauge>) => {
        const g = info.object
        if (!g) return ctx.onHover(null)
        const parts = []
        if (g.discharge) parts.push(ctx.fmt.discharge(g.discharge.value))
        if (g.percentile !== undefined)
          parts.push(ctx.fmt.t('gauge.percentile', { p: Math.round(g.percentile) }))
        ctx.onHover({
          layer: 'gauges',
          id: g.id,
          title: g.name,
          subtitle: parts.join(' · '),
          x: info.x,
          y: info.y,
        })
      },
      onClick: (info: PickingInfo<Gauge>) => {
        const g = info.object
        if (!g) return false
        ctx.onSelect({ layer: 'gauges', id: g.id, lon: g.lon, lat: g.lat })
        return true
      },
    }),
  )
  const flooding = data.gauges.filter((g) => g.floodCategory && g.floodCategory !== 'none')
  if (flooding.length)
    layers.push(pulseRing('gauges-flood-pulse', flooding, (g) => [g.lon, g.lat], 6, ctx, 2))
  return layers
}

/**
 * Outer ring pulsing radius 1× → 1.6× over `periodS` seconds, ease-out (spec §5.3 / §6.4).
 * Radius scale and opacity are uniforms, so the animation costs no attribute updates.
 */
export function pulseRing<T>(
  id: string,
  data: T[],
  getPosition: (d: T) => [number, number],
  baseRadius: number,
  ctx: BuildContext,
  periodS: number,
  color: string = TOKENS.foam,
): Layer {
  const p = ctx.reducedMotion ? 0.35 : pulsePhase(ctx.t, periodS)
  return new ScatterplotLayer<T>({
    id,
    data,
    getPosition,
    getRadius: baseRadius,
    radiusUnits: 'pixels',
    radiusScale: 1 + 0.6 * p,
    filled: false,
    stroked: true,
    lineWidthMinPixels: 1.5,
    getLineColor: hexToRgba(color),
    opacity: ctx.reducedMotion ? 0.6 : 1 - p,
    pickable: false,
    ...interleave(ctx),
  })
}
