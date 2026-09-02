import { create } from 'zustand'

export interface RasterSample {
  layer: 'drought' | 'groundwater'
  unit: string
  cls: string | null
  value: number | null
  artifactName: string
}

interface RasterState {
  samples: Record<string, RasterSample>
  set: (id: string, s: RasterSample) => void
}

export const useRasterSamples = create<RasterState>()((set) => ({
  samples: {},
  set: (id, s) => set((st) => ({ samples: { ...st.samples, [id]: s } })),
}))
