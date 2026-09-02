/**
 * MapLibre-native layers (spec §1.2 fallback decision, docs/DEVIATIONS.md):
 * raster overlays (drought, groundwater) and glacier polygons. Vector tiles and rasters are
 * served best by MapLibre itself; deck.gl draws the point/line data layers.
 */
import type { Artifact, LayerManifest } from '@ava-sipi/schema'
import type { Map as MlMap } from 'maplibre-gl'
import { TOKENS } from '@/lib/color'
import { artifactUrl, findArtifact } from '@/lib/manifest'
import { LABEL_LAYER_ID } from '@/map/basemap'
import type { GlaciersData } from '@/state/data'
import type { TimeState } from '@/state/store'

const MAX_LAT = 85.05112878

export interface RasterSpec {
  id: 'drought' | 'groundwater'
  visible: boolean
  opacity: number
  lm: LayerManifest | undefined
  base: string
  time: TimeState
  /** artifact names to try, in order (tiles first) */
  names: string[]
}

const current = new Map<string, string>() // layer id -> source signature

function beforeId(map: MlMap): string | undefined {
  return map.getLayer(LABEL_LAYER_ID) ? LABEL_LAYER_ID : undefined
}

function absolute(url: string): string {
  return new URL(url, window.location.href).href
}

function removeLayer(map: MlMap, id: string): void {
  if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(id)) map.removeSource(id)
  current.delete(id)
}

export function pickRasterArtifact(
  lm: LayerManifest | undefined,
  names: string[],
): Artifact | undefined {
  if (!lm) return undefined
  for (const n of names) {
    const a = findArtifact(lm, n)
    if (a) return a
  }
  return undefined
}

export function syncRaster(map: MlMap, spec: RasterSpec): void {
  const art = spec.visible ? pickRasterArtifact(spec.lm, spec.names) : undefined
  if (!art || !spec.lm) {
    removeLayer(map, spec.id)
    return
  }
  const url = artifactUrl(spec.lm, art, spec.base, spec.time)
  const signature = `${art.kind}:${url}`
  if (current.get(spec.id) !== signature) {
    removeLayer(map, spec.id)
    if (art.kind === 'raster-pmtiles') {
      map.addSource(spec.id, { type: 'raster', url: `pmtiles://${absolute(url)}`, tileSize: 256 })
    } else {
      const [w, s, e, n] = art.bbox ?? [-180, -MAX_LAT, 180, MAX_LAT]
      map.addSource(spec.id, {
        type: 'image',
        url: absolute(url),
        coordinates: [
          [w, n],
          [e, n],
          [e, s],
          [w, s],
        ],
      })
    }
    map.addLayer(
      {
        id: spec.id,
        type: 'raster',
        source: spec.id,
        paint: {
          'raster-opacity': spec.opacity,
          'raster-resampling': 'linear',
          'raster-fade-duration': 0,
        },
      },
      beforeId(map),
    )
    current.set(spec.id, signature)
  } else {
    map.setPaintProperty(spec.id, 'raster-opacity', spec.opacity)
  }
}

export interface GlacierSpec {
  visible: boolean
  data: GlaciersData | undefined
  /** 0.8 → 0.6 → 0.8 over 6 s where the regional mass balance is negative (spec §5.3) */
  meltOpacity: number
}

const GLACIER_FILL = 'glaciers-fill'
const GLACIER_LINE = 'glaciers-line'

export function syncGlaciers(map: MlMap, spec: GlacierSpec): void {
  if (!spec.visible || !spec.data) {
    for (const id of [GLACIER_FILL, GLACIER_LINE]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource('glaciers')) map.removeSource('glaciers')
    current.delete('glaciers')
    return
  }
  const signature = spec.data.tilesUrl ?? `geojson:${spec.data.outlines.features.length}`
  if (current.get('glaciers') !== signature) {
    for (const id of [GLACIER_FILL, GLACIER_LINE]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource('glaciers')) map.removeSource('glaciers')
    const sourceLayer = spec.data.tilesUrl ? { 'source-layer': 'glaciers' } : {}
    if (spec.data.tilesUrl) {
      map.addSource('glaciers', {
        type: 'vector',
        url: `pmtiles://${absolute(spec.data.tilesUrl)}`,
        promoteId: 'id',
      })
    } else {
      map.addSource('glaciers', {
        type: 'geojson',
        data: spec.data.outlines as GeoJSON.FeatureCollection,
        promoteId: 'id',
      })
    }
    const negative: maplibregl.ExpressionSpecification = [
      '<',
      ['coalesce', ['get', 'massBalanceMwe'], 0],
      0,
    ]
    map.addLayer(
      {
        id: GLACIER_FILL,
        type: 'fill',
        source: 'glaciers',
        ...sourceLayer,
        paint: {
          'fill-color': TOKENS.glacier,
          'fill-opacity': ['case', negative, spec.meltOpacity, 0.8],
        },
      },
      beforeId(map),
    )
    map.addLayer(
      {
        id: GLACIER_LINE,
        type: 'line',
        source: 'glaciers',
        ...sourceLayer,
        paint: {
          'line-color': '#9CCBE0',
          'line-width': 0.8,
          'line-opacity': ['case', negative, spec.meltOpacity, 0.9],
        },
      },
      beforeId(map),
    )
    current.set('glaciers', signature)
  } else if (map.getLayer(GLACIER_FILL)) {
    const negative: maplibregl.ExpressionSpecification = [
      '<',
      ['coalesce', ['get', 'massBalanceMwe'], 0],
      0,
    ]
    map.setPaintProperty(GLACIER_FILL, 'fill-opacity', ['case', negative, spec.meltOpacity, 0.8])
    map.setPaintProperty(GLACIER_LINE, 'line-opacity', ['case', negative, spec.meltOpacity, 0.9])
  }
}

/** Opacity for the melt breathing: 0.8 → 0.6 → 0.8, 6 s period. */
export function meltOpacity(tSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.7
  return 0.7 + 0.1 * Math.cos((2 * Math.PI * tSeconds) / 6)
}

export function resetNativeRegistry(): void {
  current.clear()
}

export const GLACIER_LAYER_IDS = [GLACIER_FILL, GLACIER_LINE] as const
