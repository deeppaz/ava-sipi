/** Display-side unit conversion. Data is always SI; conversion happens here only (spec §2.1). */

export type UnitSystem = 'metric' | 'imperial'

const M3S_TO_CFS = 35.31466672
const M_TO_FT = 3.280839895
const KM2_TO_MI2 = 0.386102159
const KM_TO_MI = 0.621371192
const MCM_TO_ACRE_FT = 810.71318

export interface Quantity {
  value: number
  unit: string
}

export function discharge(m3s: number, system: UnitSystem): Quantity {
  return system === 'imperial'
    ? { value: m3s * M3S_TO_CFS, unit: 'ft³/s' }
    : { value: m3s, unit: 'm³/s' }
}

export function length(m: number, system: UnitSystem): Quantity {
  return system === 'imperial' ? { value: m * M_TO_FT, unit: 'ft' } : { value: m, unit: 'm' }
}

export function distanceKm(km: number, system: UnitSystem): Quantity {
  return system === 'imperial' ? { value: km * KM_TO_MI, unit: 'mi' } : { value: km, unit: 'km' }
}

export function areaKm2(km2: number, system: UnitSystem): Quantity {
  return system === 'imperial'
    ? { value: km2 * KM2_TO_MI2, unit: 'mi²' }
    : { value: km2, unit: 'km²' }
}

export function volumeMcm(mcm: number, system: UnitSystem): Quantity {
  return system === 'imperial'
    ? { value: mcm * MCM_TO_ACRE_FT, unit: 'acre-ft' }
    : { value: mcm, unit: 'hm³' }
}

export function cm(cmValue: number, system: UnitSystem): Quantity {
  return system === 'imperial'
    ? { value: cmValue / 2.54, unit: 'in' }
    : { value: cmValue, unit: 'cm' }
}
