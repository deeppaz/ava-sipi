import type {
  GaugesLatest,
  LayerId,
  ReservoirsLatest,
  WaterEventCollection,
} from '@ava-sipi/schema'
import type { RiversData } from '@/state/data'
import type { HoverInfo, PerfLevel, Projection, Selection, TimeState } from '@/state/store'

/** Everything a layer builder needs for one frame. */
export interface BuildContext {
  /** seconds since page start */
  t: number
  zoom: number
  layers: readonly LayerId[]
  time: TimeState
  /** 1..7 in forecast mode, else 0 */
  forecastDays: number
  reducedMotion: boolean
  perfLevel: PerfLevel
  projection: Projection
  data: {
    rivers?: RiversData | undefined
    gauges?: GaugesLatest | undefined
    events?: WaterEventCollection | undefined
    reservoirs?: ReservoirsLatest | undefined
  }
  selection: Selection | null
  onSelect: (s: Selection | null) => void
  onHover: (h: HoverInfo | null) => void
  /** formatters bound to the current locale/units */
  fmt: {
    discharge: (m3s: number) => string
    percent: (v: number) => string
    t: (key: string, vars?: Record<string, string | number | undefined>) => string
  }
  /** deck layers render below this MapLibre layer (interleaved) */
  beforeId: string
}

/**
 * MapboxOverlay-only prop (interleaved mode): render below this MapLibre layer. It is not part
 * of deck's typed LayerProps, so it is spread in rather than written literally.
 */
export function interleave(ctx: Pick<BuildContext, 'beforeId'>): { beforeId?: string } {
  return ctx.beforeId ? { beforeId: ctx.beforeId } : {}
}

/** Ease-out pulse phase 0..1 with the given period in seconds. */
export function pulsePhase(t: number, periodS: number): number {
  const x = (t % periodS) / periodS
  return 1 - (1 - x) * (1 - x)
}
