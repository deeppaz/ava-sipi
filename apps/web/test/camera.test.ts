import { describe, expect, it } from 'vitest'
import { cameraForProjection } from '@/map/createMap'
import { DEFAULT_CAMERA } from '@/state/store'

describe('cameraForProjection', () => {
  const tilted = { ...DEFAULT_CAMERA, bearing: 45, pitch: 60 }

  it('flattens bearing and pitch on the globe (deck.gl GlobeViewport ignores both)', () => {
    const c = cameraForProjection(tilted, 'globe')
    expect(c.bearing).toBe(0)
    expect(c.pitch).toBe(0)
    expect(c.lon).toBe(tilted.lon)
    expect(c.zoom).toBe(tilted.zoom)
  })

  it('keeps them in the flat projection, where deck MapView matches MapLibre', () => {
    expect(cameraForProjection(tilted, 'mercator')).toEqual(tilted)
  })

  it('does not mutate its input', () => {
    cameraForProjection(tilted, 'globe')
    expect(tilted.pitch).toBe(60)
  })
})
