import type { LayerDefinition } from './types.js'

export const gauges: LayerDefinition = {
  id: 'gauges',
  nameKey: 'layer.gauges.name',
  descriptionKey: 'layer.gauges.description',
  color: 'current',
  icon: 'gauge',
  renderer: 'deck',
  geometry: 'points',
  artifactKinds: ['json', 'parquet'],
  defaultOn: true,
  wave: 1,
  refreshMinutes: 15,
  time: { historyFrom: null, step: 'day', forecastDays: 0 },
  legend: {
    unit: 'percentile',
    stops: [
      { value: 0, color: '#C8873A', label: '< 10' },
      { value: 10, color: '#D9A45B', label: '10–25' },
      { value: 25, color: '#7FB8D6', label: '25–75' },
      { value: 75, color: '#35E0E0', label: '75–90' },
      { value: 90, color: '#EAF4F8', label: '> 90' },
    ],
  },
  legendPatterns: ['ring-empty', 'ring-quarter', 'ring-half', 'ring-full', 'ring-pulse'],
  attribution: {
    name: 'USGS Water Data · NOAA National Water Prediction Service',
    url: 'https://api.waterdata.usgs.gov',
    license: 'U.S. public domain',
  },
  pulseMs: { red: 2000, orange: 4000 },
}
