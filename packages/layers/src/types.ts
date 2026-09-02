import type { ArtifactKind, Attribution, LayerId, Legend } from '@ava-sipi/schema'

/** Design tokens a layer may use for its identity colour (see docs/DESIGN.md). */
export type ColorToken =
  | 'abyss'
  | 'shelf'
  | 'tide'
  | 'current'
  | 'foam'
  | 'glacier'
  | 'surge'
  | 'parch'
  | 'parch-deep'
  | 'cyclone'

export type LayerRenderer = 'deck' | 'maplibre'

export interface LodRule {
  /** Rule applies while zoom < maxZoom (rules are evaluated in order). */
  maxZoom: number
  /** Minimum Strahler order to draw. */
  minOrder: number
}

export interface TimeSupport {
  /** Earliest day the slider may go back to for this layer (ISO day) or null when the layer has no history. */
  historyFrom: string | null
  /** Step for the slider when this layer is the driver. */
  step: 'day' | 'month' | '10day'
  /** Days of published forecast available (0 = none). */
  forecastDays: number
}

export interface LayerDefinition {
  id: LayerId
  /** i18n keys */
  nameKey: string
  descriptionKey: string
  /** Identity colour token used for the rail marker and default fills. */
  color: ColorToken
  icon:
    | 'river'
    | 'gauge'
    | 'event'
    | 'reservoir'
    | 'groundwater'
    | 'drought'
    | 'glacier'
    | 'snow'
    | 'tide'
  renderer: LayerRenderer
  geometry: 'lines' | 'points' | 'mixed' | 'raster' | 'polygons'
  artifactKinds: ArtifactKind[]
  /** On by default at first load. */
  defaultOn: boolean
  /** Delivery wave (see spec §10). Wave 3 layers are hidden from the rail until shipped. */
  wave: 1 | 2 | 3
  refreshMinutes: number
  time: TimeSupport
  lod?: LodRule[]
  legend: Legend
  /** Legend patterns for colour-blind users (used by the Legend component). */
  legendPatterns?: string[]
  attribution: Attribution
  /** Key of a shared note shown in the detail panel, e.g. surface-area proxy. */
  noteKeys?: string[]
  /** Pulse period in ms for alert states, 0 when none. */
  pulseMs?: { red: number; orange: number }
}
