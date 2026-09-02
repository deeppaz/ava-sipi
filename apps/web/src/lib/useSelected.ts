import type { Gauge, Reservoir, WaterEventCollection } from '@ava-sipi/schema'
import { type RiverFeature, useData } from '@/state/data'
import { useApp } from '@/state/store'

export type SelectedObject =
  | { kind: 'gauge'; gauge: Gauge }
  | { kind: 'river'; feature: RiverFeature }
  | { kind: 'event'; feature: WaterEventCollection['features'][number] }
  | { kind: 'reservoir'; reservoir: Reservoir }
  | { kind: 'glacier'; id: string; lon: number; lat: number }
  | { kind: 'raster'; layer: 'drought' | 'groundwater'; id: string; lon: number; lat: number }
  | null

/** Resolve the current selection to its data object. */
export function useSelectedObject(): SelectedObject {
  const selection = useApp((s) => s.selection)
  const rivers = useData((s) => s.rivers.data)
  const gauges = useData((s) => s.gauges.data)
  const events = useData((s) => s.events.data)
  const reservoirs = useData((s) => s.reservoirs.data)
  if (!selection) return null
  switch (selection.layer) {
    case 'gauges': {
      const gauge = gauges?.gauges.find((g) => g.id === selection.id)
      return gauge ? { kind: 'gauge', gauge } : null
    }
    case 'rivers': {
      const id = Number(selection.id)
      const feature = rivers?.features.find((f) => f.id === id)
      return feature ? { kind: 'river', feature } : null
    }
    case 'events': {
      const feature = events?.features.find((f) => f.properties.id === selection.id)
      return feature ? { kind: 'event', feature } : null
    }
    case 'reservoirs': {
      const reservoir = reservoirs?.reservoirs.find((r) => r.id === selection.id)
      return reservoir ? { kind: 'reservoir', reservoir } : null
    }
    case 'glaciers':
      return { kind: 'glacier', id: selection.id, lon: selection.lon ?? 0, lat: selection.lat ?? 0 }
    case 'drought':
    case 'groundwater':
      return {
        kind: 'raster',
        layer: selection.layer,
        id: selection.id,
        lon: selection.lon ?? 0,
        lat: selection.lat ?? 0,
      }
    default:
      return null
  }
}
