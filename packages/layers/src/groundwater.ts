import type { LayerDefinition } from './types.js'

export const groundwater: LayerDefinition = {
  id: 'groundwater',
  nameKey: 'layer.groundwater.name',
  descriptionKey: 'layer.groundwater.description',
  color: 'parch',
  icon: 'groundwater',
  renderer: 'maplibre',
  geometry: 'raster',
  artifactKinds: ['raster-pmtiles', 'png', 'json'],
  defaultOn: false,
  wave: 2,
  refreshMinutes: 60 * 24 * 30,
  time: { historyFrom: '2002-04-01', step: 'month', forecastDays: 0 },
  legend: {
    unit: 'cm',
    stops: [
      { value: -20, color: '#7A4A1C', label: '−20' },
      { value: -10, color: '#C8873A', label: '−10' },
      { value: 0, color: 'transparent', label: '0' },
      { value: 10, color: '#7FB8D6', label: '+10' },
      { value: 20, color: '#35E0E0', label: '+20' },
    ],
  },
  attribution: {
    name: 'NASA GRACE / GRACE-FO JPL Mascon RL06.3 · NASA GRACE-DA (UNL) indicators',
    url: 'https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4',
    license: 'NASA open data (free with citation)',
  },
  noteKeys: ['note.groundwater.tws'],
}
