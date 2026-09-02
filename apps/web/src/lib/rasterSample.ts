/**
 * Samples a world PNG overlay (EPSG:3857, ±85.05°) at a lon/lat and maps the pixel colour back
 * to a legend class/value by nearest colour. Used by the panel for drought and groundwater.
 */
import type { Legend } from '@ava-sipi/schema'
import { hexToRgba, Ramp } from './color'

const MAX_LAT = 85.05112878
const canvases = new Map<string, Promise<CanvasRenderingContext2D>>()

function loadCanvas(url: string): Promise<CanvasRenderingContext2D> {
  let p = canvases.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) return reject(new Error('no 2d context'))
        ctx.drawImage(img, 0, 0)
        resolve(ctx)
      }
      img.onerror = () => reject(new Error(`image failed: ${url}`))
      img.src = url
    })
    canvases.set(url, p)
  }
  return p
}

export function lonLatToImagePx(
  lon: number,
  lat: number,
  width: number,
  height: number,
): [number, number] {
  const x = ((lon + 180) / 360) * width
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const rad = (clamped * Math.PI) / 180
  const yMerc = Math.log(Math.tan(Math.PI / 4 + rad / 2))
  const y = (0.5 - yMerc / (2 * Math.PI)) * height
  return [
    Math.min(width - 1, Math.max(0, Math.floor(x))),
    Math.min(height - 1, Math.max(0, Math.floor(y))),
  ]
}

export async function samplePixel(
  url: string,
  lon: number,
  lat: number,
): Promise<[number, number, number, number]> {
  const ctx = await loadCanvas(url)
  const [x, y] = lonLatToImagePx(lon, lat, ctx.canvas.width, ctx.canvas.height)
  const d = ctx.getImageData(x, y, 1, 1).data
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0]
}

function dist(a: [number, number, number, number], b: [number, number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Nearest legend stop for a class legend (drought). Returns null when transparent. */
export function classifyByLegend(
  px: [number, number, number, number],
  legend: Legend,
): Legend['stops'][number] | null {
  if (px[3] < 20) return null
  let best: Legend['stops'][number] | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const s of legend.stops) {
    if (s.color === 'transparent') continue
    const d = dist(px, hexToRgba(s.color))
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return bestD < 60 ? best : null
}

const rampCache = new Map<string, Ramp>()

/** Nearest continuous value for a ramp legend (groundwater). Returns null when transparent. */
export function valueByLegend(px: [number, number, number, number], legend: Legend): number | null {
  if (px[3] < 20) return null
  const key = JSON.stringify(legend.stops)
  let ramp = rampCache.get(key)
  if (!ramp) {
    ramp = new Ramp(
      legend.stops
        .filter((s) => s.color !== 'transparent')
        .map((s) => ({ value: s.value, color: s.color })),
      128,
    )
    rampCache.set(key, ramp)
  }
  const first = legend.stops[0]?.value ?? 0
  const last = legend.stops[legend.stops.length - 1]?.value ?? 1
  let best = first
  let bestD = Number.POSITIVE_INFINITY
  for (let i = 0; i <= 64; i++) {
    const v = first + ((last - first) * i) / 64
    const d = dist(px, ramp.rgba(v))
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return bestD < 80 ? best : null
}
