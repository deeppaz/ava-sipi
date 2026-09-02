import { minOrderForZoom, rivers as riversDef } from '@ava-sipi/layers'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { PathLayer } from '@deck.gl/layers'
import { hexToRgba, type RGBA, riverRamp, TOKENS } from '@/lib/color'
import type { RiverFeature, RiversData } from '@/state/data'
import { type BuildContext, interleave } from './context'
import { featuresForOrder, ratioFor, widthForDischarge, zoomWidthScale } from './riverMath'
import FlowExtension, { type FlowExtensionProps } from './rivers/FlowExtension'

export { featuresForOrder, ratioFor, widthForDischarge, zoomWidthScale }

/** Extension props are not part of PathLayer's typed props; spread them in. */
function flowProps(p: FlowExtensionProps<RiverFeature>): FlowExtensionProps<RiverFeature> {
  return p
}

const UNKNOWN_COLOR: RGBA = hexToRgba(TOKENS.current, 210)

export function buildRivers(ctx: BuildContext): Layer[] {
  const data: RiversData | undefined = ctx.data.rivers
  if (!ctx.layers.includes('rivers') || !data) return []
  const minOrder = Math.min(7, minOrderForZoom(riversDef.lod, ctx.zoom) + ctx.perfLevel)
  const features = featuresForOrder(data.features, minOrder)
  const dischargeKey = `${data.dischargeDay ?? 'none'}:${data.discharge.size}:${ctx.forecastDays}`
  const ratioOf = (f: RiverFeature) => ratioFor(f, data.discharge.get(f.id), ctx.forecastDays)
  const selectedId = ctx.selection?.layer === 'rivers' ? Number(ctx.selection.id) : -1

  return [
    new PathLayer<RiverFeature>({
      id: 'rivers-spine',
      data: features,
      getPath: (f) => f.path as unknown as number[],
      getColor: (f) => {
        const r = ratioOf(f)
        if (r === undefined) return UNKNOWN_COLOR
        return riverRamp.rgba(r, f.id === selectedId ? 255 : 235)
      },
      getWidth: (f) => widthForDischarge(f.meanDischarge) * (f.id === selectedId ? 1.5 : 1),
      widthUnits: 'pixels',
      widthScale: zoomWidthScale(ctx.zoom),
      widthMinPixels: 0.6,
      widthMaxPixels: 9,
      capRounded: true,
      jointRounded: true,
      billboard: false,
      pickable: true,
      autoHighlight: true,
      highlightColor: hexToRgba(TOKENS.foam, 90),
      ...flowProps({
        getFlowRatio: (f: RiverFeature) => ratioOf(f) ?? 1,
        flowTime: ctx.t,
        flowIntensity: ctx.reducedMotion ? 0 : 0.55,
        flowSpeed: 0.35,
        flowWavelength: 14,
      }),
      extensions: [new FlowExtension()],
      updateTriggers: {
        getColor: [dischargeKey, selectedId],
        getWidth: [selectedId],
        getFlowRatio: [dischargeKey],
        getPath: [ctx.projection],
      },
      ...interleave(ctx),
      onHover: (info: PickingInfo<RiverFeature>) => {
        const f = info.object
        if (!f) {
          ctx.onHover(null)
          return
        }
        const r = ratioOf(f)
        ctx.onHover({
          layer: 'rivers',
          id: String(f.id),
          title: f.name ?? ctx.fmt.t('river.title'),
          subtitle: `${ctx.fmt.discharge(f.meanDischarge)}${r !== undefined ? ` · ${ctx.fmt.t('river.ratio', { ratio: r.toFixed(2) })}` : ''}`,
          x: info.x,
          y: info.y,
        })
      },
      onClick: (info: PickingInfo<RiverFeature>) => {
        const f = info.object
        if (!f) return false
        const [lon, lat] = info.coordinate
          ? [info.coordinate[0] as number, info.coordinate[1] as number]
          : f.mid
        ctx.onSelect({ layer: 'rivers', id: String(f.id), lon, lat })
        return true
      },
    }),
  ]
}
