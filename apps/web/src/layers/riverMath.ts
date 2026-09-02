/** Pure river helpers shared by the deck.gl builder and the panel (no deck.gl import here). */

import type { DischargeRow } from '@/lib/workers/discharge.worker'
import type { RiverFeature } from '@/state/data'

/** today/mean for a reach, honouring forecast mode; undefined when unknown. */
export function ratioFor(
  f: RiverFeature,
  row: DischargeRow | undefined,
  forecastDays: number,
): number | undefined {
  if (!row) return undefined
  if (forecastDays > 0) {
    const fc = row.forecast[Math.min(forecastDays, row.forecast.length) - 1]
    if (fc === undefined) return row.ratio
    const mean = row.ratio > 0 ? row.today / row.ratio : f.meanDischarge
    return mean > 0 ? Math.min(12, fc / mean) : row.ratio
  }
  return row.ratio
}

/** Stroke width in px from long-term mean discharge: log(Q+1) mapped to 0.6–6 px (spec §5.3). */
export function widthForDischarge(q: number): number {
  const t = Math.min(1, Math.max(0, Math.log10(q + 1) / 5.3))
  return 0.6 + 5.4 * t
}

export function zoomWidthScale(zoom: number): number {
  return Math.min(2.2, Math.max(1, 1 + (zoom - 3) * 0.2))
}

const lodCache = new WeakMap<RiverFeature[], Map<number, RiverFeature[]>>()

export function featuresForOrder(all: RiverFeature[], minOrder: number): RiverFeature[] {
  let byOrder = lodCache.get(all)
  if (!byOrder) {
    byOrder = new Map()
    lodCache.set(all, byOrder)
  }
  let list = byOrder.get(minOrder)
  if (!list) {
    list = all.filter((f) => f.order >= minOrder)
    byOrder.set(minOrder, list)
  }
  return list
}
