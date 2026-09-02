import maplibregl, { type Map as MlMap } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { Camera } from '@/state/store'
import { offlineStyle, onlineStyle } from './basemap'
import 'maplibre-gl/dist/maplibre-gl.css'

let protocolRegistered = false

export function registerPmtiles(): void {
  if (protocolRegistered) return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  protocolRegistered = true
}

export function supportsWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

export interface CreateMapOptions {
  container: HTMLElement
  camera: Camera
  interactive?: boolean
}

/**
 * MapLibre 5 globe map. `preserveDrawingBuffer` keeps screenshots possible (spec §5.1 ⌘K).
 * The style declares `projection: globe` and sky/atmosphere (spec §5.2).
 */
export function createMap({ container, camera, interactive = true }: CreateMapOptions): MlMap {
  registerPmtiles()
  const map = new maplibregl.Map({
    container,
    style: onlineStyle(),
    center: [camera.lon, camera.lat],
    zoom: camera.zoom,
    bearing: camera.bearing,
    pitch: camera.pitch,
    minZoom: 1,
    maxZoom: 14,
    maxPitch: 70,
    interactive,
    attributionControl: false,
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
    fadeDuration: 150,
    dragRotate: true,
    touchPitch: true,
    keyboard: true,
  })
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

  // Offline fallback: if the vector tiles never answer, swap to the Natural Earth style.
  let switched = false
  map.on('error', (e) => {
    const err = e.error as { status?: number; message?: string } | undefined
    const src = (e as { sourceId?: string }).sourceId
    if (switched || src !== 'omt') return
    if (
      err &&
      (err.status === undefined || err.status >= 500 || err.message?.includes('Failed to fetch'))
    ) {
      switched = true
      console.warn('[basemap] vector tiles unreachable, using offline Natural Earth basemap')
      map.setStyle(offlineStyle(), { diff: false })
    }
  })
  return map
}

/** Padding that keeps a selected object in the left two-thirds while the panel is open (spec §5.4). */
export function panelPadding(open: boolean, width: number): maplibregl.PaddingOptions {
  const panel = open && width >= 768 ? 380 + 32 : 0
  return { top: 72, bottom: 96, left: width < 768 ? 16 : 72, right: panel + 16 }
}
