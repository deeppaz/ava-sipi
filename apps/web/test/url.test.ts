import { describe, expect, it } from 'vitest'
import { DEFAULT_CAMERA, todayUtc } from '@/state/store'
import {
  parseCamera,
  parseTime,
  readUrlState,
  serializeCamera,
  serializeTime,
  writeUrlState,
} from '@/state/url'

describe('url state', () => {
  it('parses the spec example', () => {
    const s = readUrlState(
      '?l=rivers,events&t=2026-01-02&c=38.9,41.1,5.2&p=globe&s=gauges:USGS-01646500&story=aral&step=3',
    )
    expect(s.layers).toEqual(['rivers', 'events'])
    expect(s.time).toEqual({ mode: 'past', day: '2026-01-02' })
    expect(s.camera).toEqual({ lat: 38.9, lon: 41.1, zoom: 5.2, bearing: 0, pitch: 0 })
    expect(s.projection).toBe('globe')
    expect(s.selection).toEqual({ layer: 'gauges', id: 'USGS-01646500' })
    expect(s.story).toEqual({ id: 'aral', step: 3 })
  })
  it('ignores garbage safely', () => {
    const s = readUrlState('?l=rivers,bogus&c=999,1,2&t=nope&s=nolayer:1')
    expect(s.layers).toEqual(['rivers'])
    expect(s.camera).toBeUndefined()
    expect(s.time).toBeUndefined()
    expect(s.selection).toBeUndefined()
  })
  it('round-trips', () => {
    const state = {
      layers: ['rivers', 'gauges'] as const,
      time: { mode: 'forecast' as const, day: parseTime('f+3')?.day ?? '' },
      camera: { ...DEFAULT_CAMERA, bearing: 30, pitch: 45 },
      projection: 'mercator' as const,
      selection: { layer: 'events' as const, id: 'gdacs-FL-1' },
      story: null,
      embed: true,
      droughtProduct: 'cdi' as const,
    }
    const q = writeUrlState({ ...state, layers: [...state.layers] })
    const back = readUrlState(q)
    expect(back.layers).toEqual(['rivers', 'gauges'])
    expect(back.time?.mode).toBe('forecast')
    expect(back.projection).toBe('mercator')
    expect(back.embed).toBe(true)
    expect(back.camera?.bearing).toBe(30)
  })
  it('serializes time and camera compactly', () => {
    expect(serializeTime({ mode: 'live', day: todayUtc() })).toBe('live')
    expect(serializeCamera({ lat: 1.23456, lon: 2.34567, zoom: 3.456, bearing: 0, pitch: 0 })).toBe(
      '1.2346,2.3457,3.46',
    )
    expect(parseCamera('1,2')).toBeUndefined()
    expect(parseTime('live')?.mode).toBe('live')
  })
})
