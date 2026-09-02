/**
 * deck.gl entry, loaded with `import()` after the globe's first paint so the initial bundle stays
 * within the 450 KB budget (spec §5.6; see docs/DEVIATIONS.md). Everything deck-related is
 * reachable only through this module.
 */
export { MapboxOverlay } from '@deck.gl/mapbox'
export type { BuildContext } from './context'
export { buildDeckLayers, needsAnimation } from './index'
