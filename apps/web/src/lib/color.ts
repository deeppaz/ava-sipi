/**
 * Colour utilities: design tokens, OKLCH ramps (spec §6.4) and deck.gl RGBA arrays.
 * Ramps are sampled into lookup tables once so per-feature accessors stay cheap.
 */
import { formatHex, interpolate, oklch } from 'culori'

export const TOKENS = {
  abyss: '#07131F',
  shelf: '#0F2233',
  tide: '#3E6E8E',
  current: '#7FB8D6',
  foam: '#EAF4F8',
  glacier: '#CFE6F0',
  surge: '#35E0E0',
  parch: '#C8873A',
  parchDeep: '#7A4A1C',
  cyclone: '#9A8BD6',
} as const

export type RGBA = [number, number, number, number]

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
    alpha,
  ]
}

export interface RampStop {
  value: number
  color: string
}

/** Piecewise OKLCH ramp sampled into `steps` RGB entries between the first and last stop. */
export class Ramp {
  private readonly table: RGBA[]
  private readonly min: number
  private readonly max: number

  constructor(
    public readonly stops: readonly RampStop[],
    steps = 256,
  ) {
    const sorted = [...stops].sort((a, b) => a.value - b.value)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (!first || !last) throw new Error('ramp needs at least one stop')
    this.min = first.value
    this.max = last.value
    const segments = sorted.slice(0, -1).map((s, i) => {
      const next = sorted[i + 1] as RampStop
      return { from: s.value, to: next.value, mix: interpolate([s.color, next.color], 'oklch') }
    })
    this.table = Array.from({ length: steps }, (_v, i) => {
      const v = this.min + ((this.max - this.min) * i) / (steps - 1)
      const seg = segments.find((s) => v >= s.from && v <= s.to) ?? segments[segments.length - 1]
      if (!seg) return hexToRgba(first.color)
      const t = seg.to === seg.from ? 0 : (v - seg.from) / (seg.to - seg.from)
      const c = oklch(seg.mix(t))
      const hex = formatHex(c) ?? first.color
      return hexToRgba(hex)
    })
  }

  rgba(value: number, alpha = 255): RGBA {
    if (!Number.isFinite(value)) return [...(this.table[Math.floor(this.table.length / 2)] as RGBA)]
    const t = (Math.min(this.max, Math.max(this.min, value)) - this.min) / (this.max - this.min)
    const idx = Math.round(t * (this.table.length - 1))
    const c = this.table[idx] as RGBA
    return [c[0], c[1], c[2], alpha]
  }

  hex(value: number): string {
    const [r, g, b] = this.rgba(value)
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  }
}

/** River ratio ramp: 0.3 parch-deep → 0.6 parch → 1.0 current → 1.6 surge → 3.0 foam. */
export const riverRamp = new Ramp([
  { value: 0.3, color: TOKENS.parchDeep },
  { value: 0.6, color: TOKENS.parch },
  { value: 1.0, color: TOKENS.current },
  { value: 1.6, color: TOKENS.surge },
  { value: 3.0, color: TOKENS.foam },
])

/** Gauge percentile classes (spec §5.3): 0-10 ochre, 10-25 amber, 25-75 neutral, 75-90 cyan, >90 foam. */
export function percentileColor(p: number | undefined, alpha = 255): RGBA {
  if (p === undefined || !Number.isFinite(p)) return hexToRgba(TOKENS.tide, alpha)
  if (p < 10) return hexToRgba(TOKENS.parch, alpha)
  if (p < 25) return hexToRgba('#D9A45B', alpha)
  if (p < 75) return hexToRgba(TOKENS.current, alpha)
  if (p < 90) return hexToRgba(TOKENS.surge, alpha)
  return hexToRgba(TOKENS.foam, alpha)
}

export function percentileHex(p: number | undefined): string {
  const [r, g, b] = percentileColor(p)
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Reservoir fill ramp: 0 parch-deep → 40 parch → 70 current → 100 foam. */
export const fillRamp = new Ramp([
  { value: 0, color: TOKENS.parchDeep },
  { value: 40, color: TOKENS.parch },
  { value: 70, color: TOKENS.current },
  { value: 100, color: TOKENS.foam },
])

export const eventColor: Record<'flood' | 'drought' | 'cyclone', string> = {
  flood: TOKENS.surge,
  drought: TOKENS.parch,
  cyclone: TOKENS.cyclone,
}

/** Word class for a ratio, used by text and by the legend patterns. */
export function ratioClass(ratio: number | undefined): 'dry' | 'low' | 'normal' | 'high' | 'flood' {
  if (ratio === undefined) return 'normal'
  if (ratio < 0.5) return 'dry'
  if (ratio < 0.8) return 'low'
  if (ratio <= 1.5) return 'normal'
  if (ratio <= 3) return 'high'
  return 'flood'
}
