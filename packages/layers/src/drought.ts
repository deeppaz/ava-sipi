import type { LayerDefinition } from './types.js'

export const drought: LayerDefinition = {
  id: 'drought',
  nameKey: 'layer.drought.name',
  descriptionKey: 'layer.drought.description',
  color: 'parch',
  icon: 'drought',
  renderer: 'maplibre',
  geometry: 'raster',
  artifactKinds: ['raster-pmtiles', 'png'],
  defaultOn: false,
  wave: 2,
  refreshMinutes: 60 * 24 * 10,
  time: { historyFrom: '2012-01-01', step: '10day', forecastDays: 0 },
  legend: {
    unit: 'class',
    stops: [
      { value: 0, color: 'transparent', label: 'none' },
      { value: 1, color: '#D9A45B', label: 'watch' },
      { value: 2, color: '#C8873A', label: 'warning' },
      { value: 3, color: '#7A4A1C', label: 'alert' },
    ],
  },
  legendPatterns: ['none', 'dotted', 'hatched', 'solid'],
  attribution: {
    name: 'Copernicus Emergency Management Service — Global Drought Observatory (EC JRC)',
    url: 'https://drought.emergency.copernicus.eu',
    license: 'Copernicus open licence (free with attribution)',
  },
}
