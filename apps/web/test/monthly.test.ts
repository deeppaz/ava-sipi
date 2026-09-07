import type { LayerManifest } from '@ava-sipi/schema'
import { describe, expect, it } from 'vitest'
import { monthlyArtifact, rasterForTime } from '@/layers/nativeLayers'

const art = (name: string) => ({
  kind: name.endsWith('-tiles') ? ('raster-pmtiles' as const) : ('png' as const),
  url: `https://cdn/groundwater/20260903T1219/${name}.bin`,
  bytes: 1,
  name,
})

const lm = {
  id: 'groundwater',
  version: '20260903T1219',
  generatedAt: '2026-09-03T12:19:00Z',
  sourceUpdatedAt: '2026-06-30T00:00:00Z',
  stale: false,
  artifacts: [
    art('tws_latest'),
    art('tws_latest-tiles'),
    art('tws-2002-04'),
    art('tws-2002-04-tiles'),
    art('tws-2010-08'),
    art('tws-2010-08-tiles'),
    art('tws-2010-11'),
    art('tws-2026-06'),
  ],
  attribution: { name: 'x', url: 'https://x', license: 'x' },
  coverage: 'global',
  failures: 0,
  sample: false,
  versions: ['20260903T1219'],
  notes: [],
} as unknown as LayerManifest

describe('monthly groundwater archive', () => {
  it('picks the newest month at or before the day, per flavour', () => {
    expect(monthlyArtifact(lm, 'tws_latest', '2010-09-15')?.name).toBe('tws-2010-08')
    expect(monthlyArtifact(lm, 'tws_latest-tiles', '2010-09-15')?.name).toBe('tws-2010-08-tiles')
    expect(monthlyArtifact(lm, 'tws_latest', '2010-11-01')?.name).toBe('tws-2010-11')
    // tiles were not published for 2010-11: the tiles flavour falls back to the previous month
    expect(monthlyArtifact(lm, 'tws_latest-tiles', '2010-11-20')?.name).toBe('tws-2010-08-tiles')
  })

  it('clamps to the earliest month before the archive and knows nothing about other prefixes', () => {
    expect(monthlyArtifact(lm, 'tws_latest', '1999-01-01')?.name).toBe('tws-2002-04')
    expect(monthlyArtifact(lm, 'gws_percentile', '2010-09-15')).toBeUndefined()
  })

  it('serves the alias live and the month in the past, without swapping versions', () => {
    const base = 'https://cdn/'
    const live = rasterForTime(lm, ['tws_latest-tiles', 'tws_latest'], base, {
      mode: 'live',
      day: '2026-09-07',
    })
    expect(live?.art.name).toBe('tws_latest-tiles')
    const past = rasterForTime(lm, ['tws_latest-tiles', 'tws_latest'], base, {
      mode: 'past',
      day: '2010-09-15',
    })
    expect(past?.art.name).toBe('tws-2010-08-tiles')
    expect(past?.url).toContain('/20260903T1219/tws-2010-08-tiles')
  })
})
