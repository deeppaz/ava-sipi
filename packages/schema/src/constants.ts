/**
 * Plain constants with no zod import, so a consumer that only needs the layer ids does not pull
 * the validators into its first bundle chunk. `common.ts` builds the schema from these.
 */
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

export type LayerIdValue = (typeof LAYER_IDS)[number]
