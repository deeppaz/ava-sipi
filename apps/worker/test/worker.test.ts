import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../src/ratelimit'
import { buildUpstreamUrl, resolveRoute } from '../src/routes'

describe('routes', () => {
  it('maps allowed paths to upstreams', () => {
    const r = resolveRoute('/api/live/usgs/collections/latest-continuous/items')
    expect(r).toEqual({ source: 'usgs', path: '/collections/latest-continuous/items' })
    expect(resolveRoute('/api/live/noaa/gauges/ANAW1/stageflow')?.source).toBe('noaa')
    expect(resolveRoute('/api/live/openmeteo/flood')?.source).toBe('openmeteo')
    expect(
      resolveRoute('/api/live/gww/reservoir/90554/ts/surface_water_area_monthly')?.source,
    ).toBe('gww')
  })
  it('rejects unknown or non-allowlisted paths', () => {
    expect(resolveRoute('/api/live/usgs/anything')).toBeNull()
    expect(resolveRoute('/api/live/evil/x')).toBeNull()
    expect(resolveRoute('/api/live/noaa/gauges/../../etc')).toBeNull()
  })
  it('never forwards client keys', () => {
    const r = resolveRoute('/api/live/openmeteo/flood')
    if (!r) throw new Error('route')
    const u = buildUpstreamUrl(r, new URLSearchParams('latitude=1&longitude=2&apikey=hack'))
    expect(u.toString()).toBe('https://flood-api.open-meteo.com/v1/flood?latitude=1&longitude=2')
  })
})

describe('rate limiter', () => {
  it('allows 60 per minute then blocks', () => {
    const rl = new RateLimiter()
    let last = rl.hit('ip', 60, 0)
    for (let i = 1; i < 60; i++) last = rl.hit('ip', 60, i)
    expect(last.allowed).toBe(true)
    const blocked = rl.hit('ip', 60, 100)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(rl.hit('ip', 60, 60_001).allowed).toBe(true)
  })
})
