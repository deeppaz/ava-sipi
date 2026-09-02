import { z } from 'zod'
import { ISODate, ISODay, Latitude, Longitude } from './common.js'

export const Reservoir = z.object({
  /** Global Water Watch reservoir id as string */
  id: z.string().min(1),
  name: z.string(),
  country: z.string(),
  lat: Latitude,
  lon: Longitude,
  /** GRanD capacity, million m3 */
  capacityMcm: z.number().nonnegative().optional(),
  /** area_now / area_p95_3y * 100 — surface-area proxy, not a volume measurement */
  fillPct: z.number().min(0).max(100).optional(),
  /** change in fillPct over the last 90 days, percentage points */
  trend90d: z.number().optional(),
  /** latest surface area, km2 */
  areaKm2: z.number().nonnegative().optional(),
  observedAt: ISODate.optional(),
  seriesUrl: z.string(),
  grandId: z.number().int().optional(),
})
export type Reservoir = z.infer<typeof Reservoir>

export const ReservoirsLatest = z.object({
  generatedAt: ISODate,
  reservoirs: z.array(Reservoir),
})
export type ReservoirsLatest = z.infer<typeof ReservoirsLatest>

export const ReservoirSeries = z.object({
  id: z.string(),
  unit: z.literal('km2'),
  /** [day, surface area km2] */
  points: z.array(z.tuple([ISODay, z.number().nonnegative()])),
  areaP95Km2: z.number().nonnegative().optional(),
})
export type ReservoirSeries = z.infer<typeof ReservoirSeries>
