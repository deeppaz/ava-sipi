/**
 * Camera rules and capability checks. Deliberately free of any runtime `maplibre-gl` import —
 * MapView needs these during the first render, while the map module itself is loaded after the
 * shell has painted (see MapView and docs/DEVIATIONS.md).
 */
import type { Map as MlMap, PaddingOptions } from 'maplibre-gl'
import type { Projection } from '@/state/store'

export const MAX_PITCH = 70

export function supportsWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

/**
 * deck.gl's `GlobeViewport` builds its view matrix from longitude, latitude and zoom only — it
 * never applies bearing or pitch (verified in @deck.gl/core 9.3 `globe-viewport.js`). MapLibre's
 * globe does apply both, so a rotated or pitched globe camera tears the two apart and the data
 * layers detach from the sphere. In globe projection the camera is therefore pan + zoom only;
 * rotation and pitch belong to the flat (Mercator) projection, where deck's MapView matches.
 */
export function cameraForProjection<T extends { bearing: number; pitch: number }>(
  camera: T,
  projection: Projection,
): T {
  return projection === 'globe' ? { ...camera, bearing: 0, pitch: 0 } : camera
}

export function applyProjectionInteractions(map: MlMap, projection: Projection): void {
  if (projection === 'globe') {
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.touchPitch.disable()
    map.keyboard.disableRotation()
    map.setMaxPitch(0)
    if (map.getBearing() !== 0 || map.getPitch() !== 0) map.jumpTo({ bearing: 0, pitch: 0 })
  } else {
    map.setMaxPitch(MAX_PITCH)
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()
    map.touchPitch.enable()
    map.keyboard.enableRotation()
  }
}

/** Padding that keeps a selected object in the left two-thirds while the panel is open (spec §5.4). */
export function panelPadding(open: boolean, width: number): PaddingOptions {
  const panel = open && width >= 768 ? 380 + 32 : 0
  return { top: 72, bottom: 96, left: width < 768 ? 16 : 72, right: panel + 16 }
}
