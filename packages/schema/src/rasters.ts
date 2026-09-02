import { z } from 'zod'
import { ISODate, ISODay } from './common.js'

/** Time series of a 1° groundwater cell (GRACE TWS anomaly, cm water equivalent). */
export const GroundwaterCellSeries = z.object({
  /** cell id 'lat_lon' of the south-west corner, e.g. '36_38' */
  cell: z.string(),
  unit: z.enum(['cm', 'percentile']),
  points: z.array(z.tuple([ISODay, z.number()])),
})
export type GroundwaterCellSeries = z.infer<typeof GroundwaterCellSeries>

export const DroughtClass = z.enum(['none', 'watch', 'warning', 'alert'])
export type DroughtClass = z.infer<typeof DroughtClass>

/** Point query result for drought rasters, produced on demand by the app from the legend. */
export const DroughtSample = z.object({
  product: z.enum(['cdi', 'spi3']),
  value: z.number().nullable(),
  cls: DroughtClass.optional(),
  observedAt: ISODate,
  previous: z.number().nullable().optional(),
})
export type DroughtSample = z.infer<typeof DroughtSample>
