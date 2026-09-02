import type { LayerId } from '@ava-sipi/schema'
import { drought } from './drought.js'
import { events } from './events.js'
import { snow, tides } from './future.js'
import { gauges } from './gauges.js'
import { glaciers } from './glaciers.js'
import { groundwater } from './groundwater.js'
import { reservoirs } from './reservoirs.js'
import { rivers } from './rivers.js'
import type { LayerDefinition, LodRule } from './types.js'

export type * from './types.js'

/** Rail order (spec §5.1). */
export const layerRegistry: readonly LayerDefinition[] = [
  rivers,
  gauges,
  events,
  reservoirs,
  groundwater,
  drought,
  glaciers,
  snow,
  tides,
]

export const layerById: Readonly<Record<LayerId, LayerDefinition>> = Object.fromEntries(
  layerRegistry.map((l) => [l.id, l]),
) as Record<LayerId, LayerDefinition>

/** Layers shown in the rail: waves 1 and 2. */
export const visibleLayers: readonly LayerDefinition[] = layerRegistry.filter((l) => l.wave < 3)

export const defaultOnLayers: LayerId[] = visibleLayers.filter((l) => l.defaultOn).map((l) => l.id)

/** Minimum Strahler order to draw at a zoom, following the layer's LOD table. */
export function minOrderForZoom(rules: readonly LodRule[] | undefined, zoom: number): number {
  if (!rules || rules.length === 0) return 1
  for (const r of rules) if (zoom < r.maxZoom) return r.minOrder
  return rules[rules.length - 1]?.minOrder ?? 1
}

export { drought, events, gauges, glaciers, groundwater, reservoirs, rivers, snow, tides }
