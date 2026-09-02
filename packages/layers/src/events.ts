import type { LayerDefinition } from './types.js'

export const events: LayerDefinition = {
  id: 'events',
  nameKey: 'layer.events.name',
  descriptionKey: 'layer.events.description',
  color: 'surge',
  icon: 'event',
  renderer: 'deck',
  geometry: 'mixed',
  artifactKinds: ['geojson'],
  defaultOn: true,
  wave: 1,
  refreshMinutes: 15,
  time: { historyFrom: null, step: 'day', forecastDays: 0 },
  legend: {
    unit: 'type',
    stops: [
      { value: 0, color: '#35E0E0', label: 'flood' },
      { value: 1, color: '#C8873A', label: 'drought' },
      { value: 2, color: '#9A8BD6', label: 'cyclone' },
    ],
  },
  legendPatterns: ['solid', 'hatched', 'crosshatched'],
  attribution: {
    name: 'GDACS — Global Disaster Alert and Coordination System (EC JRC / UN OCHA)',
    url: 'https://www.gdacs.org',
    license: 'Free for non-commercial and commercial use with attribution (GDACS terms)',
  },
  pulseMs: { red: 2000, orange: 4000 },
}
