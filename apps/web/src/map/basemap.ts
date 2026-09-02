/**
 * Basemap style (spec §5.2 / §6): coastline, land mass, faint borders, settlement labels from
 * zoom 5. No roads, buildings or POIs. Ocean and land sit close in value so data can glow.
 * Vector tiles: OpenFreeMap (OpenMapTiles schema, keyless). Offline fallback: Natural Earth GeoJSON.
 */
import type { SkySpecification, StyleSpecification } from 'maplibre-gl'
import { TOKENS } from '@/lib/color'
import { env } from '@/lib/env'

/** Space behind the globe — one step darker than the ocean so the limb reads. See docs/DESIGN.md. */
export const SPACE = '#040B13'

const SKY: SkySpecification = {
  'sky-color': SPACE,
  'horizon-color': TOKENS.tide,
  'fog-color': TOKENS.abyss,
  'fog-ground-blend': 0.5,
  'horizon-fog-blend': 0.6,
  'sky-horizon-blend': 0.75,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 5, 0.45, 8, 0],
}

export const LABEL_LAYER_ID = 'place-labels'
export const BOUNDARY_LAYER_ID = 'boundaries'

export function onlineStyle(): StyleSpecification {
  const source = env.basemapPmtiles
    ? { type: 'vector' as const, url: `pmtiles://${env.basemapPmtiles}` }
    : { type: 'vector' as const, url: env.basemapTileJson }
  return {
    version: 8,
    name: 'ava-sipi-night',
    projection: { type: 'globe' as const },
    sky: SKY,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: source },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': TOKENS.shelf } },
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'fill-color': TOKENS.abyss, 'fill-antialias': true },
      },
      {
        id: 'glaciated',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'ice'],
        paint: { 'fill-color': TOKENS.glacier, 'fill-opacity': 0.12 },
      },
      {
        id: BOUNDARY_LAYER_ID,
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': TOKENS.tide,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.12, 5, 0.28],
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 0.8],
        },
      },
      {
        id: 'coastline',
        type: 'line',
        source: 'omt',
        'source-layer': 'water',
        filter: ['==', ['get', 'class'], 'ocean'],
        paint: {
          'line-color': TOKENS.tide,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.25, 6, 0.5],
          'line-width': 0.5,
        },
      },
      {
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 13],
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 30],
        },
        paint: {
          'text-color': TOKENS.foam,
          'text-opacity': 0.7,
          'text-halo-color': TOKENS.abyss,
          'text-halo-width': 1,
        },
      },
    ],
  }
}

/** Natural Earth 110m fallback (public domain), served from /data/samples/basemap. */
export function offlineStyle(base = '/data/samples/basemap/'): StyleSpecification {
  return {
    version: 8,
    name: 'ava-sipi-night-offline',
    projection: { type: 'globe' as const },
    sky: SKY,
    sources: {
      land: { type: 'geojson', data: `${base}land.geojson` },
      boundaries: { type: 'geojson', data: `${base}boundaries.geojson` },
      places: { type: 'geojson', data: `${base}places.geojson` },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': TOKENS.abyss } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': TOKENS.shelf } },
      {
        id: 'coastline',
        type: 'line',
        source: 'land',
        paint: { 'line-color': TOKENS.tide, 'line-opacity': 0.35, 'line-width': 0.6 },
      },
      {
        id: BOUNDARY_LAYER_ID,
        type: 'line',
        source: 'boundaries',
        paint: { 'line-color': TOKENS.tide, 'line-opacity': 0.2, 'line-width': 0.5 },
      },
      {
        id: LABEL_LAYER_ID,
        type: 'circle',
        source: 'places',
        minzoom: 5,
        paint: { 'circle-color': TOKENS.foam, 'circle-opacity': 0.5, 'circle-radius': 2 },
      },
    ],
  }
}
