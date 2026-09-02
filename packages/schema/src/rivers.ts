import { z } from 'zod'
import { ISODay } from './common.js'
import {
  feature,
  featureCollection,
  LineStringGeometry,
  MultiLineStringGeometry,
} from './geojson.js'

/** Properties carried by river PMTiles features and the spine GeoJSON. */
export const RiverSegment = z.object({
  /** HYRIV_ID */
  id: z.number().int(),
  /** Strahler order (ORD_STRA) */
  order: z.number().int().min(1),
  /** Long-term mean discharge, m3/s (DIS_AV_CMS) */
  meanDischarge: z.number().nonnegative(),
  /** today / meanDischarge, joined in the browser from the discharge parquet */
  ratio: z.number().nonnegative().optional(),
  name: z.string().optional(),
  lengthKm: z.number().nonnegative().optional(),
  uplandKm2: z.number().nonnegative().optional(),
  /** HYRIV_ID of the downstream segment (0 = outlet) */
  nextDown: z.number().int().optional(),
  mainRiver: z.number().int().optional(),
})
export type RiverSegment = z.infer<typeof RiverSegment>

export const RiverFeature = feature(
  RiverSegment,
  z.discriminatedUnion('type', [LineStringGeometry, MultiLineStringGeometry]),
)
export const RiverSpine = featureCollection(RiverFeature)
export type RiverSpine = z.infer<typeof RiverSpine>

/** One row of discharge/YYYYMMDD.parquet (also exported as JSON for small samples). */
export const DischargeRecord = z.object({
  id: z.number().int(),
  /** today / DIS_AV_CMS */
  ratio: z.number().nonnegative(),
  /** m3/s today */
  today: z.number().nonnegative(),
  /** next 7 days, m3/s */
  forecast: z.array(z.number().nonnegative()).max(7),
  lat: z.number(),
  lon: z.number(),
})
export type DischargeRecord = z.infer<typeof DischargeRecord>

export const DischargeFile = z.object({
  day: ISODay,
  source: z.literal('open-meteo-flood'),
  records: z.array(DischargeRecord),
})
export type DischargeFile = z.infer<typeof DischargeFile>
