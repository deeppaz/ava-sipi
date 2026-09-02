import { z } from 'zod'
import { ISODate } from './common.js'
import { feature, featureCollection, Geometry } from './geojson.js'

export const EventType = z.enum(['flood', 'drought', 'cyclone'])
export type EventType = z.infer<typeof EventType>
export const Severity = z.enum(['green', 'orange', 'red'])
export type Severity = z.infer<typeof Severity>

export const WaterEventProperties = z.object({
  /** e.g. 'gdacs-FL-1103093' */
  id: z.string().min(1),
  type: EventType,
  severity: Severity,
  title: z.string(),
  startedAt: ISODate,
  updatedAt: ISODate,
  affectedPopulation: z.number().nonnegative().optional(),
  country: z.string().optional(),
  iso3: z.string().optional(),
  sourceUrl: z.string(),
  source: z.literal('gdacs'),
  /** Representative point [lon, lat], always present even when geometry is a polygon. */
  centroid: z.tuple([z.number(), z.number()]),
  severityText: z.string().optional(),
})
export type WaterEventProperties = z.infer<typeof WaterEventProperties>

export const WaterEvent = WaterEventProperties.extend({ geometry: Geometry })
export type WaterEvent = z.infer<typeof WaterEvent>

export const WaterEventFeature = feature(WaterEventProperties)
export const WaterEventCollection = featureCollection(WaterEventFeature)
export type WaterEventCollection = z.infer<typeof WaterEventCollection>
