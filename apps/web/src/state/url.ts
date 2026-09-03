/**
 * URL state (spec §5.1): `?l=rivers,events&t=2026-09-02&c=38.9,41.1,5.2&p=globe&s=gauges:USGS-01646500&story=aral&step=2&embed=1`
 * Every share link carries the whole view. Language and units are deliberately not in the URL.
 */
import type { LayerId } from '@ava-sipi/schema'
import { LAYER_IDS } from '@ava-sipi/schema/constants'
import { useEffect } from 'react'
import {
  type AppState,
  type Camera,
  DEFAULT_CAMERA,
  type TimeState,
  todayUtc,
  useApp,
} from './store'

export type UrlState = Partial<
  Pick<
    AppState,
    'layers' | 'time' | 'camera' | 'projection' | 'selection' | 'story' | 'embed' | 'droughtProduct'
  >
>

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function parseTime(raw: string | null): TimeState | undefined {
  if (!raw || raw === 'live') return raw ? { mode: 'live', day: todayUtc() } : undefined
  const fc = /^f\+(\d)$/.exec(raw)
  if (fc) {
    const n = Math.max(1, Math.min(7, Number(fc[1])))
    const d = new Date(`${todayUtc()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return { mode: 'forecast', day: d.toISOString().slice(0, 10) }
  }
  if (ISO_DAY.test(raw)) {
    const today = todayUtc()
    if (raw >= today) return { mode: 'live', day: today }
    return { mode: 'past', day: raw }
  }
  return undefined
}

export function serializeTime(t: TimeState): string {
  if (t.mode === 'live') return 'live'
  if (t.mode === 'past') return t.day
  const today = new Date(`${todayUtc()}T00:00:00Z`).getTime()
  const n = Math.round((new Date(`${t.day}T00:00:00Z`).getTime() - today) / 86400000)
  return `f+${Math.max(1, Math.min(7, n))}`
}

function round(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

export function parseCamera(raw: string | null): Camera | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').map(Number)
  const [lat, lon, zoom, bearing = 0, pitch = 0] = parts
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return undefined
  if (lat === undefined || lon === undefined || zoom === undefined) return undefined
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || zoom < 0 || zoom > 22) return undefined
  return { lat, lon, zoom, bearing, pitch: Math.max(0, Math.min(85, pitch)) }
}

export function serializeCamera(c: Camera): string {
  const base = `${round(c.lat, 4)},${round(c.lon, 4)},${round(c.zoom, 2)}`
  if (Math.abs(c.bearing) > 0.5 || c.pitch > 0.5)
    return `${base},${round(c.bearing, 0)},${round(c.pitch, 0)}`
  return base
}

export function readUrlState(search: string): UrlState {
  const q = new URLSearchParams(search)
  const out: UrlState = {}
  const l = q.get('l')
  if (l !== null) {
    out.layers = l
      .split(',')
      .filter((x): x is LayerId => (LAYER_IDS as readonly string[]).includes(x))
  }
  const t = parseTime(q.get('t'))
  if (t) out.time = t
  const c = parseCamera(q.get('c'))
  if (c) out.camera = c
  const p = q.get('p')
  if (p === 'globe' || p === 'flat') out.projection = p === 'flat' ? 'mercator' : 'globe'
  const s = q.get('s')
  if (s) {
    const idx = s.indexOf(':')
    const layer = s.slice(0, idx)
    const id = s.slice(idx + 1)
    if (idx > 0 && id && (LAYER_IDS as readonly string[]).includes(layer))
      out.selection = { layer: layer as LayerId, id }
  }
  const story = q.get('story')
  if (story && /^[a-z0-9-]+$/.test(story)) {
    const step = Math.max(1, Number(q.get('step') ?? '1') || 1)
    out.story = { id: story, step }
  }
  if (q.get('embed') === '1') out.embed = true
  const dp = q.get('dp')
  if (dp === 'cdi' || dp === 'spi3') out.droughtProduct = dp
  return out
}

export function writeUrlState(
  s: Pick<
    AppState,
    'layers' | 'time' | 'camera' | 'projection' | 'selection' | 'story' | 'embed' | 'droughtProduct'
  >,
): string {
  const q = new URLSearchParams()
  q.set('l', s.layers.join(','))
  q.set('t', serializeTime(s.time))
  q.set('c', serializeCamera(s.camera))
  if (s.projection !== 'globe') q.set('p', 'flat')
  if (s.selection) q.set('s', `${s.selection.layer}:${s.selection.id}`)
  if (s.story) {
    q.set('story', s.story.id)
    q.set('step', String(s.story.step))
  }
  if (s.embed) q.set('embed', '1')
  if (s.droughtProduct !== 'cdi') q.set('dp', s.droughtProduct)
  // commas and colons are legal in query values; keep share links readable
  return `?${q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`
}

/** Hydrates the store from the URL on mount, then mirrors store changes back (debounced). */
export function useUrlSync(): void {
  useEffect(() => {
    const hydrate = () => {
      const parsed = readUrlState(window.location.search)
      const st = useApp.getState()
      st.hydrate(parsed)
      if (parsed.camera) st.requestCamera(parsed.camera, { durationMs: 0 })
      else if (!parsed.camera && !st.hydrated) st.requestCamera(DEFAULT_CAMERA, { durationMs: 0 })
    }
    hydrate()
    window.addEventListener('popstate', hydrate)

    let timer: number | undefined
    const unsub = useApp.subscribe((s, prev) => {
      if (
        s.layers === prev.layers &&
        s.time === prev.time &&
        s.camera === prev.camera &&
        s.projection === prev.projection &&
        s.selection === prev.selection &&
        s.story === prev.story &&
        s.embed === prev.embed &&
        s.droughtProduct === prev.droughtProduct
      )
        return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const next = writeUrlState(s)
        if (next !== window.location.search)
          history.replaceState(null, '', `${next}${window.location.hash}`)
      }, 300)
    })
    return () => {
      window.removeEventListener('popstate', hydrate)
      window.clearTimeout(timer)
      unsub()
    }
  }, [])
}

export function shareUrl(): string {
  const s = useApp.getState()
  return `${window.location.origin}${window.location.pathname}${writeUrlState(s)}`
}
