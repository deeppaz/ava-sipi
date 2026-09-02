import type { Layer } from '@deck.gl/core'
import { buildEvents } from './buildEvents'
import { buildGauges } from './buildGauges'
import { buildReservoirs } from './buildReservoirs'
import { buildRivers } from './buildRivers'
import type { BuildContext } from './context'

/** deck.gl layers for one frame, bottom to top. */
export function buildDeckLayers(ctx: BuildContext): Layer[] {
  return [...buildRivers(ctx), ...buildReservoirs(ctx), ...buildEvents(ctx), ...buildGauges(ctx)]
}

/** True when something on screen needs per-frame updates. */
export function needsAnimation(
  ctx: Pick<BuildContext, 'layers' | 'reducedMotion' | 'data'>,
): boolean {
  if (ctx.reducedMotion) return false
  if (ctx.layers.includes('rivers') && ctx.data.rivers) return true
  if (
    ctx.layers.includes('events') &&
    ctx.data.events?.features.some((f) => f.properties.severity !== 'green')
  )
    return true
  if (
    ctx.layers.includes('gauges') &&
    ctx.data.gauges?.gauges.some((g) => g.floodCategory && g.floodCategory !== 'none')
  )
    return true
  if (
    ctx.layers.includes('reservoirs') &&
    ctx.data.reservoirs?.reservoirs.some(
      (r) => r.trend90d !== undefined && Math.abs(r.trend90d) >= 0.5,
    )
  )
    return true
  return false
}

export type { BuildContext } from './context'
