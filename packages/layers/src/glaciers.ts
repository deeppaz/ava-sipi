import type { LayerDefinition } from './types.js'

export const glaciers: LayerDefinition = {
  id: 'glaciers',
  nameKey: 'layer.glaciers.name',
  descriptionKey: 'layer.glaciers.description',
  color: 'glacier',
  icon: 'glacier',
  renderer: 'maplibre',
  geometry: 'polygons',
  artifactKinds: ['pmtiles', 'geojson', 'json'],
  defaultOn: false,
  wave: 2,
  refreshMinutes: 60 * 24 * 365,
  time: { historyFrom: null, step: 'day', forecastDays: 0 },
  legend: {
    unit: 'm w.e./yr',
    stops: [
      { value: -2, color: '#C8873A', label: '−2' },
      { value: -1, color: '#CFE6F0', label: '−1' },
      { value: 0, color: '#EAF4F8', label: '0' },
    ],
  },
  attribution: {
    name: 'Randolph Glacier Inventory v7.0 (GLIMS / NSIDC) · WGMS annual mass-change estimates',
    url: 'https://www.glims.org/rgi_user_guide/',
    license: 'CC BY 4.0 (RGI 7) · WGMS open access with citation',
  },
}
