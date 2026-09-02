import type { LayerDefinition } from './types.js'

/** Hero layer: HydroRIVERS network + Open-Meteo (GloFAS) discharge ratio. */
export const rivers: LayerDefinition = {
  id: 'rivers',
  nameKey: 'layer.rivers.name',
  descriptionKey: 'layer.rivers.description',
  color: 'current',
  icon: 'river',
  renderer: 'deck',
  geometry: 'lines',
  artifactKinds: ['pmtiles', 'geojson', 'parquet', 'json'],
  defaultOn: true,
  wave: 1,
  refreshMinutes: 60 * 24,
  time: { historyFrom: '2024-01-01', step: 'day', forecastDays: 7 },
  // Spec §5.3: zoom < 3 spine only (order ≥ 7); 3–5 order ≥ 5; 5–7 order ≥ 4; > 7 everything (≥ 3).
  lod: [
    { maxZoom: 3, minOrder: 7 },
    { maxZoom: 5, minOrder: 5 },
    { maxZoom: 7, minOrder: 4 },
    { maxZoom: 99, minOrder: 3 },
  ],
  legend: {
    unit: 'ratio',
    stops: [
      { value: 0.3, color: '#7A4A1C', label: '0.3×' },
      { value: 0.6, color: '#C8873A', label: '0.6×' },
      { value: 1.0, color: '#7FB8D6', label: '1×' },
      { value: 1.6, color: '#35E0E0', label: '1.6×' },
      { value: 3.0, color: '#EAF4F8', label: '3×' },
    ],
  },
  legendPatterns: ['dotted', 'dashed', 'solid', 'solid-wide', 'solid-pulse'],
  attribution: {
    name: 'HydroRIVERS (HydroSHEDS v1) · Open-Meteo Flood API (GloFAS)',
    url: 'https://www.hydrosheds.org/products/hydrorivers',
    license: 'HydroSHEDS License (free with attribution) · CC BY 4.0 (Open-Meteo)',
  },
}
