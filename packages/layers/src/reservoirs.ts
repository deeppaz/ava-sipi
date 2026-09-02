import type { LayerDefinition } from './types.js'

export const reservoirs: LayerDefinition = {
  id: 'reservoirs',
  nameKey: 'layer.reservoirs.name',
  descriptionKey: 'layer.reservoirs.description',
  color: 'current',
  icon: 'reservoir',
  renderer: 'deck',
  geometry: 'points',
  artifactKinds: ['json'],
  defaultOn: false,
  wave: 2,
  refreshMinutes: 60 * 24 * 7,
  time: { historyFrom: '2023-01-01', step: 'month', forecastDays: 0 },
  legend: {
    unit: '%',
    stops: [
      { value: 0, color: '#7A4A1C', label: '0' },
      { value: 40, color: '#C8873A', label: '40' },
      { value: 70, color: '#7FB8D6', label: '70' },
      { value: 100, color: '#EAF4F8', label: '100' },
    ],
  },
  attribution: {
    name: 'Global Water Watch (Deltares · WRI · WWF) · GRanD v1.3',
    url: 'https://www.globalwaterwatch.earth',
    license: 'CC BY 4.0 (GWW) · GRanD terms of use',
  },
  noteKeys: ['note.reservoirs.proxy'],
}
