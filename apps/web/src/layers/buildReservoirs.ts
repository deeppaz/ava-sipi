import type { Reservoir } from '@ava-sipi/schema'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { LineLayer, ScatterplotLayer } from '@deck.gl/layers'
import { fillRamp, hexToRgba, TOKENS } from '@/lib/color'
import { type BuildContext, interleave } from './context'

/** Outer ring radius (px) from the reservoir's full surface area proxy. */
export function ringRadius(r: Reservoir): number {
  const full =
    r.areaKm2 !== undefined && r.fillPct ? r.areaKm2 / (r.fillPct / 100) : (r.areaKm2 ?? 10)
  return Math.min(16, Math.max(4, 3 + 1.6 * Math.log2(full + 1)))
}

/** Degrees per screen pixel at this zoom (512 px world at zoom 0). */
export function degreesPerPixel(zoom: number, lat: number): { dLon: number; dLat: number } {
  const dLon = 360 / (512 * 2 ** zoom)
  return { dLon, dLat: dLon * Math.cos((lat * Math.PI) / 180) }
}

interface Tick {
  id: string
  from: [number, number]
  to: [number, number]
  color: [number, number, number, number]
}

export function buildReservoirs(ctx: BuildContext): Layer[] {
  const data = ctx.data.reservoirs
  if (!ctx.layers.includes('reservoirs') || !data) return []
  const selectedId = ctx.selection?.layer === 'reservoirs' ? ctx.selection.id : null
  const layers: Layer[] = []

  const hover = (info: PickingInfo<Reservoir>) => {
    const r = info.object
    if (!r) return ctx.onHover(null)
    ctx.onHover({
      layer: 'reservoirs',
      id: r.id,
      title: r.name,
      subtitle:
        r.fillPct !== undefined
          ? `${ctx.fmt.t('reservoir.fill')} ${ctx.fmt.percent(r.fillPct)}`
          : ctx.fmt.t('panel.noData'),
      x: info.x,
      y: info.y,
    })
  }
  const click = (info: PickingInfo<Reservoir>) => {
    const r = info.object
    if (!r) return false
    ctx.onSelect({ layer: 'reservoirs', id: r.id, lon: r.lon, lat: r.lat })
    return true
  }

  layers.push(
    new ScatterplotLayer<Reservoir>({
      id: 'reservoirs-ring',
      data: data.reservoirs,
      getPosition: (r) => [r.lon, r.lat],
      getRadius: ringRadius,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      lineWidthMinPixels: 1,
      getLineColor: (r) =>
        r.id === selectedId ? hexToRgba(TOKENS.foam) : hexToRgba(TOKENS.current, 170),
      pickable: true,
      updateTriggers: { getLineColor: [selectedId] },
      ...interleave(ctx),
      onHover: hover,
      onClick: click,
    }),
    new ScatterplotLayer<Reservoir>({
      id: 'reservoirs-fill',
      data: data.reservoirs,
      getPosition: (r) => [r.lon, r.lat],
      // inner radius ∝ sqrt(fill): area reads as fill share (spec §5.3)
      getRadius: (r) => ringRadius(r) * Math.sqrt((r.fillPct ?? 0) / 100),
      radiusUnits: 'pixels',
      getFillColor: (r) =>
        r.fillPct === undefined ? hexToRgba(TOKENS.tide, 120) : fillRamp.rgba(r.fillPct, 220),
      pickable: true,
      ...interleave(ctx),
      onHover: hover,
      onClick: click,
    }),
  )

  // Trend tick: a short line that circles the ring, counter-clockwise when falling.
  const ticks: Tick[] = []
  const omega = ctx.reducedMotion ? 0 : 0.7 // rad/s
  for (const r of data.reservoirs) {
    if (r.trend90d === undefined || Math.abs(r.trend90d) < 0.5) continue
    const dir = r.trend90d < 0 ? 1 : -1 // screen space y grows downward: +angle = counter-clockwise
    const angle = ctx.reducedMotion ? Math.PI / 2 : -Math.PI / 2 + dir * omega * ctx.t
    const rad = ringRadius(r)
    const { dLon, dLat } = degreesPerPixel(ctx.zoom, r.lat)
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    ticks.push({
      id: r.id,
      from: [r.lon + ux * rad * dLon, r.lat + uy * rad * dLat],
      to: [r.lon + ux * (rad + 4) * dLon, r.lat + uy * (rad + 4) * dLat],
      color: r.trend90d < 0 ? hexToRgba(TOKENS.parch) : hexToRgba(TOKENS.surge),
    })
  }
  if (ticks.length) {
    layers.push(
      new LineLayer<Tick>({
        id: 'reservoirs-trend',
        data: ticks,
        getSourcePosition: (d) => d.from,
        getTargetPosition: (d) => d.to,
        getColor: (d) => d.color,
        getWidth: 1.5,
        widthUnits: 'pixels',
        pickable: false,
        ...interleave(ctx),
      }),
    )
  }
  return layers
}
