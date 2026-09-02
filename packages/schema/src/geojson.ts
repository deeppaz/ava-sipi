import { z } from 'zod'

/** GeoJSON Position: [lon, lat] or [lon, lat, elevation]. */
export const Position = z.array(z.number()).min(2).max(3)
export type Position = z.infer<typeof Position>

export const PointGeometry = z.object({ type: z.literal('Point'), coordinates: Position })
export const MultiPointGeometry = z.object({
  type: z.literal('MultiPoint'),
  coordinates: z.array(Position),
})
export const LineStringGeometry = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(Position).min(2),
})
export const MultiLineStringGeometry = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(Position).min(2)),
})
export const PolygonGeometry = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(Position).min(4)),
})
export const MultiPolygonGeometry = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(Position).min(4))),
})

export const Geometry = z.discriminatedUnion('type', [
  PointGeometry,
  MultiPointGeometry,
  LineStringGeometry,
  MultiLineStringGeometry,
  PolygonGeometry,
  MultiPolygonGeometry,
])
export type Geometry = z.infer<typeof Geometry>

export function feature<P extends z.ZodType, G extends z.ZodType = typeof Geometry>(
  properties: P,
  geometry?: G,
) {
  return z.object({
    type: z.literal('Feature'),
    id: z.union([z.string(), z.number()]).optional(),
    geometry: (geometry ?? Geometry) as G,
    properties,
  })
}

export function featureCollection<F extends z.ZodType>(featureSchema: F) {
  return z.object({
    type: z.literal('FeatureCollection'),
    features: z.array(featureSchema),
  })
}
