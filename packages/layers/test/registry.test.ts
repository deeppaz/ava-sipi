import { LAYER_IDS } from '@ava-sipi/schema'
import { describe, expect, it } from 'vitest'
import { defaultOnLayers, layerById, layerRegistry, minOrderForZoom, rivers } from '../src/index.js'

describe('layer registry', () => {
  it('covers every LayerId exactly once', () => {
    expect(layerRegistry.map((l) => l.id).sort()).toEqual([...LAYER_IDS].sort())
    expect(Object.keys(layerById)).toHaveLength(LAYER_IDS.length)
  })
  it('wave 1 hero layers are on by default', () => {
    expect(defaultOnLayers).toEqual(['rivers', 'gauges', 'events'])
  })
  it('every legend has monotonic stops and a token-compatible colour', () => {
    for (const l of layerRegistry) {
      const values = l.legend.stops.map((s) => s.value)
      expect([...values].sort((a, b) => a - b)).toEqual(values)
      for (const s of l.legend.stops) expect(s.color).toMatch(/^(#[0-9A-Fa-f]{6}|transparent)$/)
    }
  })
  it('rivers LOD follows spec §5.3', () => {
    expect(minOrderForZoom(rivers.lod, 2)).toBe(7)
    expect(minOrderForZoom(rivers.lod, 3)).toBe(5)
    expect(minOrderForZoom(rivers.lod, 6)).toBe(4)
    expect(minOrderForZoom(rivers.lod, 9)).toBe(3)
  })
})
