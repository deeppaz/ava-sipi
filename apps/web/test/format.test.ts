import { describe, expect, it } from 'vitest'
import { dirnameUrl, resolveUrl } from '@/lib/fetch'
import {
  addDays,
  addMonths,
  daysBetween,
  formatAgo,
  formatNumber,
  formatSigned,
} from '@/lib/format'
import { artifactUrl, versionForDay } from '@/lib/manifest'
import { classifyByLegend, lonLatToImagePx, valueByLegend } from '@/lib/rasterSample'
import { discharge, length } from '@/lib/units'

describe('format', () => {
  it('numbers use tabular-friendly precision', () => {
    expect(formatNumber('en', 0.3456)).toBe('0.35')
    expect(formatNumber('en', 12.34)).toBe('12.3')
    expect(formatNumber('en', 209000)).toBe('209,000')
    expect(formatNumber('tr', 1234.5)).toBe('1.235')
    expect(formatSigned('en', -2.5)).toBe('−2.5')
  })
  it('relative time', () => {
    const now = Date.parse('2026-09-02T12:00:00Z')
    expect(formatAgo('en', '2026-09-02T11:56:00Z', now)).toMatch(/4 ?m/)
    expect(formatAgo('en', '2026-09-01T12:00:00Z', now)).toMatch(/1 ?d/)
  })
  it('day arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03')
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7)
  })
})

describe('units', () => {
  it('converts only for display', () => {
    expect(discharge(1, 'imperial').value).toBeCloseTo(35.3147, 3)
    expect(discharge(1, 'metric')).toEqual({ value: 1, unit: 'm³/s' })
    expect(length(1, 'imperial').unit).toBe('ft')
  })
})

describe('manifest urls', () => {
  const lm = {
    id: 'rivers' as const,
    version: '20260902T1600',
    generatedAt: '2026-09-02T16:00:00Z',
    sourceUpdatedAt: '2026-09-02T16:00:00Z',
    stale: false,
    artifacts: [
      {
        kind: 'geojson' as const,
        url: 'rivers/20260902T1600/spine.geojson',
        bytes: 1,
        name: 'spine',
      },
    ],
    attribution: { name: '', url: '', license: '' },
    coverage: 'global' as const,
    failures: 0,
    sample: false,
    versions: ['20260902T1600', '20260801T0300', '20260701T0300'],
    notes: [],
  }
  it('resolves relative to the data base and swaps versions for past days', () => {
    expect(resolveUrl('a/b.json', '/data/samples/')).toBe('/data/samples/a/b.json')
    expect(resolveUrl('https://x/y', '/data/')).toBe('https://x/y')
    expect(dirnameUrl('https://cdn/manifest.json')).toBe('https://cdn/')
    expect(versionForDay(lm, '2026-08-15')).toBe('20260801T0300')
    expect(versionForDay(lm, '2026-01-01')).toBeNull()
    const art = lm.artifacts[0]
    if (!art) throw new Error('artifact')
    expect(artifactUrl(lm, art, 'https://cdn/', { mode: 'past', day: '2026-08-15' })).toBe(
      'https://cdn/rivers/20260801T0300/spine.geojson',
    )
    expect(artifactUrl(lm, art, 'https://cdn/', { mode: 'live', day: '2026-09-02' })).toBe(
      'https://cdn/rivers/20260902T1600/spine.geojson',
    )
  })
})

describe('raster sampling', () => {
  const legend = {
    unit: 'class',
    stops: [
      { value: 0, color: 'transparent', label: 'none' },
      { value: 1, color: '#D9A45B', label: 'watch' },
      { value: 2, color: '#C8873A', label: 'warning' },
      { value: 3, color: '#7A4A1C', label: 'alert' },
    ],
  }
  it('maps Mercator pixels and classifies colours', () => {
    expect(lonLatToImagePx(0, 0, 2048, 2048)).toEqual([1024, 1024])
    expect(lonLatToImagePx(-180, 85, 2048, 2048)[0]).toBe(0)
    expect(classifyByLegend([0xc8, 0x87, 0x3a, 255], legend)?.label).toBe('warning')
    expect(classifyByLegend([0, 0, 0, 0], legend)).toBeNull()
    const cm = {
      unit: 'cm',
      stops: [
        { value: -20, color: '#7A4A1C', label: '' },
        { value: 0, color: '#7FB8D6', label: '' },
        { value: 20, color: '#35E0E0', label: '' },
      ],
    }
    expect(valueByLegend([0x35, 0xe0, 0xe0, 255], cm)).toBeCloseTo(20, 0)
  })
})
