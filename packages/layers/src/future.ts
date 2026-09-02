import type { LayerDefinition } from './types.js'

/** v1.5 — placeholders so the registry, schema and UI already know about them. */
export const snow: LayerDefinition = {
  id: 'snow',
  nameKey: 'layer.snow.name',
  descriptionKey: 'layer.snow.description',
  color: 'foam',
  icon: 'snow',
  renderer: 'maplibre',
  geometry: 'raster',
  artifactKinds: ['raster-pmtiles'],
  defaultOn: false,
  wave: 3,
  refreshMinutes: 60 * 24,
  time: { historyFrom: null, step: 'day', forecastDays: 0 },
  legend: {
    unit: '%',
    stops: [
      { value: 0, color: 'transparent', label: '0' },
      { value: 100, color: '#EAF4F8', label: '100' },
    ],
  },
  attribution: {
    name: 'NASA MODIS snow cover (NSIDC)',
    url: 'https://nsidc.org/data/modis',
    license: 'NASA open data',
  },
}

export const tides: LayerDefinition = {
  id: 'tides',
  nameKey: 'layer.tides.name',
  descriptionKey: 'layer.tides.description',
  color: 'current',
  icon: 'tide',
  renderer: 'deck',
  geometry: 'points',
  artifactKinds: ['json'],
  defaultOn: false,
  wave: 3,
  refreshMinutes: 6,
  time: { historyFrom: null, step: 'day', forecastDays: 2 },
  legend: {
    unit: 'm',
    stops: [
      { value: -1, color: '#C8873A', label: '−1' },
      { value: 0, color: '#7FB8D6', label: '0' },
      { value: 1, color: '#35E0E0', label: '+1' },
    ],
  },
  attribution: {
    name: 'NOAA CO-OPS',
    url: 'https://api.tidesandcurrents.noaa.gov',
    license: 'U.S. public domain',
  },
}
