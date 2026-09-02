import { describe, expect, it } from 'vitest'
import { Gauge, LayerManifest, RootManifest, WaterEventCollection } from '../src/index.js'

describe('LayerManifest', () => {
  const base = {
    id: 'gauges',
    version: '20260902T1400',
    generatedAt: '2026-09-02T14:00:00Z',
    sourceUpdatedAt: '2026-09-02T13:45:00Z',
    stale: false,
    artifacts: [{ kind: 'json', url: 'https://x/gauges/latest.json', bytes: 12 }],
    attribution: { name: 'USGS', url: 'https://waterdata.usgs.gov', license: 'Public domain' },
    coverage: 'regional',
  }
  it('accepts a valid manifest and applies defaults', () => {
    const m = LayerManifest.parse(base)
    expect(m.failures).toBe(0)
    expect(m.sample).toBe(false)
    expect(m.versions).toEqual([])
  })
  it('rejects a bad version stamp', () => {
    expect(() => LayerManifest.parse({ ...base, version: '2026-09-02' })).toThrow()
  })
  it('root manifest allows missing layers', () => {
    const r = RootManifest.parse({ generatedAt: '2026-09-02T14:00:00Z', layers: { gauges: base } })
    expect(r.layers.rivers).toBeUndefined()
    expect(r.layers.gauges?.id).toBe('gauges')
  })
})

describe('Gauge', () => {
  it('requires SI units', () => {
    expect(() =>
      Gauge.parse({
        id: 'USGS-1',
        name: 'x',
        lat: 0,
        lon: 0,
        source: 'usgs',
        discharge: { value: 1, unit: 'ft3/s', ts: '2026-09-02T14:00:00Z' },
      }),
    ).toThrow()
  })
})

describe('WaterEventCollection', () => {
  it('parses a polygon flood event', () => {
    const fc = WaterEventCollection.parse({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
          properties: {
            id: 'gdacs-FL-1',
            type: 'flood',
            severity: 'orange',
            title: 'Flood',
            startedAt: '2026-09-01T00:00:00Z',
            updatedAt: '2026-09-02T00:00:00Z',
            sourceUrl: 'https://www.gdacs.org',
            source: 'gdacs',
            centroid: [0.5, 0.5],
          },
        },
      ],
    })
    expect(fc.features).toHaveLength(1)
  })
})
