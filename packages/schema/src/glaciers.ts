import { z } from 'zod'
import { ISODate } from './common.js'
import { feature, featureCollection, MultiPolygonGeometry, PolygonGeometry } from './geojson.js'

export const Glacier = z.object({
  /** RGI 7 id, e.g. 'RGI2000-v7.0-G-11-00001' (or sample id) */
  id: z.string().min(1),
  name: z.string().optional(),
  /** RGI first-order region code, '01'..'19' */
  region: z.string(),
  areaKm2: z.number().nonnegative(),
  /** Region-level annual mass balance, metres water equivalent (negative = loss) */
  massBalanceMwe: z.number().optional(),
})
export type Glacier = z.infer<typeof Glacier>

export const GlacierFeature = feature(
  Glacier,
  z.discriminatedUnion('type', [PolygonGeometry, MultiPolygonGeometry]),
)
export const GlacierCollection = featureCollection(GlacierFeature)
export type GlacierCollection = z.infer<typeof GlacierCollection>

export const RegionMassBalance = z.object({
  region: z.string(),
  regionName: z.string(),
  /** hydrological year */
  year: z.number().int(),
  /** m w.e. */
  mwe: z.number(),
  /** Gt, when provided */
  gt: z.number().optional(),
})
export type RegionMassBalance = z.infer<typeof RegionMassBalance>

export const MassBalanceFile = z.object({
  generatedAt: ISODate,
  source: z.string(),
  sourceUrl: z.string(),
  /** newest year per region first */
  regions: z.array(RegionMassBalance),
})
export type MassBalanceFile = z.infer<typeof MassBalanceFile>
