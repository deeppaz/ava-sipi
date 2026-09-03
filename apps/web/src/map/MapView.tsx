import { layerById } from '@ava-sipi/layers'
import type { LayerId } from '@ava-sipi/schema'
import type { Map as MlMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import type { BuildContext } from '@/layers/context'
import {
  GLACIER_LAYER_IDS,
  meltOpacity,
  pickRasterArtifact,
  resetNativeRegistry,
  syncGlaciers,
  syncRaster,
  syncRiverNetwork,
} from '@/layers/nativeLayers'
import { formatNumber, formatPercent } from '@/lib/format'
import { artifactUrl, layerManifest, useManifest } from '@/lib/manifest'
import { classifyByLegend, samplePixel, valueByLegend } from '@/lib/rasterSample'
import { discharge as toDischarge } from '@/lib/units'
import { isDataLayer, type RiversData, useData } from '@/state/data'
import { useRasterSamples } from '@/state/raster'
import { type CameraRequest, forecastDays, useApp } from '@/state/store'
import { LABEL_LAYER_ID } from './basemap'
import {
  applyProjectionInteractions,
  cameraForProjection,
  panelPadding,
  supportsWebGL2,
} from './camera'

type DeckEntry = typeof import('@/layers/deckEntry')
type Overlay = InstanceType<DeckEntry['MapboxOverlay']>

/** Segment id -> today's (or the forecast day's) flow ratio, for MapLibre feature state. */
function riverRatios(data: RiversData | undefined, forecastDays: number): Map<number, number> {
  const out = new Map<number, number>()
  if (!data) return out
  for (const [id, row] of data.discharge) {
    const ratio =
      forecastDays > 0
        ? (row.forecast[Math.min(forecastDays, row.forecast.length) - 1] ?? 0) /
          Math.max(row.ratio > 0 ? row.today / row.ratio : 1, 1e-9)
        : row.ratio
    if (Number.isFinite(ratio)) out.set(id, Math.min(12, ratio))
  }
  return out
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function MapView() {
  const ref = useRef<HTMLElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const overlayRef = useRef<Overlay | null>(null)
  const deckRef = useRef<DeckEntry | null>(null)
  const zoomRef = useRef(useApp.getState().camera.zoom)
  const [ready, setReady] = useState(false)
  const [mapPainted, setMapPainted] = useState(false)
  const [styleVersion, setStyleVersion] = useState(0)
  const [webgl] = useState(() => supportsWebGL2())
  const { t, locale } = useI18n()
  const units = useApp((s) => s.units)
  const introDone = useRef(false)

  // ---- create the map once
  useEffect(() => {
    const el = ref.current
    if (!el || !webgl) return
    let map: MlMap | undefined
    let disposed = false
    // maplibre-gl costs ~1.8 s of main-thread work on a throttled phone; let the shell paint
    // first, then build the map. Two frames is enough for the browser to present it.
    const start = () => {
      void import('./createMap').then(({ createMap }) => {
        if (disposed || !ref.current) return
        map = createMap({ container: el, camera: useApp.getState().camera })
        mapRef.current = map
        attach(map)
      })
    }
    // idle rather than a fixed frame count, so the shell's own work finishes first
    const idle = window.requestIdleCallback
    if (idle) idle(start, { timeout: 1200 })
    else requestAnimationFrame(() => requestAnimationFrame(start))

    const attach = (map: MlMap) => {
      map.on('load', () => {
        setMapPainted(true)
        // deck.gl arrives after the first paint of the globe (bundle budget, spec §5.6)
        void import('@/layers/deckEntry').then((deck) => {
          if (!mapRef.current) return
          const overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] })
          map.addControl(overlay)
          overlayRef.current = overlay
          deckRef.current = deck
          setReady(true)
        })
      })
      map.on('style.load', () => {
        resetNativeRegistry()
        setStyleVersion((v) => v + 1)
      })
      map.on('move', () => {
        zoomRef.current = map.getZoom()
      })
      map.on('moveend', () => {
        const c = map.getCenter()
        useApp.getState().setCamera({
          lon: c.lng,
          lat: c.lat,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        })
      })
      map.on('click', (e) => {
        const picked = overlayRef.current?.pickObject({ x: e.point.x, y: e.point.y, radius: 4 })
        if (picked?.object) return // deck handled it
        const st = useApp.getState()
        const feats = map.queryRenderedFeatures(e.point, {
          layers: GLACIER_LAYER_IDS.filter((id) => map.getLayer(id)),
        })
        const g = feats[0]
        if (g?.properties?.id) {
          st.select({
            layer: 'glaciers',
            id: String(g.properties.id),
            lon: e.lngLat.lng,
            lat: e.lngLat.lat,
          })
          return
        }
        const rasterLayer = (['drought', 'groundwater'] as const).find(
          (id) => st.layers.includes(id) && map.getLayer(id),
        )
        if (rasterLayer) {
          void sampleRaster(rasterLayer, e.lngLat.lng, e.lngLat.lat)
          return
        }
        st.select(null)
      })
    }

    return () => {
      disposed = true
      map?.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [webgl])

  // ---- camera requests (URL, search, stories, panel)
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    let lastSeq = -1
    const apply = (req: CameraRequest) => {
      if (req.seq === lastSeq) return
      lastSeq = req.seq
      const st = useApp.getState()
      // globe ignores bearing/pitch in deck.gl, so never fly to a rotated globe camera
      const { bearing, pitch } = cameraForProjection(
        { bearing: req.bearing ?? 0, pitch: req.pitch ?? 0 },
        st.projection,
      )
      const opts = {
        center: [req.lon ?? st.camera.lon, req.lat ?? st.camera.lat] as [number, number],
        zoom: req.zoom ?? st.camera.zoom,
        bearing,
        pitch,
        padding: panelPadding(
          !!st.selection && req.padRight !== false,
          map.getContainer().clientWidth,
        ),
      }
      if (req.durationMs <= 0 || st.reducedMotion) map.jumpTo(opts)
      else
        map.flyTo({
          ...opts,
          duration: req.durationMs,
          easing: easeInOut,
          essential: req.essential ?? true,
        })
    }
    const current = useApp.getState().cameraRequest
    if (current) apply(current)
    const unsub = useApp.subscribe((s, prev) => {
      if (s.cameraRequest && s.cameraRequest !== prev.cameraRequest) apply(s.cameraRequest)
      if (s.projection !== prev.projection) {
        map.setProjection({ type: s.projection === 'globe' ? 'globe' : 'mercator' })
        applyProjectionInteractions(map, s.projection)
      }
      if (
        s.selection !== prev.selection &&
        s.selection?.lon !== undefined &&
        s.selection.lat !== undefined
      ) {
        // keep the selected object out from under the panel (spec §5.4)
        map.easeTo({
          center: [s.selection.lon, s.selection.lat],
          padding: panelPadding(true, map.getContainer().clientWidth),
          duration: s.reducedMotion ? 0 : 600,
          easing: easeInOut,
        })
      }
      if (s.hover !== prev.hover) map.getCanvas().style.cursor = s.hover ? 'pointer' : ''
    })
    const onFly = (e: Event) => {
      const d = (e as CustomEvent<{ lon: number; lat: number; zoom: number }>).detail
      useApp
        .getState()
        .requestCamera({ lon: d.lon, lat: d.lat, zoom: d.zoom }, { durationMs: 1200 })
    }
    window.addEventListener('ava:flyto', onFly)
    return () => {
      unsub()
      window.removeEventListener('ava:flyto', onFly)
    }
  }, [ready])

  // ---- intro: slow 12 s rotation on first load only (spec §5.2), skipped for reduced motion / shared links / embeds
  useEffect(() => {
    if (!ready || introDone.current) return
    introDone.current = true
    const map = mapRef.current
    const st = useApp.getState()
    if (st.reducedMotion || st.embed || window.location.search.includes('c=') || !map) return
    const target = st.camera
    map.jumpTo({ center: [target.lon - 48, target.lat], zoom: target.zoom })
    map.easeTo({
      center: [target.lon, target.lat],
      duration: 12000,
      easing: (x) => 1 - (1 - x) ** 3,
      essential: false,
    })
  }, [ready])

  // ---- data loading for active layers
  const manifest = useManifest((s) => s.manifest)
  const base = useManifest((s) => s.base)
  const layers = useApp((s) => s.layers)
  const time = useApp((s) => s.time)
  useEffect(() => {
    // Layer artifacts are megabytes and useless before there is a map to draw them on; fetching
    // them during startup only starved the first paint of bandwidth.
    if (!manifest || !ready) return
    const ensure = useData.getState().ensure
    for (const id of layers) {
      const lm = layerManifest(manifest, id)
      if (lm && isDataLayer(id)) ensure(id, lm, base, time)
    }
  }, [manifest, base, layers, time, ready])

  // ---- deck frame loop
  useEffect(() => {
    if (!ready) return
    const overlay = overlayRef.current
    const deck = deckRef.current
    if (!overlay || !deck) return
    const { buildDeckLayers, needsAnimation } = deck
    let raf = 0
    let dirty = true
    const start = performance.now()
    let lastFrame = 0
    const unsubs = [
      useApp.subscribe(() => (dirty = true)),
      useData.subscribe(() => (dirty = true)),
      useManifest.subscribe(() => (dirty = true)),
    ]
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const st = useApp.getState()
      const d = useData.getState()
      const ctxBase = {
        layers: st.layers,
        reducedMotion: st.reducedMotion,
        data: {
          rivers: d.rivers.data,
          gauges: d.gauges.data,
          events: d.events.data,
          reservoirs: d.reservoirs.data,
        },
      }
      const animating = needsAnimation(ctxBase)
      const minInterval = st.perfLevel >= 2 ? 1000 / 30 : 0
      if (!dirty && !animating) return
      if (animating && now - lastFrame < minInterval) return
      lastFrame = now
      dirty = false
      const ctx: BuildContext = {
        ...ctxBase,
        t: (now - start) / 1000,
        zoom: zoomRef.current,
        time: st.time,
        forecastDays: forecastDays(st.time),
        perfLevel: st.perfLevel,
        projection: st.projection,
        selection: st.selection,
        onSelect: st.select,
        onHover: st.setHover,
        fmt: {
          discharge: (v) => {
            const q = toDischarge(v, st.units)
            return `${formatNumber(locale, q.value)} ${q.unit}`
          },
          percent: (v) => formatPercent(locale, v),
          t,
        },
        beforeId: mapRef.current?.getLayer(LABEL_LAYER_ID) ? LABEL_LAYER_ID : '',
      }
      overlay.setProps({ layers: buildDeckLayers(ctx) })
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      for (const u of unsubs) u()
    }
  }, [ready, locale, t])

  // ---- native layers (rasters + glaciers)
  const glaciers = useData((s) => s.glaciers.data)
  const riversLoaded = useData((s) => s.rivers.data)
  const reducedMotion = useApp((s) => s.reducedMotion)
  const droughtProduct = useApp((s) => s.droughtProduct)
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    const drought = layerManifest(manifest, 'drought')
    const groundwater = layerManifest(manifest, 'groundwater')
    syncRaster(map, {
      id: 'drought',
      visible: layers.includes('drought'),
      opacity: 0.5,
      lm: drought,
      base,
      time,
      names:
        droughtProduct === 'spi3'
          ? ['spi3-tiles', 'spi3', 'cdi-tiles', 'cdi']
          : ['cdi-tiles', 'cdi'],
    })
    syncRaster(map, {
      id: 'groundwater',
      visible: layers.includes('groundwater'),
      opacity: 0.55,
      lm: groundwater,
      base,
      time,
      names: ['tws_latest-tiles', 'tws_latest', 'gws_percentile-tiles', 'gws_percentile'],
    })
    syncGlaciers(map, {
      visible: layers.includes('glaciers'),
      data: glaciers,
      meltOpacity: meltOpacity(0, reducedMotion),
    })
    const riversData = useData.getState().rivers.data
    syncRiverNetwork(map, {
      visible: layers.includes('rivers'),
      url: riversData?.networkTilesUrl ?? null,
      ratios: riverRatios(riversData, forecastDays(time)),
    })
  }, [
    ready,
    styleVersion,
    manifest,
    base,
    layers,
    time,
    glaciers,
    riversLoaded,
    droughtProduct,
    reducedMotion,
  ])

  // glacier melt breathing (10 Hz is plenty for a 6 s cycle)
  useEffect(() => {
    if (!ready || !layers.includes('glaciers') || reducedMotion) return
    const map = mapRef.current
    if (!map) return
    const start = performance.now()
    const id = window.setInterval(() => {
      if (!map.getLayer('glaciers-fill')) return
      syncGlaciers(map, {
        visible: true,
        data: glaciers,
        meltOpacity: meltOpacity((performance.now() - start) / 1000, false),
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [ready, layers, glaciers, reducedMotion])

  // ---- raster click sampling → panel
  const sampleRaster = async (layer: 'drought' | 'groundwater', lon: number, lat: number) => {
    const m = useManifest.getState()
    const lm = layerManifest(m.manifest, layer)
    if (!lm?.legend) return
    const st = useApp.getState()
    const names =
      layer === 'drought'
        ? st.droughtProduct === 'spi3'
          ? ['spi3', 'cdi']
          : ['cdi']
        : ['tws_latest', 'gws_percentile']
    const art = pickRasterArtifact(lm, names)
    if (!art) return
    const id = `${lon.toFixed(3)},${lat.toFixed(3)}`
    st.select({ layer, id, lon, lat })
    try {
      const px = await samplePixel(artifactUrl(lm, art, m.base, st.time), lon, lat)
      const cls = lm.legend.unit === 'class' ? classifyByLegend(px, lm.legend) : null
      const value = lm.legend.unit === 'class' ? null : valueByLegend(px, lm.legend)
      useRasterSamples.getState().set(id, {
        layer,
        unit: lm.legend.unit,
        cls: cls?.label ?? null,
        value,
        artifactName: art.name ?? '',
      })
    } catch (e) {
      console.warn('[raster] sample failed', e)
      useRasterSamples.getState().set(id, {
        layer,
        unit: lm.legend.unit,
        cls: null,
        value: null,
        artifactName: art.name ?? '',
      })
    }
  }

  const layerNames = layers.map((id: LayerId) => t(layerById[id].nameKey)).join(', ')

  if (!webgl) {
    return (
      <div className="map-fallback" role="alert">
        {t('error.webgl')}
      </div>
    )
  }
  return (
    <>
      <section
        ref={ref}
        className="map-root"
        aria-label={`${t('app.map')} — ${layerNames}`}
        data-testid="map"
        data-units={units}
      />
      {/* Painted immediately so the first frame shows the globe's silhouette instead of an empty
          page; it never stands in for data and goes as soon as MapLibre's first frame lands. */}
      {!mapPainted ? <div className="globe-skeleton" aria-hidden="true" /> : null}
    </>
  )
}
