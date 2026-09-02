import { z } from 'zod'

/** ISO-8601 UTC timestamp, e.g. 2026-09-02T14:30:00Z */
export const ISODate = z.iso.datetime({ offset: true })
export type ISODate = z.infer<typeof ISODate>

/** Calendar day, YYYY-MM-DD */
export const ISODay = z.iso.date()
export type ISODay = z.infer<typeof ISODay>

export const LAYER_IDS = [
  'rivers',
  'gauges',
  'events',
  'reservoirs',
  'groundwater',
  'drought',
  'glaciers',
  'snow',
  'tides',
] as const
export const LayerId = z.enum(LAYER_IDS)
export type LayerId = z.infer<typeof LayerId>

/** Artifact version stamp: YYYYMMDDTHHMM (UTC) */
export const ArtifactVersion = z.string().regex(/^\d{8}T\d{4}$/, 'expected YYYYMMDDTHHMM')
export type ArtifactVersion = z.infer<typeof ArtifactVersion>

export const Longitude = z.number().min(-180).max(180)
export const Latitude = z.number().min(-90).max(90)

/** [west, south, east, north] in WGS84 degrees */
export const BBox = z.tuple([Longitude, Latitude, Longitude, Latitude])
export type BBox = z.infer<typeof BBox>

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)
