import { z } from 'zod'
import { ISODate, ISODay, Latitude, Longitude } from './common.js'

export const FloodCategory = z.enum(['none', 'action', 'minor', 'moderate', 'major'])
export type FloodCategory = z.infer<typeof FloodCategory>

export const DischargeMeasurement = z.object({
  value: z.number(),
  unit: z.literal('m3/s'),
  ts: ISODate,
})
export const StageMeasurement = z.object({ value: z.number(), unit: z.literal('m'), ts: ISODate })

export const Gauge = z.object({
  /** e.g. 'USGS-01646500' */
  id: z.string().min(1),
  name: z.string(),
  lat: Latitude,
  lon: Longitude,
  riverName: z.string().optional(),
  discharge: DischargeMeasurement.optional(),
  stage: StageMeasurement.optional(),
  /** 0-100, rank of the live discharge within this station's historical distribution for this month. */
  percentile: z.number().min(0).max(100).optional(),
  floodCategory: FloodCategory.optional(),
  /** NOAA NWPS location id when matched, e.g. 'ANAW1' */
  nwsLid: z.string().optional(),
  source: z.enum(['usgs', 'noaa']),
})
export type Gauge = z.infer<typeof Gauge>

export const GaugesLatest = z.object({
  generatedAt: ISODate,
  count: z.number().int().nonnegative(),
  gauges: z.array(Gauge),
})
export type GaugesLatest = z.infer<typeof GaugesLatest>

/** Per-station monthly percentile table built from historical daily means (m3/s). */
export const GaugeStats = z.object({
  id: z.string(),
  /** 12 entries (Jan..Dec): [p5, p10, p25, p50, p75, p90, p95] in m3/s, or null when unknown. */
  monthly: z.array(z.array(z.number()).length(7).nullable()).length(12),
  years: z.number().int().nonnegative(),
  /** Day the table was computed; the weekly job refreshes tables older than its age limit. */
  computedAt: ISODay.optional(),
})
export type GaugeStats = z.infer<typeof GaugeStats>

export const GaugeStatsFile = z.object({
  generatedAt: ISODate,
  stations: z.array(GaugeStats),
})
export type GaugeStatsFile = z.infer<typeof GaugeStatsFile>

/** Compact 7-day series used by the panel sparkline. */
export const GaugeSeries = z.object({
  id: z.string(),
  unit: z.enum(['m3/s', 'm']),
  points: z.array(z.tuple([ISODate, z.number()])),
  forecast: z.array(z.tuple([ISODate, z.number()])).default([]),
  source: z.string(),
  sourceUrl: z.string(),
})
export type GaugeSeries = z.infer<typeof GaugeSeries>
