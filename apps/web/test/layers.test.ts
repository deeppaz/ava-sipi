import type { GaugesLatest } from '@ava-sipi/schema'
import { describe, expect, it } from 'vitest'
import { clusterGauges, clusterZoomThreshold } from '@/layers/buildGauges'
import { degreesPerPixel, ringRadius } from '@/layers/buildReservoirs'
import { pulsePhase } from '@/layers/context'
import { featuresForOrder, ratioFor, widthForDischarge, zoomWidthScale } from '@/layers/riverMath'
import { percentileColor, ratioClass, riverRamp } from '@/lib/color'
import type { RiverFeature } from '@/state/data'

const feature = (id: number, order: number, q: number): RiverFeature => ({
  id,
  order,
  meanDischarge: q,
  path: [
    [0, 0],
    [1, 1],
  ],
  mid: [0.5, 0.5],
})

describe('rivers', () => {
  it('width grows with log discharge inside 0.6–6 px', () => {
    expect(widthForDischarge(0)).toBeCloseTo(0.6, 5)
    expect(widthForDischarge(209000)).toBeCloseTo(6, 1)
    expect(widthForDischarge(350)).toBeGreaterThan(widthForDischarge(10))
    expect(zoomWidthScale(1)).toBe(1)
    expect(zoomWidthScale(12)).toBe(2.2)
  })
  it('ratio honours forecast days', () => {
    const f = feature(1, 8, 1000)
    const row = { id: 1, ratio: 0.5, today: 500, forecast: [600, 700, 2000] }
    expect(ratioFor(f, row, 0)).toBe(0.5)
    expect(ratioFor(f, row, 1)).toBeCloseTo(0.6)
    expect(ratioFor(f, row, 3)).toBeCloseTo(2)
    expect(ratioFor(f, row, 7)).toBeCloseTo(2) // clamps to available days
    expect(ratioFor(f, undefined, 0)).toBeUndefined()
  })
  it('LOD filter caches per order', () => {
    const all = [feature(1, 9, 1), feature(2, 7, 1), feature(3, 5, 1)]
    expect(featuresForOrder(all, 7).map((f) => f.id)).toEqual([1, 2])
    expect(featuresForOrder(all, 7)).toBe(featuresForOrder(all, 7))
  })
  it('colour ramp: 1× is the token blue, extremes clamp', () => {
    expect(riverRamp.hex(1)).toBe('#7fb8d6')
    expect(riverRamp.hex(0.1)).toBe('#7a4a1c')
    expect(riverRamp.hex(9)).toBe('#eaf4f8')
    expect(ratioClass(0.2)).toBe('dry')
    expect(ratioClass(1)).toBe('normal')
    expect(ratioClass(5)).toBe('flood')
  })
})

describe('gauges', () => {
  const data: GaugesLatest = {
    generatedAt: '2026-09-02T00:00:00Z',
    count: 3,
    gauges: [
      { id: 'a', name: 'A', lat: 10.2, lon: 20.2, source: 'usgs', percentile: 10 },
      {
        id: 'b',
        name: 'B',
        lat: 10.7,
        lon: 20.9,
        source: 'usgs',
        percentile: 90,
        floodCategory: 'minor',
      },
      { id: 'c', name: 'C', lat: 30.1, lon: 40.1, source: 'usgs' },
    ],
  }
  it('clusters into 1° cells with median percentile', () => {
    const clusters = clusterGauges(data)
    expect(clusters).toHaveLength(2)
    const c = clusters.find((x) => x.n === 2)
    expect(c?.flood).toBe(true)
    expect(c?.medianPercentile).toBe(90)
    expect(clusterZoomThreshold(0)).toBe(4)
    expect(clusterZoomThreshold(2)).toBe(6)
  })
  it('percentile classes follow the spec bands', () => {
    expect(percentileColor(5).slice(0, 3)).toEqual([0xc8, 0x87, 0x3a])
    expect(percentileColor(50).slice(0, 3)).toEqual([0x7f, 0xb8, 0xd6])
    expect(percentileColor(95).slice(0, 3)).toEqual([0xea, 0xf4, 0xf8])
    expect(percentileColor(undefined).slice(0, 3)).toEqual([0x3e, 0x6e, 0x8e])
  })
})

describe('reservoirs + motion', () => {
  it('ring radius is bounded and pixel→degree scales with zoom', () => {
    expect(
      ringRadius({
        id: '1',
        name: 'x',
        country: '',
        lat: 0,
        lon: 0,
        seriesUrl: '',
        areaKm2: 640,
        fillPct: 50,
      }),
    ).toBeLessThanOrEqual(16)
    expect(
      ringRadius({ id: '1', name: 'x', country: '', lat: 0, lon: 0, seriesUrl: '' }),
    ).toBeGreaterThanOrEqual(4)
    expect(degreesPerPixel(1, 0).dLon).toBeCloseTo(360 / 1024)
    expect(degreesPerPixel(2, 60).dLat).toBeCloseTo((360 / 2048) * 0.5)
  })
  it('pulse phase is an ease-out cycle', () => {
    expect(pulsePhase(0, 2)).toBe(0)
    expect(pulsePhase(1, 2)).toBeCloseTo(0.75)
    expect(pulsePhase(1.999, 2)).toBeGreaterThan(0.99)
  })
})
