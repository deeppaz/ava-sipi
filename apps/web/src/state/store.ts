import { defaultOnLayers } from '@ava-sipi/layers'
import type { LayerId } from '@ava-sipi/schema'
import { create } from 'zustand'
import type { UnitSystem } from '@/lib/units'

export type TimeMode = 'live' | 'past' | 'forecast'
export interface TimeState {
  mode: TimeMode
  /** ISO day. For 'live' it is today (UTC); for 'forecast' the target day. */
  day: string
}
export interface Camera {
  lon: number
  lat: number
  zoom: number
  bearing: number
  pitch: number
}
export interface CameraRequest extends Partial<Camera> {
  seq: number
  durationMs: number
  /** keep the target in the left two-thirds when the panel is open (spec §5.4) */
  padRight?: boolean
  essential?: boolean
}
export interface Selection {
  layer: LayerId
  id: string
  lon?: number
  lat?: number
}
export interface HoverInfo {
  layer: LayerId
  id: string
  title: string
  subtitle?: string
  x: number
  y: number
}
export interface StoryState {
  id: string
  step: number
}
export type Projection = 'globe' | 'mercator'
export type PerfLevel = 0 | 1 | 2

const UNITS_KEY = 'ava-sipi:units'
const MOTION_KEY = 'ava-sipi:reduced-motion'

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key)
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null
  } catch {
    return null
  }
}

function systemReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface AppState {
  layers: LayerId[]
  time: TimeState
  camera: Camera
  cameraRequest: CameraRequest | null
  projection: Projection
  selection: Selection | null
  hover: HoverInfo | null
  units: UnitSystem
  reducedMotion: boolean
  story: StoryState | null
  droughtProduct: 'cdi' | 'spi3'
  embed: boolean
  perfLevel: PerfLevel
  paletteOpen: boolean
  eventsOpen: boolean
  legendOpen: boolean
  toast: string | null
  hydrated: boolean

  toggleLayer: (id: LayerId) => void
  setLayer: (id: LayerId, on: boolean) => void
  setLayers: (ids: LayerId[]) => void
  setTime: (t: TimeState) => void
  setCamera: (c: Camera) => void
  requestCamera: (c: Partial<Camera>, opts?: Partial<Omit<CameraRequest, 'seq'>>) => void
  setProjection: (p: Projection) => void
  select: (s: Selection | null) => void
  setHover: (h: HoverInfo | null) => void
  setUnits: (u: UnitSystem) => void
  setReducedMotion: (v: boolean) => void
  setStory: (s: StoryState | null) => void
  setDroughtProduct: (p: 'cdi' | 'spi3') => void
  setEmbed: (v: boolean) => void
  setPerfLevel: (l: PerfLevel) => void
  setPaletteOpen: (v: boolean) => void
  setEventsOpen: (v: boolean) => void
  setLegendOpen: (v: boolean) => void
  showToast: (msg: string | null) => void
  hydrate: (
    partial: Partial<
      Pick<
        AppState,
        | 'layers'
        | 'time'
        | 'camera'
        | 'projection'
        | 'selection'
        | 'story'
        | 'embed'
        | 'droughtProduct'
      >
    >,
  ) => void
}

export const DEFAULT_CAMERA: Camera = { lon: 20, lat: 25, zoom: 1.6, bearing: 0, pitch: 0 }

let seq = 0

export const useApp = create<AppState>()((set, get) => ({
  layers: [...defaultOnLayers],
  time: { mode: 'live', day: todayUtc() },
  camera: DEFAULT_CAMERA,
  cameraRequest: null,
  projection: 'globe',
  selection: null,
  hover: null,
  units: readStored(UNITS_KEY, ['metric', 'imperial'] as const) ?? 'metric',
  reducedMotion: readStored(MOTION_KEY, ['1', '0'] as const) === '1' || systemReducedMotion(),
  story: null,
  droughtProduct: 'cdi',
  embed: false,
  perfLevel: 0,
  paletteOpen: false,
  eventsOpen: false,
  legendOpen: false,
  toast: null,
  hydrated: false,

  toggleLayer: (id) => {
    const { layers } = get()
    set({ layers: layers.includes(id) ? layers.filter((l) => l !== id) : [...layers, id] })
  },
  setLayer: (id, on) => {
    const { layers } = get()
    if (on && !layers.includes(id)) set({ layers: [...layers, id] })
    if (!on && layers.includes(id)) set({ layers: layers.filter((l) => l !== id) })
  },
  setLayers: (ids) => set({ layers: [...new Set(ids)] }),
  setTime: (time) => set({ time }),
  setCamera: (camera) => set({ camera }),
  requestCamera: (c, opts) =>
    set({ cameraRequest: { ...c, seq: ++seq, durationMs: opts?.durationMs ?? 1600, ...opts } }),
  setProjection: (projection) => set({ projection }),
  select: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
  setUnits: (units) => {
    try {
      localStorage.setItem(UNITS_KEY, units)
    } catch {
      /* ignore */
    }
    set({ units })
  },
  setReducedMotion: (v) => {
    try {
      localStorage.setItem(MOTION_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ reducedMotion: v })
  },
  setStory: (story) => set({ story }),
  setDroughtProduct: (droughtProduct) => set({ droughtProduct }),
  setEmbed: (embed) => set({ embed }),
  setPerfLevel: (perfLevel) => set({ perfLevel }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setEventsOpen: (eventsOpen) => set({ eventsOpen }),
  setLegendOpen: (legendOpen) => set({ legendOpen }),
  showToast: (toast) => set({ toast }),
  hydrate: (partial) => set({ ...partial, hydrated: true }),
}))

/** Days ahead for forecast mode (1..7), 0 otherwise. */
export function forecastDays(time: TimeState): number {
  if (time.mode !== 'forecast') return 0
  const today = new Date(`${todayUtc()}T00:00:00Z`).getTime()
  const target = new Date(`${time.day}T00:00:00Z`).getTime()
  return Math.max(1, Math.min(7, Math.round((target - today) / 86400000)))
}

export { todayUtc }
