import type { WaterEventCollection, WaterEventProperties } from '@ava-sipi/schema'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { eventColor, hexToRgba, TOKENS } from '@/lib/color'
import { type BuildContext, interleave, pulseRing } from './context-pulse'

type EventFeature = WaterEventCollection['features'][number]

interface Split {
  polygons: EventFeature[]
  points: EventFeature[]
  red: EventFeature[]
  orange: EventFeature[]
}
const splitCache = new WeakMap<WaterEventCollection, Split>()

function split(fc: WaterEventCollection): Split {
  let s = splitCache.get(fc)
  if (s) return s
  s = { polygons: [], points: fc.features, red: [], orange: [] }
  for (const f of fc.features) {
    if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') s.polygons.push(f)
    if (f.properties.severity === 'red') s.red.push(f)
    else if (f.properties.severity === 'orange') s.orange.push(f)
  }
  splitCache.set(fc, s)
  return s
}

const centroid = (f: EventFeature): [number, number] => f.properties.centroid

function radiusFor(p: WaterEventProperties): number {
  return p.severity === 'red' ? 7 : p.severity === 'orange' ? 6 : 4.5
}

export function buildEvents(ctx: BuildContext): Layer[] {
  const data = ctx.data.events
  if (!ctx.layers.includes('events') || !data) return []
  const s = split(data)
  const selectedId = ctx.selection?.layer === 'events' ? ctx.selection.id : null
  const layers: Layer[] = []

  const hover = (info: PickingInfo<EventFeature>) => {
    const f = info.object
    if (!f) return ctx.onHover(null)
    const p = f.properties
    ctx.onHover({
      layer: 'events',
      id: p.id,
      title: p.title,
      subtitle: `${ctx.fmt.t(`event.type.${p.type}`)} · ${ctx.fmt.t(`event.severity.${p.severity}`)}`,
      x: info.x,
      y: info.y,
    })
  }
  const click = (info: PickingInfo<EventFeature>) => {
    const f = info.object
    if (!f) return false
    const [lon, lat] = f.properties.centroid
    ctx.onSelect({ layer: 'events', id: f.properties.id, lon, lat })
    return true
  }

  if (s.polygons.length) {
    layers.push(
      new GeoJsonLayer<WaterEventProperties>({
        id: 'events-polygons',
        data: { type: 'FeatureCollection', features: s.polygons } as GeoJSON.FeatureCollection,
        filled: true,
        stroked: true,
        getFillColor: (f) => hexToRgba(eventColor[(f.properties as WaterEventProperties).type], 50),
        getLineColor: (f) =>
          hexToRgba(eventColor[(f.properties as WaterEventProperties).type], 190),
        lineWidthMinPixels: 1,
        pickable: true,
        ...interleave(ctx),
        onHover: hover as (info: PickingInfo) => void,
        onClick: click as (info: PickingInfo) => boolean,
      }),
    )
  }

  layers.push(
    new ScatterplotLayer<EventFeature>({
      id: 'events-points',
      data: s.points,
      getPosition: centroid,
      getRadius: (f) => radiusFor(f.properties) * (f.properties.id === selectedId ? 1.4 : 1),
      radiusUnits: 'pixels',
      getFillColor: (f) => hexToRgba(eventColor[f.properties.type], 220),
      getLineColor: (f) =>
        f.properties.id === selectedId ? hexToRgba(TOKENS.foam) : hexToRgba(TOKENS.abyss, 200),
      stroked: true,
      lineWidthMinPixels: 1,
      pickable: true,
      autoHighlight: true,
      highlightColor: hexToRgba(TOKENS.foam, 110),
      updateTriggers: { getRadius: [selectedId], getLineColor: [selectedId] },
      ...interleave(ctx),
      onHover: hover,
      onClick: click,
    }),
  )
  // Severity pulses: red 2 s, orange 4 s, green static (spec §5.3)
  if (s.red.length)
    layers.push(pulseRing('events-pulse-red', s.red, centroid, 9, ctx, 2, TOKENS.foam))
  if (s.orange.length)
    layers.push(pulseRing('events-pulse-orange', s.orange, centroid, 8, ctx, 4, TOKENS.foam))
  return layers
}
