import { z } from 'zod'
import { ArtifactVersion, BBox, ISODate, LayerId } from './common.js'

export const ArtifactKind = z.enum([
  'pmtiles',
  'geojson',
  'parquet',
  'json',
  'raster-pmtiles',
  'png',
])
export type ArtifactKind = z.infer<typeof ArtifactKind>

export const Artifact = z.object({
  kind: ArtifactKind,
  url: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  /** Optional role within the layer, e.g. 'spine', 'network', 'latest', 'stations', 'series'. */
  name: z.string().optional(),
  /** For 'png' image overlays: [west, south, east, north]. */
  bbox: BBox.optional(),
})
export type Artifact = z.infer<typeof Artifact>

export const LegendStop = z.object({
  value: z.number(),
  color: z.string(),
  label: z.string(),
})

export const Legend = z.object({
  unit: z.string(),
  stops: z.array(LegendStop).min(2),
})
export type Legend = z.infer<typeof Legend>

export const Attribution = z.object({
  name: z.string(),
  url: z.string(),
  license: z.string(),
})
export type Attribution = z.infer<typeof Attribution>

export const LayerManifest = z.object({
  id: LayerId,
  version: ArtifactVersion,
  generatedAt: ISODate,
  /** The source's own timestamp for the newest observation in the artifact. */
  sourceUpdatedAt: ISODate,
  /** True when the pipeline could not refresh and this is an older snapshot. */
  stale: z.boolean(),
  artifacts: z.array(Artifact),
  legend: Legend.optional(),
  attribution: Attribution,
  coverage: z.enum(['global', 'regional']),
  bbox: BBox.optional(),
  /** Consecutive failed runs. >= 3 shows the "temporarily old data" badge in the UI. */
  failures: z.number().int().nonnegative().default(0),
  /** True when the artifact was produced from data/samples (offline development). */
  sample: z.boolean().default(false),
  /** Older artifact versions still available (newest first) for the time slider. */
  versions: z.array(ArtifactVersion).default([]),
  /** Free-form notes surfaced in the panel, e.g. "surface area is a proxy for fill". */
  notes: z.array(z.string()).default([]),
})
export type LayerManifest = z.infer<typeof LayerManifest>
export type LayerManifestInput = z.input<typeof LayerManifest>

export const RootManifest = z.object({
  generatedAt: ISODate,
  layers: z.partialRecord(LayerId, LayerManifest),
})
export type RootManifest = z.infer<typeof RootManifest>
export type RootManifestInput = z.input<typeof RootManifest>
